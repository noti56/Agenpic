/// <reference path="./toast-ui-editor-shim.d.ts" />
import { useEffect, useRef, useState, type FormEvent, type Ref } from "react";
import Editor from "@toast-ui/editor";
import Viewer from "@toast-ui/editor/dist/toastui-editor-viewer";
import "@toast-ui/editor/toastui-editor.css";
import "@toast-ui/editor/toastui-editor-dark.css";
import type { DocRecord } from "@agenpic/types";
import styles from "./Docs.module.css";

export interface DocsPanelProps {
  docs: DocRecord[];
  canEdit: boolean;
  onCreate: (input: { slug: string; title: string }) => void;
  onUpdate: (docId: string, patch: { title?: string; content?: string }) => void;
  onDelete: (docId: string) => void;
}

export function DocsPanel({ docs, canEdit, onCreate, onUpdate, onDelete }: DocsPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(docs[0]?.id ?? null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (selectedId && !docs.some((d) => d.id === selectedId)) {
      setSelectedId(docs[0]?.id ?? null);
    }
  }, [docs, selectedId]);

  const selected = docs.find((d) => d.id === selectedId) ?? null;

  return (
    <div className={styles.wrap}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>Docs</span>
          {canEdit && (
            <button
              type="button"
              className={styles.newBtn}
              onClick={() => setShowCreate(true)}
              aria-label="New doc"
              title="New doc"
            >
              +
            </button>
          )}
        </div>
        <div className={styles.list}>
          {docs.length === 0 && <div className={styles.emptyHint}>Nothing here yet.</div>}
          {docs.map((d) => (
            <button
              key={d.id}
              type="button"
              className={[styles.listItem, d.id === selectedId ? styles.listItemActive : ""].join(" ")}
              onClick={() => setSelectedId(d.id)}
            >
              <span className={styles.listItemTitle}>{d.title}</span>
              <span className={styles.listItemSlug}>{d.slug}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className={styles.main}>
        {!selected && (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon} aria-hidden="true">
              📄
            </span>
            <p className={styles.emptyTitle}>{docs.length === 0 ? "No docs yet" : "Select a doc"}</p>
            {canEdit && (
              <button type="button" className={styles.emptyCta} onClick={() => setShowCreate(true)}>
                + New doc
              </button>
            )}
          </div>
        )}
        {selected && (
          <DocDetail
            key={selected.id}
            doc={selected}
            canEdit={canEdit}
            onUpdate={onUpdate}
            onDelete={() => {
              onDelete(selected.id);
              setSelectedId(null);
            }}
          />
        )}
      </div>

      {showCreate && (
        <NewDocModal
          existingSlugs={docs.map((d) => d.slug)}
          onClose={() => setShowCreate(false)}
          onCreate={(input) => {
            onCreate(input);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

interface DocDetailProps {
  doc: DocRecord;
  canEdit: boolean;
  onUpdate: (docId: string, patch: { title?: string; content?: string }) => void;
  onDelete: () => void;
}

function DocDetail({ doc, canEdit, onUpdate, onDelete }: DocDetailProps) {
  const [title, setTitle] = useState(doc.title);
  const editorRef = useRef<Editor | null>(null);

  return (
    <div className={styles.detail}>
      <div className={styles.detailHeader}>
        <input
          className={styles.titleInput}
          value={title}
          disabled={!canEdit}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (canEdit && title.trim() && title !== doc.title) onUpdate(doc.id, { title: title.trim() });
          }}
        />
        <span className={styles.slugBadge}>{doc.slug}</span>
        {canEdit && (
          <button type="button" className={styles.deleteBtn} onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
      <div className={styles.editorWrap}>
        {canEdit ? (
          <MarkdownEditor
            ref={editorRef}
            initialValue={doc.content}
            onBlurSave={() => {
              const md = editorRef.current?.getMarkdown() ?? "";
              if (md !== doc.content) onUpdate(doc.id, { content: md });
            }}
          />
        ) : (
          <MarkdownViewer initialValue={doc.content} />
        )}
      </div>
    </div>
  );
}

interface MarkdownEditorProps {
  initialValue: string;
  onBlurSave: () => void;
  ref: Ref<Editor | null>;
}

function MarkdownEditor({ initialValue, onBlurSave, ref }: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<Editor | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const instance = new Editor({
      el,
      height: "100%",
      initialValue: initialValue || " ",
      previewStyle: "vertical",
      usageStatistics: false,
    });
    instance.on("blur", onBlurSave);
    instanceRef.current = instance;
    if (typeof ref === "function") ref(instance);
    else if (ref) ref.current = instance;

    return () => {
      instance.destroy();
      instanceRef.current = null;
      if (typeof ref === "function") ref(null);
      else if (ref) ref.current = null;
    };
    // Mounted once per doc (parent keys DocDetail by doc.id), so this never
    // needs to react to prop changes after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className={`${styles.editorHost} toastui-editor-dark`} ref={containerRef} />;
}

function MarkdownViewer({ initialValue }: { initialValue: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const instance = new Viewer({ el, initialValue, usageStatistics: false });
    return () => instance.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className={`${styles.viewerHost} toastui-editor-dark`} ref={containerRef} />;
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function NewDocModal({
  existingSlugs,
  onClose,
  onCreate,
}: {
  existingSlugs: string[];
  onClose: () => void;
  onCreate: (input: { slug: string; title: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const finalSlug = slug.trim() || slugify(title);
    if (!title.trim() || !finalSlug) {
      setError("Title is required.");
      return;
    }
    if (existingSlugs.includes(finalSlug)) {
      setError(`A doc with slug "${finalSlug}" already exists.`);
      return;
    }
    onCreate({ slug: finalSlug, title: title.trim() });
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>New doc</h2>
        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <label className={styles.fieldLabel}>
            Title
            <input
              className={styles.fieldInput}
              value={title}
              autoFocus
              onChange={(e) => {
                setTitle(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          </label>
          <label className={styles.fieldLabel}>
            Slug
            <input
              className={styles.fieldInput}
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
            />
          </label>
          {error && <div className={styles.errorText}>{error}</div>}
          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.createBtn}>
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
