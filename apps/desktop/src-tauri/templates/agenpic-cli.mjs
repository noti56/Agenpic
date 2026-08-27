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

   If nothing covers it, open one first — a short kebab-case slug, a human-readable title:

       node .agenpic/bin/agenpic-cli.mjs tickets create fix-auth-refresh --title "Fix token refresh dropping the session" --column in_progress

3. **Close it out before you finish your final reply.** Report what happened, then move it:

       echo "Rewrote the refresh path; added a regression test. Left the retry backoff alone." | node .agenpic/bin/agenpic-cli.mjs tickets comment fix-auth-refresh
       node .agenpic/bin/agenpic-cli.mjs tickets move fix-auth-refresh done

   If you got **blocked or stopped part-way**, say so in the comment and move it back to
   \`todo\` instead of \`done\`. A ticket left sitting in \`in_progress\` reads to the rest of
   the team as "someone is actively on this right now", so don't leave one behind.

A good closing comment says what changed, what you deliberately left alone, and anything
that needs a human decision. Skip the protocol entirely for trivial requests — a question,
a lookup, a one-line tweak. Use it for anything you'd describe as a task.

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
    node .agenpic/bin/agenpic-cli.mjs tickets create <slug> --title "Fix the thing" --column todo
    node .agenpic/bin/agenpic-cli.mjs tickets update <slug> --title "..." --file ./description.md
    node .agenpic/bin/agenpic-cli.mjs tickets move <slug> in_progress
    node .agenpic/bin/agenpic-cli.mjs tickets comment <slug> --file ./notes.md
    echo "Progress update" | node .agenpic/bin/agenpic-cli.mjs tickets comment <slug>
    node .agenpic/bin/agenpic-cli.mjs tickets delete <slug>

Columns: \`backlog\`, \`todo\`, \`in_progress\`, \`done\`.

Comments posted through the CLI are marked as agent-written in the app, so your teammates
can tell them apart from their own.

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
  agenpic tickets list | read <slug> | create <slug> --title [--column] [--file] | update <slug> [...] | move <slug> <column> [order] | comment <slug> [--file] | delete <slug>

See AGENPIC.md at the project root for full documentation.`);
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
  await pbRequest("POST", "/api/collections/tickets/records", {
    project: config.projectId,
    slug,
    title: flags.title,
    description: content ?? "",
    column: typeof flags.column === "string" ? flags.column : "backlog",
    order: 0,
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
