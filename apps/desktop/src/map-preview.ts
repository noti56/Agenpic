/**
 * Dev-only harness: renders OfficeScene with a fake roster and fake peers so
 * the map's look can be iterated on in a plain browser, with no PocketBase,
 * no auth and no presence socket. Served at /map-preview.html by `vite`.
 */
import Phaser from "phaser";
import { OfficeScene, type AvatarInput } from "./components/map/OfficeScene";
import { agentSlotPosition, computeOfficeLayout } from "./components/map/officeLayout";
import { agentTextureForAccent, resolveHero } from "./components/sprites/heroDefs";

const NAMES = ["netanel", "claude", "maya", "sam", "jordan", "alex", "tess", "riley"];
// ?n=2 renders a smaller roster, which the camera then fits at a much higher
// zoom — the only practical way to eyeball sprite detail here.
const size = Number(new URLSearchParams(location.search).get("n")) || NAMES.length;
const ROSTER = NAMES.slice(0, Math.max(1, Math.min(size, NAMES.length))).map((name) => ({
  userId: `u-${name}`,
  name,
}));

const host = document.getElementById("host")!;
const scene = new OfficeScene();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: host,
  transparent: false,
  scale: { mode: Phaser.Scale.NONE, width: host.clientWidth, height: host.clientHeight },
  render: { antialias: true, roundPixels: false },
  scene: [scene],
});

const layout = computeOfficeLayout(ROSTER);
scene.setViewportSize(host.clientWidth, host.clientHeight);
scene.setLayout(layout);

const avatars: AvatarInput[] = [];
layout.rooms.forEach((room, roomIndex) => {
  // One human at their desk...
  avatars.push({
    id: room.userId,
    x: room.deskX,
    y: room.deskY + (room.doorSide === "bottom" ? 30 : -30),
    textureKey: resolveHero(undefined, room.userId).textureKey,
    name: roomIndex === 0 ? `${room.name} (you)` : room.name,
    connected: roomIndex === 1,
    isSelf: roomIndex === 0,
    accent: room.accent,
  });
  // ...plus a varying number of docked Claude Code agents.
  const agentCount = roomIndex % 3 === 0 ? 3 : roomIndex % 3;
  for (let i = 0; i < agentCount; i++) {
    const pad = agentSlotPosition(room, i);
    avatars.push({
      id: `${room.userId}-agent-${i}`,
      x: pad.x,
      y: pad.y,
      textureKey: agentTextureForAccent(room.accent),
      name: agentCount > 1 ? `${i + 1}` : "claude",
      connected: false,
      isSelf: false,
      accent: room.accent,
      docked: true,
    });
  }
});

// A couple of people out on the floor / heading for the meeting room.
avatars.push({
  id: "wanderer-1",
  x: layout.meeting.x - 90,
  y: layout.meeting.y + 60,
  textureKey: resolveHero("nova", "w1").textureKey,
  name: "maya",
  connected: true,
  isSelf: false,
  accent: 0x00fff2,
});
avatars.push({
  id: "wanderer-2",
  x: layout.meeting.x + layout.meeting.width + 80,
  y: layout.meeting.y + layout.meeting.height - 40,
  textureKey: resolveHero("ronin", "w2").textureKey,
  name: "sam",
  connected: false,
  isSelf: false,
  accent: 0xff2fd0,
});
// A loose agent that couldn't be docked — shows the owner/path label form.
avatars.push({
  id: "loose-agent",
  x: layout.meeting.x + layout.meeting.width / 2,
  y: layout.meeting.y - 90,
  textureKey: agentTextureForAccent(undefined),
  name: "claude",
  ownerLabel: "netanel",
  pathLabel: "api",
  connected: false,
  isSelf: false,
});

scene.syncAvatars(avatars);

new ResizeObserver(() => {
  game.scale.resize(host.clientWidth, host.clientHeight);
  scene.setViewportSize(host.clientWidth, host.clientHeight);
}).observe(host);
