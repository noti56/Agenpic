import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { usePresence } from "../hooks/usePresence";
import { useProximityVoice } from "../hooks/useProximityVoice";
import { useAuth } from "../state/AuthContext";
import { HeroPicker } from "./HeroPicker";
import { HeroSprite } from "./sprites/HeroSprite";
import { RobotSprite } from "./sprites/RobotSprite";
import { loadStoredHero, resolveHero, storeHero } from "./sprites/heroDefs";
import type { PeerState } from "../lib/presenceTypes";
import styles from "./PresenceMap.module.css";

interface PresenceMapProps {
  projectId: string;
}

function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 85%, 60%)`;
}

/** Tracks left/right facing and a brief "walking" flag whenever x/y changes, so
 * sprites can animate a walk cycle instead of just teleporting between spots. */
function useMotion(x: number, y: number) {
  const [facing, setFacing] = useState<"left" | "right">("right");
  const [walking, setWalking] = useState(false);
  const prevRef = useRef({ x, y });
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const prev = prevRef.current;
    const dx = x - prev.x;
    const dy = y - prev.y;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      if (Math.abs(dx) > 0.5) setFacing(dx > 0 ? "right" : "left");
      setWalking(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setWalking(false), 320);
    }
    prevRef.current = { x, y };
  }, [x, y]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { facing, walking };
}

export function PresenceMap({ projectId }: PresenceMapProps) {
  const { user } = useAuth();
  const mapRef = useRef<HTMLDivElement | null>(null);
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

  const { socket, peers, move } = usePresence(projectId, self);

  const proximity = useProximityVoice(socket, socket?.id, peers, selfPos);
  const selfMotion = useMotion(selfPos.x, selfPos.y);

  const handleMapClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const x = Math.max(20, Math.min(rect.width - 20, e.clientX - rect.left));
    const y = Math.max(20, Math.min(rect.height - 20, e.clientY - rect.top));
    setSelfPos({ x, y });
    move(x, y);
  };

  const handleHeroSelect = (id: string) => {
    setHeroId(id);
    if (user) storeHero(user.id, id);
  };

  if (!user) return null;

  return (
    <div className={styles.mapWrap} ref={mapRef} onClick={handleMapClick}>
      <div className={styles.floorProps} aria-hidden>
        <div className={[styles.rug, styles.rugCyan].join(" ")} />
        <div className={styles.plant} style={{ left: "6%", top: "12%" }} />
        <div className={styles.plant} style={{ right: "8%", bottom: "14%" }} />
        <div className={styles.deskGlow} style={{ right: "10%", top: "10%" }} />
      </div>

      <div className={styles.toolbar} onClick={(e) => e.stopPropagation()}>
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

      {/* self */}
      <div className={styles.avatar} style={{ left: selfPos.x, top: selfPos.y }}>
        <div className={styles.shadow} />
        <HeroSprite hero={selfHero} facing={selfMotion.facing} walking={selfMotion.walking} glowColor="var(--agp-cyan)" />
        <span className={styles.label}>{user.name || user.email} (you)</span>
      </div>

      {/* remote peers (users + agent nodes) */}
      {peers.map((peer) => (
        <PeerAvatar key={peer.socketId} peer={peer} connected={proximity.connectedPeerIds.has(peer.socketId)} />
      ))}

      {[...proximity.remoteStreams.entries()].map(([socketId, stream]) => (
        <RemoteAudio key={socketId} stream={stream} />
      ))}
    </div>
  );
}

function PeerAvatar({ peer, connected }: { peer: PeerState; connected: boolean }) {
  const motion = useMotion(peer.x, peer.y);
  const isAgent = peer.kind === "agent";
  const hero = useMemo(() => resolveHero(peer.meta?.hero, peer.userId), [peer.meta?.hero, peer.userId]);

  return (
    <div className={styles.avatar} style={{ left: peer.x, top: peer.y }}>
      <div className={[styles.shadow, connected ? styles.shadowConnected : ""].join(" ")} />
      {isAgent ? (
        <RobotSprite facing={motion.facing} walking={motion.walking} active={connected} accent={peer.color} />
      ) : (
        <HeroSprite
          hero={hero}
          facing={motion.facing}
          walking={motion.walking}
          glowColor={connected ? "var(--agp-success)" : undefined}
        />
      )}
      <span className={styles.label}>{peer.name}</span>
      {isAgent && peer.meta?.path && (
        <span className={styles.pathLabel}>{peer.meta.path.split(/[\\/]/).filter(Boolean).pop()}</span>
      )}
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
