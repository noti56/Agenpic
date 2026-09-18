import { useEffect, useState } from "react";
import { ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { Button, Panel, TextInput } from "@agenpic/ui";
import { MAX_STATUS_LEN } from "@agenpic/types";
import { useAuth } from "../state/AuthContext";
import { useProjectStatuses, useSetMyStatus } from "../hooks/useProjectStatuses";
import styles from "./StatusButton.module.css";

interface StatusButtonProps {
  projectId: string;
  iconSize?: number;
  /** Applied to the trigger button, so it can share the shell header's own icon-button styling. */
  buttonClassName?: string;
}

/** Header control for setting the signed-in human's own status — a short,
 * free-text line (like a Slack status) shown next to them on the presence
 * map. Persisted in PocketBase (`presence_status`, kind: "user") rather
 * than pushed over the presence socket, so it survives reconnects and
 * reaches every connected client via PocketBase's own realtime
 * subscription (see useProjectStatuses). */
export function StatusButton({ projectId, iconSize = 17, buttonClassName }: StatusButtonProps) {
  const { user } = useAuth();
  const statuses = useProjectStatuses(projectId);
  const setMyStatus = useSetMyStatus(projectId);
  const [open, setOpen] = useState(false);
  const currentStatus = user ? (statuses.get(`${user.id}:user`) ?? "") : "";
  const [draft, setDraft] = useState(currentStatus);

  useEffect(() => {
    if (!open) setDraft(currentStatus);
  }, [open, currentStatus]);

  const save = (value: string) => {
    setMyStatus.mutate(value);
    setOpen(false);
  };

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={[buttonClassName, currentStatus ? styles.active : ""].filter(Boolean).join(" ")}
        onClick={() => setOpen((v) => !v)}
        title={currentStatus || "Set your status"}
        aria-label="Set your status"
        aria-pressed={open}
      >
        <ChatCircleDots size={iconSize} />
      </button>

      {open && (
        <Panel className={styles.popover}>
          <TextInput
            label="Your status"
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_STATUS_LEN))}
            onKeyDown={(e) => {
              if (e.key === "Enter") save(draft);
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="e.g. writing tests"
            maxLength={MAX_STATUS_LEN}
            autoFocus
          />
          <div className={styles.actions}>
            <Button type="button" variant="ghost" onClick={() => save("")}>
              Clear
            </Button>
            <Button type="button" variant="primary" onClick={() => save(draft)}>
              Save
            </Button>
          </div>
        </Panel>
      )}
    </div>
  );
}
