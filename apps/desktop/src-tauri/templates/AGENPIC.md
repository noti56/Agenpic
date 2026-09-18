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

   If nothing covers it, open one first — a short kebab-case slug, a human-readable title.
   **Always set an owner.** Default to yourself (the human whose session this is) with
   `--owner me` unless you were explicitly asked to assign it to someone else — look up a
   teammate's id with `members list` if you need it:

       node .agenpic/bin/agenpic-cli.mjs tickets create fix-auth-refresh --title "Fix token refresh dropping the session" --column in_progress --owner me

   Reassigning an already-claimed ticket updates it instead — omitting `--owner` never
   clears an existing assignee:

       node .agenpic/bin/agenpic-cli.mjs tickets update fix-auth-refresh --owner someone@example.com

   Set a short status so teammates watching the presence map can see what you're on:

       node .agenpic/bin/agenpic-cli.mjs status "fixing auth refresh"

3. **Close it out before you finish your final reply.** Report what happened, move it, and
   clear your status:

       echo "Rewrote the refresh path; added a regression test. Left the retry backoff alone." | node .agenpic/bin/agenpic-cli.mjs tickets comment fix-auth-refresh
       node .agenpic/bin/agenpic-cli.mjs tickets move fix-auth-refresh done
       node .agenpic/bin/agenpic-cli.mjs status ""

   If you got **blocked or stopped part-way**, say so in the comment and move it back to
   `todo` instead of `done`. A ticket left sitting in `in_progress` reads to the rest of
   the team as "someone is actively on this right now", so don't leave one behind.

A good closing comment says what changed, what you deliberately left alone, and anything
that needs a human decision. Skip the protocol entirely for trivial requests — a question,
a lookup, a one-line tweak. Use it for anything you'd describe as a task.

If you're genuinely stuck and need the human's attention right now — not just a comment
they'll read later — see **Poke** below.

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
    node .agenpic/bin/agenpic-cli.mjs tickets create <slug> --title "Fix the thing" --column todo --owner me
    node .agenpic/bin/agenpic-cli.mjs tickets update <slug> --title "..." --file ./description.md --owner <id|email|me>
    node .agenpic/bin/agenpic-cli.mjs tickets move <slug> in_progress
    node .agenpic/bin/agenpic-cli.mjs tickets comment <slug> --file ./notes.md
    echo "Progress update" | node .agenpic/bin/agenpic-cli.mjs tickets comment <slug>
    node .agenpic/bin/agenpic-cli.mjs tickets delete <slug>

Columns: `backlog`, `todo`, `in_progress`, `done`.

`--owner` accepts a user id, an email/name (looked up for you), or the special value `me`
(the human running this session). Creating a ticket without `--owner` defaults to `me`.
Updating one without `--owner` leaves the existing assignee alone.

Comments posted through the CLI are marked as agent-written in the app, so your teammates
can tell them apart from their own.

### Members

    node .agenpic/bin/agenpic-cli.mjs members list

Lists everyone on this project with their user id, name, email, and role — use the id to
resolve a teammate for `--owner` when a name is ambiguous.

### Status

A short, free-text status shown next to you (or this terminal's agent node) on the
presence map — like a Slack status, not a fixed set of states.

    node .agenpic/bin/agenpic-cli.mjs status "refactoring auth middleware"
    node .agenpic/bin/agenpic-cli.mjs status ""

An empty string clears it. Capped at 80 characters. If you have more than one Claude Code
terminal open in this exact project directory, a status update applies to all of them —
there's no way from here to target just one.

### Poke

Sends the human running this session a sound, a blinking tab, and (if the Agenpic window
isn't focused) a desktop notification — an interrupt, not a message they'll read later.

    node .agenpic/bin/agenpic-cli.mjs poke "need a decision on the API key rotation"

Use it when you're genuinely blocked and need attention now. For anything that can wait,
leave a ticket comment instead — pokes are meant to stay rare enough to be meaningful.

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
