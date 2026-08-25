import Phaser from "phaser";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectRecord } from "@agenpic/types";
import { usePresence } from "../hooks/usePresence";
import { useProximityVoice } from "../hooks/useProximityVoice";
import { useProjectRoster } from "../hooks/useProjectRoster";
import { useAuth } from "../state/AuthContext";
import { HeroPicker } from "./HeroPicker";
import { AGENT_TEXTURE_KEY, loadStoredHero, resolveHero, storeHero } from "./sprites/heroDefs";
import { OfficeScene, type AvatarInput } from "./map/OfficeScene";
import { computeOfficeLayout } from "./map/officeLayout";
import styles from "./PresenceMap.module.css";

interface PresenceMapProps {
  project: ProjectRecord;
}

function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 85%, 60%)`;
}

export function PresenceMap({ project }: PresenceMapProps) {
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
      render: { pixelArt: true, antialias: false },
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

  // Spawn at your own room's desk the first time your room is known,
  // instead of an arbitrary fixed point — after that, position is yours to
  // walk around with (click-to-move), so this only ever runs once.
  useEffect(() => {
    if (hasSpawnedRef.current || !user) return;
    const ownRoom = layout.rooms.find((r) => r.userId === user.id);
    if (!ownRoom) return;
    hasSpawnedRef.current = true;
    setSelfPos({ x: ownRoom.deskX, y: ownRoom.deskY });
  }, [layout, user]);

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
      },
      ...peers.map((peer): AvatarInput => {
        const isAgent = peer.kind === "agent";
        return {
          id: peer.socketId,
          x: peer.x,
          y: peer.y,
          textureKey: isAgent
            ? AGENT_TEXTURE_KEY
            : resolveHero(peer.meta?.hero, peer.userId).textureKey,
          name: peer.name,
          ownerLabel: isAgent ? peer.meta?.owner : undefined,
          pathLabel: isAgent ? peer.meta?.path?.split(/[\\/]/).filter(Boolean).pop() : undefined,
          connected: proximity.connectedPeerIds.has(peer.socketId),
          isSelf: false,
        };
      }),
    ];
    sceneRef.current?.syncAvatars(avatars);
  }, [user, selfPos, selfHero.textureKey, peers, proximity.connectedPeerIds]);

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
