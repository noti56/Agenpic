import robotUrl from "../../assets/map/characters/robot.png";
import roninUrl from "../../assets/map/characters/ronin.png";
import novaUrl from "../../assets/map/characters/nova.png";
import blazeUrl from "../../assets/map/characters/blaze.png";
import jadeUrl from "../../assets/map/characters/jade.png";
import ghostUrl from "../../assets/map/characters/ghost.png";
import byteUrl from "../../assets/map/characters/byte.png";

export interface HeroDef {
  id: string;
  name: string;
  /** Phaser texture key this hero is preloaded under — see OfficeScene. */
  textureKey: string;
  /** Accent used for the picker's active ring and the avatar's proximity glow. */
  accent: string;
}

export const HERO_DEFS: HeroDef[] = [
  { id: "ronin", name: "Ronin", textureKey: "hero-ronin", accent: "#ff4d4d" },
  { id: "nova", name: "Nova", textureKey: "hero-nova", accent: "#00fff2" },
  { id: "blaze", name: "Blaze", textureKey: "hero-blaze", accent: "#ffb14d" },
  { id: "jade", name: "Jade", textureKey: "hero-jade", accent: "#2ecc71" },
  { id: "ghost", name: "Ghost", textureKey: "hero-ghost", accent: "#c9d6e8" },
  { id: "byte", name: "Byte", textureKey: "hero-byte", accent: "#ffd23f" },
];

/** Texture key for the agent (Claude Code Terminal) avatar — preloaded once, shared by every agent node. */
export const AGENT_TEXTURE_KEY = "hero-robot";

/** Everything OfficeScene needs to preload, keyed by the same textureKey each HeroDef/AGENT_TEXTURE_KEY refers to. */
export const SPRITE_URLS: Record<string, string> = {
  "hero-robot": robotUrl,
  "hero-ronin": roninUrl,
  "hero-nova": novaUrl,
  "hero-blaze": blazeUrl,
  "hero-jade": jadeUrl,
  "hero-ghost": ghostUrl,
  "hero-byte": byteUrl,
};

/** Deterministic hash used to pick a stable default hero for peers who haven't chosen one yet. */
function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash;
}

export function resolveHero(heroId: string | undefined, fallbackSeed: string): HeroDef {
  const found = heroId ? HERO_DEFS.find((h) => h.id === heroId) : undefined;
  return found ?? HERO_DEFS[hashSeed(fallbackSeed) % HERO_DEFS.length];
}

const HERO_STORAGE_PREFIX = "agp:hero:";

export function loadStoredHero(userId: string): string | undefined {
  try {
    return localStorage.getItem(HERO_STORAGE_PREFIX + userId) ?? undefined;
  } catch {
    return undefined;
  }
}

export function storeHero(userId: string, heroId: string): void {
  try {
    localStorage.setItem(HERO_STORAGE_PREFIX + userId, heroId);
  } catch {
    // storage unavailable (private mode, etc) — selection just won't persist
  }
}
