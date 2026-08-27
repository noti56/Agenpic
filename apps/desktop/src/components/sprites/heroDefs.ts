import hero01 from "../../assets/map/characters/hero-01.png";
import hero02 from "../../assets/map/characters/hero-02.png";
import hero03 from "../../assets/map/characters/hero-03.png";
import hero04 from "../../assets/map/characters/hero-04.png";
import hero05 from "../../assets/map/characters/hero-05.png";
import hero06 from "../../assets/map/characters/hero-06.png";
import hero07 from "../../assets/map/characters/hero-07.png";
import hero08 from "../../assets/map/characters/hero-08.png";
import hero09 from "../../assets/map/characters/hero-09.png";
import hero10 from "../../assets/map/characters/hero-10.png";
import hero11 from "../../assets/map/characters/hero-11.png";
import hero12 from "../../assets/map/characters/hero-12.png";
import hero13 from "../../assets/map/characters/hero-13.png";
import hero14 from "../../assets/map/characters/hero-14.png";
import hero15 from "../../assets/map/characters/hero-15.png";
import agent01 from "../../assets/map/agents/agent-01.png";
import agent02 from "../../assets/map/agents/agent-02.png";
import agent03 from "../../assets/map/agents/agent-03.png";
import agent04 from "../../assets/map/agents/agent-04.png";
import agent05 from "../../assets/map/agents/agent-05.png";
import agent06 from "../../assets/map/agents/agent-06.png";
import agent07 from "../../assets/map/agents/agent-07.png";
import agent08 from "../../assets/map/agents/agent-08.png";
import agent09 from "../../assets/map/agents/agent-09.png";

export interface HeroDef {
  id: string;
  name: string;
  /** Phaser texture key this hero is preloaded under — see OfficeScene. */
  textureKey: string;
}

/**
 * The pickable player characters. `id` is persisted (localStorage per user,
 * and broadcast to peers as `meta.hero`), so ids must stay stable even if
 * the art behind them is replaced — the first six keep the names they had
 * under the previous sprite set so existing picks still resolve.
 */
export const HERO_DEFS: HeroDef[] = [
  { id: "ghost", name: "Ghost", textureKey: "hero-01" },
  { id: "nova", name: "Nova", textureKey: "hero-02" },
  { id: "byte", name: "Byte", textureKey: "hero-03" },
  { id: "ronin", name: "Ronin", textureKey: "hero-04" },
  { id: "blaze", name: "Blaze", textureKey: "hero-05" },
  { id: "spectre", name: "Spectre", textureKey: "hero-06" },
  { id: "jade", name: "Jade", textureKey: "hero-07" },
  { id: "cobalt", name: "Cobalt", textureKey: "hero-08" },
  { id: "ash", name: "Ash", textureKey: "hero-09" },
  { id: "rust", name: "Rust", textureKey: "hero-10" },
  { id: "vex", name: "Vex", textureKey: "hero-11" },
  { id: "onyx", name: "Onyx", textureKey: "hero-12" },
  { id: "ember", name: "Ember", textureKey: "hero-13" },
  { id: "moss", name: "Moss", textureKey: "hero-14" },
  { id: "copper", name: "Copper", textureKey: "hero-15" },
];

export interface AgentVariant {
  textureKey: string;
  /**
   * The neon this robot actually carries, sampled from its own art rather
   * than read off the source board's captions — a couple of those captions
   * name a colour the robot beneath them isn't drawn in.
   */
  accent: number;
}

/** The Claude Code agent robot, in nine team colours. */
export const AGENT_VARIANTS: AgentVariant[] = [
  { textureKey: "agent-01", accent: 0x16e1e1 },
  { textureKey: "agent-02", accent: 0xe048a5 },
  { textureKey: "agent-03", accent: 0x33e6c7 },
  { textureKey: "agent-04", accent: 0xf0b93f },
  { textureKey: "agent-05", accent: 0x9d47d8 },
  { textureKey: "agent-06", accent: 0x1ca3e7 },
  { textureKey: "agent-07", accent: 0x1b8aea },
  { textureKey: "agent-08", accent: 0xe84738 },
  { textureKey: "agent-09", accent: 0xeb9833 },
];

export const DEFAULT_AGENT_TEXTURE_KEY = AGENT_VARIANTS[0].textureKey;

/** Everything OfficeScene needs to preload, keyed by the textureKey each def refers to. */
export const SPRITE_URLS: Record<string, string> = {
  "hero-01": hero01,
  "hero-02": hero02,
  "hero-03": hero03,
  "hero-04": hero04,
  "hero-05": hero05,
  "hero-06": hero06,
  "hero-07": hero07,
  "hero-08": hero08,
  "hero-09": hero09,
  "hero-10": hero10,
  "hero-11": hero11,
  "hero-12": hero12,
  "hero-13": hero13,
  "hero-14": hero14,
  "hero-15": hero15,
  "agent-01": agent01,
  "agent-02": agent02,
  "agent-03": agent03,
  "agent-04": agent04,
  "agent-05": agent05,
  "agent-06": agent06,
  "agent-07": agent07,
  "agent-08": agent08,
  "agent-09": agent09,
};

const AGENT_TEXTURE_KEYS = new Set(AGENT_VARIANTS.map((v) => v.textureKey));

export function isAgentTexture(textureKey: string): boolean {
  return AGENT_TEXTURE_KEYS.has(textureKey);
}

/**
 * Perceptually weighted RGB distance — green counts most, blue least. Plain
 * euclidean RGB puts the purple and the blue robot about equally far from a
 * cyan room accent; this doesn't.
 */
function colorDistance(a: number, b: number): number {
  const dr = ((a >> 16) & 0xff) - ((b >> 16) & 0xff);
  const dg = ((a >> 8) & 0xff) - ((b >> 8) & 0xff);
  const db = (a & 0xff) - (b & 0xff);
  return 3 * dr * dr + 4 * dg * dg + 2 * db * db;
}

/**
 * The agent robot whose neon best matches a room's accent, so a member's
 * Claude Code sessions are colour-matched to the room they dock in. Falls
 * back to the cyan robot when the caller has no room (an agent whose owner
 * isn't a project member, so has no desk to dock at).
 */
export function agentTextureForAccent(accent: number | undefined): string {
  if (accent === undefined) return DEFAULT_AGENT_TEXTURE_KEY;
  let best = AGENT_VARIANTS[0];
  let bestDistance = Infinity;
  for (const variant of AGENT_VARIANTS) {
    const distance = colorDistance(accent, variant.accent);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = variant;
    }
  }
  return best.textureKey;
}

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
