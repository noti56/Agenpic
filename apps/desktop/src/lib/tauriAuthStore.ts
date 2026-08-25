import { BaseAuthStore, type AuthRecord } from "pocketbase";
import { isTauri } from "@tauri-apps/api/core";
import { load, type Store } from "@tauri-apps/plugin-store";

const STORE_FILE = "auth.json";
const KEY = "pb_auth";

interface PersistedAuth {
  token: string;
  record: AuthRecord;
}

/**
 * PocketBase auth persisted via Tauri's store plugin (a JSON file under the
 * app's data directory, e.g. %APPDATA%\com.agenpic.app\auth.json on
 * Windows) instead of relying on the WebView's localStorage. This is the
 * Tauri-recommended way to persist app state — explicit and inspectable,
 * rather than implicitly riding on WebView2 profile persistence.
 *
 * Constructed synchronously (so it can back the PocketBase client from the
 * very first render) — call `init()` once at startup to hydrate it from
 * disk before the auth-gated routes render.
 */
export class TauriAuthStore extends BaseAuthStore {
  private store: Store | null = null;
  private initPromise: Promise<void> | null = null;
  /** "Remember me" — when false, a new save() keeps the session working for
   * this run but doesn't write it to disk, so it won't survive a restart. */
  private persistenceEnabled = true;

  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        this.store = await load(STORE_FILE, { autoSave: true });
        const saved = await this.store.get<PersistedAuth>(KEY);
        if (saved?.token) {
          this.save(saved.token, saved.record);
        }
      })();
    }
    return this.initPromise;
  }

  setPersistenceEnabled(enabled: boolean) {
    this.persistenceEnabled = enabled;
  }

  save(token: string, record?: AuthRecord) {
    super.save(token, record);
    if (!this.persistenceEnabled) return;
    this.store?.set(KEY, { token, record: record ?? null }).catch((err) => {
      console.error("[auth] failed to persist auth store:", err);
    });
  }

  clear() {
    super.clear();
    this.store?.delete(KEY).catch((err) => {
      console.error("[auth] failed to clear persisted auth store:", err);
    });
  }
}

/** Only usable inside the real Tauri shell — the store plugin needs Tauri IPC. */
export function isTauriRuntime(): boolean {
  return isTauri();
}
