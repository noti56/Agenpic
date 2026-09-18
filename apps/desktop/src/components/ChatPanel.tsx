import { ChatPanel as ChatPanelUI } from "@agenpic/ui";
import { useFlagMessage, useMessages, useSendMessage } from "@agenpic/core";
import { client } from "../lib/pocketbase";
import { useAuth } from "../state/AuthContext";
import { useProjectContext } from "../state/ProjectContext";
import { emitToast } from "../lib/toastBus";
import { playMessageSound } from "../lib/notificationSounds";
import { notifyIfUnfocused } from "../lib/nativeNotify";
import styles from "./ChatPanel.module.css";

interface ChatPanelProps {
  projectId: string;
}

export function ChatPanel({ projectId }: ChatPanelProps) {
  const { user } = useAuth();
  const { projects, markProjectUnread } = useProjectContext();
  const { data: messages = [], isLoading } = useMessages(client, projectId, (message) => {
    // Only for messages from someone else — never notify yourself for your
    // own send. Fires only on the realtime "create" event, so reopening a
    // project with existing chat history doesn't replay old messages here.
    if (message.user === user?.id) return;
    playMessageSound();
    const senderName = message.expand?.user?.name || message.expand?.user?.email || "Someone";
    emitToast({ kind: "message", message: `${senderName}: ${message.text}` });
    markProjectUnread(projectId);
    const projectName = projects.find((p) => p.id === projectId)?.name ?? "a project";
    notifyIfUnfocused(`${senderName} — ${projectName}`, message.text);
  });
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
