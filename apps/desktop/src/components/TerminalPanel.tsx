import { useState } from "react";
import { useAuth } from "../state/AuthContext";
import { TerminalTab } from "./TerminalTab";
import styles from "./TerminalPanel.module.css";

interface TerminalPanelProps {
  cwd: string;
  projectId: string;
}

interface TerminalSession {
  /** Stable unique key for React + PTY tracking — not shown to the user, so
   * it doesn't matter that it isn't sequential. */
  id: string;
}

function makeSession(): TerminalSession {
  return { id: `term-${crypto.randomUUID()}` };
}

export function TerminalPanel({ cwd, projectId }: TerminalPanelProps) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<TerminalSession[]>(() => [makeSession()]);
  const [activeId, setActiveId] = useState(() => sessions[0].id);

  const addTab = () => {
    const session = makeSession();
    setSessions((prev) => [...prev, session]);
    setActiveId(session.id);
  };

  const closeTab = (id: string) => {
    setSessions((prev) => {
      if (prev.length <= 1) return prev; // always keep at least one terminal open
      const next = prev.filter((s) => s.id !== id);
      if (activeId === id) setActiveId(next[next.length - 1].id);
      return next;
    });
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.tabBar}>
        {sessions.map((s, index) => {
          // Numbered by current position, not a persistent counter — a
          // counter that survives remounts (StrictMode double-invoking the
          // initial useState, Vite HMR, switching projects and back) drifts
          // from the actual tab count, e.g. showing "Terminal 8, 10, 11, 12"
          // for 4 open tabs. Position-based labels are always correct and
          // self-heal when a tab closes.
          const label = `Terminal ${index + 1}`;
          return (
            <div
              key={s.id}
              className={[styles.tabItem, s.id === activeId ? styles.tabItemActive : ""].join(" ")}
              onClick={() => setActiveId(s.id)}
            >
              <span>{label}</span>
              {sessions.length > 1 && (
                <button
                  type="button"
                  className={styles.tabCloseBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(s.id);
                  }}
                  aria-label={`Close ${label}`}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
        <button type="button" className={styles.addTabBtn} onClick={addTab} aria-label="New terminal">
          +
        </button>
      </div>

      <div className={styles.instances}>
        {sessions.map((s) => (
          <TerminalTab
            key={s.id}
            tabId={s.id}
            cwd={cwd}
            projectId={projectId}
            userId={user?.id}
            ownerName={user?.name || user?.email}
            active={s.id === activeId}
          />
        ))}
      </div>
    </div>
  );
}
