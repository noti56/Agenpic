import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { PeerState } from "../lib/presenceTypes";

const PROXIMITY_RADIUS = 160;
const MAX_MESH_PEERS = 6;

interface SignalData {
  type: "offer" | "answer" | "ice-candidate";
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export interface UseProximityVoiceResult {
  connectedPeerIds: Set<string>;
  remoteStreams: Map<string, MediaStream>;
  micOn: boolean;
  toggleMic: () => void;
  cameraOn: boolean;
  toggleCamera: () => Promise<void>;
}

/**
 * Mesh WebRTC: opens a direct RTCPeerConnection to every "user" peer within
 * PROXIMITY_RADIUS of the local avatar, signaled through the Socket.io
 * relay. Capped at MAX_MESH_PEERS — beyond that an SFU would be needed,
 * which is out of scope here (see build brief).
 */
export function useProximityVoice(
  socket: Socket | null,
  selfSocketId: string | undefined,
  peers: PeerState[],
  selfPos: { x: number; y: number },
): UseProximityVoiceResult {
  const [connectedPeerIds, setConnectedPeerIds] = useState<Set<string>>(new Set());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);

  async function ensureLocalStream(): Promise<MediaStream | null> {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      // getUserMedia never rejects while its permission prompt sits
      // unanswered — it just hangs — which would otherwise block peer
      // connection setup indefinitely for anyone who doesn't respond to it
      // right away. Time out and proceed without audio instead.
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("getUserMedia timed out")), 15000),
        ),
      ]);
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      console.warn("[proximity-voice] mic unavailable, presence continues without audio:", err);
      return null;
    }
  }

  function teardownPeer(socketId: string) {
    pcsRef.current.get(socketId)?.close();
    pcsRef.current.delete(socketId);
    setConnectedPeerIds((prev) => {
      if (!prev.has(socketId)) return prev;
      const next = new Set(prev);
      next.delete(socketId);
      return next;
    });
    setRemoteStreams((prev) => {
      if (!prev.has(socketId)) return prev;
      const next = new Map(prev);
      next.delete(socketId);
      return next;
    });
  }

  async function createPeerConnection(remoteId: string): Promise<RTCPeerConnection> {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    // Register synchronously, before the `await` below, so a concurrent
    // effect re-run (e.g. triggered by any peer moving while we're still
    // waiting on getUserMedia) sees this connection as already in flight
    // instead of racing to start a second one for the same peer.
    pcsRef.current.set(remoteId, pc);

    const local = await ensureLocalStream();
    if (local) {
      local.getTracks().forEach((track) => pc.addTrack(track, local));
    } else {
      // No mic available — still open a data channel so the offer carries
      // at least one m-line and the connection can be established (as a
      // presence link, even without audio).
      pc.createDataChannel("agenpic-presence");
    }

    pc.ontrack = (event) => {
      setRemoteStreams((prev) => new Map(prev).set(remoteId, event.streams[0]));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit("webrtc:signal", {
          to: remoteId,
          data: { type: "ice-candidate", candidate: event.candidate.toJSON() } as SignalData,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[proximity-voice] ${remoteId} connectionState -> ${pc.connectionState}`);
      if (pc.connectionState === "connected") {
        setConnectedPeerIds((prev) => new Set(prev).add(remoteId));
      } else if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        teardownPeer(remoteId);
      }
    };
    pc.oniceconnectionstatechange = () => {
      console.log(`[proximity-voice] ${remoteId} iceConnectionState -> ${pc.iceConnectionState}`);
    };

    return pc;
  }

  // Incoming signaling: offers, answers, ICE candidates.
  useEffect(() => {
    if (!socket) return;

    const onSignal = async ({ from, data }: { from: string; data: SignalData }) => {
      console.log(`[proximity-voice] received ${data.type} from ${from}`);
      let pc = pcsRef.current.get(from);

      if (data.type === "offer") {
        if (!pc) pc = await createPeerConnection(from);
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp!));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc:signal", { to: from, data: { type: "answer", sdp: answer } });
        console.log(`[proximity-voice] sent answer to ${from}`);
      } else if (data.type === "answer") {
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.sdp!));
      } else if (data.type === "ice-candidate") {
        if (pc && data.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch((e) =>
            console.warn("[proximity-voice] addIceCandidate failed:", e),
          );
        }
      }
    };

    socket.on("webrtc:signal", onSignal);
    return () => {
      socket.off("webrtc:signal", onSignal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  // Proximity-driven connect/disconnect.
  useEffect(() => {
    if (!socket || !selfSocketId) return;

    const nearby = peers.filter((p) => {
      if (p.kind !== "user") return false;
      const dx = p.x - selfPos.x;
      const dy = p.y - selfPos.y;
      return Math.hypot(dx, dy) <= PROXIMITY_RADIUS;
    });
    const nearbyIds = new Set(nearby.map((p) => p.socketId));

    for (const socketId of pcsRef.current.keys()) {
      if (!nearbyIds.has(socketId)) teardownPeer(socketId);
    }

    for (const peer of nearby) {
      if (pcsRef.current.has(peer.socketId)) continue;
      if (pcsRef.current.size >= MAX_MESH_PEERS) {
        console.warn(
          `[proximity-voice] mesh cap (${MAX_MESH_PEERS}) reached — an SFU would be needed for larger rooms`,
        );
        break;
      }
      // Only the lexicographically-smaller socket id initiates, so both
      // sides don't race to send an offer.
      if (selfSocketId < peer.socketId) {
        console.log(`[proximity-voice] ${peer.name} is nearby — initiating connection`);
        createPeerConnection(peer.socketId).then(async (pc) => {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("webrtc:signal", { to: peer.socketId, data: { type: "offer", sdp: offer } });
          console.log(`[proximity-voice] sent offer to ${peer.socketId}`);
        });
      } else {
        console.log(`[proximity-voice] ${peer.name} is nearby — waiting for their offer`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, selfSocketId, peers, selfPos.x, selfPos.y]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      for (const socketId of [...pcsRef.current.keys()]) teardownPeer(socketId);
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
  };

  const toggleCamera = async () => {
    const next = !cameraOn;
    if (next) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const track = camStream.getVideoTracks()[0];
        localStreamRef.current?.addTrack(track);
        for (const pc of pcsRef.current.values()) {
          pc.addTrack(track, localStreamRef.current!);
        }
        setCameraOn(true);
      } catch (err) {
        console.warn("[proximity-voice] camera unavailable:", err);
      }
    } else {
      const track = localStreamRef.current?.getVideoTracks()[0];
      track?.stop();
      if (track) localStreamRef.current?.removeTrack(track);
      setCameraOn(false);
    }
  };

  return { connectedPeerIds, remoteStreams, micOn, toggleMic, cameraOn, toggleCamera };
}
