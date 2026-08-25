import { io, type Socket } from "socket.io-client";
import type { HandshakeAuth } from "./presenceTypes";

export const SERVER_URL = "http://127.0.0.1:4001";

export function connectPresence(auth: HandshakeAuth): Socket {
  return io(SERVER_URL, {
    auth,
    transports: ["websocket"],
  });
}
