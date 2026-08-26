import type { ReactNode } from "react";
import { X } from "@phosphor-icons/react/X";
import styles from "./WorkspacePane.module.css";

interface WorkspacePaneProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Small chrome around each dockable panel's content — a name + close button,
 * using the same tab-strip visual language as TerminalPanel's own internal
 * tabs, so the "editor group" look is consistent whether it's the outer
 * workspace split or the terminal's own multi-session tabs underneath it. */
export function WorkspacePane({ title, onClose, children }: WorkspacePaneProps) {
  return (
    <div className={styles.pane}>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={`Close ${title}`}>
          <X size={17} weight="bold" />
        </button>
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
