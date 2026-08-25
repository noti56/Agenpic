import { createServer } from "node:http";
import { Server } from "socket.io";
import { createLogger } from "@agenpic/logger";
import type {
  ClientToServerEvents,
  HandshakeAuth,
  PeerState,
  ServerToClientEvents,
} from "./types.js";

const PORT = Number(process.env.PORT ?? 4001);
const log = createLogger("server");

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
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
});
