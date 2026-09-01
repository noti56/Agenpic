import { SERVER_URL } from "./socket";
import { getLogger } from "./logger";

const log = getLogger("proximity-voice").child("ice");

/**
 * Used until the server's real list arrives, and if it never does. STUN-only
 * means direct peer-to-peer or nothing: two clients on the same machine or
 * the same LAN connect fine, two clients behind separate NATs usually don't.
 * That asymmetry is the whole reason the server hands out a TURN relay.
 */
const FALLBACK: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

/** Cloudflare mints these with a 24h TTL; re-fetch well inside that window. */
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

let current: RTCIceServer[] = FALLBACK;
let fetchedFromServer = false;
let inflight: Promise<RTCIceServer[]> | null = null;
let lastFetchedAt = 0;

/** Whether the list in use came from the server (i.e. may include TURN). */
export function iceServersAreServerProvided(): boolean {
  return fetchedFromServer;
}

/** Synchronous read for RTCPeerConnection construction — never blocks. */
export function currentIceServers(): RTCIceServer[] {
  return current;
}

/**
 * Fetch the ICE server list from the signaling server, memoized. Safe to
 * call on every render/effect: it no-ops while a fetch is in flight and
 * while the last successful result is still fresh.
 */
export function primeIceServers(force = false): Promise<RTCIceServer[]> {
  if (inflight) return inflight;
  if (!force && fetchedFromServer && Date.now() - lastFetchedAt < REFRESH_INTERVAL_MS) {
    return Promise.resolve(current);
  }

  inflight = (async () => {
    try {
      const res = await fetch(new URL("/ice", SERVER_URL).toString(), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { iceServers?: RTCIceServer[] };
      if (!Array.isArray(body.iceServers) || body.iceServers.length === 0) {
        throw new Error("no iceServers in response");
      }
      current = body.iceServers;
      fetchedFromServer = true;
      lastFetchedAt = Date.now();
      const hasTurn = body.iceServers.some((s) =>
        (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => u.startsWith("turn")),
      );
      log.info("ICE servers loaded", { count: body.iceServers.length, turn: hasTurn });
      if (!hasTurn) {
        log.warn(
          "server returned no TURN relay — voice/video will only work between peers " +
            "that can reach each other directly (same machine or same LAN)",
        );
      }
      return current;
    } catch (err) {
      // Keep whatever we already had. A stale-but-working list, or even the
      // STUN-only fallback, beats an empty config: with no ICE servers at all
      // a peer cannot connect to anyone, including ones it could reach directly.
      log.warn("failed to load ICE servers, using fallback", err instanceof Error ? err.message : err);
      return current;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
