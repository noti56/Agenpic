import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { connectPresence } from "../lib/socket";
import type { HandshakeAuth, PeerState } from "../lib/presenceTypes";
import { emitToast } from "../lib/toastBus";
import { getLogger } from "../lib/logger";

const log = getLogger("presence");

export interface UsePresenceResult {
  socket: Socket | null;
  peers: PeerState[];
  move: (x: number, y: number) => void;
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
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!projectId || !self) return;

    const socket = connectPresence({ projectId, ...self });
    socketRef.current = socket;
    setPeers(new Map());

    socket.on("connect", () => log.info(`connected as ${self.kind}`, { projectId, socketId: socket.id }));
    socket.on("disconnect", (reason) => log.info("disconnected", { reason }));
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

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, self?.userId, self?.kind, self?.meta?.hero]);

  const move = (x: number, y: number) => {
    socketRef.current?.emit("presence:move", { x, y });
  };

  return { socket: socketRef.current, peers: [...peers.values()], move };
}
