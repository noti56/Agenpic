import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ProjectRecord } from "@agenpic/types";
import { useProjects } from "../hooks/useProjects";
import { useAuth } from "./AuthContext";

const OPEN_IDS_KEY = "agenpic:openProjectIds";
const ACTIVE_ID_KEY = "agenpic:activeProjectId";

function readOpenIds(): string[] {
  try {
    const raw = localStorage.getItem(OPEN_IDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

interface ProjectContextValue {
  projects: ProjectRecord[];
  isLoading: boolean;
  /** Projects currently open as tabs, in tab order. */
  openProjects: ProjectRecord[];
  /** The focused tab, or null if none are open. */
  activeProject: ProjectRecord | null;
  /** Opens a project as a tab (if not already open) and focuses it. */
  openProject: (id: string) => void;
  /** Closes a tab. If it was focused, focuses a neighboring tab or none. */
  closeProject: (id: string) => void;
  focusProject: (id: string) => void;
  /** Project ids with something unread (a poke or a new chat message) — drives the tab bar's blink indicator. */
  unreadProjectIds: Set<string>;
  markProjectUnread: (id: string) => void;
  clearProjectUnread: (id: string) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data, isLoading } = useProjects();
  const [openIds, setOpenIds] = useState<string[]>(readOpenIds);
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem(ACTIVE_ID_KEY));
  const [unreadProjectIds, setUnreadProjectIds] = useState<Set<string>>(new Set());

  const projects = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    localStorage.setItem(OPEN_IDS_KEY, JSON.stringify(openIds));
  }, [openIds]);

  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_ID_KEY, activeId);
    else localStorage.removeItem(ACTIVE_ID_KEY);
  }, [activeId]);

  // Drop any open/active id the user no longer has access to (project
  // deleted, access revoked) once the project list has actually loaded.
  useEffect(() => {
    if (!user) {
      setOpenIds([]);
      setActiveId(null);
      return;
    }
    if (isLoading) return;
    const validIds = new Set(projects.map((p) => p.id));
    setOpenIds((prev) => prev.filter((id) => validIds.has(id)));
    setActiveId((prev) => (prev && validIds.has(prev) ? prev : null));
  }, [user, projects, isLoading]);

  const openProject = (id: string) => {
    setOpenIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveId(id);
  };

  const closeProject = (id: string) => {
    setOpenIds((prev) => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const next = prev.filter((openId) => openId !== id);
      setActiveId((currentActive) => {
        if (currentActive !== id) return currentActive;
        if (next.length === 0) return null;
        return next[Math.min(idx, next.length - 1)];
      });
      return next;
    });
    setUnreadProjectIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const focusProject = (id: string) => setActiveId(id);

  const markProjectUnread = (id: string) =>
    setUnreadProjectIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));

  const clearProjectUnread = (id: string) =>
    setUnreadProjectIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const openProjects = useMemo(
    () => openIds.map((id) => projects.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p),
    [openIds, projects],
  );
  const activeProject = openProjects.find((p) => p.id === activeId) ?? null;

  return (
    <ProjectContext.Provider
      value={{
        projects,
        isLoading,
        openProjects,
        activeProject,
        openProject,
        closeProject,
        focusProject,
        unreadProjectIds,
        markProjectUnread,
        clearProjectUnread,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjectContext must be used within ProjectProvider");
  return ctx;
}
