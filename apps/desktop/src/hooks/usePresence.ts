import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { connectPresence } from "../lib/socket";
import type { HandshakeAuth, PeerState } from "../lib/presenceTypes";
import { emitToast } from "../lib/toastBus";
import { emitPoke } from "../lib/pokeBus";
import { getLogger } from "../lib/logger";

const log = getLogger("presence");

export interface UsePresenceResult {
  socket: Socket | null;
  /** Our own socket id, or undefined until the handshake completes. Held as
   *  state (not read off `socket.id`) so that consumers actually re-render
   *  when it lands — WebRTC role assignment depends on comparing it against
   *  peer ids, and silently reading a stale `undefined` breaks that. */
  socketId: string | undefined;
  peers: PeerState[];
  move: (x: number, y: number) => void;
  /** Human-to-human poke, targeted by userId (clicking a peer's avatar). */
  poke: (toUserId: string) => void;
}

/**
 * Opens one presence connection for the lifetime this hook is mounted.
 * Used both for the human user (mounted for as long as a project is open)
 * and for the "agent" node representing the embedded terminal session
 * (mounted for as long as the terminal panel is alive).
 */
export function usePresence(
  projectId: string | undefined,
  self: Omit<HandshakeAuth, "projectId"> | undefined,
): UsePresenceResult {
  const [peers, setPeers] = useState<Map<string, PeerState>>(new Map());
  const [socketId, setSocketId] = useState<string | undefined>(undefined);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!projectId || !self) return;

    const socket = connectPresence({ projectId, ...self });
    socketRef.current = socket;
    setPeers(new Map());

    setSocketId(undefined);

    socket.on("connect", () => {
      setSocketId(socket.id);
      log.info(`connected as ${self.kind}`, { projectId, socketId: socket.id });
    });
    socket.on("disconnect", (reason) => {
      setSocketId(undefined);
      log.info("disconnected", { reason });
    });
    socket.on("connect_error", (err) => log.error("connection error", err.message));

    socket.on("presence:roster", (roster: PeerState[]) => {
      setPeers(new Map(roster.map((p) => [p.socketId, p])));
    });

    socket.on("presence:joined", (peer: PeerState) => {
      setPeers((prev) => new Map(prev).set(peer.socketId, peer));
      // Only the human-facing connection announces this (not the terminal's
      // own agent connection, which would otherwise double the toast since
      // both are separate sockets in the same room), and only for other
      // humans joining, not agent nodes.
      if (self.kind === "user" && peer.kind === "user") {
        emitToast({ kind: "teammate-joined", message: `${peer.name} joined the project` });
      }
    });

    socket.on("presence:moved", ({ socketId, x, y }: { socketId: string; x: number; y: number }) => {
      setPeers((prev) => {
        const existing = prev.get(socketId);
        if (!existing) return prev;
        const next = new Map(prev);
        next.set(socketId, { ...existing, x, y });
        return next;
      });
    });

    socket.on("presence:left", ({ socketId }: { socketId: string }) => {
      setPeers((prev) => {
        if (!prev.has(socketId)) return prev;
        const next = new Map(prev);
        next.delete(socketId);
        return next;
      });
    });

    // Only the human-facing connection cares about being poked — an
    // agent's own connection never receives one (the server only emits
    // "poke" to kind:"user" sockets), but guard anyway for clarity.
    socket.on("poke", (payload) => {
      if (self.kind !== "user") return;
      emitPoke(payload);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocketId(undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, self?.userId, self?.kind, self?.meta?.hero]);

  // Stable identity: consumers key effects off `move` (the map re-registers
  // its click handler, and re-announces position on reconnect), and a fresh
  // closure each render would make those effects re-run every render.
  const move = useCallback((x: number, y: number) => {
    socketRef.current?.emit("presence:move", { x, y });
  }, []);

  const poke = useCallback((toUserId: string) => {
    socketRef.current?.emit("presence:poke", { toUserId });
  }, []);

  return { socket: socketRef.current, socketId, peers: [...peers.values()], move, poke };
}
