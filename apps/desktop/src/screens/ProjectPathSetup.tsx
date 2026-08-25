import { useState, type FormEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { ProjectRecord } from "@agenpic/types";
import { Button, Panel, TextInput } from "@agenpic/ui";
import styles from "./ProjectPathSetup.module.css";

interface ProjectPathSetupProps {
  project: ProjectRecord;
  onSave: (path: string) => void | Promise<void>;
  onBack: () => void;
}

/**
 * Shown to a member opening a shared project on this machine for the first
 * time. `project.path` is only the owner's local checkout — everyone else
 * needs to point at wherever they cloned the repo on their own machine.
 */
export function ProjectPathSetup({ project, onSave, onBack }: ProjectPathSetupProps) {
  const [path, setPath] = useState("");
  const [saving, setSaving] = useState(false);

  const pickFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") setPath(selected);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!path) return;
    setSaving(true);
    try {
      await onSave(path);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <Panel className={styles.panel}>
        <h1 className={styles.title}>Where is “{project.name}” on this machine?</h1>
        <p className={styles.hint}>
          Point this device at your own local copy of the project — it doesn&apos;t have to match
          the owner&apos;s path.
        </p>
        <form className={styles.form} onSubmit={handleSubmit}>
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
            <Button type="button" variant="ghost" onClick={onBack}>
              ← Projects
            </Button>
            <Button type="submit" variant="primary" disabled={saving || !path}>
              Continue
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
