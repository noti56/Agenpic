import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AgenpicClient } from "@agenpic/pocketbase-client";

export function ticketCommentsQueryKey(ticketId: string | undefined) {
  return ["ticket_comments", ticketId];
}

export function useTicketComments(client: AgenpicClient, ticketId: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ticketCommentsQueryKey(ticketId),
    queryFn: () =>
      client.ticketComments.getFullList({
        filter: `ticket = "${ticketId}"`,
        sort: "created",
        expand: "user",
      }),
    enabled: !!ticketId,
  });

  useEffect(() => {
    if (!ticketId) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    client.ticketComments
      .subscribe(
        "*",
        (e) => {
          if (e.record.ticket !== ticketId) return;
          qc.invalidateQueries({ queryKey: ticketCommentsQueryKey(ticketId) });
        },
        { filter: `ticket = "${ticketId}"`, expand: "user" },
      )
      .then((unsub) => {
        if (cancelled) unsub();
        else unsubscribe = unsub;
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [client, ticketId, qc]);

  return query;
}

export function useAddTicketComment(client: AgenpicClient, ticketId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, text }: { userId: string; text: string }) => {
      if (!ticketId) throw new Error("No ticket selected");
      return client.ticketComments.create({ ticket: ticketId, user: userId, text });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ticketCommentsQueryKey(ticketId) }),
  });
}

export function useDeleteTicketComment(client: AgenpicClient, ticketId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: string) => client.ticketComments.delete(commentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ticketCommentsQueryKey(ticketId) }),
  });
}
