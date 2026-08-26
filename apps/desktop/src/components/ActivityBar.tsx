import type { ReactNode } from "react";
import type { PanelId } from "../hooks/useWorkspaceLayout";
import styles from "./ActivityBar.module.css";

export interface ActivityBarItem {
  id: PanelId;
  label: string;
  icon: ReactNode;
}

interface ActivityBarProps {
  items: ActivityBarItem[];
  activePanel: PanelId | null;
  onSelect: (id: PanelId) => void;
}

/** VS Code-style icon rail: one button per dockable workspace panel (see
 * useWorkspaceLayout). Clicking replaces the current view with this panel;
 * clicking the already-active one closes it. No drag-and-drop. */
export function ActivityBar({ items, activePanel, onSelect }: ActivityBarProps) {
  return (
    <nav className={styles.bar} aria-label="Workspace panels">
      <div className={styles.top}>
        {items.map((item) => {
          const isActive = item.id === activePanel;
          return (
            <button
              key={item.id}
              type="button"
              className={[styles.btn, isActive ? styles.btnActive : ""].join(" ")}
              onClick={() => onSelect(item.id)}
              data-tooltip={item.label}
              aria-pressed={isActive}
              aria-label={item.label}
            >
              {item.icon}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
