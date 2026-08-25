# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Agenpic is a Tauri desktop "command center" for Claude Code sessions: a real embedded terminal (xterm.js + a Rust PTY), a kanban ticket board, project team chat, and a Gather-Town-style presence map with proximity-triggered WebRTC voice/video — all backed by PocketBase, with a thin Socket.io server handling only presence/signaling/relay.

The implementation is well past a bare MVP: auth, project/member roles, the embedded terminal, the CLAUDE.md/ticket file-sync loop, the kanban board, presence map, proximity voice, chat with flagging, an Ollama connector, toasts, and an in-app log viewer all have working code on disk (see Architecture below for what's real vs. still a stub). Treat any todo/roadmap language you see elsewhere as historical planning context, not a description of current state — check the actual code.

## Commands

Run everything from the repo root with pnpm + Turborepo (`pnpm@10.13.1`, Node >=20).

```bash
pnpm dev              # runs the Tauri desktop app (turbo --filter=@agenpic/desktop dev)
pnpm dev:server       # runs the Socket.io server (tsx watch)
pnpm build            # turbo run build (all packages, respects dependsOn: ["^build"])
pnpm typecheck        # turbo run typecheck (tsc --noEmit in every package)
pnpm lint             # turbo run lint
pnpm test             # turbo run test
pnpm clean            # turbo run clean
```

Backend services (PocketBase + the Socket.io server) run via Docker Compose:

```bash
docker compose up          # PocketBase on :8090 (pb_migrations/ auto-applied), server on :4001
```

PocketBase must be running before the desktop app can auth or load projects — the client hardcodes `http://127.0.0.1:8090` (`apps/desktop/src/lib/pocketbase.ts`). The Socket.io server (`:4001`) is only needed for presence/chat-relay/WebRTC signaling features, not for auth/kanban/terminal.

Per-package, useful when iterating on one piece:

```bash
pnpm --filter @agenpic/desktop tauri dev      # Tauri dev, or `pnpm --filter @agenpic/desktop vite:dev` for frontend-only (no Rust rebuild)
pnpm --filter @agenpic/ui test                # vitest run (packages/ui)
pnpm --filter @agenpic/ui exec vitest run src/Chat.test.tsx   # single test file
pnpm --filter @agenpic/server build && pnpm --filter @agenpic/server start
```

There is no root-level single-test-file shortcut — target the package directly as above. `packages/ui` is the only package with tests today (Vitest + React Testing Library, jsdom, setup at `packages/ui/src/test/setup.ts`).

Rust side (`apps/desktop/src-tauri`): standard `cargo build` / `cargo check` from that directory works for isolated Rust iteration, but `tauri dev` is the normal path since it also drives the Vite frontend.

## Architecture

### Monorepo shape and the desktop/shared split

- `apps/desktop` — the Tauri app. Rust backend (`src-tauri/src`) owns the PTY and file-watching; React frontend (`src`) owns everything else, including the terminal, kanban, chat, presence map, and WebRTC — even though kanban/chat *logic* is meant to live in shared packages (see below).
- `apps/server` — thin Socket.io server. No business logic, no PocketBase access: it only relays presence (`presence:*` events) and WebRTC signaling (`webrtc:signal`), scoped to Socket.io rooms keyed `project:<projectId>` (see `apps/server/src/index.ts`).
- `packages/ui` — presentational components only (`Button`, `TextInput`, `Select`, `Panel`, `KanbanBoard`, `ChatPanel`), CSS Modules, cyberpunk design tokens in `tokens.css`. No Tauri APIs — must stay runnable in a plain browser so it can back a future web app.
- `packages/core` — shared React Query hooks for kanban/chat only (`useTickets.ts`, `useMessages.ts`), parameterized by an injected `AgenpicClient` rather than importing a singleton, so it stays platform-agnostic.
- `packages/types` — the PocketBase record shapes (`ProjectRecord`, `TicketRecord`, `MessageRecord`, `ProjectMemberRecord`, `UserRecord`) plus the role-derivation helpers `effectiveRole()` / `canEdit()` — this is the one place that encodes the owner/admin/viewer permission logic on the client side (PocketBase collection rules enforce the same logic server-side independently; see below).
- `packages/pocketbase-client` — thin typed wrapper (`AgenpicClient`) around the `pocketbase` SDK exposing typed collection getters (`.projects`, `.tickets`, `.messages`, `.projectMembers`, `.users`) and auth helpers.
- `packages/logger` — scoped structured logger (`createLogger(scope)`, `.child(subScope)`) with a pluggable transport list; `consoleTransport` for dev, `createRingBufferTransport` backs the in-app `LogViewer` panel. Used identically by `apps/server` and the desktop frontend (`apps/desktop/src/lib/logger.ts` wraps it with a ring buffer feeding `LogViewer`).

The terminal, presence map, and WebRTC code live directly in `apps/desktop/src` (components + hooks), not in shared packages — they're desktop-only by nature (PTY access, proximity/presence tied to the Tauri process).

### Rust PTY + file watcher (`apps/desktop/src-tauri/src`)

- `pty.rs`: spawns a real PTY per terminal (`portable-pty`, `powershell.exe` on Windows / `$SHELL` elsewhere), keyed by a UUID in `PtyState` (a `Mutex<HashMap<String, PtySession>>` managed by Tauri). A background thread streams PTY output to the frontend via the `pty://output` event; `pty://exit` fires on EOF. Commands: `pty_spawn`, `pty_write`, `pty_resize`, `pty_kill`.
- `watcher.rs`: one `notify` recursive watcher per project (`WatcherState`, keyed by `project_id`), rooted at the project's local path. It only cares about two things: the project's `CLAUDE.md` and `.agenpic/tickets/*.json`, debounced 250ms per path. Changes emit `agenpic://claude-md` / `agenpic://ticket-changed` events with the file's new content (or `null` on delete). Commands: `watch_project`, `unwatch_project`.
- Both are registered in `lib.rs` via `tauri::generate_handler!` and `.manage(...)`.

### The CLAUDE.md / ticket sync loop

This is the core "control surface" mechanic and spans three layers — read `watcher.rs` + `apps/desktop/src/hooks/useClaudeSync.ts` together to understand it:

1. Claude Code runs as an ordinary CLI process inside the embedded terminal (`TerminalPanel`), `cd`'d into the active project's directory. It edits `CLAUDE.md` and writes ticket files to `.agenpic/tickets/<slug>.json` like any other file it touches — there is no custom RPC/tool-calling protocol.
2. The Rust watcher (`watch_project`) picks up those filesystem changes and emits Tauri events.
3. `useClaudeSync` (mounted once per active project) listens for those events and pushes the content into PocketBase (`projects.claude_md` field; upsert/delete against the `tickets` collection matched by `project + slug`). PocketBase's own realtime subscriptions (used by `useTickets` in `packages/core`) then push the change out to every connected client's kanban board.

A ticket file's JSON shape is `{ title, description?, column?, order? }`; `column` defaults to `"backlog"` if omitted. `slug` is derived from the filename, not stored in the JSON — it's the stable identity used for upsert matching (see `idx_tickets_project_slug` unique index).

### Auth, projects, and roles

- PocketBase's built-in email/password auth (`users` collection) is the only auth mechanism. `AuthContext` wraps it; on Tauri, the auth store persists via `tauriAuthStore.ts` instead of localStorage (`isTauriRuntime()` gates this — falls back to the SDK default in plain-browser dev).
- A project (`projects` collection) has one `owner` and zero or more `project_members` (`project`, `user`, `role: "admin" | "viewer"`, unique per project+user). Effective role is computed client-side by `effectiveRole()` in `packages/types` (owner always outranks membership) and enforced server-side independently via PocketBase collection rules in `pb_migrations/*.js` — the two must be kept in sync by hand if role logic changes; there's no shared source of truth between Rust/PocketBase-JS rules and the TS helper.
- `canEdit(role)` gates kanban/ticket write affordances for viewers in the UI; PocketBase's `updateRule`/`createRule` on `tickets` enforce the same restriction server-side regardless of what the client does.
- `ProjectContext` tracks the active project in `localStorage` (`agenpic:activeProjectId`) and clears it if the user no longer has access.

### Presence map + WebRTC (`apps/desktop/src/hooks/usePresence.ts`, `useProximityVoice.ts`, `components/PresenceMap.tsx`)

- Every connected client (a real user, or an "agent" node representing a live PTY session — see `TerminalPanel`'s `agentSelf`) authenticates to the Socket.io server with `{ projectId, userId, name, kind, color, meta }` and joins room `project:<projectId>`. `meta.path` on an agent node is the directory the Claude Code session is running against.
- `useProximityVoice` opens a full-mesh WebRTC connection to every `kind: "user"` peer within `PROXIMITY_RADIUS` (160px) of the local avatar, signaled through the Socket.io server's `webrtc:signal` passthrough (the server never inspects SDP/ICE payloads). Capped at `MAX_MESH_PEERS = 6` — beyond that an SFU would be required (explicitly out of scope; the code just stops connecting and logs a warning). The lower `socketId` always initiates the offer, to avoid both sides racing.

### Ollama connector

`apps/desktop/src/lib/ollama.ts` wraps the `openai` npm package pointed at `http://localhost:11434/v1` (Ollama's OpenAI-compatible endpoint), config persisted to `localStorage`. This is connection/config plumbing only (`SettingsPanel` + `testOllamaConnection`) — there is no scheduled/background job consuming it yet.

### Styling

Cyberpunk theme tokens live in `packages/ui/src/tokens.css` (imported once, globally, in `apps/desktop/src/App.tsx`) and are consumed via CSS Modules per component (`*.module.css` beside each `.tsx`). No default-styled HTML form controls — always use the `packages/ui` primitives (`Button`, `TextInput`, `Select`, `Panel`) rather than raw `<button>`/`<input>`/`<select>`.

### Data model quick reference

Collections (see `pb_migrations/` for the authoritative field lists and access rules): `users`, `projects` (`name`, `path`, `owner`, `claude_md`), `project_members` (`project`, `user`, `role`), `tickets` (`project`, `slug`, `title`, `description`, `column`, `order`, `owner`, `images`), `messages` (`project`, `user`, `text`, `flagged`, `flaggedBy`, `flaggedAt`). Migrations are sequential and numbered (`10NN_*.js`) — add new ones rather than editing applied migrations, and update both the `migrate(up, down)` pair.
