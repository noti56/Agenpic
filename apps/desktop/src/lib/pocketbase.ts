import { createAgenpicClient } from "@agenpic/pocketbase-client";
import { isTauriRuntime, TauriAuthStore } from "./tauriAuthStore";

// Baked in at `vite build` time from apps/desktop/.env.production (see
// .env.example) — a shipped build never reads this at runtime, so pointing
// a distributed build at a different backend means rebuilding, not just
// setting an env var on the teammate's machine.
export const POCKETBASE_URL = import.meta.env.VITE_POCKETBASE_URL || "http://127.0.0.1:8090";

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
