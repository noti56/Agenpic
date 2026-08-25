export type PeerKind = "user" | "agent";

export interface PeerMeta {
  path?: string;
  hero?: string;
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
