import { DocsPanel as DocsPanelUI } from "@agenpic/ui";
import { useCreateDoc, useDeleteDoc, useDocs, useUpdateDoc } from "@agenpic/core";
import { canEdit, type EffectiveRole } from "@agenpic/types";
import { client } from "../lib/pocketbase";
import styles from "./DocsPanel.module.css";

interface DocsPanelProps {
  projectId: string;
  role: EffectiveRole | undefined;
}

export function DocsPanel({ projectId, role }: DocsPanelProps) {
  const { data: docs = [], isLoading } = useDocs(client, projectId);
  const createDoc = useCreateDoc(client, projectId);
  const updateDoc = useUpdateDoc(client, projectId);
  const deleteDoc = useDeleteDoc(client, projectId);

  return (
    <div className={styles.wrap}>
      {isLoading ? (
        <p className={styles.dim}>Loading docs…</p>
      ) : (
        <DocsPanelUI
          docs={docs}
          canEdit={canEdit(role)}
          onCreate={(input) => createDoc.mutate(input)}
          onUpdate={(docId, patch) => updateDoc.mutate({ docId, ...patch })}
          onDelete={(docId) => deleteDoc.mutate(docId)}
        />
      )}
    </div>
  );
}
