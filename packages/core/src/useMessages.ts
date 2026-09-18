import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AgenpicClient, type MessageRecord, type RecordModel } from "@agenpic/pocketbase-client";

export function messagesQueryKey(projectId: string | undefined) {
  return ["messages", projectId];
}

export function useMessages(
  client: AgenpicClient,
  projectId: string | undefined,
  /** Fired only for realtime "create" events (never the initial fetch, never updates like flagging) — the hook to notification/sound UI lives on top of this, not inside it, since this package stays platform-agnostic. */
  onCreate?: (message: MessageRecord & RecordModel) => void,
) {
  const qc = useQueryClient();
  // Kept current on every render without going in the effect's deps — the
  // subscription itself must not tear down and reconnect just because the
  // caller passed a fresh inline callback (it would on every render).
  const onCreateRef = useRef(onCreate);
  onCreateRef.current = onCreate;
  const query = useQuery({
    queryKey: messagesQueryKey(projectId),
    queryFn: () =>
      client.messages.getFullList({
        filter: `project = "${projectId}"`,
        sort: "created",
        expand: "user",
      }),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (!projectId) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    client.messages
      .subscribe(
        "*",
        (e) => {
          if (e.record.project !== projectId) return;
          qc.invalidateQueries({ queryKey: messagesQueryKey(projectId) });
          if (e.action === "create") onCreateRef.current?.(e.record);
        },
        { filter: `project = "${projectId}"`, expand: "user" },
      )
      .then((unsub) => {
        if (cancelled) unsub();
        else unsubscribe = unsub;
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [client, projectId, qc]);

  return query;
}

export function useSendMessage(client: AgenpicClient, projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, text }: { userId: string; text: string }) => {
      if (!projectId) throw new Error("No active project");
      return client.messages.create({ project: projectId, user: userId, text });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: messagesQueryKey(projectId) }),
  });
}

export function useFlagMessage(client: AgenpicClient, projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      messageId,
      flaggedBy,
      flagged,
    }: {
      messageId: string;
      flaggedBy: string;
      flagged: boolean;
    }) =>
      client.messages.update(messageId, {
        flagged,
        flaggedBy: flagged ? flaggedBy : null,
        flaggedAt: flagged ? new Date().toISOString() : null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: messagesQueryKey(projectId) }),
  });
}
