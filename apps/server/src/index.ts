import { createServer } from "node:http";
import { Server } from "socket.io";
import { createLogger } from "@agenpic/logger";
import { getIceServers, turnConfigured } from "./ice.js";
import type {
  ClientToServerEvents,
  HandshakeAuth,
  PeerState,
  ServerToClientEvents,
} from "./types.js";

const PORT = Number(process.env.PORT ?? 4001);
const log = createLogger("server");

// The desktop app fetches these over plain HTTP from a webview whose origin
// is `tauri://localhost` (or `http://tauri.localhost` on Windows), so every
// response here is cross-origin and needs CORS headers — unlike the Socket.io
// endpoint below, which sets its own.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const httpServer = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
    res.end(JSON.stringify({ ok: true, turn: turnConfigured }));
    return;
  }

  // WebRTC media is peer-to-peer UDP and never touches this server (nor the
  // Cloudflare Tunnel in front of it) — only signaling does. Without a TURN
  // relay in this list, any two peers whose NATs can't be hole-punched
  // through simply never exchange media, which looks exactly like "audio and
  // video silently don't work" on the client.
  if (req.url === "/ice") {
    getIceServers()
      .then((iceServers) => {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          ...CORS_HEADERS,
        });
        res.end(JSON.stringify({ iceServers }));
      })
      .catch((err) => {
        log.error("/ice failed", err instanceof Error ? err.message : err);
        res.writeHead(500, { "Content-Type": "application/json", ...CORS_HEADERS });
        res.end(JSON.stringify({ error: "failed to resolve ICE servers" }));
      });
    return;
  }

  res.writeHead(404, CORS_HEADERS);
  res.end();
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: "*" },
});

function roomFor(projectId: string) {
  return `project:${projectId}`;
}

function randomSpawn() {
  return { x: 100 + Math.random() * 400, y: 100 + Math.random() * 300 };
}

io.on("connection", (socket) => {
  const auth = socket.handshake.auth as Partial<HandshakeAuth>;

  if (!auth.projectId || !auth.userId || !auth.name || !auth.kind) {
    socket.disconnect(true);
    return;
  }

  const room = roomFor(auth.projectId);
  const spawn = randomSpawn();
  const state: PeerState = {
    socketId: socket.id,
    userId: auth.userId,
    name: auth.name,
    kind: auth.kind,
    color: auth.color ?? "#00fff2",
    x: spawn.x,
    y: spawn.y,
    meta: auth.meta,
  };

  socket.join(room);
  socket.data.state = state;
  socket.data.room = room;

  const peers = [...(io.sockets.adapter.rooms.get(room) ?? [])]
    .map((id) => io.sockets.sockets.get(id)?.data.state as PeerState | undefined)
    .filter((p): p is PeerState => !!p && p.socketId !== socket.id);

  socket.emit("presence:roster", peers);
  socket.to(room).emit("presence:joined", state);

  log.info(`${state.kind} "${state.name}" joined ${room}`, { online: peers.length + 1 });

  socket.on("presence:move", ({ x, y }) => {
    if (typeof x !== "number" || typeof y !== "number") return;
    state.x = x;
    state.y = y;
    socket.to(room).emit("presence:moved", { socketId: socket.id, x, y });
  });

  socket.on("webrtc:signal", ({ to, data }) => {
    if (typeof to !== "string") return;
    io.to(to).emit("webrtc:signal", { from: socket.id, data });
  });

  socket.on("disconnect", () => {
    socket.to(room).emit("presence:left", { socketId: socket.id });
    log.info(`${state.kind} "${state.name}" left ${room}`);
  });
});

httpServer.listen(PORT, () => {
  log.info(`listening on :${PORT}`);
  if (!turnConfigured) {
    log.warn(
      "TURN_KEY_ID/TURN_KEY_API_TOKEN not set — serving STUN-only ICE config. " +
        "Voice/video will work between peers on the same machine or LAN, and fail " +
        "between peers behind separate NATs.",
    );
  }
});
