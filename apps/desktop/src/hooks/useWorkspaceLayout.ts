import { useEffect, useState } from "react";

export type PanelId = "terminal" | "hangar" | "map" | "chat" | "docs";

const STORAGE_PREFIX = "agp:workspace-active:";

function loadActivePanel(projectId: string): PanelId | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + projectId);
    if (raw === "terminal" || raw === "hangar" || raw === "map" || raw === "chat" || raw === "docs") return raw;
  } catch {
    // storage unavailable or corrupt — fall through to the default
  }
  return "terminal";
}

/**
 * Which single workspace panel is showing, per project, persisted to
 * localStorage. Clicking an Activity Bar icon replaces the view entirely —
 * no split panes. Switching away from a panel doesn't unmount it (see
 * Shell.tsx's display:none toggling), so a running terminal session, an
 * open voice call, or scroll position all survive being switched away from
 * and back.
 */
export function useWorkspaceLayout(projectId: string) {
  const [activePanel, setActivePanel] = useState<PanelId | null>(() => loadActivePanel(projectId));

  useEffect(() => {
    setActivePanel(loadActivePanel(projectId));
  }, [projectId]);

  useEffect(() => {
    try {
      if (activePanel) localStorage.setItem(STORAGE_PREFIX + projectId, activePanel);
      else localStorage.removeItem(STORAGE_PREFIX + projectId);
    } catch {
      // storage unavailable — layout just won't persist across restarts
    }
  }, [projectId, activePanel]);

  const select = (id: PanelId) => {
    setActivePanel((prev) => (prev === id ? null : id));
  };

  const close = () => setActivePanel(null);

  return { activePanel, select, close };
}
