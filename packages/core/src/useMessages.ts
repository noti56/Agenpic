import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AgenpicClient } from "@agenpic/pocketbase-client";

export function messagesQueryKey(projectId: string | undefined) {
  return ["messages", projectId];
}

export function useMessages(client: AgenpicClient, projectId: string | undefined) {
  const qc = useQueryClient();
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
