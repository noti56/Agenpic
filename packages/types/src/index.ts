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
