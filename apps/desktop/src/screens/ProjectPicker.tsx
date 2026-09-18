import { useState, type FormEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderSimple } from "@phosphor-icons/react/FolderSimple";
import { Clock } from "@phosphor-icons/react/Clock";
import { Crown } from "@phosphor-icons/react/Crown";
import { Button, Panel, TextInput } from "@agenpic/ui";
import type { ProjectRecord } from "@agenpic/types";
import { useProjectContext } from "../state/ProjectContext";
import { useCreateProject } from "../hooks/useProjects";
import { useAuth } from "../state/AuthContext";
import { formatRelativeTime } from "../lib/relativeTime";
import styles from "./ProjectPicker.module.css";

interface ProjectPickerProps {
  /** True when shown inside the tab bar's "+" modal (tabs already open) rather than the full-screen zero-tabs state. */
  embedded?: boolean;
}

/** Same hue-hash approach as the presence map's colorForId — a stable, no-lookup color per id, used here as the fallback avatar background when a project has no picture set. */
function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 55%, 32%)`;
}

function ProjectCard({
  project,
  isOwner,
  onOpen,
}: {
  project: ProjectRecord;
  isOwner: boolean;
  onOpen: () => void;
}) {
  const initial = project.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <Panel className={styles.card} onClick={onOpen}>
      <div className={styles.cardTop}>
        <div className={styles.thumb} style={project.image ? undefined : { background: colorForId(project.id) }}>
          {project.image ? (
            <img src={project.image} alt="" className={styles.thumbImg} />
          ) : (
            <span className={styles.thumbInitial}>{initial}</span>
          )}
        </div>
        <div className={styles.cardTitleBlock}>
          <div className={styles.cardName}>{project.name}</div>
          <span className={[styles.roleBadge, isOwner ? styles.roleBadgeOwner : ""].join(" ")}>
            {isOwner && <Crown size={10} weight="fill" />}
            {isOwner ? "Owner" : "Member"}
          </span>
        </div>
      </div>
      <div className={styles.cardPath}>
        <FolderSimple size={12} />
        <span className={styles.cardPathText}>{project.path}</span>
      </div>
      <div className={styles.cardMeta}>
        <Clock size={11} />
        Updated {formatRelativeTime(project.updated)}
      </div>
    </Panel>
  );
}

export function ProjectPicker({ embedded = false }: ProjectPickerProps) {
  const { projects, isLoading, openProject } = useProjectContext();
  const { logout, user } = useAuth();
  const createProject = useCreateProject();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");

  const pickFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      setPath(selected);
      if (!name) {
        const parts = selected.split(/[\\/]/).filter(Boolean);
        setName(parts[parts.length - 1] ?? "");
      }
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name || !path) return;
    const created = await createProject.mutateAsync({ name, path });
    openProject(created.id);
    setShowCreate(false);
    setName("");
    setPath("");
  };

  return (
    <div className={[styles.wrap, embedded ? styles.wrapEmbedded : ""].filter(Boolean).join(" ")}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Projects</h1>
          {!isLoading && projects.length > 0 && (
            <p className={styles.subtitle}>
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <div className={styles.headerRight}>
          {!embedded && (
            <>
              <span className={styles.userEmail}>{user?.email}</span>
              <Button variant="ghost" onClick={logout}>
                Sign out
              </Button>
            </>
          )}
        </div>
      </div>

      <div className={styles.grid}>
        {isLoading && <p className={styles.dim}>Loading projects…</p>}
        {!isLoading && projects.length === 0 && !showCreate && (
          <p className={styles.dim}>No projects yet. Create one to get started.</p>
        )}
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            isOwner={project.owner === user?.id}
            onOpen={() => openProject(project.id)}
          />
        ))}

        {showCreate ? (
          <Panel className={styles.createCard}>
            <form className={styles.form} onSubmit={handleCreate}>
              <TextInput label="Project name" value={name} onChange={(e) => setName(e.target.value)} required />
              <div className={styles.pathRow}>
                <TextInput
                  label="Directory"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="Pick a folder…"
                  required
                />
                <Button type="button" onClick={pickFolder}>
                  Browse
                </Button>
              </div>
              <div className={styles.formActions}>
                <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={createProject.isPending}>
                  Create
                </Button>
              </div>
            </form>
          </Panel>
        ) : (
          <button type="button" className={styles.addCard} onClick={() => setShowCreate(true)}>
            + New Project
          </button>
        )}
      </div>
    </div>
  );
}
