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

type OpenListener = (open: boolean) => void;
const openListeners: OpenListener[] = [];
let logViewerOpen = false;

export function onLogViewerOpenChange(listener: OpenListener): () => void {
  openListeners.push(listener);
  listener(logViewerOpen);
  return () => {
    const i = openListeners.indexOf(listener);
    if (i >= 0) openListeners.splice(i, 1);
  };
}

export function setLogViewerOpen(open: boolean) {
  logViewerOpen = open;
  for (const listener of openListeners) listener(logViewerOpen);
}

export function toggleLogViewer() {
  setLogViewerOpen(!logViewerOpen);
}

const rootLogger = createLogger("desktop", [consoleTransport, ring.transport]);

export function getLogger(scope: string) {
  return rootLogger.child(scope);
}
