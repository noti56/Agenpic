import Phaser from "phaser";
import { AGENT_TEXTURE_KEY, SPRITE_URLS } from "../sprites/heroDefs";
import { TILE_URLS } from "./mapAssets";
import { AGENT_SLOT_COUNT, agentSlotPosition, type OfficeLayout, type RoomDef } from "./officeLayout";

export interface AvatarInput {
  /** "self" for the local user, otherwise the peer's socketId. */
  id: string;
  x: number;
  y: number;
  /** Phaser texture key — one of heroDefs' HeroDef.textureKey / AGENT_TEXTURE_KEY. */
  textureKey: string;
  name: string;
  ownerLabel?: string;
  pathLabel?: string;
  /** Proximity-connected (voice link) or the local user — both render the glow ring. */
  connected: boolean;
  isSelf: boolean;
}

interface AvatarEntity {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Ellipse;
  nameText: Phaser.GameObjects.Text;
  ownerText: Phaser.GameObjects.Text;
  pathText: Phaser.GameObjects.Text;
  lastX: number;
  lastY: number;
}

const TEXT_STYLE_BASE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "Consolas, 'Cascadia Mono', monospace",
};

const WALL_THICKNESS = 6;
const GRID_SPACING = 128;
const DOCK_COLOR = 0x7fd6ff;

/**
 * Renders the presence map as a procedurally laid-out office (see
 * officeLayout.ts): a room per project member plus a central meeting zone,
 * built from plain Graphics rects rather than tiled sprite art — a Kenney
 * tile repeated across a whole floor read as visual noise at this scale, a
 * flat cyberpunk-toned floor with room walls reads as an actual building.
 * Character sprites and small props (desk, conference table, plants — CC0,
 * see assets/map/CREDITS.txt) are the only tile art still used.
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

  constructor() {
    super({ key: "office" });
  }

  preload() {
    this.load.image("desk", TILE_URLS.desk);
    this.load.image("table", TILE_URLS.rug);
    this.load.image("plant", TILE_URLS.plant);
    for (const [key, url] of Object.entries(SPRITE_URLS)) {
      this.load.image(key, url);
    }
  }

  create() {
    this.cameras.main.setBackgroundColor("#0a0a12");

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.layout) return;
      const x = Phaser.Math.Clamp(pointer.worldX, 20, this.layout.worldWidth - 20);
      const y = Phaser.Math.Clamp(pointer.worldY, 20, this.layout.worldHeight - 20);
      this.moveHandler?.(x, y);
    });

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
    const zoom = Math.min(cam.width / content.width, cam.height / content.height);
    cam.setZoom(zoom);
    cam.centerOn(content.x + content.width / 2, content.y + content.height / 2);
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

  private applyLayout(layout: OfficeLayout) {
    if (this.layout && this.layout.worldWidth === layout.worldWidth && this.layout.worldHeight === layout.worldHeight && this.layout.rooms.length === layout.rooms.length) {
      // Same shape (e.g. a roster refetch with no membership change) — skip
      // a full rebuild so it doesn't flicker/reset scroll position.
      return;
    }
    this.layout = layout;
    this.cameras.main.setBounds(0, 0, layout.worldWidth, layout.worldHeight);
    this.fitCameraToContent();

    const bg = this.add.graphics().setDepth(-30);
    bg.fillStyle(0x0a0a12, 1);
    bg.fillRect(0, 0, layout.worldWidth, layout.worldHeight);
    bg.lineStyle(1, 0x1c1c2a, 0.5);
    for (let x = 0; x <= layout.worldWidth; x += GRID_SPACING) bg.lineBetween(x, 0, x, layout.worldHeight);
    for (let y = 0; y <= layout.worldHeight; y += GRID_SPACING) bg.lineBetween(0, y, layout.worldWidth, y);

    const { meeting } = layout;
    const meetGfx = this.add.graphics().setDepth(-20);
    meetGfx.fillStyle(0x14141e, 1);
    meetGfx.fillRoundedRect(meeting.x, meeting.y, meeting.width, meeting.height, 16);
    meetGfx.lineStyle(2, 0x00fff2, 0.45);
    meetGfx.strokeRoundedRect(meeting.x, meeting.y, meeting.width, meeting.height, 16);

    this.add
      .image(meeting.x + meeting.width / 2, meeting.y + meeting.height / 2, "table")
      .setDepth(-10)
      .setScale(2.4)
      .setAlpha(0.9);
    this.add
      .text(meeting.x + meeting.width / 2, meeting.y - 6, "MEETING ROOM", {
        ...TEXT_STYLE_BASE,
        fontSize: "13px",
        color: "#00fff2",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 1)
      .setDepth(-10);

    // Anchored to the office corners, not the world's — the world's corners
    // are far out in the bleed area and would never be on screen.
    const { content } = layout;
    for (const [px, py] of [
      [content.x + 40, content.y + 40],
      [content.x + content.width - 40, content.y + 40],
      [content.x + 40, content.y + content.height - 40],
      [content.x + content.width - 40, content.y + content.height - 40],
    ]) {
      this.add.image(px, py, "plant").setDepth(-10);
    }

    for (const room of layout.rooms) this.drawRoom(room);
  }

  private drawRoom(room: RoomDef) {
    const g = this.add.graphics().setDepth(-15);
    g.fillStyle(0x101018, 1);
    g.fillRect(room.x, room.y, room.width, room.height);

    g.fillStyle(room.accent, 0.9);
    const doorEnd = room.doorX + room.doorWidth;

    if (room.doorSide === "top") {
      g.fillRect(room.x, room.y, room.doorX - room.x, WALL_THICKNESS);
      g.fillRect(doorEnd, room.y, room.x + room.width - doorEnd, WALL_THICKNESS);
      g.fillRect(room.x, room.y + room.height - WALL_THICKNESS, room.width, WALL_THICKNESS);
    } else {
      g.fillRect(room.x, room.y, room.width, WALL_THICKNESS);
      g.fillRect(room.x, room.y + room.height - WALL_THICKNESS, room.doorX - room.x, WALL_THICKNESS);
      g.fillRect(doorEnd, room.y + room.height - WALL_THICKNESS, room.x + room.width - doorEnd, WALL_THICKNESS);
    }
    g.fillRect(room.x, room.y, WALL_THICKNESS, room.height);
    g.fillRect(room.x + room.width - WALL_THICKNESS, room.y, WALL_THICKNESS, room.height);

    this.add.image(room.deskX, room.deskY, "desk").setDepth(-10).setScale(1.15);

    // The agent dock: a lit server-rack style platform with one marked pad
    // per slot, so it reads as "this is where this member's Claude Code
    // terminals stand" even before any of them connect — and so a docked
    // agent visibly lines up with a pad rather than floating on bare floor.
    const bay = room.agentBay;
    const dockGfx = this.add.graphics().setDepth(-11);
    dockGfx.fillStyle(DOCK_COLOR, 0.08);
    dockGfx.fillRoundedRect(bay.x, bay.y, bay.width, bay.height, 8);
    dockGfx.lineStyle(1.5, DOCK_COLOR, 0.55);
    dockGfx.strokeRoundedRect(bay.x, bay.y, bay.width, bay.height, 8);

    for (let slot = 0; slot < AGENT_SLOT_COUNT; slot++) {
      const pad = agentSlotPosition(room, slot);
      dockGfx.fillStyle(DOCK_COLOR, 0.16);
      dockGfx.fillEllipse(pad.x, pad.y + 8, 22, 9);
      dockGfx.lineStyle(1, DOCK_COLOR, 0.5);
      dockGfx.strokeEllipse(pad.x, pad.y + 8, 22, 9);
    }

    this.add
      // Clear of the docked sprites, which stand ~18px proud of the bay.
      .text(bay.x + bay.width / 2, bay.y - 24, "AGENT DOCK", {
        ...TEXT_STYLE_BASE,
        fontSize: "8px",
        fontStyle: "bold",
        color: "#7fd6ff",
      })
      .setOrigin(0.5, 1)
      .setDepth(-11);

    this.add
      .text(room.labelX, room.labelY, room.name, {
        ...TEXT_STYLE_BASE,
        fontSize: "10px",
        color: "#c8c8e0",
        backgroundColor: "#14141ecc",
        padding: { x: 6, y: 2 },
      })
      .setOrigin(0.5, room.doorSide === "bottom" ? 0 : 1)
      .setDepth(-10);
  }

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
        entity.container.destroy();
        this.avatars.delete(id);
      }
    }
  }

  private createAvatarEntity(input: AvatarInput): AvatarEntity {
    const container = this.add.container(input.x, input.y);

    const isAgent = input.textureKey === AGENT_TEXTURE_KEY;
    const glow = this.add.ellipse(0, 2, 34, 12, 0x3dffb0, 0.35);
    const sprite = this.add
      .image(0, -6, input.textureKey)
      .setOrigin(0.5, 1)
      .setScale(isAgent ? 0.8 : 1.3);
    const nameText = this.add
      .text(0, 8, input.name, {
        ...TEXT_STYLE_BASE,
        fontSize: "10px",
        color: "#c8c8e0",
        backgroundColor: "#14141ecc",
        padding: { x: 6, y: 1 },
      })
      .setOrigin(0.5, 0);
    const ownerText = this.add
      .text(0, 20, "", { ...TEXT_STYLE_BASE, fontSize: "9px", color: "#00fff2", fontStyle: "bold" })
      .setOrigin(0.5, 0);
    const pathText = this.add
      .text(0, 31, "", { ...TEXT_STYLE_BASE, fontSize: "9px", color: "#ff2fd0" })
      .setOrigin(0.5, 0);

    container.add([glow, sprite, nameText, ownerText, pathText]);

    return { container, sprite, glow, nameText, ownerText, pathText, lastX: input.x, lastY: input.y };
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

    const glowOn = input.isSelf || input.connected;
    entity.glow.setVisible(glowOn);
    entity.glow.setFillStyle(input.isSelf ? 0x00fff2 : 0x3dffb0, 0.35);

    entity.ownerText.setText(input.ownerLabel ?? "").setVisible(!!input.ownerLabel);
    entity.pathText
      .setText(input.pathLabel ?? "")
      .setY(input.ownerLabel ? 31 : 20)
      .setVisible(!!input.pathLabel);
  }
}
