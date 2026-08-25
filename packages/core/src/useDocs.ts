import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DocRecord } from "@agenpic/types";
import { AgenpicClient } from "@agenpic/pocketbase-client";

export function docsQueryKey(projectId: string | undefined) {
  return ["docs", projectId];
}

export function useDocs(client: AgenpicClient, projectId: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: docsQueryKey(projectId),
    queryFn: () =>
      client.docs.getFullList({
        filter: `project = "${projectId}"`,
        sort: "title",
      }),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (!projectId) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    client.docs
      .subscribe(
        "*",
        (e) => {
          if (e.record.project !== projectId) return;
          qc.invalidateQueries({ queryKey: docsQueryKey(projectId) });
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
  }, [client, projectId, qc]);

  return query;
}

export function useCreateDoc(client: AgenpicClient, projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { slug: string; title: string; content?: string }) => {
      if (!projectId) throw new Error("No active project");
      return client.docs.create({ project: projectId, content: "", ...input });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: docsQueryKey(projectId) }),
  });
}

export function useUpdateDoc(client: AgenpicClient, projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ docId, ...patch }: { docId: string } & Partial<DocRecord>) =>
      client.docs.update(docId, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: docsQueryKey(projectId) }),
  });
}

export function useDeleteDoc(client: AgenpicClient, projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (docId: string) => client.docs.delete(docId),
    onSuccess: () => qc.invalidateQueries({ queryKey: docsQueryKey(projectId) }),
  });
}
