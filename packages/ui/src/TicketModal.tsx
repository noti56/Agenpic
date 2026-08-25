import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { CommentRecord, TicketColumn, TicketRecord, UserRecord } from "@agenpic/types";
import { Panel } from "./Panel";
import styles from "./TicketModal.module.css";

const COLUMN_OPTIONS: { value: TicketColumn; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

export interface TicketModalProps {
  ticket: TicketRecord;
  members: UserRecord[];
  comments: CommentRecord[];
  currentUserId: string;
  readOnly?: boolean;
  onClose: () => void;
  onChangeTitle: (title: string) => void;
  onChangeDescription: (description: string) => void;
  onChangeColumn: (column: TicketColumn) => void;
  onChangeOwner: (ownerId: string) => void;
  onUploadImage: (file: File) => void;
  onRemoveImage: (filename: string) => void;
  onAddComment: (text: string) => void;
  onDelete?: () => void;
  /** Resolves a stored PocketBase filename to a viewable URL. */
  imageUrl: (filename: string) => string;
}

export function TicketModal({
  ticket,
  members,
  comments,
  currentUserId,
  readOnly,
  onClose,
  onChangeTitle,
  onChangeDescription,
  onChangeColumn,
  onChangeOwner,
  onUploadImage,
  onRemoveImage,
  onAddComment,
  onDelete,
  imageUrl,
}: TicketModalProps) {
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description);
  const [commentDraft, setCommentDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setTitle(ticket.title), [ticket.id, ticket.title]);
  useEffect(() => setDescription(ticket.description), [ticket.id, ticket.description]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUploadImage(file);
    e.target.value = "";
  };

  const handleAddComment = (e: FormEvent) => {
    e.preventDefault();
    const text = commentDraft.trim();
    if (!text) return;
    onAddComment(text);
    setCommentDraft("");
  };

  const owner = members.find((m) => m.id === ticket.owner);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <Panel className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <input
            className={styles.titleInput}
            value={title}
            disabled={readOnly}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title.trim() && title !== ticket.title) onChangeTitle(title.trim());
            }}
          />
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.main}>
            <section>
              <h3 className={styles.sectionLabel}>Description</h3>
              <textarea
                className={styles.description}
                value={description}
                disabled={readOnly}
                placeholder="Add a description…"
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => {
                  if (description !== ticket.description) onChangeDescription(description);
                }}
              />
            </section>

            <section>
              <h3 className={styles.sectionLabel}>Images</h3>
              <div className={styles.imageGrid}>
                {ticket.images.map((filename) => (
                  <div key={filename} className={styles.imageThumbWrap}>
                    <img className={styles.imageThumb} src={imageUrl(filename)} alt="" />
                    {!readOnly && (
                      <button
                        type="button"
                        className={styles.imageRemoveBtn}
                        onClick={() => onRemoveImage(filename)}
                        aria-label="Remove image"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {!readOnly && ticket.images.length < 6 && (
                  <button
                    type="button"
                    className={styles.uploadTile}
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Upload image"
                  >
                    +
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
              </div>
            </section>

            <section>
              <h3 className={styles.sectionLabel}>Comments</h3>
              <div className={styles.commentList}>
                {comments.length === 0 && <div className={styles.emptyHint}>No comments yet.</div>}
                {comments.map((c) => {
                  const author = c.expand?.user;
                  return (
                    <div key={c.id} className={styles.comment}>
                      <div className={styles.commentMeta}>
                        <span className={styles.commentAuthor}>
                          {author?.name || author?.email || "Unknown"}
                        </span>
                        <span>{new Date(c.created).toLocaleString()}</span>
                      </div>
                      <div className={styles.commentText}>{c.text}</div>
                    </div>
                  );
                })}
              </div>
              {!readOnly && (
                <form className={styles.commentForm} onSubmit={handleAddComment}>
                  <input
                    className={styles.commentInput}
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="Write a comment…"
                  />
                </form>
              )}
            </section>
          </div>

          <div className={styles.sidebar}>
            <div>
              <h3 className={styles.sectionLabel}>Status</h3>
              <select
                className={styles.select}
                value={ticket.column}
                disabled={readOnly}
                onChange={(e) => onChangeColumn(e.target.value as TicketColumn)}
              >
                {COLUMN_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <h3 className={styles.sectionLabel}>Owner</h3>
              <select
                className={styles.select}
                value={ticket.owner || ""}
                disabled={readOnly}
                onChange={(e) => onChangeOwner(e.target.value)}
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.email}
                    {m.id === currentUserId ? " (you)" : ""}
                  </option>
                ))}
              </select>
              {owner && !members.some((m) => m.id === owner.id) && (
                <div className={styles.emptyHint}>{owner.name || owner.email}</div>
              )}
            </div>

            <div className={styles.metaRow}>
              <span>Created {new Date(ticket.created).toLocaleDateString()}</span>
              <span>Updated {new Date(ticket.updated).toLocaleDateString()}</span>
            </div>

            {!readOnly && onDelete && (
              <div className={styles.dangerZone}>
                <button type="button" className={styles.deleteBtn} onClick={onDelete}>
                  Delete ticket
                </button>
              </div>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
