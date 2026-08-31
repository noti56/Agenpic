import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { PeerState } from "../lib/presenceTypes";

const PROXIMITY_RADIUS = 160;
const MAX_MESH_PEERS = 6;
const MIC_DEVICE_KEY = "agenpic:av-mic-device";
const CAMERA_DEVICE_KEY = "agenpic:av-camera-device";
const VOLUME_KEY = "agenpic:av-volume";

/**
 * Every peer connection carries exactly these three m-lines, in this order,
 * for its whole life. They are created once by the initiator and negotiated
 * exactly once; turning a mic/camera/screen on or off afterwards is a
 * `sender.replaceTrack()` on the matching slot, which needs no renegotiation
 * at all.
 *
 * This is what makes toggles reliable. The previous design added/removed
 * tracks per toggle, so every camera-on had to survive a fresh offer/answer
 * round trip — and since `ontrack` fires the moment an m-line is negotiated
 * (long before any RTP arrives), a round trip that half-failed showed the
 * other side a video tile that stayed black forever.
 */
const SLOT_AUDIO = 0;
const SLOT_CAMERA = 1;
const SLOT_SCREEN = 2;

interface SignalData {
  type: "offer" | "answer" | "ice-candidate" | "media-state";
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  /** For "media-state": whether that peer is currently sending camera/screen. */
  camera?: boolean;
  screen?: boolean;
}

/** Per-peer bookkeeping. One entry per open RTCPeerConnection. */
interface PeerConn {
  pc: RTCPeerConnection;
  /** True if we are the side that creates the transceivers and offers. */
  initiator: boolean;
  /** Remote audio + camera video, one stable MediaStream for the tile. */
  media: MediaStream;
  /** Remote screen-share video. */
  screen: MediaStream;
  /** ICE candidates that arrived before setRemoteDescription could accept them. */
  pendingCandidates: RTCIceCandidateInit[];
  /** Set once setRemoteDescription has succeeded, so candidates can be flushed. */
  remoteDescriptionSet: boolean;
}

export interface UseProximityVoiceResult {
  connectedPeerIds: Set<string>;
  remoteStreams: Map<string, MediaStream>;
  /** Peers whose camera is actually on right now — drives the video tile. */
  remoteCameraOn: Set<string>;
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
 * Both sides create their connection object as soon as the other comes into
 * range (so early ICE candidates always have somewhere to land), but only
 * the lexicographically-lower socket id builds the transceivers and offers.
 * There is exactly one offer/answer exchange per connection — see the
 * SLOT_* comment above for why nothing after that renegotiates.
 */
export function useProximityVoice(
  socket: Socket | null,
  selfSocketId: string | undefined,
  peers: PeerState[],
  selfPos: { x: number; y: number },
): UseProximityVoiceResult {
  const [connectedPeerIds, setConnectedPeerIds] = useState<Set<string>>(new Set());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<Map<string, MediaStream>>(new Map());
  const [remoteCameraOn, setRemoteCameraOn] = useState<Set<string>>(new Set());
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenShareOn, setScreenShareOn] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [volume, setVolumeState] = useState<number>(() => {
    const saved = readStored(VOLUME_KEY);
    const parsed = saved ? Number(saved) : NaN;
    return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 100;
  });
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [micDeviceId, setMicDeviceId] = useState<string | undefined>(() => readStored(MIC_DEVICE_KEY));
  const [cameraDeviceId, setCameraDeviceId] = useState<string | undefined>(() => readStored(CAMERA_DEVICE_KEY));

  const connsRef = useRef<Map<string, PeerConn>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micPromiseRef = useRef<Promise<void> | null>(null);

  // `socket.id` only exists after the connection handshake completes, and
  // usePresence hands back a ref rather than state — so the value captured
  // by a long-lived effect closure can easily be `undefined` forever. Every
  // read of our own socket id goes through this ref (refreshed on each
  // render, and falling back to the live socket) so the initiator/answerer
  // roles can never be decided from a stale undefined.
  const selfIdRef = useRef<string | undefined>(selfSocketId);
  selfIdRef.current = selfSocketId ?? socket?.id;
  const socketRef = useRef<Socket | null>(socket);
  socketRef.current = socket;
  const micOnRef = useRef(micOn);
  micOnRef.current = micOn;
  const micDeviceIdRef = useRef(micDeviceId);
  micDeviceIdRef.current = micDeviceId;

  function signal(to: string, data: SignalData) {
    socketRef.current?.emit("webrtc:signal", { to, data });
  }

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

  /** The sender sitting on one of the three fixed slots, if it exists yet. */
  function senderForSlot(pc: RTCPeerConnection, slot: number): RTCRtpSender | undefined {
    return pc.getTransceivers()[slot]?.sender;
  }

  /** Push one local track onto the given slot of every open connection. */
  async function publishToSlot(slot: number, track: MediaStreamTrack | null): Promise<void> {
    await Promise.all(
      [...connsRef.current.values()].map(async ({ pc }) => {
        const sender = senderForSlot(pc, slot);
        if (!sender) return; // transceivers not built yet — picked up at attach time
        try {
          await sender.replaceTrack(track);
        } catch (err) {
          console.warn(`[proximity-voice] replaceTrack on slot ${slot} failed:`, err);
        }
      }),
    );
  }

  /** Tell every connected peer what we are currently sending. */
  function broadcastMediaState() {
    for (const remoteId of connsRef.current.keys()) {
      signal(remoteId, {
        type: "media-state",
        camera: !!localStreamRef.current?.getVideoTracks().length,
        screen: !!screenStreamRef.current?.getVideoTracks().length,
      });
    }
  }

  /**
   * Acquire the microphone once, lazily, and keep it in the local stream.
   * Deliberately NOT awaited before a connection is built: the connection
   * gets its m-lines from `addTransceiver` regardless, and the track is
   * dropped onto the audio slot via replaceTrack whenever it does arrive.
   * A slow (or ignored) permission prompt therefore delays audio only, not
   * the connection itself.
   */
  function ensureAudioTrack(): Promise<void> {
    if (micPromiseRef.current) return micPromiseRef.current;
    const container = getLocalStream();
    if (container.getAudioTracks().length > 0) return Promise.resolve();

    micPromiseRef.current = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: micDeviceIdRef.current ? { deviceId: { exact: micDeviceIdRef.current } } : true,
          video: false,
        });
        const track = stream.getAudioTracks()[0];
        if (!track) return;
        track.enabled = micOnRef.current;
        container.addTrack(track);
        await publishToSlot(SLOT_AUDIO, track);
        refreshDevices();
      } catch (err) {
        console.warn("[proximity-voice] mic unavailable, presence continues without audio:", err);
        // Allow a later retry (e.g. once the user grants permission).
        micPromiseRef.current = null;
      }
    })();
    return micPromiseRef.current;
  }

  function teardownPeer(socketId: string) {
    const conn = connsRef.current.get(socketId);
    if (!conn) return;
    conn.pc.onicecandidate = null;
    conn.pc.ontrack = null;
    conn.pc.onconnectionstatechange = null;
    conn.pc.close();
    connsRef.current.delete(socketId);

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
    setRemoteCameraOn((prev) => {
      if (!prev.has(socketId)) return prev;
      const next = new Set(prev);
      next.delete(socketId);
      return next;
    });
  }

  function createPeerConnection(remoteId: string, initiator: boolean): PeerConn {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    const conn: PeerConn = {
      pc,
      initiator,
      media: new MediaStream(),
      screen: new MediaStream(),
      pendingCandidates: [],
      remoteDescriptionSet: false,
    };
    // Registered synchronously so a concurrent effect re-run (any peer
    // moving re-runs the proximity effect) sees this connection as already
    // in flight instead of racing to open a second one for the same peer.
    connsRef.current.set(remoteId, conn);

    // Incoming media is identified by which of the three fixed slots it
    // arrived on, not by `event.streams` — a transceiver created before its
    // track exists carries no msid, so stream-based identification would
    // mislabel exactly the case we care about (a camera turned on later).
    pc.ontrack = (event) => {
      const slot = pc.getTransceivers().indexOf(event.transceiver);
      const target = slot === SLOT_SCREEN ? conn.screen : conn.media;
      if (!target.getTracks().includes(event.track)) target.addTrack(event.track);
      // The screen slot is negotiated on every connection whether or not
      // anyone is sharing, so its arrival says nothing about whether frames
      // are coming — the peer's "media-state" broadcast is what puts a
      // screen tile on screen. `conn.screen` is a stable MediaStream, so a
      // tile mounted by media-state picks this track up when it lands.
      if (slot !== SLOT_SCREEN) {
        setRemoteStreams((prev) => new Map(prev).set(remoteId, conn.media));
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signal(remoteId, { type: "ice-candidate", candidate: event.candidate.toJSON() });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[proximity-voice] ${remoteId} connectionState -> ${pc.connectionState}`);
      if (pc.connectionState === "connected") {
        setConnectedPeerIds((prev) => new Set(prev).add(remoteId));
        // A peer that has just finished connecting has no idea whether our
        // camera/screen were already live before it arrived.
        broadcastMediaState();
      } else if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        teardownPeer(remoteId);
      }
    };
    pc.oniceconnectionstatechange = () => {
      console.log(`[proximity-voice] ${remoteId} iceConnectionState -> ${pc.iceConnectionState}`);
    };

    return conn;
  }

  /** Put whatever we are currently capturing onto this connection's slots. */
  async function attachLocalTracks(pc: RTCPeerConnection): Promise<void> {
    const audio = localStreamRef.current?.getAudioTracks()[0] ?? null;
    const camera = localStreamRef.current?.getVideoTracks()[0] ?? null;
    const screen = screenStreamRef.current?.getVideoTracks()[0] ?? null;
    const slots: [number, MediaStreamTrack | null][] = [
      [SLOT_AUDIO, audio],
      [SLOT_CAMERA, camera],
      [SLOT_SCREEN, screen],
    ];
    for (const [slot, track] of slots) {
      const transceiver = pc.getTransceivers()[slot];
      if (!transceiver) continue;
      // A transceiver created by applying a remote offer starts out
      // "recvonly" — without this the answer would advertise that we never
      // send anything, and the other side would wait forever for media.
      transceiver.direction = "sendrecv";
      if (track) {
        try {
          await transceiver.sender.replaceTrack(track);
        } catch (err) {
          console.warn(`[proximity-voice] attaching slot ${slot} failed:`, err);
        }
      }
    }
  }

  /** Initiator side: build the three slots and send the one and only offer. */
  async function startOffer(remoteId: string): Promise<void> {
    const conn = createPeerConnection(remoteId, true);
    const container = getLocalStream();
    conn.pc.addTransceiver("audio", { direction: "sendrecv", streams: [container] });
    conn.pc.addTransceiver("video", { direction: "sendrecv", streams: [container] });
    conn.pc.addTransceiver("video", { direction: "sendrecv" });

    await attachLocalTracks(conn.pc);
    // Kicked off but not awaited — see ensureAudioTrack.
    ensureAudioTrack();

    try {
      const offer = await conn.pc.createOffer();
      await conn.pc.setLocalDescription(offer);
      signal(remoteId, { type: "offer", sdp: conn.pc.localDescription! });
      console.log(`[proximity-voice] sent offer to ${remoteId}`);
    } catch (err) {
      console.warn(`[proximity-voice] failed to offer to ${remoteId}:`, err);
      teardownPeer(remoteId);
    }
  }

  async function flushCandidates(conn: PeerConn): Promise<void> {
    const queued = conn.pendingCandidates.splice(0);
    for (const candidate of queued) {
      await conn.pc
        .addIceCandidate(new RTCIceCandidate(candidate))
        .catch((e) => console.warn("[proximity-voice] queued addIceCandidate failed:", e));
    }
  }

  // Incoming signaling: offers, answers, ICE candidates, media state.
  useEffect(() => {
    if (!socket) return;

    const onSignal = async ({ from, data }: { from: string; data: SignalData }) => {
      if (data.type === "media-state") {
        setRemoteCameraOn((prev) => {
          const has = prev.has(from);
          if (has === !!data.camera) return prev;
          const next = new Set(prev);
          if (data.camera) next.add(from);
          else next.delete(from);
          return next;
        });
        setRemoteScreenStreams((prev) => {
          const conn = connsRef.current.get(from);
          if (data.screen && conn) {
            if (prev.get(from) === conn.screen) return prev;
            return new Map(prev).set(from, conn.screen);
          }
          if (!prev.has(from)) return prev;
          const next = new Map(prev);
          next.delete(from);
          return next;
        });
        return;
      }

      console.log(`[proximity-voice] received ${data.type} from ${from}`);

      if (data.type === "offer") {
        // An offer always defines the connection. If we somehow already
        // have one for this peer (both sides raced, or the peer restarted
        // its connection), drop ours and follow theirs — there is exactly
        // one offer per connection in this design, so there is no glare to
        // arbitrate and nothing is lost by deferring.
        const existing = connsRef.current.get(from);
        const queued = existing?.pendingCandidates ?? [];
        if (existing?.initiator === false && existing.remoteDescriptionSet) {
          teardownPeer(from);
        } else if (existing?.initiator) {
          const selfId = selfIdRef.current;
          if (selfId && selfId < from) {
            console.log(`[proximity-voice] ignoring offer from ${from} — we are the initiator`);
            return;
          }
          teardownPeer(from);
        }

        const conn = connsRef.current.get(from) ?? createPeerConnection(from, false);
        conn.pendingCandidates.push(...queued);
        try {
          await conn.pc.setRemoteDescription(new RTCSessionDescription(data.sdp!));
          conn.remoteDescriptionSet = true;
          await flushCandidates(conn);
          // Only now do the three transceivers exist on this side.
          await attachLocalTracks(conn.pc);
          ensureAudioTrack();
          const answer = await conn.pc.createAnswer();
          await conn.pc.setLocalDescription(answer);
          signal(from, { type: "answer", sdp: conn.pc.localDescription! });
          broadcastMediaState();
          console.log(`[proximity-voice] sent answer to ${from}`);
        } catch (err) {
          console.warn(`[proximity-voice] failed to answer ${from}:`, err);
          teardownPeer(from);
        }
        return;
      }

      const conn = connsRef.current.get(from);
      if (!conn) return;

      if (data.type === "answer") {
        if (conn.pc.signalingState !== "have-local-offer") {
          console.warn(
            `[proximity-voice] dropping answer from ${from} in state ${conn.pc.signalingState}`,
          );
          return;
        }
        try {
          await conn.pc.setRemoteDescription(new RTCSessionDescription(data.sdp!));
          conn.remoteDescriptionSet = true;
          await flushCandidates(conn);
          broadcastMediaState();
        } catch (err) {
          console.warn(`[proximity-voice] failed to apply answer from ${from}:`, err);
        }
        return;
      }

      if (data.type === "ice-candidate" && data.candidate) {
        // Candidates routinely arrive before the description that makes
        // them addable — queue rather than drop, or the answering side
        // loses the whole first burst of the offerer's candidates.
        if (!conn.remoteDescriptionSet) {
          conn.pendingCandidates.push(data.candidate);
          return;
        }
        await conn.pc
          .addIceCandidate(new RTCIceCandidate(data.candidate))
          .catch((e) => console.warn("[proximity-voice] addIceCandidate failed:", e));
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
    const selfId = selfSocketId ?? socket?.id;
    if (!socket || !selfId) return;

    const nearby = peers.filter((p) => {
      if (p.kind !== "user") return false;
      if (p.socketId === selfId) return false;
      const dx = p.x - selfPos.x;
      const dy = p.y - selfPos.y;
      return Math.hypot(dx, dy) <= PROXIMITY_RADIUS;
    });
    const nearbyIds = new Set(nearby.map((p) => p.socketId));

    for (const socketId of [...connsRef.current.keys()]) {
      if (!nearbyIds.has(socketId)) teardownPeer(socketId);
    }

    for (const peer of nearby) {
      if (connsRef.current.has(peer.socketId)) continue;
      if (connsRef.current.size >= MAX_MESH_PEERS) {
        console.warn(
          `[proximity-voice] mesh cap (${MAX_MESH_PEERS}) reached — an SFU would be needed for larger rooms`,
        );
        break;
      }
      if (selfId < peer.socketId) {
        console.log(`[proximity-voice] ${peer.name} is nearby — initiating connection`);
        startOffer(peer.socketId);
      } else {
        // Open the connection object anyway, so their ICE candidates have
        // somewhere to queue while their offer is still in flight.
        console.log(`[proximity-voice] ${peer.name} is nearby — waiting for their offer`);
        createPeerConnection(peer.socketId, false);
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
      for (const socketId of [...connsRef.current.keys()]) teardownPeer(socketId);
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
    if (next) ensureAudioTrack();
  };

  const toggleCamera = async () => {
    const container = getLocalStream();
    if (!cameraOn) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: cameraDeviceId ? { deviceId: { exact: cameraDeviceId } } : true,
        });
        const track = camStream.getVideoTracks()[0];
        container.addTrack(track);
        await publishToSlot(SLOT_CAMERA, track);
        setCameraOn(true);
        broadcastMediaState();
        refreshDevices();
      } catch (err) {
        console.warn("[proximity-voice] camera unavailable:", err);
      }
    } else {
      await publishToSlot(SLOT_CAMERA, null);
      const track = container.getVideoTracks()[0];
      if (track) {
        container.removeTrack(track);
        track.stop();
      }
      setCameraOn(false);
      broadcastMediaState();
    }
  };

  const stopScreenShare = async () => {
    const stream = screenStreamRef.current;
    if (!stream) return;
    await publishToSlot(SLOT_SCREEN, null);
    stream.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    setScreenShareOn(false);
    broadcastMediaState();
  };

  const toggleScreenShare = async () => {
    if (screenShareOn) {
      await stopScreenShare();
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
      track.onended = () => {
        stopScreenShare();
      };
      await publishToSlot(SLOT_SCREEN, track);
      broadcastMediaState();
    } catch (err) {
      console.warn("[proximity-voice] screen share unavailable or cancelled:", err);
    }
  };

  const setMicDevice = async (deviceId: string) => {
    setMicDeviceId(deviceId || undefined);
    micDeviceIdRef.current = deviceId || undefined;
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
      await publishToSlot(SLOT_AUDIO, newTrack);
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
      await publishToSlot(SLOT_CAMERA, newTrack);
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
    remoteCameraOn,
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
