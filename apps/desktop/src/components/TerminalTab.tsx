import { useMemo, useState } from "react";
import { usePresence } from "../hooks/usePresence";
import { TerminalInstance } from "./TerminalInstance";

interface TerminalTabProps {
  tabId: string;
  cwd: string;
  projectId: string;
  userId: string | undefined;
  ownerName: string | undefined;
  active: boolean;
}

/**
 * One terminal tab plus its own independent presence connection. Each tab
 * gets its own agent node on the map — the server keys peers by socketId,
 * not userId, so two tabs both running `claude` correctly show as two
 * separate nodes instead of collapsing into one. The node exists only while
 * this tab's backend-confirmed `claude` status is true (see pty.rs's
 * claude-detection poller and the `pty://claude-status` event) and is torn
 * down automatically when `claude` exits or the tab closes. Carries the
 * owning human's display name in `meta.owner` so teammates can tell whose
 * agent is whose on the map.
 */
export function TerminalTab({ tabId, cwd, projectId, userId, ownerName, active }: TerminalTabProps) {
  const [running, setRunning] = useState(false);

  const agentSelf = useMemo(
    () =>
      userId && running
        ? {
            userId: `${userId}:agent:${tabId}`,
            name: "Claude Code Terminal",
            kind: "agent" as const,
            color: "#ff2fd0",
            meta: { path: cwd, owner: ownerName },
          }
        : undefined,
    [userId, running, tabId, cwd, ownerName],
  );
  usePresence(projectId, agentSelf);

  return (
    <div style={{ display: active ? "block" : "none", height: "100%" }}>
      <TerminalInstance cwd={cwd} onClaudeStatusChange={setRunning} />
    </div>
  );
}
