import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TicketColumn, TicketRecord, UserRecord } from "@agenpic/types";
import styles from "./MissionHangar.module.css";

const COLUMNS: { id: TicketColumn; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "done", label: "Done" },
];

export interface MissionHangarBoardProps {
  tickets: TicketRecord[];
  readOnly?: boolean;
  onMove: (ticketId: string, column: TicketColumn, order: number) => void;
  onCreate?: (column: TicketColumn, title: string) => void;
  onDelete?: (ticketId: string) => void;
  onOpen?: (ticket: TicketRecord) => void;
  /** Owner avatars are resolved from this map, keyed by user id. */
  users?: Record<string, UserRecord>;
}

export function MissionHangarBoard({
  tickets,
  readOnly,
  onMove,
  onCreate,
  onDelete,
  onOpen,
  users,
}: MissionHangarBoardProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<TicketColumn | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const byColumn = useMemo(() => {
    const map = new Map<TicketColumn, TicketRecord[]>();
    for (const col of COLUMNS) map.set(col.id, []);
    for (const t of tickets) {
      const list = map.get(t.column) ?? [];
      list.push(t);
      map.set(t.column, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order);
    return map;
  }, [tickets]);

  const activeTicket = tickets.find((t) => t.id === activeId) ?? null;

  const columnOf = (id: string): TicketColumn | undefined => {
    if (COLUMNS.some((c) => c.id === id)) return id as TicketColumn;
    return tickets.find((t) => t.id === id)?.column;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    if (readOnly) return;
    const { active, over } = event;
    if (!over) return;

    const ticketId = String(active.id);
    const targetColumn = columnOf(String(over.id));
    if (!targetColumn) return;

    const destList = byColumn.get(targetColumn) ?? [];
    const overIndex = destList.findIndex((t) => t.id === over.id);
    const order = overIndex >= 0 ? destList[overIndex].order : destList.length;

    onMove(ticketId, targetColumn, order);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className={styles.board}>
        {COLUMNS.map((col) => (
          <HangarColumn
            key={col.id}
            id={col.id}
            label={col.label}
            tickets={byColumn.get(col.id) ?? []}
            readOnly={readOnly}
            isAdding={addingTo === col.id}
            newTitle={newTitle}
            onStartAdd={() => setAddingTo(col.id)}
            onChangeTitle={setNewTitle}
            onSubmitAdd={() => {
              if (newTitle.trim() && onCreate) onCreate(col.id, newTitle.trim());
              setNewTitle("");
              setAddingTo(null);
            }}
            onCancelAdd={() => {
              setAddingTo(null);
              setNewTitle("");
            }}
            onDelete={onDelete}
            onOpen={onOpen}
            users={users}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTicket ? (
          <div className={styles.cardOverlay}>
            <div className={styles.cardTitle}>{activeTicket.title}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface HangarColumnProps {
  id: TicketColumn;
  label: string;
  tickets: TicketRecord[];
  readOnly?: boolean;
  isAdding: boolean;
  newTitle: string;
  onStartAdd: () => void;
  onChangeTitle: (v: string) => void;
  onSubmitAdd: () => void;
  onCancelAdd: () => void;
  onDelete?: (id: string) => void;
  onOpen?: (ticket: TicketRecord) => void;
  users?: Record<string, UserRecord>;
}

function HangarColumn({
  id,
  label,
  tickets,
  readOnly,
  isAdding,
  newTitle,
  onStartAdd,
  onChangeTitle,
  onSubmitAdd,
  onCancelAdd,
  onDelete,
  onOpen,
  users,
}: HangarColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className={[styles.column, isOver ? styles.columnOver : ""].filter(Boolean).join(" ")}>
      <div className={styles.columnHeader}>
        <span className={styles.columnTitle}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={styles.columnCount}>{tickets.length}</span>
          {!readOnly && (
            <button
              type="button"
              className={styles.addBtn}
              onClick={onStartAdd}
              aria-label={`Add ticket to ${label}`}
            >
              +
            </button>
          )}
        </div>
      </div>

      <SortableContext items={tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={styles.cardList}>
          {tickets.map((ticket) => (
            <HangarCard
              key={ticket.id}
              ticket={ticket}
              readOnly={readOnly}
              onDelete={onDelete}
              onOpen={onOpen}
              owner={ticket.owner ? users?.[ticket.owner] : undefined}
            />
          ))}
        </div>
      </SortableContext>

      {isAdding && (
        <div className={styles.newCardForm}>
          <input
            className={styles.newCardInput}
            autoFocus
            value={newTitle}
            onChange={(e) => onChangeTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmitAdd();
              if (e.key === "Escape") onCancelAdd();
            }}
            placeholder="Ticket title…"
          />
          <div className={styles.newCardActions}>
            <button type="button" className={styles.addBtn} onClick={onCancelAdd}>
              Cancel
            </button>
            <button type="button" className={styles.addBtn} onClick={onSubmitAdd}>
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function HangarCard({
  ticket,
  readOnly,
  onDelete,
  onOpen,
  owner,
}: {
  ticket: TicketRecord;
  readOnly?: boolean;
  onDelete?: (id: string) => void;
  onOpen?: (ticket: TicketRecord) => void;
  owner?: UserRecord;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
    disabled: readOnly,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[styles.card, isDragging ? styles.cardDragging : ""].filter(Boolean).join(" ")}
      onClick={() => onOpen?.(ticket)}
      {...(readOnly ? {} : { ...attributes, ...listeners })}
    >
      <div className={styles.cardTitle}>{ticket.title}</div>
      {ticket.description && <div className={styles.cardDesc}>{ticket.description}</div>}
      <div className={styles.cardFooter}>
        <div className={styles.cardBadges}>
          {!!ticket.images?.length && <span className={styles.cardBadge}>📎 {ticket.images.length}</span>}
        </div>
        {owner && (
          <span className={styles.ownerAvatar} title={owner.name || owner.email}>
            {initials(owner.name || owner.email)}
          </span>
        )}
      </div>
      {!readOnly && onDelete && (
        <button
          type="button"
          className={styles.deleteBtn}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(ticket.id);
          }}
          aria-label="Delete ticket"
        >
          ×
        </button>
      )}
    </div>
  );
}
