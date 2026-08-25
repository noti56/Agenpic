import { useState, type FormEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button, Panel, TextInput } from "@agenpic/ui";
import { useProjectContext } from "../state/ProjectContext";
import { useCreateProject } from "../hooks/useProjects";
import { useAuth } from "../state/AuthContext";
import styles from "./ProjectPicker.module.css";

export function ProjectPicker() {
  const { projects, isLoading, selectProject } = useProjectContext();
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
    selectProject(created.id);
    setShowCreate(false);
    setName("");
    setPath("");
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>Projects</h1>
        <div className={styles.headerRight}>
          <span className={styles.userEmail}>{user?.email}</span>
          <Button variant="ghost" onClick={logout}>
            Sign out
          </Button>
        </div>
      </div>

      <div className={styles.grid}>
        {isLoading && <p className={styles.dim}>Loading projects…</p>}
        {!isLoading && projects.length === 0 && !showCreate && (
          <p className={styles.dim}>No projects yet. Create one to get started.</p>
        )}
        {projects.map((project) => (
          <Panel key={project.id} className={styles.card} onClick={() => selectProject(project.id)}>
            <div className={styles.cardName}>{project.name}</div>
            <div className={styles.cardPath}>{project.path}</div>
          </Panel>
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
