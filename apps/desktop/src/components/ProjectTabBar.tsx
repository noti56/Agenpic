import { useState } from "react";
import { X } from "@phosphor-icons/react/X";
import { Plus } from "@phosphor-icons/react/Plus";
import { useProjectContext } from "../state/ProjectContext";
import { ProjectPicker } from "../screens/ProjectPicker";
import styles from "./ProjectTabBar.module.css";

/** Thin VS Code-style tab strip, one tab per open project. Lives above Shell
 * so every open project can stay mounted-but-hidden (see Shell's own
 * comment on that pattern) while this bar controls which one is visible. */
export function ProjectTabBar() {
  const { openProjects, activeProject, focusProject, closeProject, unreadProjectIds } = useProjectContext();
  const [showPicker, setShowPicker] = useState(false);

  return (
    <>
      <div className={styles.bar} role="tablist" aria-label="Open projects">
        {openProjects.map((project) => {
          const isActive = project.id === activeProject?.id;
          const isUnread = unreadProjectIds.has(project.id);
          return (
            <div
              key={project.id}
              role="tab"
              aria-selected={isActive}
              className={[styles.tab, isActive ? styles.tabActive : "", isUnread ? styles.tabUnread : ""].join(" ")}
              onClick={() => focusProject(project.id)}
            >
              {isUnread && <span className={styles.unreadDot} aria-label="Unread" />}
              <span className={styles.tabName}>{project.name}</span>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  closeProject(project.id);
                }}
                title={`Close ${project.name}`}
                aria-label={`Close ${project.name}`}
              >
                <X size={16} weight="bold" />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setShowPicker(true)}
          title="Open another project"
          aria-label="Open another project"
        >
          <Plus size={18} weight="bold" />
        </button>
      </div>

      {showPicker && (
        <div className={styles.pickerOverlay} onClick={() => setShowPicker(false)}>
          <div className={styles.pickerModal} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.pickerClose}
              onClick={() => setShowPicker(false)}
              aria-label="Close"
            >
              <X size={16} weight="bold" />
            </button>
            <ProjectPicker embedded />
          </div>
        </div>
      )}
    </>
  );
}
