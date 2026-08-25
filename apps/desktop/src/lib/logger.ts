import { consoleTransport, createLogger, createRingBufferTransport, type LogEntry } from "@agenpic/logger";

type LogListener = (entries: LogEntry[]) => void;
const changeListeners: LogListener[] = [];

const ring = createRingBufferTransport(500, (entries) => {
  for (const listener of changeListeners) listener(entries);
});

export function onLogsChange(listener: LogListener): () => void {
  changeListeners.push(listener);
  listener(ring.getEntries());
  return () => {
    const i = changeListeners.indexOf(listener);
    if (i >= 0) changeListeners.splice(i, 1);
  };
}

export function getLogEntries(): LogEntry[] {
  return ring.getEntries();
}

const rootLogger = createLogger("desktop", [consoleTransport, ring.transport]);

export function getLogger(scope: string) {
  return rootLogger.child(scope);
}
