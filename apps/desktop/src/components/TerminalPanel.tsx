import { useMemo, useState } from "react";
import { usePresence } from "../hooks/usePresence";
import { useAuth } from "../state/AuthContext";
import { TerminalInstance } from "./TerminalInstance";
import styles from "./TerminalPanel.module.css";

interface TerminalPanelProps {
  cwd: string;
  projectId: string;
}

interface TerminalSession {
  id: string;
  title: string;
}

let sessionCounter = 0;
function nextSession(): TerminalSession {
  sessionCounter += 1;
  return { id: `term-${Date.now()}-${sessionCounter}`, title: `Terminal ${sessionCounter}` };
}

export function TerminalPanel({ cwd, projectId }: TerminalPanelProps) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<TerminalSession[]>(() => [nextSession()]);
  const [activeId, setActiveId] = useState(() => sessions[0].id);

  // Registers a single "agent" node on the presence map for as long as this
  // project has the terminal area mounted — tagged with the project
  // directory. One node regardless of how many terminal tabs are open;
  // this is the embedded terminal's own PTY session, not a detection of
  // the `claude` command specifically being run inside it.
  const agentSelf = useMemo(
    () =>
      user
        ? {
            userId: `${user.id}:agent`,
            name: "Claude Code Terminal",
            kind: "agent" as const,
            color: "#ff2fd0",
            meta: { path: cwd },
          }
        : undefined,
    [user, cwd],
  );
  usePresence(projectId, agentSelf);

  const addTab = () => {
    const session = nextSession();
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
        {sessions.map((s) => (
          <div
            key={s.id}
            className={[styles.tabItem, s.id === activeId ? styles.tabItemActive : ""].join(" ")}
            onClick={() => setActiveId(s.id)}
          >
            <span>{s.title}</span>
            {sessions.length > 1 && (
              <button
                type="button"
                className={styles.tabCloseBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(s.id);
                }}
                aria-label={`Close ${s.title}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button type="button" className={styles.addTabBtn} onClick={addTab} aria-label="New terminal">
          +
        </button>
      </div>

      <div className={styles.instances}>
        {sessions.map((s) => (
          <div key={s.id} style={{ display: s.id === activeId ? "block" : "none", height: "100%" }}>
            <TerminalInstance cwd={cwd} />
          </div>
        ))}
      </div>
    </div>
  );
}
