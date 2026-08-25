import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MissionHangarBoard, TicketModal } from "@agenpic/ui";
import {
  useAddTicketComment,
  useCreateTicket,
  useDeleteTicket,
  useMoveTicket,
  useTickets,
  useTicketComments,
} from "@agenpic/core";
import type { EffectiveRole, ProjectRecord, TicketColumn, UserRecord } from "@agenpic/types";
import { client } from "../lib/pocketbase";
import { useProjectMembers } from "../hooks/useProjectMembers";
import { emitToast } from "../lib/toastBus";
import { useAuth } from "../state/AuthContext";
import styles from "./MissionHangarPanel.module.css";

interface MissionHangarPanelProps {
  project: ProjectRecord;
  role: EffectiveRole | undefined;
}

const COLUMN_LABEL: Record<TicketColumn, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export function MissionHangarPanel({ project, role }: MissionHangarPanelProps) {
  const { user } = useAuth();
  const { data: tickets = [], isLoading } = useTickets(client, project.id);
  const { data: memberRows = [] } = useProjectMembers(project.id);
  const { data: owner } = useQuery({
    queryKey: ["user", project.owner],
    queryFn: () => client.users.getOne(project.owner),
  });

  const moveTicket = useMoveTicket(client, project.id);
  const createTicket = useCreateTicket(client, project.id);
  const deleteTicket = useDeleteTicket(client, project.id);

  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const openTicket = tickets.find((t) => t.id === openTicketId) ?? null;

  const { data: comments = [] } = useTicketComments(client, openTicketId ?? undefined);
  const addComment = useAddTicketComment(client, openTicketId ?? undefined);

  const members: UserRecord[] = useMemo(() => {
    const list = memberRows.map((m) => m.expand?.user).filter((u): u is UserRecord => !!u);
    if (owner && !list.some((u) => u.id === owner.id)) list.unshift(owner);
    return list;
  }, [memberRows, owner]);

  const usersById = useMemo(() => {
    const map: Record<string, UserRecord> = {};
    for (const m of members) map[m.id] = m;
    return map;
  }, [members]);

  const readOnly = role !== "owner" && role !== "admin";

  const updateTicketField = (patch: Record<string, unknown>) => {
    if (!openTicketId) return;
    client.tickets.update(openTicketId, patch).catch(console.error);
  };

  return (
    <div className={styles.wrap}>
      {isLoading ? (
        <p className={styles.dim}>Loading missions…</p>
      ) : (
        <MissionHangarBoard
          tickets={tickets}
          readOnly={readOnly}
          users={usersById}
          onMove={(ticketId, column, order) => {
            const ticket = tickets.find((t) => t.id === ticketId);
            moveTicket.mutate({ ticketId, column, order });
            if (ticket && ticket.column !== column) {
              emitToast({
                kind: "ticket-moved",
                message: `"${ticket.title}" moved to ${COLUMN_LABEL[column]}`,
              });
            }
          }}
          onCreate={(column, title) => createTicket.mutate({ title, column, order: 0 })}
          onDelete={(ticketId) => deleteTicket.mutate(ticketId)}
          onOpen={(ticket) => setOpenTicketId(ticket.id)}
        />
      )}

      {openTicket && user && (
        <TicketModal
          ticket={openTicket}
          members={members}
          comments={comments}
          currentUserId={user.id}
          readOnly={readOnly}
          onClose={() => setOpenTicketId(null)}
          onChangeTitle={(title) => updateTicketField({ title })}
          onChangeDescription={(description) => updateTicketField({ description })}
          onChangeColumn={(column) => {
            moveTicket.mutate({ ticketId: openTicket.id, column, order: 0 });
          }}
          onChangeOwner={(ownerId) => updateTicketField({ owner: ownerId })}
          onUploadImage={(file) => updateTicketField({ "images+": file })}
          onRemoveImage={(filename) => updateTicketField({ "images-": filename })}
          onAddComment={(text) => addComment.mutate({ userId: user.id, text })}
          onDelete={() => {
            deleteTicket.mutate(openTicket.id);
            setOpenTicketId(null);
          }}
          imageUrl={(filename) => client.fileUrl(openTicket, filename)}
        />
      )}
    </div>
  );
}
