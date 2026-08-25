# Agenpic

A desktop app for running and collaborating on Claude Code sessions across a team, with live presence, a shared kanban board, and chat — backed by PocketBase.

## Structure

This is a pnpm/Turborepo monorepo:

```
apps/
  desktop/    Tauri + React desktop app (terminal, kanban, presence map, chat)
  server/     Socket.IO realtime server
packages/
  core/               Shared domain logic
  logger/             Shared logging utility
  pocketbase-client/  Typed PocketBase client wrapper
  types/              Shared TypeScript types
  ui/                 Shared React UI components
pb_migrations/        PocketBase collection schema migrations
```

## Prerequisites

- Node.js >= 20
- [pnpm](https://pnpm.io/) 10.13.1
- [Rust](https://www.rust-lang.org/tools/install) + platform build tools (required by Tauri)
- Docker (optional, for running PocketBase + the realtime server via `docker-compose`)

## Getting started

```bash
pnpm install

# Start PocketBase (and the realtime server) via Docker
docker compose up -d

# Run the desktop app in dev mode
pnpm dev
```

Other useful scripts (run from the repo root, via Turborepo):

```bash
pnpm dev:server   # run the realtime server standalone
pnpm build        # build all apps/packages
pnpm typecheck    # typecheck all workspaces
pnpm lint         # lint all workspaces
pnpm test         # run tests across workspaces
```

## Data model

PocketBase schema is defined as JS migrations under `pb_migrations/`. Key collections:

- `projects` — a project, owned by a single user, pointing at a local directory
- `project_members` — invites other users onto a project with an `admin`/`viewer` role
- `tickets` — kanban cards synced from `.agenpic/tickets/*.json` in the project directory
- `messages` — project chat

Each collaborator's local checkout path is stored locally on their own machine (not synced through PocketBase), since a shared project can live at a different filesystem path per user.
