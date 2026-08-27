# Agenpic

This project is managed with **Agenpic**, a team command center for Claude Code sessions
(terminal + kanban + team chat + presence map, all shared live with your teammates).

This file and a one-line pointer in `CLAUDE.md` are the *only* things Agenpic writes into
this project. Everything else it manages — docs and tickets — lives in the cloud
(PocketBase) and is only ever touched through the CLI below or the Agenpic app's UI.
Nothing gets mirrored onto disk, so it never shows up as noise in `git status` or your
commit history.

## Mission protocol

**Every non-trivial piece of work in this project is tracked as a ticket, and your
teammates watch that board live.** Before you start:

1. See what's already tracked:

       node .agenpic/bin/agenpic-cli.mjs tickets list

2. **Claim a ticket.** If one already covers what you're about to do:

       node .agenpic/bin/agenpic-cli.mjs tickets move <slug> in_progress

   If nothing covers it, open one first — a short kebab-case slug, a human-readable title:

       node .agenpic/bin/agenpic-cli.mjs tickets create fix-auth-refresh --title "Fix token refresh dropping the session" --column in_progress

3. **Close it out before you finish your final reply.** Report what happened, then move it:

       echo "Rewrote the refresh path; added a regression test. Left the retry backoff alone." | node .agenpic/bin/agenpic-cli.mjs tickets comment fix-auth-refresh
       node .agenpic/bin/agenpic-cli.mjs tickets move fix-auth-refresh done

   If you got **blocked or stopped part-way**, say so in the comment and move it back to
   `todo` instead of `done`. A ticket left sitting in `in_progress` reads to the rest of
   the team as "someone is actively on this right now", so don't leave one behind.

A good closing comment says what changed, what you deliberately left alone, and anything
that needs a human decision. Skip the protocol entirely for trivial requests — a question,
a lookup, a one-line tweak. Use it for anything you'd describe as a task.

## CLI

A small, dependency-free CLI is bundled at `.agenpic/bin/agenpic-cli.mjs`. Run it with Node:

    node .agenpic/bin/agenpic-cli.mjs <command>

It talks straight to this project's PocketBase instance using a local, auto-refreshed
credential — no login step needed. If it reports a missing config or an auth error, open
this project in the Agenpic app once to regenerate the credential.

### Tickets

The same kanban board tickets shown in the app's **Mission Hangar** tab.

    node .agenpic/bin/agenpic-cli.mjs tickets list
    node .agenpic/bin/agenpic-cli.mjs tickets read <slug>
    node .agenpic/bin/agenpic-cli.mjs tickets create <slug> --title "Fix the thing" --column todo
    node .agenpic/bin/agenpic-cli.mjs tickets update <slug> --title "..." --file ./description.md
    node .agenpic/bin/agenpic-cli.mjs tickets move <slug> in_progress
    node .agenpic/bin/agenpic-cli.mjs tickets comment <slug> --file ./notes.md
    echo "Progress update" | node .agenpic/bin/agenpic-cli.mjs tickets comment <slug>
    node .agenpic/bin/agenpic-cli.mjs tickets delete <slug>

Columns: `backlog`, `todo`, `in_progress`, `done`.

Comments posted through the CLI are marked as agent-written in the app, so your teammates
can tell them apart from their own.

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

### Re-running setup

If this file ever gets deleted, regenerate it with:

    node .agenpic/bin/agenpic-cli.mjs init
