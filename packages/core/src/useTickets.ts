import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TicketColumn, TicketRecord } from "@agenpic/types";
import { AgenpicClient } from "@agenpic/pocketbase-client";

export function ticketsQueryKey(projectId: string | undefined) {
  return ["tickets", projectId];
}

export function useTickets(client: AgenpicClient, projectId: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ticketsQueryKey(projectId),
    queryFn: () =>
      client.tickets.getFullList({
        filter: `project = "${projectId}"`,
        sort: "column,order",
      }),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (!projectId) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    client.tickets
      .subscribe(
        "*",
        (e) => {
          if (e.record.project !== projectId) return;
          qc.invalidateQueries({ queryKey: ticketsQueryKey(projectId) });
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

export function useMoveTicket(client: AgenpicClient, projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ticketId,
      column,
      order,
    }: {
      ticketId: string;
      column: TicketColumn;
      order: number;
    }) => client.tickets.update(ticketId, { column, order }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ticketsQueryKey(projectId) }),
  });
}

export function useCreateTicket(client: AgenpicClient, projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      column: TicketColumn;
      order: number;
    }) => {
      if (!projectId) throw new Error("No active project");
      const slug = `manual-${Date.now().toString(36)}`;
      return client.tickets.create({ project: projectId, slug, ...input });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ticketsQueryKey(projectId) }),
  });
}

export function useUpdateTicket(client: AgenpicClient, projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, ...patch }: { ticketId: string } & Partial<TicketRecord>) =>
      client.tickets.update(ticketId, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ticketsQueryKey(projectId) }),
  });
}

export function useDeleteTicket(client: AgenpicClient, projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ticketId: string) => client.tickets.delete(ticketId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ticketsQueryKey(projectId) }),
  });
}
