import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { PeerState } from "../lib/presenceTypes";

const PROXIMITY_RADIUS = 160;
const MAX_MESH_PEERS = 6;
const MIC_DEVICE_KEY = "agenpic:av-mic-device";
const CAMERA_DEVICE_KEY = "agenpic:av-camera-device";
const VOLUME_KEY = "agenpic:av-volume";

interface SignalData {
  type: "offer" | "answer" | "ice-candidate" | "screen-share-state";
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  sharing?: boolean;
  /** The sender's screen-share MediaStream.id — preserved as the `msid` across
   *  the connection, so the receiver can tell a screen-share video track
   *  apart from a camera video track without guessing at negotiation order. */
  streamId?: string;
}

export interface UseProximityVoiceResult {
  connectedPeerIds: Set<string>;
  remoteStreams: Map<string, MediaStream>;
  micOn: boolean;
  toggleMic: () => void;
  cameraOn: boolean;
  toggleCamera: () => Promise<void>;
  localStream: MediaStream | null;
  volume: number;
  setVolume: (percent: number) => void;
  micDevices: MediaDeviceInfo[];
  cameraDevices: MediaDeviceInfo[];
  micDeviceId: string | undefined;
  cameraDeviceId: string | undefined;
  setMicDevice: (deviceId: string) => Promise<void>;
  setCameraDevice: (deviceId: string) => Promise<void>;
  screenShareOn: boolean;
  screenStream: MediaStream | null;
  toggleScreenShare: () => Promise<void>;
  remoteScreenStreams: Map<string, MediaStream>;
}

function readStored(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeStored(key: string, value: string | undefined) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // ignore — device preference just won't persist
  }
}

/**
 * Mesh WebRTC: opens a direct RTCPeerConnection to every "user" peer within
 * PROXIMITY_RADIUS of the local avatar, signaled through the Socket.io
 * relay. Capped at MAX_MESH_PEERS — beyond that an SFU would be needed,
 * which is out of scope here (see build brief).
 *
 * Uses the "perfect negotiation" pattern (onnegotiationneeded on both ends,
 * with a fixed polite/impolite role per pair derived from socket id order)
 * so that adding/removing the camera track after the initial connection —
 * i.e. every camera toggle — triggers a renegotiation that the other side
 * actually receives, instead of silently adding a track no offer ever
 * mentions.
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
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenShareOn, setScreenShareOn] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<Map<string, MediaStream>>(new Map());
  const [volume, setVolumeState] = useState<number>(() => {
    const saved = readStored(VOLUME_KEY);
    const parsed = saved ? Number(saved) : NaN;
    return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 100;
  });
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [micDeviceId, setMicDeviceId] = useState<string | undefined>(() => readStored(MIC_DEVICE_KEY));
  const [cameraDeviceId, setCameraDeviceId] = useState<string | undefined>(() => readStored(CAMERA_DEVICE_KEY));

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const politeRef = useRef<Map<string, boolean>>(new Map());
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const screenStreamRef = useRef<MediaStream | null>(null);
  // Populated from an incoming "screen-share-state" signal: remote socket id
  // -> the MediaStream.id of the screen-share stream that peer is about to
  // (or already does) send. The msid is preserved across the connection, so
  // comparing an incoming track's stream.id against this tells `ontrack`
  // apart a screen-share video track from a camera video track regardless
  // of negotiation order.
  const remoteScreenStreamIdRef = useRef<Map<string, string>>(new Map());

  // Device labels are blank (and deviceIds may be blank/unstable) until the
  // corresponding permission has been granted at least once — re-enumerate
  // after every successful getUserMedia call, since granting permission
  // does not itself fire the "devicechange" event.
  async function refreshDevices(): Promise<void> {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setMicDevices(list.filter((d) => d.kind === "audioinput" && d.deviceId));
      setCameraDevices(list.filter((d) => d.kind === "videoinput" && d.deviceId));
    } catch (err) {
      console.warn("[proximity-voice] enumerateDevices failed:", err);
    }
  }

  function getLocalStream(): MediaStream {
    if (!localStreamRef.current) {
      localStreamRef.current = new MediaStream();
      setLocalStream(localStreamRef.current);
    }
    return localStreamRef.current;
  }

  async function ensureAudioTrack(): Promise<void> {
    const container = getLocalStream();
    if (container.getAudioTracks().length > 0) return;
    try {
      // getUserMedia never rejects while its permission prompt sits
      // unanswered — it just hangs — which would otherwise block peer
      // connection setup indefinitely for anyone who doesn't respond to it
      // right away. Time out and proceed without audio instead.
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
          video: false,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("getUserMedia timed out")), 15000),
        ),
      ]);
      stream.getAudioTracks().forEach((track) => {
        track.enabled = micOn;
        container.addTrack(track);
      });
      refreshDevices();
    } catch (err) {
      console.warn("[proximity-voice] mic unavailable, presence continues without audio:", err);
    }
  }

  function teardownPeer(socketId: string) {
    pcsRef.current.get(socketId)?.close();
    pcsRef.current.delete(socketId);
    politeRef.current.delete(socketId);
    makingOfferRef.current.delete(socketId);
    remoteScreenStreamIdRef.current.delete(socketId);
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
    setRemoteScreenStreams((prev) => {
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
    // Fixed per-pair role for perfect negotiation's glare handling — the
    // same side (lower socketId) that originates the initial offer stays
    // "impolite" for the life of the connection.
    politeRef.current.set(remoteId, !!selfSocketId && selfSocketId > remoteId);
    makingOfferRef.current.set(remoteId, false);

    await ensureAudioTrack();
    const container = getLocalStream();
    if (container.getTracks().length > 0) {
      container.getTracks().forEach((track) => pc.addTrack(track, container));
    } else {
      // No mic available — still open a data channel so the offer carries
      // at least one m-line and the connection can be established (as a
      // presence link, even without audio).
      pc.createDataChannel("agenpic-presence");
    }

    // A peer that walks into range while we're already sharing our screen
    // needs that track too — and needs to know its stream id ahead of time,
    // since this renegotiation otherwise looks identical to a camera
    // turning on.
    if (screenStreamRef.current && screenStreamRef.current.getVideoTracks().length > 0) {
      pc.addTrack(screenStreamRef.current.getVideoTracks()[0], screenStreamRef.current);
      socket?.emit("webrtc:signal", {
        to: remoteId,
        data: { type: "screen-share-state", sharing: true, streamId: screenStreamRef.current.id } as SignalData,
      });
    }

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (event.track.kind === "video" && remoteScreenStreamIdRef.current.get(remoteId) === stream.id) {
        setRemoteScreenStreams((prev) => new Map(prev).set(remoteId, stream));
        return;
      }
      setRemoteStreams((prev) => new Map(prev).set(remoteId, stream));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit("webrtc:signal", {
          to: remoteId,
          data: { type: "ice-candidate", candidate: event.candidate.toJSON() } as SignalData,
        });
      }
    };

    // Fires on the initial track/data-channel setup above *and* on every
    // later addTrack/removeTrack (i.e. every mic/camera toggle) — this is
    // what actually gets a renegotiated offer to the other side instead of
    // silently mutating a track locally.
    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current.set(remoteId, true);
        await pc.setLocalDescription();
        socket?.emit("webrtc:signal", {
          to: remoteId,
          data: { type: "offer", sdp: pc.localDescription! } as SignalData,
        });
      } catch (err) {
        console.warn(`[proximity-voice] negotiation with ${remoteId} failed:`, err);
      } finally {
        makingOfferRef.current.set(remoteId, false);
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

      // Bookkeeping only — recorded independent of whether a peer connection
      // exists yet, since this can (and often does) arrive slightly ahead of
      // the offer that carries the actual screen-share track.
      if (data.type === "screen-share-state") {
        if (data.sharing && data.streamId) {
          remoteScreenStreamIdRef.current.set(from, data.streamId);
        } else {
          remoteScreenStreamIdRef.current.delete(from);
          setRemoteScreenStreams((prev) => {
            if (!prev.has(from)) return prev;
            const next = new Map(prev);
            next.delete(from);
            return next;
          });
        }
        return;
      }

      let pc = pcsRef.current.get(from);
      if (!pc) {
        if (data.type !== "offer") return;
        pc = await createPeerConnection(from);
      }

      if (data.type === "offer" || data.type === "answer") {
        const polite = politeRef.current.get(from) ?? false;
        const makingOffer = makingOfferRef.current.get(from) ?? false;
        const offerCollision = data.type === "offer" && (makingOffer || pc.signalingState !== "stable");
        const ignoreOffer = !polite && offerCollision;
        if (ignoreOffer) {
          console.log(`[proximity-voice] ignoring colliding offer from ${from} (impolite)`);
          return;
        }
        if (offerCollision) {
          await Promise.all([
            pc.setLocalDescription({ type: "rollback" }),
            pc.setRemoteDescription(new RTCSessionDescription(data.sdp!)),
          ]);
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp!));
        }
        if (data.type === "offer") {
          await pc.setLocalDescription();
          socket.emit("webrtc:signal", { to: from, data: { type: "answer", sdp: pc.localDescription! } });
          console.log(`[proximity-voice] sent answer to ${from}`);
        }
      } else if (data.type === "ice-candidate") {
        if (data.candidate) {
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
      // Only the lexicographically-smaller socket id initiates — its
      // createPeerConnection call above adds tracks/a data channel, which
      // fires onnegotiationneeded and sends the offer. The other side just
      // waits and creates its (polite) pc when that offer arrives.
      if (selfSocketId < peer.socketId) {
        console.log(`[proximity-voice] ${peer.name} is nearby — initiating connection`);
        createPeerConnection(peer.socketId);
      } else {
        console.log(`[proximity-voice] ${peer.name} is nearby — waiting for their offer`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, selfSocketId, peers, selfPos.x, selfPos.y]);

  // Enumerate audio/video input devices for the picker, refreshing when the
  // OS device list changes (e.g. a USB webcam gets plugged in). Labels are
  // blank until permission has been granted at least once — the picker
  // falls back to "Microphone/Camera N" in that case, until a getUserMedia
  // call elsewhere grants permission and triggers a refreshDevices() re-run.
  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices.addEventListener?.("devicechange", refreshDevices);
    return () => {
      navigator.mediaDevices.removeEventListener?.("devicechange", refreshDevices);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      for (const socketId of [...pcsRef.current.keys()]) teardownPeer(socketId);
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
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
    const container = getLocalStream();
    if (next) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: cameraDeviceId ? { deviceId: { exact: cameraDeviceId } } : true,
        });
        const track = camStream.getVideoTracks()[0];
        container.addTrack(track);
        for (const pc of pcsRef.current.values()) {
          pc.addTrack(track, container);
        }
        setCameraOn(true);
        refreshDevices();
      } catch (err) {
        console.warn("[proximity-voice] camera unavailable:", err);
      }
    } else {
      const track = container.getVideoTracks()[0];
      if (track) {
        for (const pc of pcsRef.current.values()) {
          const sender = pc.getSenders().find((s) => s.track === track);
          if (sender) pc.removeTrack(sender);
        }
        container.removeTrack(track);
        track.stop();
      }
      setCameraOn(false);
    }
  };

  const stopScreenShare = () => {
    const stream = screenStreamRef.current;
    if (!stream) return;
    for (const track of stream.getTracks()) {
      for (const pc of pcsRef.current.values()) {
        const sender = pc.getSenders().find((s) => s.track === track);
        if (sender) pc.removeTrack(sender);
      }
      track.stop();
    }
    screenStreamRef.current = null;
    setScreenStream(null);
    setScreenShareOn(false);
    for (const remoteId of pcsRef.current.keys()) {
      socket?.emit("webrtc:signal", {
        to: remoteId,
        data: { type: "screen-share-state", sharing: false } as SignalData,
      });
    }
  };

  const toggleScreenShare = async () => {
    if (screenShareOn) {
      stopScreenShare();
      return;
    }
    try {
      // getDisplayMedia's own OS/browser picker is what lets the user choose
      // which screen or window to share — there is no way (or need) to
      // build a custom one on top of it.
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const track = displayStream.getVideoTracks()[0];
      const container = new MediaStream([track]);
      screenStreamRef.current = container;
      setScreenStream(container);
      setScreenShareOn(true);
      // Fires when the user stops sharing via the browser/OS's native
      // "Stop sharing" affordance, rather than our own button.
      track.onended = () => stopScreenShare();
      for (const [remoteId, pc] of pcsRef.current) {
        pc.addTrack(track, container);
        socket?.emit("webrtc:signal", {
          to: remoteId,
          data: { type: "screen-share-state", sharing: true, streamId: container.id } as SignalData,
        });
      }
    } catch (err) {
      console.warn("[proximity-voice] screen share unavailable or cancelled:", err);
    }
  };

  const setMicDevice = async (deviceId: string) => {
    setMicDeviceId(deviceId || undefined);
    writeStored(MIC_DEVICE_KEY, deviceId || undefined);
    const container = localStreamRef.current;
    const oldTrack = container?.getAudioTracks()[0];
    if (!container || !oldTrack) return; // not active yet — new device is used next time the mic is acquired
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      const newTrack = stream.getAudioTracks()[0];
      newTrack.enabled = micOn;
      for (const pc of pcsRef.current.values()) {
        const sender = pc.getSenders().find((s) => s.track === oldTrack);
        if (sender) await sender.replaceTrack(newTrack);
      }
      container.removeTrack(oldTrack);
      oldTrack.stop();
      container.addTrack(newTrack);
      refreshDevices();
    } catch (err) {
      console.warn("[proximity-voice] failed to switch microphone:", err);
    }
  };

  const setCameraDevice = async (deviceId: string) => {
    setCameraDeviceId(deviceId || undefined);
    writeStored(CAMERA_DEVICE_KEY, deviceId || undefined);
    const container = localStreamRef.current;
    const oldTrack = container?.getVideoTracks()[0];
    if (!cameraOn || !container || !oldTrack) return; // camera is off — new device is used next time it's turned on
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      const newTrack = stream.getVideoTracks()[0];
      for (const pc of pcsRef.current.values()) {
        const sender = pc.getSenders().find((s) => s.track === oldTrack);
        if (sender) await sender.replaceTrack(newTrack);
      }
      container.removeTrack(oldTrack);
      oldTrack.stop();
      container.addTrack(newTrack);
      refreshDevices();
    } catch (err) {
      console.warn("[proximity-voice] failed to switch camera:", err);
    }
  };

  const setVolume = (percent: number) => {
    const clamped = Math.min(100, Math.max(0, percent));
    setVolumeState(clamped);
    writeStored(VOLUME_KEY, String(clamped));
  };

  return {
    connectedPeerIds,
    remoteStreams,
    micOn,
    toggleMic,
    cameraOn,
    toggleCamera,
    localStream,
    volume,
    setVolume,
    micDevices,
    cameraDevices,
    micDeviceId,
    cameraDeviceId,
    setMicDevice,
    setCameraDevice,
    screenShareOn,
    screenStream,
    toggleScreenShare,
    remoteScreenStreams,
  };
}
