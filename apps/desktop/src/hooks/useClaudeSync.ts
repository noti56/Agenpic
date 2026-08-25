import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ClientResponseError } from "pocketbase";
import type { TicketColumn } from "@agenpic/types";
import { client } from "../lib/pocketbase";
import { getLogger } from "../lib/logger";

const log = getLogger("claude-sync");

interface ClaudeMdChangedPayload {
  project_id: string;
  content: string | null;
}

interface TicketChangedPayload {
  project_id: string;
  slug: string;
  content: string | null;
}

interface TicketFileShape {
  title: string;
  description?: string;
  column?: TicketColumn;
  order?: number;
}

/**
 * Watches a project's directory (via the Rust file watcher) for CLAUDE.md
 * and .agenpic/tickets/*.json changes written by Claude Code running in the
 * embedded terminal, and syncs them into PocketBase so the UI updates live.
 */
export function useClaudeSync(projectId: string | undefined, projectPath: string | undefined) {
  useEffect(() => {
    if (!projectId || !projectPath) return;

    let cancelled = false;
    const unlistenFns: Array<() => void> = [];

    (async () => {
      await invoke("watch_project", { projectId, projectPath });
      if (cancelled) return;

      unlistenFns.push(
        await listen<ClaudeMdChangedPayload>("agenpic://claude-md", (event) => {
          if (event.payload.project_id !== projectId) return;
          client.projects
            .update(projectId, { claude_md: event.payload.content ?? "" })
            .then(() => log.info("synced CLAUDE.md"))
            .catch((err) => log.error("failed to sync CLAUDE.md", err));
        }),
      );

      unlistenFns.push(
        await listen<TicketChangedPayload>("agenpic://ticket-changed", (event) => {
          if (event.payload.project_id !== projectId) return;
          syncTicketFile(projectId, event.payload.slug, event.payload.content)
            .then(() => log.info("synced ticket file", { slug: event.payload.slug }))
            .catch((err) => log.error("failed to sync ticket file", err));
        }),
      );
    })();

    return () => {
      cancelled = true;
      unlistenFns.forEach((fn) => fn());
      invoke("unwatch_project", { projectId }).catch((err) => log.error("unwatch_project failed", err));
    };
  }, [projectId, projectPath]);
}

async function syncTicketFile(projectId: string, slug: string, content: string | null) {
  const existing = await findTicketBySlug(projectId, slug);

  if (content === null) {
    if (existing) await client.tickets.delete(existing.id);
    return;
  }

  let parsed: TicketFileShape;
  try {
    parsed = JSON.parse(content);
  } catch {
    return;
  }
  if (!parsed.title) return;

  const data = {
    project: projectId,
    slug,
    title: parsed.title,
    description: parsed.description ?? "",
    column: parsed.column ?? "backlog",
    order: parsed.order ?? 0,
  };

  if (existing) {
    await client.tickets.update(existing.id, data);
  } else {
    await client.tickets.create(data);
  }
}

async function findTicketBySlug(projectId: string, slug: string) {
  try {
    return await client.tickets.getFirstListItem(`project = "${projectId}" && slug = "${slug}"`);
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return null;
    throw err;
  }
}
