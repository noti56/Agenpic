import { createLogger } from "@agenpic/logger";

const log = createLogger("server").child("ice");

const TURN_KEY_ID = process.env.TURN_KEY_ID;
const TURN_KEY_API_TOKEN = process.env.TURN_KEY_API_TOKEN;
const TTL_SECONDS = Number(process.env.TURN_TTL_SECONDS ?? 86400);
/** Re-mint this far ahead of expiry, so a client still holding the previous
 *  response always has credentials that outlive its next refresh. */
const REFRESH_MARGIN_SECONDS = 3600;

const CLOUDFLARE_TURN_API = "https://rtc.live.cloudflare.com/v1/turn/keys";

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

/**
 * What clients get when no TURN key is configured: STUN only, which means
 * direct peer-to-peer or nothing. That is fine for two clients on one
 * machine or one LAN, and fails for most pairs of real machines behind
 * separate NATs — which is exactly the bug TURN exists to fix. Kept as the
 * fallback so local dev works with no Cloudflare account at all.
 */
const STUN_ONLY: IceServer[] = [{ urls: ["stun:stun.l.google.com:19302"] }];

let cached: { servers: IceServer[]; expiresAt: number } | null = null;
let inflight: Promise<IceServer[]> | null = null;

export const turnConfigured = !!(TURN_KEY_ID && TURN_KEY_API_TOKEN);

async function mintCredentials(): Promise<IceServer[]> {
  const res = await fetch(
    `${CLOUDFLARE_TURN_API}/${TURN_KEY_ID}/credentials/generate-ice-servers`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TURN_KEY_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: TTL_SECONDS }),
    },
  );

  if (!res.ok) {
    throw new Error(`Cloudflare TURN API returned ${res.status}: ${await res.text()}`);
  }

  const body = (await res.json()) as { iceServers?: IceServer[] | IceServer };
  // The generate-ice-servers endpoint returns an array; tolerate the single
  // object shape too, since the older /credentials/generate endpoint used it.
  const servers = Array.isArray(body.iceServers)
    ? body.iceServers
    : body.iceServers
      ? [body.iceServers]
      : [];
  if (servers.length === 0) throw new Error("Cloudflare TURN API returned no iceServers");
  return servers;
}

/**
 * Short-lived TURN credentials for one client, cached process-wide until
 * shortly before they expire. The TURN key itself is a long-term secret and
 * never leaves this process — clients only ever see a derived, expiring
 * username/credential pair.
 */
export async function getIceServers(): Promise<IceServer[]> {
  if (!turnConfigured) return STUN_ONLY;
  if (cached && Date.now() < cached.expiresAt) return cached.servers;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const servers = await mintCredentials();
      cached = {
        servers,
        expiresAt: Date.now() + Math.max(60, TTL_SECONDS - REFRESH_MARGIN_SECONDS) * 1000,
      };
      log.info("minted TURN credentials", { ttl: TTL_SECONDS, servers: servers.length });
      return servers;
    } catch (err) {
      // Serving stale-but-unexpired credentials, or STUN-only, beats serving
      // nothing: a client with no ICE config at all cannot connect to anyone,
      // including peers it could have reached directly.
      log.error("failed to mint TURN credentials", err instanceof Error ? err.message : err);
      return cached?.servers ?? STUN_ONLY;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
