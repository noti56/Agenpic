import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { getLogger } from "../lib/logger";
import styles from "./TerminalPanel.module.css";

interface PtyOutputPayload {
  id: string;
  data: string;
}

interface TerminalInstanceProps {
  cwd: string;
}

const log = getLogger("pty");

/** One xterm.js view wired to one PTY session. A single terminal tab. */
export function TerminalInstance({ cwd }: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ptyIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "Consolas, 'Cascadia Mono', monospace",
      fontSize: 14,
      theme: {
        background: "#0a0a12",
        foreground: "#e0e0ff",
        cursor: "#00fff2",
        selectionBackground: "#ff2fd055",
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    let unlistenOutput: UnlistenFn | undefined;
    let unlistenExit: UnlistenFn | undefined;
    let cancelled = false;

    (async () => {
      unlistenOutput = await listen<PtyOutputPayload>("pty://output", (event) => {
        if (event.payload.id === ptyIdRef.current) {
          term.write(event.payload.data);
        }
      });
      unlistenExit = await listen<PtyOutputPayload>("pty://exit", (event) => {
        if (event.payload.id === ptyIdRef.current) {
          term.write("\r\n[process exited]\r\n");
          log.info("pty exited", { id: event.payload.id });
        }
      });

      const id = await invoke<string>("pty_spawn", {
        cwd,
        cols: term.cols,
        rows: term.rows,
      });
      if (cancelled) {
        // Effect was torn down (e.g. StrictMode's mount/unmount/remount)
        // while the spawn was still in flight, so the cleanup below never
        // saw a ptyIdRef to kill — do it here instead to avoid an orphaned
        // shell process.
        invoke("pty_kill", { id }).catch((err) => log.error("pty_kill failed", err));
        return;
      }
      ptyIdRef.current = id;
      log.info("pty spawned", { id, cwd });

      term.onData((data) => {
        invoke("pty_write", { id, data }).catch(console.error);
      });
    })();

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (ptyIdRef.current) {
        invoke("pty_resize", {
          id: ptyIdRef.current,
          cols: term.cols,
          rows: term.rows,
        }).catch(console.error);
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      unlistenOutput?.();
      unlistenExit?.();
      if (ptyIdRef.current) {
        log.info("pty killed on unmount", { id: ptyIdRef.current });
        invoke("pty_kill", { id: ptyIdRef.current }).catch((err) => log.error("pty_kill failed", err));
      }
      term.dispose();
    };
  }, [cwd]);

  return <div className={styles.terminal} ref={containerRef} />;
}
