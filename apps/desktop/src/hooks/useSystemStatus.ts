import { useEffect, useState } from "react";
import { POCKETBASE_URL } from "../lib/pocketbase";
import { SERVER_URL } from "../lib/socket";

export type SystemStatus = "checking" | "ok" | "degraded";

const RETRY_DELAYS_MS = [0, 1000, 2500];

async function checkOnce(): Promise<boolean> {
  const [pbOk, serverOk] = await Promise.all([
    fetch(`${POCKETBASE_URL}/api/health`).then((r) => r.ok).catch(() => false),
    fetch(`${SERVER_URL}/health`).then((r) => r.ok).catch(() => false),
  ]);
  return pbOk && serverOk;
}

/**
 * Pings the PocketBase and Socket.io backends' health endpoints for the
 * login screen's status badge. Retries a couple of times before settling
 * on "degraded" — a cold app start can briefly race the network stack
 * spinning up, which would otherwise flash a false negative.
 */
export function useSystemStatus(): SystemStatus {
  const [status, setStatus] = useState<SystemStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      for (const delay of RETRY_DELAYS_MS) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        if (cancelled) return;
        if (await checkOnce()) {
          if (!cancelled) setStatus("ok");
          return;
        }
      }
      if (!cancelled) setStatus("degraded");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
