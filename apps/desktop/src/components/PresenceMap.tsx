import Phaser from "phaser";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectRecord } from "@agenpic/types";
import { usePresence } from "../hooks/usePresence";
import { useProximityVoice } from "../hooks/useProximityVoice";
import { useProjectRoster } from "../hooks/useProjectRoster";
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
  const [heroId, setHeroId] = useState<string | undefined>(() => (user ? loadStoredHero(user.id) : undefined));
  const selfHero = useMemo(() => resolveHero(heroId, user?.id ?? "self"), [heroId, user?.id]);

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

  const { socket, peers, move } = usePresence(project.id, self);
  const proximity = useProximityVoice(socket, socket?.id, peers, selfPos);

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
          connected: proximity.connectedPeerIds.has(peer.socketId),
          isSelf: false,
        };
      }),
    ];
    sceneRef.current?.syncAvatars(avatars);
  }, [user, selfPos, selfHero.textureKey, peers, proximity.connectedPeerIds, agentPlacements, accentByUser]);

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
          className={[styles.toolBtn, proximity.micOn ? styles.toolBtnActive : ""].join(" ")}
          onClick={proximity.toggleMic}
        >
          {proximity.micOn ? "Mic On" : "Mic Off"}
        </button>
        <button
          type="button"
          className={[styles.toolBtn, proximity.cameraOn ? styles.toolBtnActive : ""].join(" ")}
          onClick={proximity.toggleCamera}
        >
          {proximity.cameraOn ? "Camera On" : "Camera Off"}
        </button>
      </div>

      <div className={styles.hint}>Click anywhere to move · get close to teammates to talk</div>

      {[...proximity.remoteStreams.entries()].map(([socketId, stream]) => (
        <RemoteAudio key={socketId} stream={stream} />
      ))}
    </div>
  );
}

function RemoteAudio({ stream }: { stream: MediaStream }) {
  return (
    <audio
      autoPlay
      ref={(el) => {
        if (el) el.srcObject = stream;
      }}
    />
  );
}
