import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
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

/** Consecutive messages from the same sender within this window are grouped
 * under one avatar/name, like Slack/iMessage. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;
/** How close to the bottom counts as "already caught up", for both the
 * autoscroll-on-new-message decision and hiding the jump-to-latest button. */
const NEAR_BOTTOM_PX = 96;
const COMPOSER_MAX_HEIGHT = 140;

export function ChatPanel({ messages, currentUserId, onSend, onToggleFlag }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);

  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const prevLastIdRef = useRef<string | undefined>(undefined);
  const hasScrolledOnceRef = useRef(false);

  const submitDraft = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitDraft();
  };

  const handleComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitDraft();
    }
  };

  const handleContextMenu = (e: MouseEvent, message: MessageRecord) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, message });
  };

  // Auto-grow the composer as the draft gets longer, capping out at
  // COMPOSER_MAX_HEIGHT and letting it scroll internally past that.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [draft]);

  const scrollToBottom = (behavior: ScrollBehavior) => {
    const el = listRef.current;
    if (!el) return;
    // jsdom (unit tests) doesn't implement Element.scrollTo.
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior });
    } else {
      el.scrollTop = el.scrollHeight;
    }
    setUnseenCount(0);
  };

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < NEAR_BOTTOM_PX;
    setIsNearBottom(nearBottom);
    if (nearBottom) setUnseenCount(0);
  };

  const lastMessage = messages[messages.length - 1];

  // Stay pinned to the latest message while the reader is already caught up
  // (or it's their own outgoing message); otherwise leave their scroll
  // position alone and surface an unread badge instead.
  useEffect(() => {
    if (!lastMessage) return;
    const isNewMessage = prevLastIdRef.current !== lastMessage.id;
    const wasNearBottom = isNearBottom;
    prevLastIdRef.current = lastMessage.id;
    if (!isNewMessage) return;

    const behavior: ScrollBehavior = hasScrolledOnceRef.current ? "smooth" : "auto";
    hasScrolledOnceRef.current = true;

    if (wasNearBottom || lastMessage.user === currentUserId) {
      scrollToBottom(behavior);
    } else {
      setUnseenCount((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage, currentUserId]);

  const grouped = useMemo(() => groupMessages(messages), [messages]);

  return (
    <div className={styles.chat} onClick={() => setMenu(null)}>
      <div className={styles.list} ref={listRef} onScroll={handleScroll}>
        {messages.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              💬
            </span>
            <p className={styles.emptyTitle}>No messages yet</p>
            <p className={styles.emptyHint}>Say hi to the team to get things started.</p>
          </div>
        )}

        {grouped.map(({ message: m, isFirstInGroup, isLastInGroup, dateLabel }) => {
          const isSelf = m.user === currentUserId;
          const author = m.expand?.user as UserRecord | undefined;
          const name = author?.name || author?.email || "Unknown";
          const cornerStyle = isSelf
            ? {
                borderTopRightRadius: isFirstInGroup ? "4px" : undefined,
                borderBottomRightRadius: isLastInGroup ? "4px" : undefined,
              }
            : {
                borderTopLeftRadius: isFirstInGroup ? "4px" : undefined,
                borderBottomLeftRadius: isLastInGroup ? "4px" : undefined,
              };

          return (
            <div key={m.id}>
              {dateLabel && (
                <div className={styles.dateSeparator}>
                  <span>{dateLabel}</span>
                </div>
              )}
              <div
                className={[styles.row, isSelf ? styles.rowSelf : styles.rowOther, isFirstInGroup ? styles.rowGroupStart : ""]
                  .filter(Boolean)
                  .join(" ")}
              >
                {!isSelf && (
                  <div className={styles.avatarSlot}>{isFirstInGroup && <Avatar name={name} />}</div>
                )}
                <div className={styles.bubbleCol}>
                  {!isSelf && isFirstInGroup && <span className={styles.meta}>{name}</span>}
                  <div
                    className={[styles.bubble, isSelf ? styles.bubbleSelf : "", m.flagged ? styles.bubbleFlagged : ""]
                      .filter(Boolean)
                      .join(" ")}
                    style={cornerStyle}
                    onContextMenu={(e) => handleContextMenu(e, m)}
                  >
                    {m.flagged && (
                      <span className={styles.flagBadge} title="Flagged">
                        🚩
                      </span>
                    )}
                    <span className={styles.bubbleText}>{m.text}</span>
                  </div>
                  {isLastInGroup && <span className={styles.time}>{formatTime(m.created)}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!isNearBottom && messages.length > 0 && (
        <button type="button" className={styles.jumpToBottom} onClick={() => scrollToBottom("smooth")}>
          {unseenCount > 0 ? `${unseenCount} new ↓` : "↓"}
        </button>
      )}

      <form className={styles.inputRow} onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          className={styles.input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Message the team…"
          rows={1}
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

const AVATAR_PALETTE = [
  "var(--agp-cyan)",
  "var(--agp-magenta)",
  "var(--agp-warning)",
  "var(--agp-success)",
  "var(--agp-cyan-dim)",
  "var(--agp-magenta-dim)",
];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function Avatar({ name }: { name: string }) {
  return (
    <div className={styles.avatar} style={{ background: colorForName(name) }} aria-hidden="true">
      {initialsForName(name)}
    </div>
  );
}

interface GroupedMessage {
  message: MessageRecord;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  /** Non-empty only on the message that should show a date separator above it. */
  dateLabel: string;
}

function groupMessages(messages: MessageRecord[]): GroupedMessage[] {
  return messages.map((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const sameSenderAsPrev =
      !!prev && prev.user === m.user && sameDay(prev.created, m.created) && withinGroupWindow(prev.created, m.created);
    const sameSenderAsNext =
      !!next && next.user === m.user && sameDay(m.created, next.created) && withinGroupWindow(m.created, next.created);
    const showSeparator = !prev || !sameDay(prev.created, m.created);

    return {
      message: m,
      isFirstInGroup: !sameSenderAsPrev,
      isLastInGroup: !sameSenderAsNext,
      dateLabel: showSeparator ? formatDateSeparator(m.created) : "",
    };
  });
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function withinGroupWindow(a: string, b: string): boolean {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return false;
  return Math.abs(db.getTime() - da.getTime()) < GROUP_WINDOW_MS;
}

function sameDay(a: string, b: string): boolean {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return true; // can't tell — don't spam a separator
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function formatTime(value: string): string {
  const d = parseDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
}

function formatDateSeparator(value: string): string {
  const d = parseDate(value);
  if (!d) return "";
  const now = new Date();
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  const sameYear = d.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  }).format(d);
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
