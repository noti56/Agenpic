import { useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import type { MessageRecord, UserRecord } from "@agenpic/types";
import styles from "./Chat.module.css";

export interface ChatPanelProps {
  messages: MessageRecord[];
  currentUserId: string;
  onSend: (text: string) => void;
  onToggleFlag: (messageId: string, flagged: boolean) => void;
}

interface MenuState {
  x: number;
  y: number;
  message: MessageRecord;
}

export function ChatPanel({ messages, currentUserId, onSend, onToggleFlag }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<MenuState | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  const handleContextMenu = (e: MouseEvent, message: MessageRecord) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, message });
  };

  return (
    <div className={styles.chat} onClick={() => setMenu(null)}>
      <div className={styles.list}>
        {messages.length === 0 && <div className={styles.empty}>No messages yet — say hi.</div>}
        {messages.map((m) => {
          const isSelf = m.user === currentUserId;
          const author = m.expand?.user as UserRecord | undefined;
          return (
            <div key={m.id} className={[styles.row, isSelf ? styles.rowSelf : styles.rowOther].join(" ")}>
              {!isSelf && <span className={styles.meta}>{author?.name || author?.email || "Unknown"}</span>}
              <div
                className={[styles.bubble, isSelf ? styles.bubbleSelf : "", m.flagged ? styles.bubbleFlagged : ""]
                  .filter(Boolean)
                  .join(" ")}
                onContextMenu={(e) => handleContextMenu(e, m)}
              >
                {m.flagged && (
                  <span className={styles.flagBadge} title="Flagged">
                    🚩
                  </span>
                )}
                {m.text}
              </div>
            </div>
          );
        })}
      </div>

      <form className={styles.inputRow} onSubmit={handleSubmit}>
        <input
          className={styles.input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message the team…"
        />
        <button type="submit" className={styles.sendBtn} disabled={!draft.trim()}>
          Send
        </button>
      </form>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y}>
          <button
            type="button"
            className={styles.contextMenuItem}
            onClick={() => {
              onToggleFlag(menu.message.id, !menu.message.flagged);
              setMenu(null);
            }}
          >
            {menu.message.flagged ? "Remove flag" : "Flag message"}
          </button>
        </ContextMenu>
      )}
    </div>
  );
}

/**
 * Positions itself at (x, y) like a normal context menu, but measures its
 * own rendered size after mount and clamps to the viewport — so it never
 * gets clipped when it opens near the right/bottom/left/top edge.
 */
function ContextMenu({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; ready: boolean }>({
    left: x,
    top: y,
    ready: false,
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 6;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - margin) left = window.innerWidth - rect.width - margin;
    if (top + rect.height > window.innerHeight - margin) top = window.innerHeight - rect.height - margin;
    left = Math.max(margin, left);
    top = Math.max(margin, top);
    setPos({ left, top, ready: true });
  }, [x, y]);

  return (
    <div
      ref={ref}
      className={styles.contextMenu}
      style={{ left: pos.left, top: pos.top, visibility: pos.ready ? "visible" : "hidden" }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
