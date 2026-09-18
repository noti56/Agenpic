import { getCurrentWindow } from "@tauri-apps/api/window";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { getLogger } from "./logger";

const log = getLogger("native-notify");

/** Fires a native OS notification only when the Agenpic window isn't focused — used by both poke and incoming chat messages so a human doesn't miss either while looking at something else. Silently requests notification permission on first use if not already granted. */
export async function notifyIfUnfocused(title: string, body: string) {
  try {
    const focused = await getCurrentWindow().isFocused();
    if (focused) return;

    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
    if (granted) sendNotification({ title, body });
  } catch (err) {
    log.warn("failed to send native notification", err);
  }
}
