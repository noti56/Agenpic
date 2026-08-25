# Agenpic

This project is managed with **Agenpic**, a team command center for Claude Code sessions
(terminal + kanban + team chat + presence map, all shared live with your teammates).

This file is the *only* file Agenpic writes into this project. Everything else it manages —
docs and tickets — lives in the cloud (PocketBase) and is only ever touched through the CLI
below or the Agenpic app's UI. Nothing gets mirrored onto disk, so it never shows up as noise
in `git status` or your commit history.

## CLI

A small, dependency-free CLI is bundled at `.agenpic/bin/agenpic-cli.mjs`. Run it with Node:

    node .agenpic/bin/agenpic-cli.mjs <command>

It talks straight to this project's PocketBase instance using a local, auto-refreshed
credential — no login step needed.

### Docs

Shared, per-project Markdown docs. Visible to the whole team in the app's **Docs** tab.

    node .agenpic/bin/agenpic-cli.mjs docs list
    node .agenpic/bin/agenpic-cli.mjs docs read <slug>
    node .agenpic/bin/agenpic-cli.mjs docs create <slug> --title "Title" --file ./notes.md
    echo "# Title\n\nBody" | node .agenpic/bin/agenpic-cli.mjs docs create <slug>
    node .agenpic/bin/agenpic-cli.mjs docs update <slug> --file ./notes.md
    node .agenpic/bin/agenpic-cli.mjs docs delete <slug>

Content comes from `--file <path>`, or from stdin if piped. The title comes from `--title`,
else the first `# Heading` line of the content, else the slug.

### Tickets

The same kanban board tickets shown in the app's **Mission Hangar** tab.

    node .agenpic/bin/agenpic-cli.mjs tickets list
    node .agenpic/bin/agenpic-cli.mjs tickets read <slug>
    node .agenpic/bin/agenpic-cli.mjs tickets create <slug> --title "Fix the thing" --column todo
    node .agenpic/bin/agenpic-cli.mjs tickets update <slug> --title "..." --file ./description.md
    node .agenpic/bin/agenpic-cli.mjs tickets move <slug> in_progress
    node .agenpic/bin/agenpic-cli.mjs tickets delete <slug>

Columns: `backlog`, `todo`, `in_progress`, `done`.

### Re-running setup

If this file ever gets deleted, regenerate it with:

    node .agenpic/bin/agenpic-cli.mjs init
