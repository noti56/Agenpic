import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MAX_STATUS_LEN } from "@agenpic/types";
import { client } from "../lib/pocketbase";
import { useAuth } from "../state/AuthContext";

function statusesQueryKey(projectId: string | undefined) {
  return ["presence-status", projectId];
}

/**
 * Realtime, per-project status map keyed `${userId}:${kind}` -> status
 * text, backed by PocketBase's `presence_status` collection rather than
 * ephemeral socket state — it survives reconnects and propagates via
 * PocketBase's own realtime subscription, the same mechanism tickets/chat
 * already rely on (see packages/core/useMessages.ts for the same pattern).
 */
export function useProjectStatuses(projectId: string | undefined): Map<string, string> {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: statusesQueryKey(projectId),
    queryFn: () => client.presenceStatus.getFullList({ filter: `project = "${projectId}"` }),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (!projectId) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    client.presenceStatus
      .subscribe(
        "*",
        (e) => {
          if (e.record.project !== projectId) return;
          qc.invalidateQueries({ queryKey: statusesQueryKey(projectId) });
        },
        { filter: `project = "${projectId}"` },
      )
      .then((unsub) => {
        if (cancelled) unsub();
        else unsubscribe = unsub;
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [projectId, qc]);

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const row of query.data ?? []) {
      if (row.status) map.set(`${row.user}:${row.kind}`, row.status);
    }
    return map;
  }, [query.data]);
}

/** Sets (or clears, with `""`) the signed-in human's own status for a project. */
export function useSetMyStatus(projectId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (status: string) => {
      if (!projectId || !user) throw new Error("Not ready");
      const trimmed = status.trim().slice(0, MAX_STATUS_LEN);
      const existing = await client.presenceStatus
        .getFirstListItem(`project = "${projectId}" && user = "${user.id}" && kind = "user"`)
        .catch(() => null);
      if (existing) return client.presenceStatus.update(existing.id, { status: trimmed });
      return client.presenceStatus.create({ project: projectId, user: user.id, kind: "user", status: trimmed });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: statusesQueryKey(projectId) }),
  });
}
