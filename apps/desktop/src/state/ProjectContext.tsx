import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ProjectRecord } from "@agenpic/types";
import { useProjects } from "../hooks/useProjects";
import { useAuth } from "./AuthContext";

const STORAGE_KEY = "agenpic:activeProjectId";

interface ProjectContextValue {
  projects: ProjectRecord[];
  isLoading: boolean;
  activeProject: ProjectRecord | null;
  selectProject: (id: string | null) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data, isLoading } = useProjects();
  const [activeId, setActiveId] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  );

  const projects = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    if (!user) {
      setActiveId(null);
      return;
    }
    if (activeId && !projects.some((p) => p.id === activeId) && !isLoading) {
      setActiveId(null);
    }
  }, [user, projects, activeId, isLoading]);

  const selectProject = (id: string | null) => {
    setActiveId(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  };

  const activeProject = projects.find((p) => p.id === activeId) ?? null;

  return (
    <ProjectContext.Provider value={{ projects, isLoading, activeProject, selectProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjectContext must be used within ProjectProvider");
  return ctx;
}
