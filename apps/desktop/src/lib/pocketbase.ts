import { createAgenpicClient } from "@agenpic/pocketbase-client";
import { isTauriRuntime, TauriAuthStore } from "./tauriAuthStore";

export const POCKETBASE_URL = "http://127.0.0.1:8090";

const tauriAuthStore = isTauriRuntime() ? new TauriAuthStore() : undefined;

export const client = createAgenpicClient(POCKETBASE_URL, tauriAuthStore);

/**
 * Resolves once any persisted session has been loaded from disk (in the
 * real Tauri app) — await this before rendering auth-gated routes so a
 * returning user isn't bounced to the login screen while it loads.
 * Resolves immediately outside Tauri (plain browser dev/testing).
 */
export const authReady: Promise<void> = tauriAuthStore ? tauriAuthStore.init() : Promise.resolve();

/** "Remember me" toggle — call before login/signup. No-op outside Tauri (browser dev/testing always persists via localStorage regardless). */
export function setRememberMe(enabled: boolean) {
  tauriAuthStore?.setPersistenceEnabled(enabled);
}
