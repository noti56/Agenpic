import { useEffect } from "react";
import { onPoke } from "../lib/pokeBus";
import { playPokeSound } from "../lib/notificationSounds";
import { notifyIfUnfocused } from "../lib/nativeNotify";
import { emitToast } from "../lib/toastBus";
import { useProjectContext } from "../state/ProjectContext";

/** Mounted once at the app root — reacts to any incoming poke (see pokeBus)
 * with a sound, an in-app toast, a tab-bar blink, and (only if the window
 * isn't focused) a native OS notification. */
export function PokeBridge() {
  const { projects, markProjectUnread } = useProjectContext();

  useEffect(() => {
    return onPoke((event) => {
      playPokeSound();

      const who = event.fromKind === "agent" ? `Claude (${event.fromName})` : event.fromName;
      const message = event.message ? `${who}: ${event.message}` : `${who} poked you`;
      emitToast({ kind: "poke", message });

      markProjectUnread(event.projectId);

      const projectName = projects.find((p) => p.id === event.projectId)?.name ?? "a project";
      notifyIfUnfocused("Agenpic", `${message} — ${projectName}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, markProjectUnread]);

  return null;
}
