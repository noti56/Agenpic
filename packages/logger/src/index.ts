export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  scope: string;
  message: string;
  payload?: unknown;
  timestamp: string;
}

export type LogTransport = (entry: LogEntry) => void;

export class Logger {
  constructor(
    private readonly scope: string,
    private readonly transports: LogTransport[],
  ) {}

  private emit(level: LogLevel, message: string, payload?: unknown) {
    const entry: LogEntry = {
      level,
      scope: this.scope,
      message,
      payload,
      timestamp: new Date().toISOString(),
    };
    for (const transport of this.transports) transport(entry);
  }

  debug(message: string, payload?: unknown) {
    this.emit("debug", message, payload);
  }
  info(message: string, payload?: unknown) {
    this.emit("info", message, payload);
  }
  warn(message: string, payload?: unknown) {
    this.emit("warn", message, payload);
  }
  error(message: string, payload?: unknown) {
    this.emit("error", message, payload);
  }

  /** Scoped child logger, e.g. logger.child("pty") -> scope "desktop:pty". */
  child(subScope: string): Logger {
    return new Logger(`${this.scope}:${subScope}`, this.transports);
  }
}

export const consoleTransport: LogTransport = (entry) => {
  const fn = entry.level === "error" ? console.error : entry.level === "warn" ? console.warn : console.log;
  fn(`[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.scope}] ${entry.message}`, entry.payload ?? "");
};

/**
 * Keeps the last `capacity` entries in memory for a log viewer UI, calling
 * `onChange` with the full buffer on every new entry.
 */
export function createRingBufferTransport(capacity: number, onChange?: (entries: LogEntry[]) => void) {
  const buffer: LogEntry[] = [];
  const transport: LogTransport = (entry) => {
    buffer.push(entry);
    if (buffer.length > capacity) buffer.shift();
    onChange?.([...buffer]);
  };
  return { transport, getEntries: () => [...buffer] };
}

export function createLogger(scope: string, transports: LogTransport[] = [consoleTransport]): Logger {
  return new Logger(scope, transports);
}
