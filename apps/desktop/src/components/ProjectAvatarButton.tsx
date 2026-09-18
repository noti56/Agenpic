import { useRef, useState } from "react";
import { Buildings } from "@phosphor-icons/react/Buildings";
import { Panel, Button } from "@agenpic/ui";
import type { ProjectRecord } from "@agenpic/types";
import { resizeImageToDataUrl } from "../lib/imageToDataUrl";
import { useUpdateProjectImages } from "../hooks/useProjects";
import styles from "./ProjectAvatarButton.module.css";

interface ProjectAvatarButtonProps {
  project: ProjectRecord;
  /** Only the project owner can change these — matches PocketBase's `projects.updateRule` (owner-only, not admins). */
  isOwner: boolean;
}

/** Round avatar pinned to the bottom of the activity rail, showing the
 * project's own picture. Owners can click it to change the project picture
 * and a placeholder "organization" picture — no organization entity exists
 * yet, so that one just lives on the project record for when it does. */
export function ProjectAvatarButton({ project, isOwner }: ProjectAvatarButtonProps) {
  const [open, setOpen] = useState(false);
  const update = useUpdateProjectImages();
  const projectFileRef = useRef<HTMLInputElement | null>(null);
  const orgFileRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (field: "image" | "orgImage", file: File | undefined) => {
    if (!file) return;
    const dataUrl = await resizeImageToDataUrl(file);
    update.mutate({ projectId: project.id, [field]: dataUrl });
  };

  const initial = project.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.avatarBtn}
        onClick={() => isOwner && setOpen((v) => !v)}
        title={isOwner ? `${project.name} — click to change picture` : project.name}
        aria-label={isOwner ? "Change project picture" : project.name}
      >
        {project.image ? (
          <img src={project.image} alt="" className={styles.avatarImg} />
        ) : (
          <span className={styles.avatarInitial}>{initial}</span>
        )}
      </button>

      {open && isOwner && (
        <Panel className={styles.popover}>
          <div className={styles.slot}>
            <div className={styles.preview}>
              {project.image ? (
                <img src={project.image} alt="" className={styles.previewImg} />
              ) : (
                <span className={styles.previewInitial}>{initial}</span>
              )}
            </div>
            <div className={styles.slotBody}>
              <span className={styles.slotLabel}>Project picture</span>
              <div className={styles.slotActions}>
                <Button type="button" variant="ghost" onClick={() => projectFileRef.current?.click()}>
                  Change
                </Button>
                {project.image && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => update.mutate({ projectId: project.id, image: "" })}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <input
                ref={projectFileRef}
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={(e) => {
                  handleFile("image", e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <div className={styles.slot}>
            <div className={styles.preview}>
              {project.orgImage ? (
                <img src={project.orgImage} alt="" className={styles.previewImg} />
              ) : (
                <Buildings size={20} />
              )}
            </div>
            <div className={styles.slotBody}>
              <span className={styles.slotLabel}>Organization picture</span>
              <p className={styles.slotHint}>
                No organizations yet — saved on this project for when they exist.
              </p>
              <div className={styles.slotActions}>
                <Button type="button" variant="ghost" onClick={() => orgFileRef.current?.click()}>
                  Change
                </Button>
                {project.orgImage && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => update.mutate({ projectId: project.id, orgImage: "" })}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <input
                ref={orgFileRef}
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={(e) => {
                  handleFile("orgImage", e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
