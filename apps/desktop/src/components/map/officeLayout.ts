export interface RosterEntry {
  userId: string;
  name: string;
}

export interface RoomDef {
  userId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  doorSide: "top" | "bottom";
  doorX: number;
  doorWidth: number;
  deskX: number;
  deskY: number;
  labelX: number;
  labelY: number;
  accent: number;
}

export interface MeetingZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OfficeLayout {
  worldWidth: number;
  worldHeight: number;
  rooms: RoomDef[];
  meeting: MeetingZone;
}

const TILE = 64;
const ROOM_COLS = 4;
const ROOM_ROWS = 4;
const CORRIDOR = 2;
const MEETING_ROWS = 5;
const MARGIN = 2;
const DOOR_WIDTH = TILE * 1.5;

/** Cyberpunk accent palette — each dev room's wall trim + nameplate is drawn in one of these. */
const ACCENTS = [0x00fff2, 0xff2fd0, 0x3dffb0, 0xffd23f, 0xff4d4d, 0x7b2ff7, 0xffb14d, 0x1c6cff];

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash;
}

/**
 * Procedural office floor plan: developer rooms in two rows (top / bottom),
 * a shared meeting zone in the middle strip between them. No tilemap editor
 * involved — everything is computed from the roster size and rendered as
 * plain rectangles by OfficeScene. Deterministic per roster (sorted by
 * name), so a given member always gets the same room across sessions.
 */
export function computeOfficeLayout(roster: RosterEntry[]): OfficeLayout {
  const sorted = [...roster].sort((a, b) => a.name.localeCompare(b.name));
  const topCount = Math.ceil(sorted.length / 2);
  const bottomCount = sorted.length - topCount;
  const ringWidth = Math.max(topCount, bottomCount, 1);

  const worldCols = ringWidth * ROOM_COLS + MARGIN * 2;
  const worldRows = ROOM_ROWS * 2 + CORRIDOR * 2 + MEETING_ROWS + MARGIN * 2;
  const worldWidth = worldCols * TILE;
  const worldHeight = worldRows * TILE;

  const meeting: MeetingZone = {
    x: MARGIN * TILE,
    y: (MARGIN + ROOM_ROWS + CORRIDOR) * TILE,
    width: ringWidth * ROOM_COLS * TILE,
    height: MEETING_ROWS * TILE,
  };

  const rooms: RoomDef[] = [];

  const placeRow = (members: RosterEntry[], rowIndex: 0 | 1) => {
    const isTop = rowIndex === 0;
    const offsetRooms = Math.floor((ringWidth - members.length) / 2);
    const roomY = isTop ? MARGIN * TILE : (MARGIN + ROOM_ROWS + CORRIDOR + MEETING_ROWS + CORRIDOR) * TILE;
    const doorSide: "top" | "bottom" = isTop ? "bottom" : "top";

    members.forEach((member, i) => {
      const roomX = (MARGIN + offsetRooms + i * ROOM_COLS) * TILE;
      const width = ROOM_COLS * TILE;
      const height = ROOM_ROWS * TILE;
      const accent = ACCENTS[hashSeed(member.userId) % ACCENTS.length];

      rooms.push({
        userId: member.userId,
        name: member.name,
        x: roomX,
        y: roomY,
        width,
        height,
        doorSide,
        doorX: roomX + width / 2 - DOOR_WIDTH / 2,
        doorWidth: DOOR_WIDTH,
        deskX: roomX + width / 2,
        deskY: isTop ? roomY + height * 0.32 : roomY + height * 0.68,
        labelX: roomX + width / 2,
        labelY: isTop ? roomY + height + 6 : roomY - 18,
        accent,
      });
    });
  };

  placeRow(sorted.slice(0, topCount), 0);
  placeRow(sorted.slice(topCount), 1);

  return { worldWidth, worldHeight, rooms, meeting };
}

export { TILE as OFFICE_TILE_SIZE };
