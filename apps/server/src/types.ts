export type PeerKind = "user" | "agent";

export interface PeerMeta {
  /** For agent nodes: the project directory the Claude Code session is running against. */
  path?: string;
  /** For user nodes: the id of the chosen hero sprite. */
  hero?: string;
  /** For agent nodes: display name of the human who owns/spawned this Claude Code session. */
  owner?: string;
}

export interface PeerState {
  socketId: string;
  userId: string;
  name: string;
  kind: PeerKind;
  color: string;
  x: number;
  y: number;
  meta?: PeerMeta;
}

export interface HandshakeAuth {
  projectId: string;
  userId: string;
  name: string;
  kind: PeerKind;
  color: string;
  meta?: PeerMeta;
}

export interface ClientToServerEvents {
  "presence:move": (pos: { x: number; y: number }) => void;
  "webrtc:signal": (payload: { to: string; data: unknown }) => void;
}

export interface ServerToClientEvents {
  "presence:roster": (peers: PeerState[]) => void;
  "presence:joined": (peer: PeerState) => void;
  "presence:moved": (payload: { socketId: string; x: number; y: number }) => void;
  "presence:left": (payload: { socketId: string }) => void;
  "webrtc:signal": (payload: { from: string; data: unknown }) => void;
}
