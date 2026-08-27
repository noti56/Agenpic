import Phaser from "phaser";
import { isAgentTexture, SPRITE_URLS } from "../sprites/heroDefs";
import {
  AGENT_SLOT_COUNT,
  agentSlotPosition,
  DOOR_PILLAR,
  OFFICE_TILE_SIZE as TILE,
  WALL_CAP,
  WALL_THICKNESS,
  type OfficeLayout,
  type RoomDef,
} from "./officeLayout";

export interface AvatarInput {
  /** "self" for the local user, otherwise the peer's socketId. */
  id: string;
  x: number;
  y: number;
  /** Phaser texture key — a heroDefs HeroDef.textureKey or AgentVariant.textureKey. */
  textureKey: string;
  name: string;
  ownerLabel?: string;
  pathLabel?: string;
  /** Proximity-connected (voice link) or the local user — both render the glow ring. */
  connected: boolean;
  isSelf: boolean;
  /** Neon colour for this avatar's ring/emissives — its room accent where it has one. */
  accent?: number;
  /** An agent standing on one of its owner's dock pads, rather than loose on the floor. */
  docked?: boolean;
}

interface AvatarEntity {
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  pool: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Ellipse;
  sprite: Phaser.GameObjects.Image;
  antenna: Phaser.GameObjects.Image;
  nameText: Phaser.GameObjects.Text;
  ownerText: Phaser.GameObjects.Text;
  pathText: Phaser.GameObjects.Text;
  ringTween?: Phaser.Tweens.Tween;
  lastX: number;
  lastY: number;
}

/**
 * "Neon grid office" palette (option 1 of the art direction board). Floor
 * and structure stay desaturated near-black so the per-room accent neon is
 * the only saturated colour on screen.
 */
const PALETTE = {
  floorBase: 0x0a0a12,
  floorAlt: 0x0b0e18,
  roomFloor: 0x151a27,
  wall: 0x1b1f2b,
  wallTop: 0x333d54,
  wallEdge: 0x4d5a76,
  doorLight: 0x2b3347,
  deskTop: 0x333c4f,
  deskEdge: 0x3a4459,
  chair: 0x232a3a,
  metal: 0x1e2432,
  leaf: 0x2f7a52,
  leafLit: 0x3dffb0,
  pot: 0x30281d,
  text: "#d0d6e6",
  plateBg: "#080b14",
} as const;

const MONO = "Consolas, 'Cascadia Mono', 'JetBrains Mono', monospace";

/**
 * Labels are 8-13px and the camera fits the office at a fractional zoom, so
 * a text texture rasterised at its nominal size gets resampled to something
 * like 0.9x and turns to mush. Rendering the glyphs 3x oversized gives the
 * downscale real pixels to work with; display size is unaffected — Phaser
 * scales the oversized texture back down itself.
 */
const TEXT_RESOLUTION = 3;

const TEXT_STYLE_BASE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: MONO,
  resolution: TEXT_RESOLUTION,
};

const DOCK_COLOR = 0x7fd6ff;

const TEX_GLOW = "fx-glow";
const TEX_FLOOR = "fx-floor";
const TEX_VIGNETTE = "fx-vignette";

/**
 * Back-to-front draw order, matching the reference board's layer spec.
 * Avatars sit between the scenery and the overlay layers: they take their
 * world Y as depth so they occlude each other correctly, which is why every
 * scenery layer is negative and the vignette is far positive.
 */
const DEPTH = {
  floor: -200,
  floorDetail: -190,
  roomFloor: -180,
  roomTint: -175,
  lightPool: -170,
  propsBack: -160,
  wallShadow: -150,
  wallBody: -145,
  wallCap: -140,
  wallTrim: -135,
  door: -130,
  propsFront: -120,
  dock: -110,
  plate: -60,
  vignette: 100_000,
} as const;

interface WallSeg {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Which way the room interior lies from this segment — where trim + inner shadow go. */
  inward: "up" | "down" | "left" | "right";
}

function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/**
 * Renders the presence map as a procedurally laid-out office (see
 * officeLayout.ts): a room per project member plus a central meeting zone,
 * built from primitives — rects, lines and generated gradient textures —
 * rather than hand-painted tile art, following the "neon grid office" art
 * direction. The character and agent sprites (see assets/map/CREDITS.txt)
 * are the only bitmap art involved.
 *
 * Coordinates are plain pixel numbers shared directly with the rest of the
 * app (usePresence peer.x/y, PROXIMITY_RADIUS in useProximityVoice) — no
 * separate world/screen conversion needed outside this file, aside from
 * `pointer.worldX/worldY` for click-to-move now that the camera can pan.
 */
export class OfficeScene extends Phaser.Scene {
  private avatars = new Map<string, AvatarEntity>();
  private moveHandler?: (x: number, y: number) => void;
  private ready = false;
  private pendingSync?: AvatarInput[];
  private pendingLayout?: OfficeLayout;
  private pendingViewport?: { width: number; height: number };
  private layout?: OfficeLayout;
  /** Everything applyLayout draws, so a roster change can clear the old office before drawing the new one. */
  private scenery: Phaser.GameObjects.GameObject[] = [];
  private vignette?: Phaser.GameObjects.Image;

  constructor() {
    super({ key: "office" });
  }

  preload() {
    // Character sprites are the only bitmap art — desks, chairs, plants,
    // racks and the conference table are all drawn as primitives below.
    for (const [key, url] of Object.entries(SPRITE_URLS)) {
      this.load.image(key, url);
    }
  }

  create() {
    this.cameras.main.setBackgroundColor(cssColor(PALETTE.floorBase));
    this.buildTextures();

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.layout) return;
      const x = Phaser.Math.Clamp(pointer.worldX, 20, this.layout.worldWidth - 20);
      const y = Phaser.Math.Clamp(pointer.worldY, 20, this.layout.worldHeight - 20);
      this.moveHandler?.(x, y);
    });

    // Radial darkening toward the edges of frame, over everything including
    // avatars. Lives outside `scenery` because it survives relayouts; it is
    // resized/recentred to the camera's visible rect in fitCameraToContent.
    this.vignette = this.add.image(0, 0, TEX_VIGNETTE).setDepth(DEPTH.vignette).setVisible(false);

    this.ready = true;
    // Viewport first: applyLayout fits the camera to the office, which needs
    // the camera already sized to the container.
    if (this.pendingViewport) {
      this.applyViewportSize(this.pendingViewport.width, this.pendingViewport.height);
      this.pendingViewport = undefined;
    }
    if (this.pendingLayout) {
      this.applyLayout(this.pendingLayout);
      this.pendingLayout = undefined;
    }
    if (this.pendingSync) {
      this.applySync(this.pendingSync);
      this.pendingSync = undefined;
    }
  }

  setMoveHandler(cb: (x: number, y: number) => void) {
    this.moveHandler = cb;
  }

  /**
   * Sets the camera's screen-space viewport size (the container element's
   * size, not the world). Safe to call before the scene has booted — the
   * caller (a ResizeObserver, or the Map tab becoming visible) can fire
   * while Phaser is still starting up, when `this.cameras` doesn't exist yet.
   */
  setViewportSize(width: number, height: number) {
    if (!this.ready) {
      this.pendingViewport = { width, height };
      return;
    }
    this.applyViewportSize(width, height);
  }

  private applyViewportSize(width: number, height: number) {
    this.cameras.main.setSize(width, height);
    this.fitCameraToContent();
  }

  /**
   * Zooms/centers the camera so the whole office is visible at once — no
   * panning or scrolling required, however many rooms the roster needs.
   *
   * Fits `layout.content` (the office) rather than the world: the world
   * carries a wide floor bleed on every side, so whichever axis isn't the
   * limiting one gets filled with floor instead of empty letterboxing. That
   * keeps the map covering its whole panel at any window aspect while the
   * office itself stays entirely on screen.
   */
  private fitCameraToContent() {
    if (!this.layout) return;
    const { content } = this.layout;
    const cam = this.cameras.main;
    if (cam.width <= 0 || cam.height <= 0) return;
    // 0.95 leaves a sliver of corridor floor around the building instead of
    // butting its outer walls flush against the panel edge, where the wall
    // caps and the top row's nameplates get clipped.
    const zoom = Math.min(cam.width / content.width, cam.height / content.height) * 0.95;
    cam.setZoom(zoom);
    const cx = content.x + content.width / 2;
    const cy = content.y + content.height / 2;
    cam.centerOn(cx, cy);

    // The vignette is a world-space object but should always frame the
    // *view*, so it tracks the visible rect (viewport / zoom) rather than
    // the world or the office.
    this.vignette
      ?.setPosition(cx, cy)
      .setDisplaySize((cam.width / zoom) * 1.02, (cam.height / zoom) * 1.02)
      .setVisible(true);
  }

  setLayout(layout: OfficeLayout) {
    if (!this.ready) {
      this.pendingLayout = layout;
      return;
    }
    this.applyLayout(layout);
  }

  syncAvatars(inputs: AvatarInput[]) {
    if (!this.ready) {
      this.pendingSync = inputs;
      return;
    }
    this.applySync(inputs);
  }

  // ---------------------------------------------------------------------
  // Generated textures
  // ---------------------------------------------------------------------

  private buildTextures() {
    this.buildGlowTexture();
    this.buildFloorTexture();
    this.buildVignetteTexture();
  }

  private makeCanvasTexture(
    key: string,
    width: number,
    height: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
  ) {
    if (this.textures.exists(key)) return;
    const canvas = this.textures.createCanvas(key, width, height);
    if (!canvas) return;
    draw(canvas.context);
    canvas.refresh();
    // Explicit rather than relying on the game's antialias default: these
    // are gradients, and a NEAREST sample of one renders as visible
    // concentric banding.
    canvas.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  /** Soft white radial falloff, tinted + additively blended wherever a light is needed. */
  private buildGlowTexture() {
    const size = 256;
    this.makeCanvasTexture(TEX_GLOW, size, size, (ctx) => {
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.28, "rgba(255,255,255,0.55)");
      g.addColorStop(0.6, "rgba(255,255,255,0.16)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    });
  }

  /**
   * One tiling 2x2-tile floor cell: alternating base/alt squares, hairline
   * seams and per-pixel noise all baked in. Drawn across the whole world as
   * a single TileSprite — the alternative, a Graphics rect per tile, is
   * thousands of draws once the floor bleed is taken into account.
   */
  private buildFloorTexture() {
    const size = TILE * 2;
    this.makeCanvasTexture(TEX_FLOOR, size, size, (ctx) => {
      ctx.fillStyle = cssColor(PALETTE.floorBase);
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = cssColor(PALETTE.floorAlt);
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillRect(TILE, TILE, TILE, TILE);

      // Two grid densities: a fine minor grid at half-tile giving the floor
      // its texture, and slightly stronger major seams on the tile itself.
      const line = (step: number, style: string) => {
        ctx.strokeStyle = style;
        ctx.lineWidth = 1;
        for (let p = 0; p <= size; p += step) {
          ctx.beginPath();
          ctx.moveTo(p + 0.5, 0);
          ctx.lineTo(p + 0.5, size);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, p + 0.5);
          ctx.lineTo(size, p + 0.5);
          ctx.stroke();
        }
      };
      line(TILE / 2, "rgba(140,170,220,0.028)");
      line(TILE, "rgba(140,170,220,0.06)");

      const image = ctx.getImageData(0, 0, size, size);
      const data = image.data;
      for (let i = 0; i < data.length; i += 4) {
        const n = (Math.random() - 0.5) * 13;
        data[i] = Phaser.Math.Clamp(data[i] + n, 0, 255);
        data[i + 1] = Phaser.Math.Clamp(data[i + 1] + n, 0, 255);
        data[i + 2] = Phaser.Math.Clamp(data[i + 2] + n, 0, 255);
      }
      ctx.putImageData(image, 0, 0);
    });
  }

  private buildVignetteTexture() {
    const size = 512;
    this.makeCanvasTexture(TEX_VIGNETTE, size, size, (ctx) => {
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, "rgba(2,3,10,0)");
      g.addColorStop(0.5, "rgba(2,3,10,0)");
      g.addColorStop(0.78, "rgba(2,3,10,0.34)");
      g.addColorStop(1, "rgba(2,3,10,0.86)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    });
  }

  // ---------------------------------------------------------------------
  // Scenery
  // ---------------------------------------------------------------------

  private track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.scenery.push(obj);
    return obj;
  }

  /** An additive light: the glow texture, tinted and stretched to an ellipse. */
  private addLight(
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    alpha: number,
    depth: number,
  ) {
    return this.track(
      this.add
        .image(x, y, TEX_GLOW)
        .setDisplaySize(width, height)
        .setTint(color)
        .setAlpha(alpha)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(depth),
    );
  }

  private applyLayout(layout: OfficeLayout) {
    if (
      this.layout &&
      this.layout.worldWidth === layout.worldWidth &&
      this.layout.worldHeight === layout.worldHeight &&
      this.layout.rooms.length === layout.rooms.length &&
      this.layout.rooms.every((r, i) => r.userId === layout.rooms[i].userId)
    ) {
      // Same office (e.g. a roster refetch with no membership change) — skip
      // a full rebuild so it doesn't flicker.
      return;
    }

    // A changed roster redraws the office from scratch; without this the new
    // rooms would be layered on top of the old ones.
    for (const obj of this.scenery) obj.destroy();
    this.scenery = [];

    this.layout = layout;
    this.cameras.main.setBounds(0, 0, layout.worldWidth, layout.worldHeight);
    this.fitCameraToContent();

    this.drawFloor(layout);
    this.drawMeetingZone(layout);
    for (const room of layout.rooms) this.drawRoom(room);
    this.drawCorridorProps(layout);
  }

  /**
   * Plants standing in the corridor in the gaps between rooms, at the ends
   * of each row's door wall. Purely to break up what is otherwise a large
   * empty strip of floor between the two rows of rooms.
   */
  private drawCorridorProps(layout: OfficeLayout) {
    const g = this.track(this.add.graphics().setDepth(DEPTH.propsFront));
    for (const room of layout.rooms) {
      const doorWallY = room.doorSide === "bottom" ? room.y + room.height : room.y;
      const y = doorWallY + (room.doorSide === "bottom" ? 30 : -30);
      this.drawPlant(g, room.x + 14, y);
      this.drawPlant(g, room.x + room.width - 14, y);
    }
  }

  /** Layers 1-2: tiled grid floor across the world, with the office footprint lifted out of the bleed. */
  private drawFloor(layout: OfficeLayout) {
    this.track(
      this.add
        .tileSprite(0, 0, layout.worldWidth, layout.worldHeight, TEX_FLOOR)
        .setOrigin(0, 0)
        .setDepth(DEPTH.floor),
    );

    const { content } = layout;

    // Ambient fill over the office footprint only, so the building reads as
    // lit and the floor bleeding off-frame falls away into the dark.
    this.addLight(
      content.x + content.width / 2,
      content.y + content.height / 2,
      content.width * 1.35,
      content.height * 1.5,
      0x2b3f66,
      0.5,
      DEPTH.floorDetail,
    );

    // Office outline — a faint lit kerb marking where the building ends.
    const edge = this.track(this.add.graphics().setDepth(DEPTH.floorDetail));
    edge.lineStyle(2, PALETTE.wallTop, 0.5);
    edge.strokeRect(content.x, content.y, content.width, content.height);
  }

  /**
   * The shared meeting zone: rug, conference table and chairs, framed by
   * plants, under a cyan pool of light — the office's one landmark, and the
   * only place using neutral cyan rather than a per-room accent.
   */
  private drawMeetingZone(layout: OfficeLayout) {
    const { meeting } = layout;
    const cx = meeting.x + meeting.width / 2;
    const cy = meeting.y + meeting.height / 2;
    const accent = 0x00fff2;

    const floor = this.track(this.add.graphics().setDepth(DEPTH.roomFloor));
    floor.fillStyle(PALETTE.roomFloor, 1);
    floor.fillRoundedRect(meeting.x, meeting.y, meeting.width, meeting.height, 18);

    this.addLight(cx, cy, meeting.width * 1.15, meeting.height * 1.7, accent, 0.2, DEPTH.roomTint);

    const border = this.track(this.add.graphics().setDepth(DEPTH.wallTrim));
    border.lineStyle(2, accent, 0.55);
    border.strokeRoundedRect(meeting.x, meeting.y, meeting.width, meeting.height, 18);
    // Slow breathing pulse on the meeting room border — a small bit of
    // ambient motion on the office's one shared landmark, everything else
    // stays static so it doesn't fight for attention with avatar movement.
    this.tweens.add({
      targets: border,
      alpha: { from: 1, to: 0.5 },
      duration: 2600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Rug framing the table, inset inside the zone.
    const rugW = Math.min(meeting.width * 0.62, 470);
    const rugH = meeting.height * 0.66;
    const rug = this.track(this.add.graphics().setDepth(DEPTH.propsBack));
    rug.fillStyle(0x171c2e, 1);
    rug.fillRoundedRect(cx - rugW / 2, cy - rugH / 2, rugW, rugH, 14);
    rug.lineStyle(2, accent, 0.18);
    rug.strokeRoundedRect(cx - rugW / 2, cy - rugH / 2, rugW, rugH, 14);
    rug.lineStyle(1, accent, 0.1);
    rug.strokeRoundedRect(cx - rugW / 2 + 9, cy - rugH / 2 + 9, rugW - 18, rugH - 18, 10);

    const tableW = Math.min(meeting.width * 0.5, 380);
    const tableH = 128;
    const table = this.track(this.add.graphics().setDepth(DEPTH.propsFront));
    table.fillStyle(0x000000, 0.35);
    table.fillRoundedRect(cx - tableW / 2 + 4, cy - tableH / 2 + 8, tableW, tableH, 26);
    table.fillStyle(0x1d2230, 1);
    table.fillRoundedRect(cx - tableW / 2, cy - tableH / 2, tableW, tableH, 26);
    table.lineStyle(1.5, accent, 0.5);
    table.strokeRoundedRect(cx - tableW / 2, cy - tableH / 2, tableW, tableH, 26);
    table.fillStyle(accent, 0.1);
    table.fillRoundedRect(cx - tableW / 2 + 12, cy - tableH / 2 + 12, tableW - 24, tableH - 24, 18);

    // Chairs around the table — plain rounded blocks, three a side plus one
    // at each end, the same primitive vocabulary as the walls.
    const chairs = this.track(this.add.graphics().setDepth(DEPTH.propsFront));
    chairs.fillStyle(PALETTE.chair, 1);
    const chairW = 30;
    const chairH = 22;
    for (let i = -1; i <= 1; i++) {
      const chairX = cx + i * (tableW / 3.1) - chairW / 2;
      chairs.fillRoundedRect(chairX, cy - tableH / 2 - chairH - 8, chairW, chairH, 7);
      chairs.fillRoundedRect(chairX, cy + tableH / 2 + 8, chairW, chairH, 7);
    }
    chairs.fillRoundedRect(cx - tableW / 2 - chairH - 8, cy - chairW / 2, chairH, chairW, 7);
    chairs.fillRoundedRect(cx + tableW / 2 + 8, cy - chairW / 2, chairH, chairW, 7);

    const plants = this.track(this.add.graphics().setDepth(DEPTH.propsFront));
    for (const [px, py] of [
      [meeting.x + 34, meeting.y + 32],
      [meeting.x + meeting.width - 34, meeting.y + 32],
      [meeting.x + 34, meeting.y + meeting.height - 32],
      [meeting.x + meeting.width - 34, meeting.y + meeting.height - 32],
    ]) {
      this.drawPlant(plants, px, py);
    }

    this.track(
      this.add
        .text(cx, meeting.y - 10, "MEETING ROOM", {
          ...TEXT_STYLE_BASE,
          fontSize: "13px",
          color: cssColor(accent),
          fontStyle: "bold",
        })
        .setOrigin(0.5, 1)
        .setShadow(0, 0, cssColor(accent), 8, false, true)
        .setDepth(DEPTH.plate),
    );
  }

  /** The four wall runs of a room, gapped at the doorway, each tagged with which way the interior lies. */
  private wallSegments(room: RoomDef): WallSeg[] {
    const W = WALL_THICKNESS;
    const { x, y, width, height, doorX, doorWidth, doorSide } = room;
    const doorEnd = doorX + doorWidth;
    const segs: WallSeg[] = [];

    if (doorSide === "top") {
      segs.push({ x, y, w: doorX - x, h: W, inward: "down" });
      segs.push({ x: doorEnd, y, w: x + width - doorEnd, h: W, inward: "down" });
      segs.push({ x, y: y + height - W, w: width, h: W, inward: "up" });
    } else {
      segs.push({ x, y, w: width, h: W, inward: "down" });
      segs.push({ x, y: y + height - W, w: doorX - x, h: W, inward: "up" });
      segs.push({ x: doorEnd, y: y + height - W, w: x + width - doorEnd, h: W, inward: "up" });
    }
    segs.push({ x, y, w: W, h: height, inward: "right" });
    segs.push({ x: x + width - W, y, w: W, h: height, inward: "left" });
    return segs;
  }

  /**
   * Layers 4-5: wall body, lit top face with a darker south strip for
   * relief, a bright outer edge highlight, an inner shadow falling into the
   * room, and the accent neon trim running along the interior face.
   */
  private drawWalls(room: RoomDef) {
    const segs = this.wallSegments(room);

    const shadow = this.track(this.add.graphics().setDepth(DEPTH.wallShadow));
    shadow.fillStyle(0x000000, 0.5);
    for (const s of segs) shadow.fillRect(s.x + 4, s.y + 7, s.w, s.h);

    const body = this.track(this.add.graphics().setDepth(DEPTH.wallBody));
    body.fillStyle(PALETTE.wall, 1);
    for (const s of segs) body.fillRect(s.x, s.y, s.w, s.h);

    const cap = this.track(this.add.graphics().setDepth(DEPTH.wallCap));
    for (const s of segs) {
      // Lit top face across the whole run, then a darker band along its
      // south edge: the wall reads as having height rather than being a
      // flat coloured line.
      cap.fillStyle(PALETTE.wallTop, 1);
      cap.fillRect(s.x, s.y, s.w, s.h - WALL_CAP);
      cap.fillStyle(PALETTE.wall, 1);
      cap.fillRect(s.x, s.y + s.h - WALL_CAP, s.w, WALL_CAP);
      cap.fillStyle(PALETTE.wallEdge, 0.9);
      cap.fillRect(s.x, s.y, s.w, 1);
    }

    const trim = this.track(this.add.graphics().setDepth(DEPTH.wallTrim));
    for (const s of segs) {
      // Inner shadow: three darkening bands falling from the wall into the
      // room, then the accent trim line on the very edge of the interior.
      for (let i = 0; i < 3; i++) {
        trim.fillStyle(0x000000, 0.2 - i * 0.06);
        const band = 3;
        if (s.inward === "down") trim.fillRect(s.x, s.y + s.h + i * band, s.w, band);
        else if (s.inward === "up") trim.fillRect(s.x, s.y - (i + 1) * band, s.w, band);
        else if (s.inward === "right") trim.fillRect(s.x + s.w + i * band, s.y, band, s.h);
        else trim.fillRect(s.x - (i + 1) * band, s.y, band, s.h);
      }

      trim.fillStyle(room.accent, 1);
      if (s.inward === "down") trim.fillRect(s.x, s.y + s.h - 2.5, s.w, 2.5);
      else if (s.inward === "up") trim.fillRect(s.x, s.y, s.w, 2.5);
      else if (s.inward === "right") trim.fillRect(s.x + s.w - 2.5, s.y, 2.5, s.h);
      else trim.fillRect(s.x, s.y, 2.5, s.h);
    }

    // Additive bloom along every trim run, spreading into the room — this is
    // what makes the neon read as light rather than as a coloured outline.
    for (const s of segs) {
      if (s.inward === "down") this.addLight(s.x + s.w / 2, s.y + s.h, s.w, 46, room.accent, 0.32, DEPTH.wallTrim);
      else if (s.inward === "up") this.addLight(s.x + s.w / 2, s.y, s.w, 46, room.accent, 0.32, DEPTH.wallTrim);
      else if (s.inward === "right") this.addLight(s.x + s.w, s.y + s.h / 2, 46, s.h, room.accent, 0.18, DEPTH.wallTrim);
      else this.addLight(s.x, s.y + s.h / 2, 46, s.h, room.accent, 0.18, DEPTH.wallTrim);
    }
  }

  /** Layer 6: the doorway gap — lit pillars either side, a threshold line, and light spilling into the corridor. */
  private drawDoor(room: RoomDef) {
    const W = WALL_THICKNESS;
    const isBottomDoor = room.doorSide === "bottom";
    const wallY = isBottomDoor ? room.y + room.height - W : room.y;
    const doorEnd = room.doorX + room.doorWidth;

    const g = this.track(this.add.graphics().setDepth(DEPTH.door));
    for (const pillarX of [room.doorX - DOOR_PILLAR, doorEnd]) {
      g.fillStyle(0x000000, 0.45);
      g.fillRect(pillarX + 3, wallY + 6, DOOR_PILLAR, W);
      g.fillStyle(PALETTE.wallTop, 1);
      g.fillRect(pillarX, wallY - 3, DOOR_PILLAR, W + 6);
      g.fillStyle(PALETTE.doorLight, 1);
      g.fillRect(pillarX, wallY + W - WALL_CAP + 3, DOOR_PILLAR, WALL_CAP);
    }
    // The vertical light strip on each pillar's door-facing face.
    g.fillStyle(room.accent, 0.95);
    g.fillRect(room.doorX - 3, wallY - 3, 3, W + 6);
    g.fillRect(doorEnd, wallY - 3, 3, W + 6);
    // Threshold: a dim accent line across the open gap, at floor level.
    g.fillStyle(room.accent, 0.3);
    g.fillRect(room.doorX, isBottomDoor ? wallY + W - 2 : wallY, room.doorWidth, 2);

    this.addLight(room.doorX, wallY + W / 2, 26, W + 34, room.accent, 0.65, DEPTH.door);
    this.addLight(doorEnd + 3, wallY + W / 2, 26, W + 34, room.accent, 0.65, DEPTH.door);
    // Pool spilling out of the doorway onto the corridor floor.
    this.addLight(
      room.doorX + room.doorWidth / 2,
      isBottomDoor ? wallY + W + 26 : wallY - 26,
      room.doorWidth * 2.1,
      120,
      room.accent,
      0.22,
      DEPTH.door,
    );
  }

  /** Layer 10: the wall-mounted, colour-coded nameplate screen over the desk. */
  private drawNameplate(room: RoomDef) {
    const label = room.name.length > 14 ? `${room.name.slice(0, 13)}…` : room.name;
    const plateW = Math.max(76, label.length * 8 + 26);
    const plateH = 22;
    const px = room.labelX - plateW / 2;
    const py = room.labelY - plateH / 2;

    this.addLight(room.labelX, room.labelY, plateW * 2, plateH * 4, room.accent, 0.3, DEPTH.plate);

    const g = this.track(this.add.graphics().setDepth(DEPTH.plate));
    g.fillStyle(0x080b14, 0.94);
    g.fillRoundedRect(px, py, plateW, plateH, 5);
    g.lineStyle(1.5, room.accent, 0.8);
    g.strokeRoundedRect(px, py, plateW, plateH, 5);
    // Two lit pips at the left of the plate, like a status readout.
    g.fillStyle(room.accent, 0.9);
    g.fillCircle(px + 9, room.labelY - 3.5, 1.6);
    g.fillStyle(room.accent, 0.35);
    g.fillCircle(px + 9, room.labelY + 3.5, 1.6);

    this.track(
      this.add
        .text(room.labelX + 6, room.labelY, label, {
          ...TEXT_STYLE_BASE,
          fontSize: "12px",
          color: cssColor(room.accent),
        })
        .setOrigin(0.5, 0.5)
        .setShadow(0, 0, cssColor(room.accent), 7, false, true)
        .setDepth(DEPTH.plate),
    );
  }

  /**
   * Layer 7: the agent dock — a lit platform with one marked pad per slot,
   * so it reads as "this is where this member's Claude Code terminals stand"
   * even before any of them connect, and a docked agent visibly lines up
   * with a pad rather than floating on bare floor.
   */
  private drawAgentDock(room: RoomDef) {
    const bay = room.agentBay;

    this.addLight(
      bay.x + bay.width / 2,
      bay.y + bay.height / 2,
      bay.width * 1.5,
      bay.height * 2.6,
      DOCK_COLOR,
      0.22,
      DEPTH.lightPool,
    );

    const g = this.track(this.add.graphics().setDepth(DEPTH.dock));
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(bay.x + 3, bay.y + 6, bay.width, bay.height, 9);
    g.fillStyle(0x161d2b, 1);
    g.fillRoundedRect(bay.x, bay.y, bay.width, bay.height, 9);
    g.lineStyle(1.5, DOCK_COLOR, 0.6);
    g.strokeRoundedRect(bay.x, bay.y, bay.width, bay.height, 9);

    for (let slot = 0; slot < AGENT_SLOT_COUNT; slot++) {
      const pad = agentSlotPosition(room, slot);
      g.fillStyle(DOCK_COLOR, 0.14);
      g.fillEllipse(pad.x, pad.y + 8, 22, 9);
      g.lineStyle(1, DOCK_COLOR, 0.55);
      g.strokeEllipse(pad.x, pad.y + 8, 22, 9);
    }

    this.track(
      this.add
        // Clear of the docked sprites, which stand ~18px proud of the bay.
        // Deliberately quiet — the lit platform + pads already say "this is
        // a dock", so the label is a hint rather than another bold line
        // competing with the nameplate.
        .text(bay.x + bay.width / 2, bay.y - 26, "AGENT DOCK", {
          ...TEXT_STYLE_BASE,
          fontSize: "8px",
          color: cssColor(DOCK_COLOR),
        })
        .setOrigin(0.5, 1)
        .setAlpha(0.5)
        .setDepth(DEPTH.dock),
    );
  }

  /** A potted plant: dark pot plus a few overlapping leaf blobs, one catching the light. */
  private drawPlant(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(x + 2, y + 11, 24, 9);
    g.fillStyle(PALETTE.pot, 1);
    g.fillRoundedRect(x - 7, y + 2, 14, 11, 3);
    g.fillStyle(PALETTE.leaf, 1);
    g.fillCircle(x - 6, y - 2, 7);
    g.fillCircle(x + 6, y - 1, 6);
    g.fillCircle(x, y - 8, 7.5);
    g.fillStyle(PALETTE.leafLit, 0.35);
    g.fillCircle(x - 1, y - 9, 4);
  }

  /**
   * Layers 3 + 7: the room's furniture. Desk with a warm lamp pool and an
   * accent-lit monitor, the occupant's chair on the doorward side, a server
   * rack against the far wall and a plant in the corner — enough to stop a
   * room reading as an empty rectangle with one prop in it.
   */
  private drawRoomProps(room: RoomDef) {
    const isTopRow = room.doorSide === "bottom";
    // +1 when the door is below the desk, so the chair always goes doorward
    // and the monitor to the back wall; both swap for the bottom row.
    const facing = isTopRow ? 1 : -1;
    const props = this.track(this.add.graphics().setDepth(DEPTH.propsFront));
    // The furniture row, one avatar-height back from where the occupant
    // stands, so a person at their desk sits in front of it rather than on
    // top of it.
    const furnitureY = room.deskY - facing * 82;

    // Desks have local light pools — one warm from the lamp, one from the
    // screen in the room's accent.
    this.addLight(room.deskX, furnitureY, 230, 180, 0xffe6b8, 0.24, DEPTH.lightPool);
    this.addLight(room.deskX, furnitureY - facing * 12, 140, 100, room.accent, 0.26, DEPTH.lightPool);

    // Chair, on the standing spot itself, so the avatar reads as seated.
    const chairY = room.deskY;
    props.fillStyle(0x000000, 0.3);
    props.fillRoundedRect(room.deskX - 13, chairY - 9, 30, 22, 7);
    props.fillStyle(PALETTE.chair, 1);
    props.fillRoundedRect(room.deskX - 15, chairY - 11, 30, 22, 7);
    props.fillStyle(PALETTE.deskEdge, 1);
    props.fillRoundedRect(room.deskX - 15, chairY + facing * 8 - 4, 30, 7, 3);

    // Desk: shadow, top surface, lit front edge.
    const deskW = 82;
    const deskH = 40;
    const deskX = room.deskX - deskW / 2;
    const deskY = furnitureY - deskH / 2;
    props.fillStyle(0x000000, 0.45);
    props.fillRoundedRect(deskX + 4, deskY + 8, deskW, deskH, 5);
    props.fillStyle(PALETTE.deskTop, 1);
    props.fillRoundedRect(deskX, deskY, deskW, deskH, 5);
    props.fillStyle(PALETTE.deskEdge, 1);
    props.fillRect(deskX + 3, deskY + deskH - 5, deskW - 6, 3);
    props.lineStyle(1, PALETTE.wallEdge, 0.5);
    props.strokeRoundedRect(deskX, deskY, deskW, deskH, 5);

    // Monitor on the back half of the desk, screen lit in the room accent.
    const screenY = furnitureY - facing * 11;
    props.fillStyle(0x0d1119, 1);
    props.fillRoundedRect(room.deskX - 19, screenY - 8, 38, 16, 3);
    props.fillStyle(room.accent, 0.55);
    props.fillRoundedRect(room.deskX - 16, screenY - 5, 32, 10, 2);
    props.fillStyle(room.accent, 0.9);
    props.fillRect(room.deskX - 13, screenY - 2, 18, 1);
    props.fillRect(room.deskX - 13, screenY + 1, 11, 1);
    this.addLight(room.deskX, screenY, 74, 50, room.accent, 0.35, DEPTH.propsFront);

    // Keyboard between the screen and the chair.
    props.fillStyle(PALETTE.metal, 1);
    props.fillRoundedRect(room.deskX - 14, furnitureY + facing * 8 - 3, 28, 7, 2);

    // Server rack against the far wall, on the furniture row so it clears
    // the agent dock, its slot LEDs in the room accent.
    const rackX = room.x + room.width - WALL_THICKNESS - 34;
    const rackY = furnitureY - 32;
    props.fillStyle(0x000000, 0.4);
    props.fillRoundedRect(rackX + 3, rackY + 6, 26, 64, 4);
    props.fillStyle(PALETTE.metal, 1);
    props.fillRoundedRect(rackX, rackY, 26, 64, 4);
    props.lineStyle(1, PALETTE.wallEdge, 0.45);
    props.strokeRoundedRect(rackX, rackY, 26, 64, 4);
    for (let i = 0; i < 4; i++) {
      props.fillStyle(room.accent, i % 2 === 0 ? 0.7 : 0.3);
      props.fillRect(rackX + 5, rackY + 9 + i * 14, 16, 3);
    }
    this.addLight(rackX + 13, rackY + 32, 70, 100, room.accent, 0.16, DEPTH.lightPool);

    // Plant in the corner beside the door, breaking up the empty floor.
    const plantX = room.x + WALL_THICKNESS + 24;
    const plantY = isTopRow
      ? room.y + room.height - WALL_THICKNESS - 26
      : room.y + WALL_THICKNESS + 26;
    this.drawPlant(props, plantX, plantY);
  }

  private drawRoom(room: RoomDef) {
    const floor = this.track(this.add.graphics().setDepth(DEPTH.roomFloor));
    floor.fillStyle(PALETTE.roomFloor, 1);
    floor.fillRect(room.x, room.y, room.width, room.height);
    // Tile seams inside the room, a touch brighter than the corridor's, so
    // the room floor reads as a different (cleaner) surface.
    for (const [step, alpha] of [
      [TILE / 2, 0.16],
      [TILE, 0.34],
    ]) {
      floor.lineStyle(1, PALETTE.wallTop, alpha);
      for (let gx = room.x + step; gx < room.x + room.width; gx += step) {
        floor.lineBetween(gx, room.y, gx, room.y + room.height);
      }
      for (let gy = room.y + step; gy < room.y + room.height; gy += step) {
        floor.lineBetween(room.x, gy, room.x + room.width, gy);
      }
    }

    // Each room tinted faintly in its own accent — gives every room a
    // distinct identity instead of all reading as the same dark rect.
    this.addLight(
      room.deskX,
      room.y + room.height / 2,
      room.width * 1.5,
      room.height * 1.6,
      room.accent,
      0.16,
      DEPTH.roomTint,
    );

    this.drawWalls(room);
    this.drawDoor(room);
    this.drawRoomProps(room);
    this.drawAgentDock(room);
    this.drawNameplate(room);
  }

  // ---------------------------------------------------------------------
  // Avatars
  // ---------------------------------------------------------------------

  private applySync(inputs: AvatarInput[]) {
    const seen = new Set<string>();
    for (const input of inputs) {
      seen.add(input.id);
      let entity = this.avatars.get(input.id);
      if (!entity) {
        entity = this.createAvatarEntity(input);
        this.avatars.set(input.id, entity);
      }
      this.updateAvatarEntity(entity, input);
    }
    for (const [id, entity] of this.avatars) {
      if (!seen.has(id)) {
        entity.ringTween?.remove();
        entity.container.destroy();
        this.avatars.delete(id);
      }
    }
  }

  private createAvatarEntity(input: AvatarInput): AvatarEntity {
    const container = this.add.container(input.x, input.y);
    const isAgent = isAgentTexture(input.textureKey);
    const accent = input.accent ?? 0x00fff2;

    const shadow = this.add.ellipse(0, 4, 26, 10, 0x000000, 0.4);
    const pool = this.add
      .image(0, 2, TEX_GLOW)
      .setDisplaySize(64, 32)
      .setTint(accent)
      .setAlpha(0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    const ring = this.add.ellipse(0, 3, 34, 14);
    ring.isFilled = false;
    ring.setStrokeStyle(1.6, accent, 0.9);

    // Heroes are exported 68px tall and agents 60px (see assets/map/CREDITS
    // .txt); these scales land them at ~58 and ~41 world px, keeping an
    // agent visibly smaller than a person and narrow enough that four of
    // them fit their room's dock pads without touching.
    const sprite = this.add
      .image(0, -6, input.textureKey)
      .setOrigin(0.5, 1)
      .setScale(isAgent ? 0.68 : 0.85);

    // The robot art already draws its own lit antenna; this is just a soft
    // additive bloom over the tip, tinted to the owner room's accent.
    const antenna = this.add
      .image(0, -44, TEX_GLOW)
      .setDisplaySize(16, 16)
      .setTint(accent)
      .setAlpha(0.75)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);

    const nameText = this.add
      .text(0, 10, input.name, {
        ...TEXT_STYLE_BASE,
        fontSize: "10px",
        color: PALETTE.text,
        backgroundColor: `${PALETTE.plateBg}dd`,
        padding: { x: 6, y: 2 },
      })
      .setOrigin(0.5, 0);
    const ownerText = this.add
      .text(0, 24, "", { ...TEXT_STYLE_BASE, fontSize: "9px", color: "#00fff2", fontStyle: "bold" })
      .setOrigin(0.5, 0);
    const pathText = this.add
      .text(0, 35, "", { ...TEXT_STYLE_BASE, fontSize: "9px", color: "#ff2fd0" })
      .setOrigin(0.5, 0);

    container.add([shadow, pool, ring, sprite, antenna, nameText, ownerText, pathText]);

    return {
      container,
      shadow,
      pool,
      ring,
      sprite,
      antenna,
      nameText,
      ownerText,
      pathText,
      lastX: input.x,
      lastY: input.y,
    };
  }

  private updateAvatarEntity(entity: AvatarEntity, input: AvatarInput) {
    const dx = input.x - entity.lastX;
    if (Math.abs(dx) > 0.5) entity.sprite.setFlipX(dx < 0);

    if (entity.lastX !== input.x || entity.lastY !== input.y) {
      this.tweens.add({ targets: entity.container, x: input.x, y: input.y, duration: 160, ease: "Linear" });
      entity.lastX = input.x;
      entity.lastY = input.y;
    }
    entity.container.setDepth(input.y);

    if (entity.sprite.texture.key !== input.textureKey) {
      entity.sprite.setTexture(input.textureKey);
    }

    entity.nameText.setText(input.name);

    const isAgent = isAgentTexture(input.textureKey);
    const accent = input.accent ?? (input.isSelf ? 0x00fff2 : 0x3dffb0);

    // Ring + floor pool double as the status overlay: lit for you, for a
    // peer you have a proximity voice link with, and always for a docked
    // agent so it reads as powered up and working on its pad.
    const lit = input.isSelf || input.connected || (isAgent && !!input.docked);
    entity.ring.setVisible(lit).setStrokeStyle(1.6, accent, 0.9);
    entity.pool.setVisible(lit).setTint(accent);
    entity.antenna.setVisible(isAgent).setTint(accent);

    if (input.connected && !entity.ringTween) {
      entity.ringTween = this.tweens.add({
        targets: entity.ring,
        scaleX: { from: 1, to: 1.35 },
        scaleY: { from: 1, to: 1.35 },
        alpha: { from: 0.9, to: 0.15 },
        duration: 1400,
        repeat: -1,
        ease: "Sine.easeOut",
      });
    } else if (!input.connected && entity.ringTween) {
      entity.ringTween.remove();
      entity.ringTween = undefined;
      entity.ring.setScale(1).setAlpha(1);
    }

    entity.ownerText.setText(input.ownerLabel ?? "").setVisible(!!input.ownerLabel);
    entity.pathText
      .setText(input.pathLabel ?? "")
      .setY(input.ownerLabel ? 35 : 24)
      .setVisible(!!input.pathLabel);
  }
}
