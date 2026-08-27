import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { client, POCKETBASE_URL } from "../lib/pocketbase";
import { getLogger } from "../lib/logger";

const log = getLogger("agenpic-cli-config");
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Keeps `.agenpic/agenpic.config.json` (the local credential the bundled
 * `agenpic-cli.mjs` uses to talk to PocketBase directly) fresh for as long
 * as this project is open: written once on mount, rewritten on every auth
 * change, and the underlying token actively refreshed on an interval so it
 * doesn't go stale mid-session.
 */
export function useAgenpicCliConfig(projectId: string | undefined, projectPath: string | undefined) {
  useEffect(() => {
    if (!projectId || !projectPath) return;

    const writeConfig = async () => {
      const configJson = JSON.stringify({
        pocketbaseUrl: POCKETBASE_URL,
        projectId,
        token: client.pb.authStore.token,
        // ticket_comments.user is a required relation, so the CLI needs to
        // know which account it posts as — it cannot derive that from the
        // bearer token alone without an extra round trip.
        userId: client.currentUser?.id ?? null,
      });
      try {
        await invoke("write_agenpic_config", { projectPath, configJson });
      } catch (err) {
        log.error("failed to write agenpic CLI config", err);
      }
    };

    // Fires immediately on subscribe (and again on every future change),
    // so this alone covers the initial write.
    const unsubscribeAuth = client.onAuthChange(() => {
      writeConfig();
    });

    const interval = setInterval(async () => {
      try {
        await client.pb.collection("users").authRefresh();
      } catch (err) {
        log.warn("agenpic CLI token refresh failed", err);
      }
    }, REFRESH_INTERVAL_MS);

    return () => {
      unsubscribeAuth();
      clearInterval(interval);
    };
  }, [projectId, projectPath]);
}
