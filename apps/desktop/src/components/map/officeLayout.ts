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
  /** Centre of the wall-mounted nameplate, on the room's back wall (opposite the door). */
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
/**
 * Five columns is the narrowest a room can be and still fit a desk beside a
 * four-pad agent dock without the docked robots touching each other.
 */
const MIN_ROOM_COLS = 5;
const MAX_ROOM_COLS = 8;
const CORRIDOR = 2;
const MEETING_ROWS = 5;
const DOOR_WIDTH = TILE * 1.5;

/**
 * Wall thickness. The "neon grid office" look wants walls solid enough to
 * carry a lit top face plus an inner shadow (see OfficeScene.drawRoom) — a
 * hairline rectangle outline reads as a diagram, not a building.
 */
export const WALL_THICKNESS = 18;

/** Depth of the darker south-facing strip that gives each wall its top-face relief. */
export const WALL_CAP = 6;

/** Width of the lit pillar block capping each side of a doorway. */
export const DOOR_PILLAR = 14;

/**
 * The column budget rooms are sized against: rooms get narrower as more of
 * them have to share a row, down to MIN_ROOM_COLS. This is not the office's
 * width — that follows from how many rooms actually get placed.
 */
const ROOM_COLS_BUDGET = 26;

/**
 * Floor the office's width, so a one- or two-person team still has a meeting
 * zone with room around it rather than a corridor-width strip.
 */
const MIN_CONTENT_COLS = 16;

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
  const roomCols = clamp(Math.floor(ROOM_COLS_BUDGET / perRow) - 1, MIN_ROOM_COLS, MAX_ROOM_COLS);
  // The office is only as wide as the rooms it actually holds. Fixing it at
  // a large width instead left a small team's rooms marooned in the middle
  // of a mostly empty floor.
  const contentCols = Math.max(MIN_CONTENT_COLS, perRow * (roomCols + 1) + 1);
  // Likewise the height: with one or two people everyone fits in the top
  // row, and reserving the bottom row anyway left a quarter of the map as
  // permanently blank floor below the meeting zone.
  const roomBands = bottomCount > 0 ? 2 : 1;
  const contentRows = ROOM_ROWS * roomBands + CORRIDOR * 2 + MEETING_ROWS;

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
      // Where the occupant *stands* — not where the desk is drawn. Avatar
      // sprites are bottom-anchored and ~56px tall, so a spawn point on the
      // desk itself buries the furniture; OfficeScene draws the desk a
      // sprite-height further toward the back wall from here.
      const deskY = isTop ? roomY + height * 0.6 : roomY + height * 0.4;
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
        // Mounted on the back wall (the one without the door), directly over
        // the desk — like the lit nameplate screens in the reference art,
        // rather than floating on the corridor floor outside the room.
        labelX: deskX,
        labelY: isTop ? roomY + WALL_THICKNESS + 15 : roomY + height - WALL_THICKNESS - 15,
        accent,
        agentBay: {
          x: roomX + width - bayWidth - WALL_THICKNESS - 10,
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
