/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** PocketBase base URL — see lib/pocketbase.ts and .env.example. */
  readonly VITE_POCKETBASE_URL?: string;
  /** Socket.io presence/signaling server URL — see lib/socket.ts and .env.example. */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
