#!/usr/bin/env node
// Agenpic CLI — talks directly to this project's PocketBase instance.
// Self-contained, zero dependencies. See AGENPIC.md for usage docs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..", "..");
const configPath = path.join(scriptDir, "..", "agenpic.config.json");

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch {
  console.error(
    `Error: couldn't read ${configPath}.\n` +
      `Open this project in the Agenpic app at least once so it can generate your local credentials.`,
  );
  process.exit(1);
}

// Comments posted through this CLI are machine-written by definition, so
// they carry a prefix instead of a schema field — it is what lets the app
// render them distinctly from a teammate's own comment.
const AGENT_COMMENT_PREFIX = "🤖 ";

const AGENPIC_MD = `# Agenpic

This project is managed with **Agenpic**, a team command center for Claude Code sessions
(terminal + kanban + team chat + presence map, all shared live with your teammates).

This file and a one-line pointer in \`CLAUDE.md\` are the *only* things Agenpic writes into
this project. Everything else it manages — docs and tickets — lives in the cloud
(PocketBase) and is only ever touched through the CLI below or the Agenpic app's UI.
Nothing gets mirrored onto disk, so it never shows up as noise in \`git status\` or your
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
   \`--owner me\` unless you were explicitly asked to assign it to someone else — look up a
   teammate's id with \`members list\` if you need it:

       node .agenpic/bin/agenpic-cli.mjs tickets create fix-auth-refresh --title "Fix token refresh dropping the session" --column in_progress --owner me

   Reassigning an already-claimed ticket updates it instead — omitting \`--owner\` never
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
   \`todo\` instead of \`done\`. A ticket left sitting in \`in_progress\` reads to the rest of
   the team as "someone is actively on this right now", so don't leave one behind.

A good closing comment says what changed, what you deliberately left alone, and anything
that needs a human decision. Skip the protocol entirely for trivial requests — a question,
a lookup, a one-line tweak. Use it for anything you'd describe as a task.

If you're genuinely stuck and need the human's attention right now — not just a comment
they'll read later — see **Poke** below.

## CLI

A small, dependency-free CLI is bundled at \`.agenpic/bin/agenpic-cli.mjs\`. Run it with Node:

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

Columns: \`backlog\`, \`todo\`, \`in_progress\`, \`done\`.

\`--owner\` accepts a user id, an email/name (looked up for you), or the special value \`me\`
(the human running this session). Creating a ticket without \`--owner\` defaults to \`me\`.
Updating one without \`--owner\` leaves the existing assignee alone.

Comments posted through the CLI are marked as agent-written in the app, so your teammates
can tell them apart from their own.

### Members

    node .agenpic/bin/agenpic-cli.mjs members list

Lists everyone on this project with their user id, name, email, and role — use the id to
resolve a teammate for \`--owner\` when a name is ambiguous.

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
    echo "# Title\\n\\nBody" | node .agenpic/bin/agenpic-cli.mjs docs create <slug>
    node .agenpic/bin/agenpic-cli.mjs docs update <slug> --file ./notes.md
    node .agenpic/bin/agenpic-cli.mjs docs delete <slug>

Content comes from \`--file <path>\`, or from stdin if piped. The title comes from \`--title\`,
else the first \`# Heading\` line of the content, else the slug.

### Re-running setup

If this file ever gets deleted, regenerate it with:

    node .agenpic/bin/agenpic-cli.mjs init
`;

async function pbRequest(method, urlPath, body) {
  const res = await fetch(`${config.pocketbaseUrl}${urlPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(config.token ? { Authorization: config.token } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const errBody = await res.json();
      if (errBody?.message) message = errBody.message;
    } catch {
      // ignore — fall back to the status line
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

/**
 * Talks to the Socket.io presence server (poke/status) rather than
 * PocketBase — this CLI has no live socket of its own, so poke/status
 * updates are delivered through a plain HTTP endpoint the server exposes
 * for exactly this purpose.
 */
async function serverRequest(method, urlPath, body) {
  if (!config.serverUrl) {
    fail("This project's config predates poke/status support — reopen it in the Agenpic app to refresh the credential.");
  }
  const res = await fetch(`${config.serverUrl}${urlPath}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const MAX_STATUS_LEN = 80;

async function findBySlug(collection, slug) {
  const filter = encodeURIComponent(`project = "${config.projectId}" && slug = "${slug}"`);
  const data = await pbRequest("GET", `/api/collections/${collection}/records?filter=${filter}&perPage=1`);
  return data.items[0] ?? null;
}

async function listAll(collection, sort) {
  const filter = encodeURIComponent(`project = "${config.projectId}"`);
  const sortParam = sort ? `&sort=${encodeURIComponent(sort)}` : "";
  const data = await pbRequest(
    "GET",
    `/api/collections/${collection}/records?filter=${filter}&perPage=200${sortParam}`,
  );
  return data.items;
}

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

async function readContent(flags) {
  if (typeof flags.file === "string") {
    return fs.readFileSync(path.resolve(process.cwd(), flags.file), "utf8");
  }
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf8");
    return text.length > 0 ? text : undefined;
  }
  return undefined;
}

function deriveTitle(flags, content, slug) {
  if (typeof flags.title === "string") return flags.title;
  const match = typeof content === "string" ? content.match(/^#\s+(.+)$/m) : null;
  if (match) return match[1].trim();
  return slug;
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function usage() {
  console.log(`Usage:
  agenpic init
  agenpic docs    list | read <slug> | create <slug> [--title] [--file] | update <slug> [...] | delete <slug>
  agenpic tickets list | read <slug> | create <slug> --title [--column] [--owner] [--file] | update <slug> [...] | move <slug> <column> [order] | comment <slug> [--file] | delete <slug>
  agenpic members list
  agenpic status [<text>]
  agenpic poke [<message>]

See AGENPIC.md at the project root for full documentation.`);
}

/**
 * Resolves a `--owner` value to a PocketBase user id: "me" (the human
 * running this session), a raw id, or an email/name looked up against the
 * users collection (any authenticated user can list/view any other user —
 * see pb_migrations/1000_update_users_rules.js).
 */
async function resolveOwner(value) {
  if (value.toLowerCase() === "me") {
    if (!config.userId) {
      fail("This project's config predates owner support — reopen it in the Agenpic app to refresh the credential.");
    }
    return config.userId;
  }
  if (/^[a-z0-9]{15}$/.test(value)) return value;

  const filter = encodeURIComponent(`email = "${value}" || name = "${value}"`);
  const data = await pbRequest("GET", `/api/collections/users/records?filter=${filter}&perPage=2`);
  if (data.items.length === 0) fail(`No user found matching "${value}". Try "members list" to see who's on this project.`);
  if (data.items.length > 1) {
    fail(
      `"${value}" matches more than one user: ${data.items.map((u) => `${u.id} (${u.email})`).join(", ")}. Use an id instead.`,
    );
  }
  return data.items[0].id;
}

function cmdInit() {
  const target = path.join(projectRoot, "AGENPIC.md");
  fs.writeFileSync(target, AGENPIC_MD, "utf8");
  console.log(`Wrote ${target}`);
}

async function docsList() {
  const items = await listAll("docs", "title");
  if (items.length === 0) {
    console.log("(no docs yet)");
    return;
  }
  for (const it of items) console.log(`${it.slug} — ${it.title}`);
}

async function docsRead(slug) {
  const doc = await findBySlug("docs", slug);
  if (!doc) fail(`No doc found with slug "${slug}"`);
  console.log(doc.content ?? "");
}

async function docsCreate(slug, flags) {
  const existing = await findBySlug("docs", slug);
  if (existing) fail(`A doc with slug "${slug}" already exists — use "update" instead.`);
  const content = (await readContent(flags)) ?? "";
  const title = deriveTitle(flags, content, slug);
  await pbRequest("POST", "/api/collections/docs/records", {
    project: config.projectId,
    slug,
    title,
    content,
  });
  console.log(`Created doc "${slug}"`);
}

async function docsUpdate(slug, flags) {
  const existing = await findBySlug("docs", slug);
  if (!existing) fail(`No doc found with slug "${slug}"`);
  const content = await readContent(flags);
  const patch = {};
  if (content !== undefined) patch.content = content;
  if (typeof flags.title === "string") patch.title = flags.title;
  else if (content !== undefined) patch.title = deriveTitle(flags, content, slug);
  if (Object.keys(patch).length === 0) {
    fail("Nothing to update — pass --title and/or --file, or pipe content via stdin.");
  }
  await pbRequest("PATCH", `/api/collections/docs/records/${existing.id}`, patch);
  console.log(`Updated doc "${slug}"`);
}

async function docsDelete(slug) {
  const existing = await findBySlug("docs", slug);
  if (!existing) fail(`No doc found with slug "${slug}"`);
  await pbRequest("DELETE", `/api/collections/docs/records/${existing.id}`);
  console.log(`Deleted doc "${slug}"`);
}

async function ticketsList() {
  const items = await listAll("tickets", "column,order");
  if (items.length === 0) {
    console.log("(no tickets yet)");
    return;
  }
  for (const it of items) console.log(`${it.slug} — ${it.title} [${it.column}]`);
}

async function ticketsRead(slug) {
  const t = await findBySlug("tickets", slug);
  if (!t) fail(`No ticket found with slug "${slug}"`);
  console.log(`# ${t.title}\n\ncolumn: ${t.column}\norder: ${t.order}\n\n${t.description ?? ""}`);
}

async function ticketsCreate(slug, flags) {
  const existing = await findBySlug("tickets", slug);
  if (existing) fail(`A ticket with slug "${slug}" already exists — use "update" instead.`);
  if (typeof flags.title !== "string") fail('"tickets create" requires --title');
  const content = await readContent(flags);
  // Every ticket gets an owner — defaults to the human running this session
  // unless a different assignee was explicitly named.
  const owner = await resolveOwner(typeof flags.owner === "string" ? flags.owner : "me");
  await pbRequest("POST", "/api/collections/tickets/records", {
    project: config.projectId,
    slug,
    title: flags.title,
    description: content ?? "",
    column: typeof flags.column === "string" ? flags.column : "backlog",
    order: 0,
    owner,
  });
  console.log(`Created ticket "${slug}"`);
}

async function ticketsUpdate(slug, flags) {
  const existing = await findBySlug("tickets", slug);
  if (!existing) fail(`No ticket found with slug "${slug}"`);
  const content = await readContent(flags);
  const patch = {};
  if (typeof flags.title === "string") patch.title = flags.title;
  if (content !== undefined) patch.description = content;
  if (typeof flags.column === "string") patch.column = flags.column;
  // Only touch owner when explicitly passed — omitting --owner must never
  // clear an existing assignee.
  if (typeof flags.owner === "string") patch.owner = await resolveOwner(flags.owner);
  if (Object.keys(patch).length === 0) fail("Nothing to update.");
  await pbRequest("PATCH", `/api/collections/tickets/records/${existing.id}`, patch);
  console.log(`Updated ticket "${slug}"`);
}

async function ticketsMove(slug, column, order) {
  if (!column) fail('"tickets move" requires a target column.');
  const existing = await findBySlug("tickets", slug);
  if (!existing) fail(`No ticket found with slug "${slug}"`);
  const patch = { column };
  if (order !== undefined) patch.order = Number(order);
  await pbRequest("PATCH", `/api/collections/tickets/records/${existing.id}`, patch);
  console.log(`Moved ticket "${slug}" to ${column}`);
}

async function ticketsComment(slug, flags) {
  if (!config.userId) {
    fail("This project's config predates comment support — reopen it in the Agenpic app to refresh the credential.");
  }
  const existing = await findBySlug("tickets", slug);
  if (!existing) fail(`No ticket found with slug "${slug}"`);
  const content = await readContent(flags);
  if (content === undefined || content.trim() === "") {
    fail("Nothing to post — pass --file <path>, or pipe the comment via stdin.");
  }
  await pbRequest("POST", "/api/collections/ticket_comments/records", {
    ticket: existing.id,
    user: config.userId,
    text: AGENT_COMMENT_PREFIX + content.trim(),
  });
  console.log(`Commented on ticket "${slug}"`);
}

async function ticketsDelete(slug) {
  const existing = await findBySlug("tickets", slug);
  if (!existing) fail(`No ticket found with slug "${slug}"`);
  await pbRequest("DELETE", `/api/collections/tickets/records/${existing.id}`);
  console.log(`Deleted ticket "${slug}"`);
}

async function membersList() {
  const filter = encodeURIComponent(`project = "${config.projectId}"`);
  const data = await pbRequest(
    "GET",
    `/api/collections/project_members/records?filter=${filter}&expand=user&perPage=200`,
  );
  if (data.items.length === 0) {
    console.log("(no members yet)");
    return;
  }
  for (const it of data.items) {
    const user = it.expand?.user;
    const label = user ? `${user.name || user.email} <${user.email}>` : it.user;
    console.log(`${it.user} — ${label} (${it.role})`);
  }
}

async function statusCmd(text) {
  if (!config.userId) {
    fail("This project's config predates status support — reopen it in the Agenpic app to refresh the credential.");
  }
  const status = (text ?? "").trim().slice(0, MAX_STATUS_LEN);
  // Persisted directly in PocketBase (not routed through the Socket.io
  // server) so it survives reconnects and reaches every connected client
  // via PocketBase's own realtime subscription — the app reads it back
  // through useProjectStatuses. One row per (project, user, kind="agent"):
  // if you have more than one Claude Code terminal open in this exact
  // project, a status update applies to all of them.
  const filter = encodeURIComponent(
    `project = "${config.projectId}" && user = "${config.userId}" && kind = "agent"`,
  );
  const data = await pbRequest("GET", `/api/collections/presence_status/records?filter=${filter}&perPage=1`);
  const existing = data.items[0];
  if (existing) {
    await pbRequest("PATCH", `/api/collections/presence_status/records/${existing.id}`, { status });
  } else {
    await pbRequest("POST", "/api/collections/presence_status/records", {
      project: config.projectId,
      user: config.userId,
      kind: "agent",
      status,
    });
  }
  console.log(status === "" ? "Status cleared." : `Status set to "${status}"`);
}

async function pokeCmd(message) {
  if (!config.userId) {
    fail("This project's config predates poke support — reopen it in the Agenpic app to refresh the credential.");
  }
  const data = await serverRequest("POST", "/poke", {
    projectId: config.projectId,
    userId: config.userId,
    message,
  });
  console.log(data?.delivered > 0 ? "Poke sent" : "Poke sent (nobody's currently online to receive it)");
}

async function main() {
  const [, , resource, action, ...rest] = process.argv;

  if (!resource) {
    usage();
    process.exit(1);
  }

  if (resource === "init") {
    cmdInit();
    return;
  }

  if (resource === "members") {
    if (action !== "list") fail(`Unknown "members" action "${action ?? ""}". Only "members list" is supported.`);
    return membersList();
  }

  // Both take an optional free-text argument (or stdin), so they're
  // dispatched before the "requires a slug" ticket/docs handling below.
  if (resource === "status") {
    const text = action !== undefined ? [action, ...rest].join(" ") : await readContent({});
    return statusCmd(text ?? "");
  }
  if (resource === "poke") {
    const message = action !== undefined ? [action, ...rest].join(" ") : undefined;
    return pokeCmd(message);
  }

  if (resource !== "docs" && resource !== "tickets") {
    fail(`Unknown command "${resource}". Run with no arguments for usage.`);
  }

  if (!action) {
    usage();
    process.exit(1);
  }

  const { flags, positional } = parseFlags(rest);
  const slug = positional[0];

  if (action === "list") {
    await (resource === "docs" ? docsList() : ticketsList());
    return;
  }

  if (!slug) fail(`"${resource} ${action}" requires a slug.`);

  if (resource === "docs") {
    if (action === "read") return docsRead(slug);
    if (action === "create") return docsCreate(slug, flags);
    if (action === "update") return docsUpdate(slug, flags);
    if (action === "delete") return docsDelete(slug);
  } else {
    if (action === "read") return ticketsRead(slug);
    if (action === "create") return ticketsCreate(slug, flags);
    if (action === "update") return ticketsUpdate(slug, flags);
    if (action === "delete") return ticketsDelete(slug);
    if (action === "move") return ticketsMove(slug, positional[1], positional[2]);
    if (action === "comment") return ticketsComment(slug, flags);
  }

  fail(`Unknown action "${action}" for "${resource}".`);
}

main().catch((err) => fail(err.message));
