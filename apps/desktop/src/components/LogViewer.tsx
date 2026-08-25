import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "@agenpic/logger";
import { onLogsChange } from "../lib/logger";
import styles from "./LogViewer.module.css";

export function LogViewer() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => onLogsChange(setEntries), []);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries, open]);

  if (!open) {
    return (
      <button className={styles.toggle} onClick={() => setOpen(true)}>
        ▲ Logs ({entries.length})
      </button>
    );
  }

  return (
    <div className={styles.drawer}>
      <div className={styles.header}>
        <span className={styles.title}>Logs — frontend (this session)</span>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={() => setEntries([])}>
            Clear view
          </button>
          <button className={styles.iconBtn} onClick={() => setOpen(false)} aria-label="Close">
            ▼
          </button>
        </div>
      </div>
      <div className={styles.list} ref={listRef}>
        {entries.length === 0 && <div className={styles.empty}>No logs yet.</div>}
        {entries.map((entry, i) => (
          <div key={i} className={styles.row}>
            <span className={styles.time}>{entry.timestamp.slice(11, 23)}</span>
            <span className={[styles.level, styles[`level-${entry.level}`]].join(" ")}>
              {entry.level.toUpperCase()}
            </span>
            <span className={styles.scope}>[{entry.scope}]</span>
            <span className={styles.message}>{entry.message}</span>
            {entry.payload !== undefined && (
              <span className={styles.payload}>{safeStringify(entry.payload)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function safeStringify(payload: unknown): string {
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}
