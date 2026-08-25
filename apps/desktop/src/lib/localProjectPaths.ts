import { load, type Store } from "@tauri-apps/plugin-store";

const STORE_FILE = "project-paths.json";

/**
 * Per-project local directory overrides, persisted via Tauri's store plugin
 * (like tauriAuthStore.ts). Each machine a user opens a project on may have
 * it checked out at a different path, so this is intentionally local-only
 * and never synced through PocketBase — unlike `project.path`, which is
 * just the owner's original path.
 */
let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(STORE_FILE, { autoSave: true });
  }
  return storePromise;
}

export async function getLocalProjectPath(projectId: string): Promise<string | null> {
  const store = await getStore();
  return (await store.get<string>(projectId)) ?? null;
}

export async function setLocalProjectPath(projectId: string, path: string): Promise<void> {
  const store = await getStore();
  await store.set(projectId, path);
}

export async function clearLocalProjectPath(projectId: string): Promise<void> {
  const store = await getStore();
  await store.delete(projectId);
}
