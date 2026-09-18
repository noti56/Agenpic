import type { PeerKind } from "./presenceTypes";

export interface PokeEvent {
  projectId: string;
  fromKind: PeerKind;
  fromName: string;
  fromUserId?: string;
  message?: string;
}

type Listener = (event: PokeEvent) => void;

const listeners: Listener[] = [];

/** Hook point for anything that wants to react to an incoming poke — sound, toast, tab blink, native notification. */
export function onPoke(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    const i = listeners.indexOf(listener);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function emitPoke(event: PokeEvent) {
  for (const listener of listeners) listener(event);
}
