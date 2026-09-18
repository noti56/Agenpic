export type ProjectMemberRole = "admin" | "viewer";

export type TicketColumn = "backlog" | "todo" | "in_progress" | "done";

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  avatar: string;
  created: string;
  updated: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  owner: string;
  /** Base64 data URI (client-resized), not a PocketBase file field — see apps/desktop/src/lib/imageToDataUrl.ts. */
  image?: string;
  /** Same storage shape as `image`. No organization entity exists yet — this is a placeholder ref on the project for when one does. */
  orgImage?: string;
  created: string;
  updated: string;
}

export interface ProjectMemberRecord {
  id: string;
  project: string;
  user: string;
  role: ProjectMemberRole;
  created: string;
  /** Populated via the `expand` query param, not stored directly. */
  expand?: {
    user?: UserRecord;
  };
}

export interface TicketRecord {
  id: string;
  project: string;
  slug: string;
  title: string;
  description: string;
  column: TicketColumn;
  order: number;
  owner: string;
  /** PocketBase file field: stored filenames, resolved to URLs by the consumer. */
  images: string[];
  created: string;
  updated: string;
}

export interface DocRecord {
  id: string;
  project: string;
  slug: string;
  title: string;
  content: string;
  created: string;
  updated: string;
}

export interface CommentRecord {
  id: string;
  ticket: string;
  user: string;
  text: string;
  created: string;
  /** Populated via the `expand` query param, not stored directly. */
  expand?: {
    user?: UserRecord;
  };
}

export type PresenceStatusKind = "user" | "agent";

/** Cap for PresenceStatusRecord.status — mirrored in the CLI template (apps/desktop/src-tauri/templates/agenpic-cli.mjs), which can't import this constant. */
export const MAX_STATUS_LEN = 80;

/**
 * A free-text, Slack-style status shown on the presence map — persisted in
 * PocketBase (not ephemeral socket state) so it survives reconnects and
 * propagates via PocketBase's realtime subscriptions, same as tickets/chat.
 * One row per (project, user, kind): `kind: "user"` is the human's own
 * status; `kind: "agent"` is set by that human's Claude Code session(s) via
 * the CLI's `status` command. Multiple simultaneous terminal tabs for the
 * same human share the one `agent` row — the CLI has no way to address a
 * specific tab.
 */
export interface PresenceStatusRecord {
  id: string;
  project: string;
  user: string;
  kind: PresenceStatusKind;
  status: string;
  updated: string;
}

export interface MessageRecord {
  id: string;
  project: string;
  user: string;
  text: string;
  flagged: boolean;
  flaggedBy: string;
  flaggedAt: string;
  created: string;
  /** Populated via the `expand` query param, not stored directly. */
  expand?: {
    user?: UserRecord;
  };
}

/** The viewer's effective role on a project: owners are always admin-equivalent. */
export type EffectiveRole = "owner" | ProjectMemberRole;

export function effectiveRole(
  project: ProjectRecord,
  userId: string,
  membership: ProjectMemberRecord | undefined,
): EffectiveRole | undefined {
  if (project.owner === userId) return "owner";
  if (membership) return membership.role;
  return undefined;
}

export function canEdit(role: EffectiveRole | undefined): boolean {
  return role === "owner" || role === "admin";
}
