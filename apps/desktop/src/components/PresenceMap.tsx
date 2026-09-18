import Phaser from "phaser";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Microphone } from "@phosphor-icons/react/Microphone";
import { MicrophoneSlash } from "@phosphor-icons/react/MicrophoneSlash";
import { VideoCamera } from "@phosphor-icons/react/VideoCamera";
import { VideoCameraSlash } from "@phosphor-icons/react/VideoCameraSlash";
import { SlidersHorizontal } from "@phosphor-icons/react/SlidersHorizontal";
import { SpeakerHigh } from "@phosphor-icons/react/SpeakerHigh";
import { Monitor } from "@phosphor-icons/react/Monitor";
import { MonitorPlay } from "@phosphor-icons/react/MonitorPlay";
import { ArrowsOut } from "@phosphor-icons/react/ArrowsOut";
import { ArrowsIn } from "@phosphor-icons/react/ArrowsIn";
import { Panel, Select } from "@agenpic/ui";
import type { ProjectRecord } from "@agenpic/types";
import { usePresence } from "../hooks/usePresence";
import { useProximityVoice } from "../hooks/useProximityVoice";
import { useProjectRoster } from "../hooks/useProjectRoster";
import { useProjectStatuses } from "../hooks/useProjectStatuses";
import { useAuth } from "../state/AuthContext";
import { HeroPicker } from "./HeroPicker";
import { agentTextureForAccent, loadStoredHero, resolveHero, storeHero } from "./sprites/heroDefs";
import { OfficeScene, type AvatarInput } from "./map/OfficeScene";
import { agentSlotPosition, computeOfficeLayout } from "./map/officeLayout";
import type { PeerState } from "../lib/presenceTypes";
import styles from "./PresenceMap.module.css";

interface PresenceMapProps {
  project: ProjectRecord;
  /** Whether the Map tab is the one currently shown (vs. mounted-but-hidden). */
  active: boolean;
}

function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 85%, 60%)`;
}

export function PresenceMap({ project, active }: PresenceMapProps) {
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<OfficeScene | null>(null);
  const hasSpawnedRef = useRef(false);

  const roster = useProjectRoster(project);
  const layout = useMemo(() => computeOfficeLayout(roster), [roster]);

  const [selfPos, setSelfPos] = useState({ x: 200, y: 150 });
  const [avSettingsOpen, setAvSettingsOpen] = useState(false);
  const [heroId, setHeroId] = useState<string | undefined>(() => (user ? loadStoredHero(user.id) : undefined));
  const selfHero = useMemo(() => resolveHero(heroId, user?.id ?? "self"), [heroId, user?.id]);
  const statuses = useProjectStatuses(project.id);

  const self = useMemo(
    () =>
      user
        ? {
            userId: user.id,
            name: user.name || user.email,
            kind: "user" as const,
            color: colorForId(user.id),
            meta: { hero: selfHero.id },
          }
        : undefined,
    [user, selfHero.id],
  );

  const { socket, socketId, peers, move, poke } = usePresence(project.id, self);
  const proximity = useProximityVoice(socket, socketId, peers, selfPos);

  // Mount the Phaser game once. All further state is pushed into the scene
  // imperatively (below) rather than through React reconciliation — Phaser
  // owns its own canvas render loop, React just feeds it data.
  //
  // This panel stays mounted-but-hidden (display:none) when another tab is
  // active — same pattern as the terminal tabs, so Phaser's WebGL context
  // isn't torn down and recreated on every switch. That means it can boot
  // while its container is 0x0. Rather than trust Scale.RESIZE to notice a
  // display:none -> block transition on its own, drive sizing explicitly
  // with a ResizeObserver and Scale.NONE.
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const scene = new OfficeScene();
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      transparent: false,
      scale: {
        mode: Phaser.Scale.NONE,
        width: Math.max(container.clientWidth, 1),
        height: Math.max(container.clientHeight, 1),
      },
      // Not pixelArt: the office props are vector primitives, the character
      // sprites are shaded art, and the glow/floor/vignette textures are
      // gradients — every one of them wants smoothing. pixelArt forces
      // NEAREST globally, which the camera's fractional fit-zoom then turns
      // into crawling sprite edges and mushy text.
      render: { antialias: true, roundPixels: false },
      scene: [scene],
    });
    gameRef.current = game;
    sceneRef.current = scene;

    const resizeObserver = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = container;
      if (clientWidth > 0 && clientHeight > 0) {
        game.scale.resize(clientWidth, clientHeight);
        scene.setViewportSize(clientWidth, clientHeight);
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      game.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setMoveHandler((x, y) => {
      setSelfPos({ x, y });
      move(x, y);
    });
  }, [move]);

  useEffect(() => {
    sceneRef.current?.setPokeHandler((toUserId) => poke(toUserId));
  }, [poke]);

  useEffect(() => {
    sceneRef.current?.setLayout(layout);
  }, [layout]);

  // This panel is always mounted (see the mount effect's comment below), so
  // a `display:none -> block` tab switch doesn't necessarily fire the
  // ResizeObserver in every webview reliably/promptly. Force a resize using
  // the container's now-current size the moment the tab actually becomes
  // visible, rather than depending solely on that observer.
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    const game = gameRef.current;
    const scene = sceneRef.current;
    if (!container || !game || !scene) return;
    const { clientWidth, clientHeight } = container;
    if (clientWidth > 0 && clientHeight > 0) {
      game.scale.resize(clientWidth, clientHeight);
      scene.setViewportSize(clientWidth, clientHeight);
    }
  }, [active]);

  // Spawn at your own room's desk the first time your room is known,
  // instead of an arbitrary fixed point — after that, position is yours to
  // walk around with (click-to-move), so this only ever runs once. Also
  // broadcast it via `move()` (not just local state), otherwise other
  // clients keep seeing the random spawn point the server assigned you on
  // connect until you make your first real click-to-move.
  useEffect(() => {
    if (hasSpawnedRef.current || !user) return;
    const ownRoom = layout.rooms.find((r) => r.userId === user.id);
    if (!ownRoom) return;
    hasSpawnedRef.current = true;
    setSelfPos({ x: ownRoom.deskX, y: ownRoom.deskY });
    move(ownRoom.deskX, ownRoom.deskY);
  }, [layout, user, move]);

  // ...but that spawn broadcast happens exactly once, and `move()` silently
  // does nothing while the socket is still connecting (or has dropped and
  // come back). When it is lost, every other client keeps us at the random
  // point the server assigned on connect — and since proximity voice/video
  // is triggered purely from those broadcast positions, two people standing
  // on the same tile would never connect. Re-announce on every (re)connect,
  // which is idempotent and costs one message.
  const selfPosRef = useRef(selfPos);
  selfPosRef.current = selfPos;
  useEffect(() => {
    if (!socketId) return;
    move(selfPosRef.current.x, selfPosRef.current.y);
  }, [socketId, move]);

  // Agent nodes stand on their owner's dock rather than wherever they were
  // spawned. Derived here, on the map, instead of being broadcast by each
  // terminal: only the map sees *all* of a member's agents at once, so it
  // can hand out one pad each with no collisions. Sorting by socketId keeps
  // every client's assignment identical without any coordination.
  const agentPlacements = useMemo(() => {
    const byOwner = new Map<string, PeerState[]>();
    for (const peer of peers) {
      if (peer.kind !== "agent") continue;
      const ownerId = peer.userId.split(":agent:")[0];
      const existing = byOwner.get(ownerId);
      if (existing) existing.push(peer);
      else byOwner.set(ownerId, [peer]);
    }

    const placements = new Map<string, { x: number; y: number; index: number; total: number }>();
    for (const [ownerId, owned] of byOwner) {
      const room = layout.rooms.find((r) => r.userId === ownerId);
      if (!room) continue; // not a project member — leave it where it is
      [...owned]
        .sort((a, b) => a.socketId.localeCompare(b.socketId))
        .forEach((peer, i) =>
          placements.set(peer.socketId, { ...agentSlotPosition(room, i), index: i, total: owned.length }),
        );
    }
    return placements;
  }, [peers, layout]);

  // An avatar's neon takes the accent of the room it belongs to, so a
  // docked agent's ring/antenna matches the walls and nameplate around it
  // rather than being one more unrelated colour on screen.
  const accentByUser = useMemo(
    () => new Map(layout.rooms.map((room) => [room.userId, room.accent])),
    [layout],
  );

  useEffect(() => {
    if (!user) return;
    const avatars: AvatarInput[] = [
      {
        id: "self",
        x: selfPos.x,
        y: selfPos.y,
        textureKey: selfHero.textureKey,
        name: `${user.name || user.email} (you)`,
        statusLabel: statuses.get(`${user.id}:user`),
        connected: true,
        isSelf: true,
        accent: accentByUser.get(user.id),
      },
      ...peers.map((peer): AvatarInput => {
        const isAgent = peer.kind === "agent";
        const docked = isAgent ? agentPlacements.get(peer.socketId) : undefined;
        const ownerId = isAgent ? peer.userId.split(":agent:")[0] : peer.userId;
        return {
          id: peer.socketId,
          x: docked?.x ?? peer.x,
          y: docked?.y ?? peer.y,
          accent: accentByUser.get(ownerId),
          docked: !!docked,
          textureKey: isAgent
            ? agentTextureForAccent(accentByUser.get(ownerId))
            : resolveHero(peer.meta?.hero, peer.userId).textureKey,
          // A docked agent already sits inside its owner's room, so the
          // owner and project-path lines are redundant there. The pads are
          // only ~35px apart, so a second docked agent drops to its slot
          // number alone — "claude 2" beside "claude 3" overlaps into mush.
          name: docked ? (docked.total > 1 ? `${docked.index + 1}` : "claude") : peer.name,
          ownerLabel: isAgent && !docked ? peer.meta?.owner : undefined,
          pathLabel:
            isAgent && !docked ? peer.meta?.path?.split(/[\\/]/).filter(Boolean).pop() : undefined,
          statusLabel: statuses.get(`${isAgent ? ownerId : peer.userId}:${isAgent ? "agent" : "user"}`),
          pokeable: !isAgent,
          peerUserId: isAgent ? undefined : peer.userId,
          connected: proximity.connectedPeerIds.has(peer.socketId),
          isSelf: false,
        };
      }),
    ];
    sceneRef.current?.syncAvatars(avatars);
  }, [user, selfPos, selfHero.textureKey, statuses, peers, proximity.connectedPeerIds, agentPlacements, accentByUser]);

  const handleHeroSelect = (id: string) => {
    setHeroId(id);
    if (user) storeHero(user.id, id);
  };

  if (!user) return null;

  return (
    <div className={styles.mapWrap}>
      <div ref={containerRef} className={styles.canvasHost} />

      <div className={styles.toolbar}>
        <HeroPicker hero={selfHero} onSelect={handleHeroSelect} />
        <button
          type="button"
          className={[styles.iconBtn, proximity.micOn ? styles.iconBtnActive : styles.iconBtnOff].join(" ")}
          onClick={proximity.toggleMic}
          title={proximity.micOn ? "Mute microphone" : "Unmute microphone"}
          aria-label={proximity.micOn ? "Mute microphone" : "Unmute microphone"}
          aria-pressed={proximity.micOn}
        >
          {proximity.micOn ? <Microphone size={16} weight="bold" /> : <MicrophoneSlash size={16} weight="bold" />}
        </button>
        <button
          type="button"
          className={[styles.iconBtn, proximity.cameraOn ? styles.iconBtnActive : styles.iconBtnOff].join(" ")}
          onClick={proximity.toggleCamera}
          title={proximity.cameraOn ? "Turn camera off" : "Turn camera on"}
          aria-label={proximity.cameraOn ? "Turn camera off" : "Turn camera on"}
          aria-pressed={proximity.cameraOn}
        >
          {proximity.cameraOn ? <VideoCamera size={16} weight="bold" /> : <VideoCameraSlash size={16} weight="bold" />}
        </button>
        <button
          type="button"
          className={[styles.iconBtn, proximity.screenShareOn ? styles.iconBtnActive : ""].join(" ")}
          onClick={proximity.toggleScreenShare}
          title={proximity.screenShareOn ? "Stop sharing screen" : "Share screen"}
          aria-label={proximity.screenShareOn ? "Stop sharing screen" : "Share screen"}
          aria-pressed={proximity.screenShareOn}
        >
          {proximity.screenShareOn ? <MonitorPlay size={16} weight="bold" /> : <Monitor size={16} weight="bold" />}
        </button>
        <div className={styles.avSettingsWrap}>
          <button
            type="button"
            className={[styles.iconBtn, avSettingsOpen ? styles.iconBtnActive : ""].join(" ")}
            onClick={() => setAvSettingsOpen((v) => !v)}
            title="Audio & video settings"
            aria-label="Audio & video settings"
            aria-pressed={avSettingsOpen}
          >
            <SlidersHorizontal size={16} weight="bold" />
          </button>
          {avSettingsOpen && (
            <Panel className={styles.avSettings}>
              <Select
                label="Microphone"
                value={proximity.micDeviceId ?? ""}
                onChange={(e) => proximity.setMicDevice(e.target.value)}
                options={[
                  { value: "", label: "System default" },
                  ...proximity.micDevices.map((d, i) => ({
                    value: d.deviceId,
                    label: d.label || `Microphone ${i + 1}`,
                  })),
                ]}
              />
              <Select
                label="Camera"
                value={proximity.cameraDeviceId ?? ""}
                onChange={(e) => proximity.setCameraDevice(e.target.value)}
                options={[
                  { value: "", label: "System default" },
                  ...proximity.cameraDevices.map((d, i) => ({
                    value: d.deviceId,
                    label: d.label || `Camera ${i + 1}`,
                  })),
                ]}
              />
              <label className={styles.volumeField}>
                <span className={styles.volumeLabel}>
                  <SpeakerHigh size={14} weight="bold" />
                  Volume — {proximity.volume}%
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={proximity.volume}
                  onChange={(e) => proximity.setVolume(Number(e.target.value))}
                  className={styles.volumeSlider}
                />
              </label>
            </Panel>
          )}
        </div>
      </div>

      <div className={styles.hint}>Click anywhere to move · get close to teammates to talk</div>

      <div className={styles.callStrip}>
        {proximity.cameraOn && <LocalPreview stream={proximity.localStream} />}
        {proximity.screenShareOn && (
          <ScreenShareTile stream={proximity.screenStream} label="Your screen" muted />
        )}
        {[...proximity.remoteStreams.entries()].map(([socketId, stream]) => (
          <RemotePeerMedia
            key={socketId}
            stream={stream}
            volume={proximity.volume}
            hasVideo={proximity.remoteCameraOn.has(socketId)}
          />
        ))}
        {[...proximity.remoteScreenStreams.entries()].map(([socketId, stream]) => {
          const peer = peers.find((p) => p.socketId === socketId);
          return (
            <ScreenShareTile
              key={`screen-${socketId}`}
              stream={stream}
              label={peer ? `${peer.name}'s screen` : "Screen share"}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Overlay button shown on hover, present on every video tile — expands the
 * tile's own container into fullscreen so a shared screen or a teammate's
 * camera can be viewed larger, independent of every other tile. */
function FullscreenButton({ targetRef }: { targetRef: RefObject<HTMLElement | null> }) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === targetRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    if (document.fullscreenElement === targetRef.current) {
      document.exitFullscreen().catch(() => {});
    } else {
      targetRef.current?.requestFullscreen?.().catch(() => {});
    }
  };

  return (
    <button
      type="button"
      className={styles.fullscreenBtn}
      onClick={toggle}
      title={isFullscreen ? "Exit full screen" : "Full screen"}
      aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
    >
      {isFullscreen ? <ArrowsIn size={13} weight="bold" /> : <ArrowsOut size={13} weight="bold" />}
    </button>
  );
}

function LocalPreview({ stream }: { stream: MediaStream | null }) {
  const tileRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (el && stream && el.srcObject !== stream) el.srcObject = stream;
  }, [stream]);

  return (
    <div ref={tileRef} className={styles.videoTile}>
      <video ref={videoRef} className={styles.videoEl} autoPlay muted playsInline />
      <span className={styles.videoTileLabel}>You</span>
      <FullscreenButton targetRef={tileRef} />
    </div>
  );
}

/**
 * The peer's sound, and nothing else.
 *
 * Deliberately its own element, portalled to <body> and never hidden. Remote
 * audio used to ride along on the video tile, which is `display:none`
 * whenever that peer's camera is off — and the whole map panel is
 * additionally `display:none` whenever another tab is active. A hidden media
 * element is not a dependable audio sink (WebView2 in particular stops
 * driving it), which is why voice appeared to work only while somebody's
 * camera happened to be on. Keeping the sink permanently mounted and visible
 * to the layout decouples "can I hear them" from "is a tile on screen".
 */
function RemoteAudio({ stream, volume }: { stream: MediaStream; volume: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || el.srcObject === stream) return;
    el.srcObject = stream;
    const tryPlay = () => {
      el.play().catch(() => {
        /* autoplay refused — retried on the next gesture below */
      });
    };
    tryPlay();
    // If the autoplay policy refused us, the user's next interaction is the
    // first moment playback is allowed to start.
    document.addEventListener("pointerdown", tryPlay);
    document.addEventListener("keydown", tryPlay);
    return () => {
      document.removeEventListener("pointerdown", tryPlay);
      document.removeEventListener("keydown", tryPlay);
    };
  }, [stream]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume]);

  return createPortal(<audio ref={audioRef} autoPlay />, document.body);
}

function RemotePeerMedia({
  stream,
  volume,
  hasVideo,
}: {
  stream: MediaStream;
  volume: number;
  /** Driven by the peer's broadcast media-state, not by track presence: under the
   *  fixed-transceiver-slot design the video track always exists, it is just muted
   *  when their camera is off. */
  hasVideo: boolean;
}) {
  const tileRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || el.srcObject === stream) return;
    el.srcObject = stream;
    el.play().catch(() => {
      /* muted video: the policy allows this, and RemoteAudio owns the sound */
    });
  }, [stream]);

  return (
    <>
      <RemoteAudio stream={stream} volume={volume} />
      <div ref={tileRef} className={styles.videoTile}>
      {/* Muted on purpose — RemoteAudio is the single audio sink, so this
          element carrying the same stream must not double up the sound. */}
      <video
        ref={videoRef}
        className={styles.videoEl}
        autoPlay
        playsInline
        muted
        style={hasVideo ? undefined : { display: "none" }}
      />
      {!hasVideo && (
        <div className={styles.audioOnlyTile}>
          <Microphone size={18} weight="bold" />
        </div>
      )}
      {hasVideo && <FullscreenButton targetRef={tileRef} />}
      </div>
    </>
  );
}

function ScreenShareTile({
  stream,
  label,
  muted,
}: {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
}) {
  const tileRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (el && stream && el.srcObject !== stream) el.srcObject = stream;
  }, [stream]);

  return (
    <div ref={tileRef} className={[styles.videoTile, styles.screenTile].join(" ")}>
      <video ref={videoRef} className={styles.videoEl} autoPlay muted={muted} playsInline />
      <span className={styles.videoTileLabel}>{label}</span>
      <FullscreenButton targetRef={tileRef} />
    </div>
  );
}
