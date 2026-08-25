export type ToastKind = "info" | "success" | "warning" | "ticket-moved" | "teammate-joined" | "message-flagged";

export interface ToastEvent {
  kind: ToastKind;
  message: string;
}

type Listener = (event: ToastEvent) => void;

const listeners: Listener[] = [];

/**
 * Hook point for anything that wants to react to a toast-worthy event
 * beyond just showing the visual toast — e.g. a future voice-line/audio
 * feature can subscribe here without reworking how events get raised.
 */
export function onToast(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    const i = listeners.indexOf(listener);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function emitToast(event: ToastEvent) {
  for (const listener of listeners) listener(event);
}
