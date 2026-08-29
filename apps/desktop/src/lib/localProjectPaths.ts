import { load, type Store } from "@tauri-apps/plugin-store";
import { isTauriRuntime } from "./tauriAuthStore";

const STORE_FILE = "project-paths.json";
const LOCAL_STORAGE_KEY = "agenpic:local-project-paths";

/**
 * Per-project local directory overrides, persisted via Tauri's store plugin
 * (like tauriAuthStore.ts). Each machine a user opens a project on may have
 * it checked out at a different path, so this is intentionally local-only
 * and never synced through PocketBase — unlike `project.path`, which is
 * just the owner's original path.
 *
 * The store plugin needs Tauri IPC, which doesn't exist in plain-browser dev
 * — fall back to localStorage there, same pattern as tauriAuthStore.ts.
 */
let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(STORE_FILE, { autoSave: true });
  }
  return storePromise;
}

function readLocalStorageMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeLocalStorageMap(map: Record<string, string>): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore — path override just won't persist across reloads
  }
}

export async function getLocalProjectPath(projectId: string): Promise<string | null> {
  if (!isTauriRuntime()) return readLocalStorageMap()[projectId] ?? null;
  const store = await getStore();
  return (await store.get<string>(projectId)) ?? null;
}

export async function setLocalProjectPath(projectId: string, path: string): Promise<void> {
  if (!isTauriRuntime()) {
    const map = readLocalStorageMap();
    map[projectId] = path;
    writeLocalStorageMap(map);
    return;
  }
  const store = await getStore();
  await store.set(projectId, path);
}

export async function clearLocalProjectPath(projectId: string): Promise<void> {
  if (!isTauriRuntime()) {
    const map = readLocalStorageMap();
    delete map[projectId];
    writeLocalStorageMap(map);
    return;
  }
  const store = await getStore();
  await store.delete(projectId);
}
