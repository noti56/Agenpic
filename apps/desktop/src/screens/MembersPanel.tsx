import { useState, type FormEvent } from "react";
import { X } from "@phosphor-icons/react/X";
import type { ProjectMemberRecord, ProjectRecord, UserRecord } from "@agenpic/types";
import { Button, Panel, Select, TextInput } from "@agenpic/ui";
import {
  useInviteMember,
  useProjectMembers,
  useRemoveMember,
  useUpdateMemberRole,
} from "../hooks/useProjectMembers";
import styles from "./MembersPanel.module.css";

interface MembersPanelProps {
  project: ProjectRecord;
  isOwner: boolean;
  onClose: () => void;
}

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "viewer", label: "Viewer" },
];

export function MembersPanel({ project, isOwner, onClose }: MembersPanelProps) {
  const { data: members, isLoading } = useProjectMembers(project.id);
  const invite = useInviteMember(project.id);
  const updateRole = useUpdateMemberRole(project.id);
  const removeMember = useRemoveMember(project.id);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "viewer">("viewer");
  const [error, setError] = useState<string | null>(null);

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await invite.mutateAsync({ email, role });
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite member");
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <Panel className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Members — {project.name}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={16} weight="bold" />
          </button>
        </div>

        <ul className={styles.list}>
          {isLoading && <li className={styles.dim}>Loading…</li>}
          {members?.map((m: ProjectMemberRecord) => {
            const memberUser = m.expand?.user as UserRecord | undefined;
            return (
              <li key={m.id} className={styles.row}>
                <span className={styles.memberEmail}>{memberUser?.email ?? m.user}</span>
                {isOwner ? (
                  <div className={styles.rowActions}>
                    <Select
                      options={ROLE_OPTIONS}
                      value={m.role}
                      onChange={(e) =>
                        updateRole.mutate({
                          memberId: m.id,
                          role: e.target.value as "admin" | "viewer",
                        })
                      }
                    />
                    <Button variant="danger" onClick={() => removeMember.mutate(m.id)}>
                      Remove
                    </Button>
                  </div>
                ) : (
                  <span className={styles.roleBadge}>{m.role}</span>
                )}
              </li>
            );
          })}
        </ul>

        {isOwner && (
          <form className={styles.inviteForm} onSubmit={handleInvite}>
            <TextInput
              label="Invite by email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Select
              label="Role"
              options={ROLE_OPTIONS}
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "viewer")}
            />
            {error && <div className={styles.error}>{error}</div>}
            <Button type="submit" variant="primary" disabled={invite.isPending}>
              Invite
            </Button>
          </form>
        )}
      </Panel>
    </div>
  );
}
