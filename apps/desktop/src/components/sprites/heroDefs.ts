export type HairStyle = "spiky" | "mohawk" | "pony" | "bob" | "hood" | "helmet";

export interface HeroDef {
  id: string;
  name: string;
  skin: string;
  hair: string;
  outfit: string;
  outfitDark: string;
  accent: string;
  hairStyle: HairStyle;
}

export const HERO_DEFS: HeroDef[] = [
  {
    id: "ronin",
    name: "Ronin",
    skin: "#e8b98c",
    hair: "#2b2b2b",
    outfit: "#ff4d4d",
    outfitDark: "#8c1f1f",
    accent: "#ffcf4d",
    hairStyle: "spiky",
  },
  {
    id: "nova",
    name: "Nova",
    skin: "#f0c9a0",
    hair: "#2fd0ff",
    outfit: "#1c6cff",
    outfitDark: "#0d3aa0",
    accent: "#00fff2",
    hairStyle: "pony",
  },
  {
    id: "blaze",
    name: "Blaze",
    skin: "#d9a066",
    hair: "#ff7a1a",
    outfit: "#ff9d1a",
    outfitDark: "#b5590a",
    accent: "#ffe14d",
    hairStyle: "mohawk",
  },
  {
    id: "jade",
    name: "Jade",
    skin: "#e6b892",
    hair: "#14251a",
    outfit: "#2ecc71",
    outfitDark: "#1c7a44",
    accent: "#d4ffea",
    hairStyle: "bob",
  },
  {
    id: "ghost",
    name: "Ghost",
    skin: "#cfd6e4",
    hair: "#7b2ff7",
    outfit: "#7b2ff7",
    outfitDark: "#4a1b99",
    accent: "#e0d4ff",
    hairStyle: "hood",
  },
  {
    id: "byte",
    name: "Byte",
    skin: "#caa98a",
    hair: "#ffd23f",
    outfit: "#ffd23f",
    outfitDark: "#cc9e00",
    accent: "#00fff2",
    hairStyle: "helmet",
  },
];

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
