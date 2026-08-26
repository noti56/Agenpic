export interface RosterEntry {
  userId: string;
  name: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
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
  /** Platform inside the room where this member's Claude Code agent nodes dock. */
  agentBay: Rect;
}

export type MeetingZone = Rect;

export interface OfficeLayout {
  worldWidth: number;
  worldHeight: number;
  /**
   * The office itself — the region the camera frames. The world extends well
   * past this on every side so the floor bleeds off-screen instead of ending
   * in a hard edge with letterboxing beyond it.
   */
  content: Rect;
  rooms: RoomDef[];
  meeting: MeetingZone;
}

const TILE = 64;
const ROOM_ROWS = 4;
const MIN_ROOM_COLS = 4;
const MAX_ROOM_COLS = 8;
const CORRIDOR = 2;
const MEETING_ROWS = 5;
const DOOR_WIDTH = TILE * 1.5;

/**
 * Keeps the office roughly screen-shaped for small teams. Without it a
 * two-person roster lays out as a 1-room-wide, 17-row-tall column, which
 * fit-to-view then shrinks to a narrow strip using ~30% of a typical panel.
 */
const MIN_CONTENT_COLS = 26;

/**
 * Floor drawn beyond the office on every side, as a fraction of the office's
 * longest edge, so it still covers the viewport edges when the panel's aspect
 * differs sharply from the office's. A fixed bleed can't: a wide office fitted
 * by width into a tall panel needs vertical bleed proportional to its *width*.
 */
const FLOOR_BLEED_RATIO = 1;

/** How many agent nodes (terminal tabs running Claude Code) a single room can dock side by side. */
export const AGENT_SLOT_COUNT = 4;

/** Cyberpunk accent palette — each dev room's wall trim + nameplate is drawn in one of these. */
const ACCENTS = [0x00fff2, 0xff2fd0, 0x3dffb0, 0xffd23f, 0xff4d4d, 0x7b2ff7, 0xffb14d, 0x1c6cff];

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Procedural office floor plan: developer rooms in two rows (top / bottom),
 * a shared meeting zone in the middle strip between them. No tilemap editor
 * involved — everything is computed from the roster size and rendered as
 * plain rectangles by OfficeScene. Deterministic per roster (sorted by
 * name), so a given member always gets the same room across sessions.
 *
 * Deliberately independent of viewport size: avatar coordinates are shared
 * between clients over the presence socket, so every client must agree on
 * where each room sits. Fitting the office to the window happens purely in
 * the camera (see OfficeScene.fitCameraToContent).
 */
export function computeOfficeLayout(roster: RosterEntry[]): OfficeLayout {
  const sorted = [...roster].sort((a, b) => a.name.localeCompare(b.name));
  const topCount = Math.ceil(sorted.length / 2);
  const bottomCount = sorted.length - topCount;
  const perRow = Math.max(topCount, bottomCount, 1);

  // Rooms stretch to share the floor when the team is small and settle to a
  // floor size as it grows — so the office fills its space either way.
  const roomCols = clamp(Math.floor(MIN_CONTENT_COLS / perRow) - 1, MIN_ROOM_COLS, MAX_ROOM_COLS);
  const contentCols = Math.max(MIN_CONTENT_COLS, perRow * (roomCols + 1) + 1);
  const contentRows = ROOM_ROWS * 2 + CORRIDOR * 2 + MEETING_ROWS;

  const contentWidth = contentCols * TILE;
  const contentHeight = contentRows * TILE;
  const bleed =
    Math.ceil((Math.max(contentWidth, contentHeight) * FLOOR_BLEED_RATIO) / TILE) * TILE;

  const content: Rect = { x: bleed, y: bleed, width: contentWidth, height: contentHeight };
  const worldWidth = content.width + bleed * 2;
  const worldHeight = content.height + bleed * 2;

  const meetingWidth = Math.min(content.width * 0.62, 18 * TILE);
  const meeting: MeetingZone = {
    x: content.x + (content.width - meetingWidth) / 2,
    y: content.y + (ROOM_ROWS + CORRIDOR) * TILE,
    width: meetingWidth,
    height: MEETING_ROWS * TILE,
  };

  const rooms: RoomDef[] = [];

  const placeRow = (members: RosterEntry[], rowIndex: 0 | 1) => {
    if (members.length === 0) return;
    const isTop = rowIndex === 0;
    const width = roomCols * TILE;
    const height = ROOM_ROWS * TILE;
    const roomY = isTop ? content.y : content.y + content.height - height;
    const doorSide: "top" | "bottom" = isTop ? "bottom" : "top";
    // Even gaps at both ends and between rooms, so a row always reads as
    // centered no matter how many people are in it.
    const gap = (content.width - members.length * width) / (members.length + 1);

    members.forEach((member, i) => {
      const roomX = content.x + gap * (i + 1) + width * i;
      const accent = ACCENTS[hashSeed(member.userId) % ACCENTS.length];
      const deskX = roomX + width * 0.27;
      const deskY = isTop ? roomY + height * 0.36 : roomY + height * 0.64;
      const bayWidth = width * 0.44;
      const bayHeight = 46;

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
        deskX,
        deskY,
        labelX: roomX + width / 2,
        labelY: isTop ? roomY + height + 6 : roomY - 18,
        accent,
        agentBay: {
          x: roomX + width - bayWidth - 18,
          y: deskY - bayHeight / 2,
          width: bayWidth,
          height: bayHeight,
        },
      });
    });
  };

  placeRow(sorted.slice(0, topCount), 0);
  placeRow(sorted.slice(topCount), 1);

  return { worldWidth, worldHeight, content, rooms, meeting };
}

/**
 * Where a room's Nth agent node stands on its dock — evenly spaced across
 * the bay so every slot is a distinct spot. Callers assign N by ordering the
 * room's connected agents (see PresenceMap's `agentPlacements`); hashing an
 * id into a slot instead would collide ~25% of the time with only four pads.
 */
export function agentSlotPosition(room: RoomDef, slotIndex: number): { x: number; y: number } {
  const { agentBay: bay } = room;
  const slot = ((slotIndex % AGENT_SLOT_COUNT) + AGENT_SLOT_COUNT) % AGENT_SLOT_COUNT;
  const step = bay.width / AGENT_SLOT_COUNT;
  return { x: bay.x + step * (slot + 0.5), y: bay.y + bay.height / 2 };
}

export { TILE as OFFICE_TILE_SIZE };
