import { ChatPanel as ChatPanelUI } from "@agenpic/ui";
import { useFlagMessage, useMessages, useSendMessage } from "@agenpic/core";
import { client } from "../lib/pocketbase";
import { useAuth } from "../state/AuthContext";
import { emitToast } from "../lib/toastBus";
import styles from "./ChatPanel.module.css";

interface ChatPanelProps {
  projectId: string;
}

export function ChatPanel({ projectId }: ChatPanelProps) {
  const { user } = useAuth();
  const { data: messages = [], isLoading } = useMessages(client, projectId);
  const sendMessage = useSendMessage(client, projectId);
  const flagMessage = useFlagMessage(client, projectId);

  if (!user) return null;

  return (
    <div className={styles.wrap}>
      {isLoading ? (
        <p className={styles.dim}>Loading messages…</p>
      ) : (
        <ChatPanelUI
          messages={messages}
          currentUserId={user.id}
          onSend={(text) => sendMessage.mutate({ userId: user.id, text })}
          onToggleFlag={(messageId, flagged) => {
            flagMessage.mutate({ messageId, flaggedBy: user.id, flagged });
            if (flagged) emitToast({ kind: "message-flagged", message: "Message flagged for follow-up" });
          }}
        />
      )}
    </div>
  );
}
