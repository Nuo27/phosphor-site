import { Client, APIErrorCode, APIResponseError } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import yaml from "js-yaml";
import pLimit from "p-limit";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  rmSync,
} from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const ARTICLES_DIR = join(REPO_ROOT, "_articles");
const CATEGORIES_FILE = join(REPO_ROOT, "_data", "categories.yml");
const MAX_DEPTH = 10;

// Rate limit Notion API calls (~3 req/s budget) + retry on 429/5xx.
const limit = pLimit(3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function notionCall(label, fn) {
  const MAX = 3;
  let lastErr;
  for (let attempt = 0; attempt <= MAX; attempt++) {
    try {
      return await limit(fn);
    } catch (e) {
      lastErr = e;
      const retryable = e instanceof APIResponseError &&
        (e.code === APIErrorCode.RateLimited ||
         e.code === APIErrorCode.InternalServerError ||
         e.code === APIErrorCode.ServiceUnavailable);
      if (!retryable || attempt === MAX) break;
      const wait = (e.code === APIErrorCode.RateLimited && e.headers?.["retry-after"]
        ? Number(e.headers["retry-after"]) * 1000
        : 500 * Math.pow(2, attempt));
      console.warn(`  ! ${label} ${e.code}, retry ${attempt + 1}/${MAX} in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

const categories = yaml.load(readFileSync(CATEGORIES_FILE, "utf8"));
const RESERVED_SLUGS = new Set(categories.map((c) => c.slug));
const DATABASES = categories
  .map((c) => ({ env: "NOTION_DB_" + String(c.slug).toUpperCase(), category: c.slug }))
  .filter((entry) => {
    if (!process.env[entry.env]) {
      console.warn(`○ skip category "${entry.category}" (${entry.env} not set)`);
      return false;
    }
    return true;
  });

const token = process.env.NOTION_TOKEN;
if (!token) {
  console.error("✗ NOTION_TOKEN missing. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const notion = new Client({ auth: token });

const SIMPLE_PROP_TYPES = new Set([
  "title", "rich_text", "select", "status", "multi_select", "number",
  "checkbox", "date", "url", "email", "phone_number",
  "created_time", "last_edited_time",
]);

function slugify(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function esc(s) {
  return '"' + String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ") + '"';
}
function plain(list) {
  return (list ?? []).map((t) => t.plain_text).join("");
}
function titleOf(page) {
  const props = page?.properties || {};
  const titleProp = Object.values(props).find((p) => p && p.type === "title");
  if (titleProp) return plain(titleProp.title);
  if (page.child_page?.title) return page.child_page.title;
  return "untitled";
}
function computeSlug(page) {
  const p = page.properties || {};
  return slugify(plain(p.Slug?.rich_text) || titleOf(page));
}
function descriptionOf(page) {
  return plain(page?.properties?.Description?.rich_text);
}
function tagsOf(page) {
  return (page?.properties?.Tags?.multi_select ?? []).map((t) => t.name);
}
function langOf(page) {
  const raw = page.properties?.Language?.select?.name || "en";
  return String(raw).toLowerCase().replace(/[^a-z0-9]/g, "") || "en";
}
function cellText(prop, type) {
  if (!prop) return "";
  switch (type) {
    case "title": return plain(prop.title);
    case "rich_text": return plain(prop.rich_text);
    case "select": return prop.select?.name ?? "";
    case "status": return prop.status?.name ?? "";
    case "multi_select": return (prop.multi_select ?? []).map((s) => s.name).join(", ");
    case "number": return prop.number != null ? String(prop.number) : "";
    case "checkbox": return prop.checkbox ? "✓" : "";
    case "date": return prop.date?.start ?? "";
    case "url": return prop.url ?? "";
    case "email": return prop.email ?? "";
    case "phone_number": return prop.phone_number ?? "";
    case "created_time": return prop.created_time ?? "";
    case "last_edited_time": return prop.last_edited_time ?? "";
    default: return "";
  }
}
function markdownTable(rows) {
  if (!rows.length) return "";
  const escape = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
  const header = rows[0].map(escape);
  const sep = header.map(() => "---");
  const body = rows.slice(1).map((r) => r.map(escape));
  return ["|" + header.join(" | ") + " |",
          "|" + sep.join(" | ") + " |",
          ...body.map((r) => "|" + r.join(" | ") + " |")].join("\n");
}

function isNotionManaged(filepath) {
  try {
    const content = readFileSync(filepath, "utf8");
    const parts = content.split("---\n", 3);
    if (parts.length < 3) return false;
    return /^source:\s*notion\s*$/m.test(parts[1]);
  } catch {
    return false;
  }
}

async function getAllBlocks(blockId) {
  const out = [];
  let cursor;
  do {
    const res = await notionCall("blocks.list", () =>
      notion.blocks.children.list({
        block_id: blockId, start_cursor: cursor, page_size: 100,
      })
    );
    out.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}
async function queryDatabase(dbId) {
  const out = [];
  let cursor;
  do {
    const res = await notionCall("databases.query", () =>
      notion.databases.query({ database_id: dbId, start_cursor: cursor, page_size: 100 })
    );
    out.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}
async function queryPublished(dbId) {
  const out = [];
  let cursor;
  do {
    const res = await notionCall("databases.query", () =>
      notion.databases.query({
        database_id: dbId,
        filter: { property: "Status", select: { equals: "Published" } },
        start_cursor: cursor,
      })
    );
    out.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

// pageIdToMeta: { [id]: { slug, path, title } } — global map for link rewriting.
const pageIdToMeta = {};
const stats = { added: 0, updated: 0, unchanged: 0, skipped: 0, deleted: 0, relocated: 0, dirs: 0 };
const currentPageIds = new Set();
const existingById = {};
const seenPaths = new Set();
const visited = new Set();
const topLevelIds = new Set();

// parseChildPages:false → notion-to-md skips child_page blocks (we handle them
// manually in the segment walk to avoid content duplication). child_database is
// unaffected and goes through its customTransformer.
const n2m = new NotionToMarkdown({
  notionClient: notion,
  config: { parseChildPages: false },
});

// Render a Notion database as a markdown table. Title column links to each
// row's nested page (rows are recursed separately in walk()).
async function renderDatabaseTable(dbId, title) {
  try {
    const dbMeta = await notionCall("databases.retrieve", () =>
      notion.databases.retrieve({ database_id: dbId })
    );
    const rows = await queryDatabase(dbId);
    const cols = Object.entries(dbMeta.properties).filter(([, p]) => SIMPLE_PROP_TYPES.has(p.type));
    console.log(`  … db "${title}" ${dbId}: cols=${cols.length} rows=${rows.length}`);
    if (!cols.length || !rows.length) {
      const label = rows.length ? `${rows.length} rows (no simple columns)` : "empty";
      return `[${title}](https://www.notion.so/${dbId}) — _${label}_`;
    }
    const header = cols.map(([k]) => k);
    const dataRows = rows.map((row) =>
      cols.map(([k, p]) => {
        const val = cellText(row.properties[k], p.type);
        if (p.type === "title") {
          const meta = pageIdToMeta[row.id];
          if (meta) return `[${val}](/articles/${meta.path}/)`;
        }
        return val;
      })
    );
    return `**${title}**\n\n` + markdownTable([header, ...dataRows]);
  } catch (e) {
    return `_${title}_ (database: ${e.message})`;
  }
}
async function childDatabaseToMd(block) {
  const title = block.child_database?.title || "database";
  const meta = pageIdToMeta[block.id];
  if (meta) {
    return `[${String(title).replace(/[\[\]]/g, "")}](/articles/${meta.path}/)`;
  }
  return renderDatabaseTable(block.id, title);
}
// link_to_page covers references to EXISTING pages/databases (vs child_page/
// child_database which are inline-created). Page → link to nested page;
// database → table via renderDatabaseTable.
async function linkToPageToMd(block) {
  const ref = block.link_to_page || {};
  if (ref.type === "page_id" && ref.page_id) {
    const meta = pageIdToMeta[ref.page_id];
    const title = String(meta?.title || "page").replace(/[\[\]]/g, "");
    const url = meta ? `/articles/${meta.path}/` : `https://www.notion.so/${ref.page_id}`;
    return `[${title}](${url})`;
  }
  if (ref.type === "database_id" && ref.database_id) {
    let title = "database";
    try {
      const m = await notionCall("databases.retrieve", () =>
        notion.databases.retrieve({ database_id: ref.database_id })
      );
      title = (m.title || []).map((t) => t.plain_text).join("") || title;
    } catch (e) {}
    return renderDatabaseTable(ref.database_id, title);
  }
  return "";
}
n2m.setCustomTransformer("child_database", childDatabaseToMd);
n2m.setCustomTransformer("link_to_page", linkToPageToMd);

// PASS 1: recursively collect every page under published top-level articles.
async function collectTree() {
  const all = [];
  const topLevel = [];
  // Phase A: pre-register top-level page ids (topLevelIds prevents nested
  // references from claiming a sibling top-level page) and gather pages.
  // Headers are printed in Phase B so each `===` appears with its content.
  for (const { env, category } of DATABASES) {
    const id = process.env[env];
    if (!id) continue;
    const topPages = await queryPublished(id);
    for (const page of topPages) {
      topLevelIds.add(page.id);
      topLevel.push({ page, category, lang: langOf(page) });
    }
  }
  // Phase B: walk grouped by category. Headers are NOT printed here — they
  // print in Pass 2 (render) so `✓` lines group correctly under each header.
  // Pass 1 diagnostics (`…`) flow without headers to avoid misleading output.
  const byCategory = new Map();
  for (const item of topLevel) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category).push(item);
  }
  for (const [category, items] of byCategory) {
    for (const { page, lang } of items) {
      await walk(page, null, category, lang, 0, all);
    }
  }
  return all;
}

async function walk(page, parentPath, category, lang, depth, all, parentTitle) {
  if (visited.has(page.id)) {
    console.warn(`  ○ skip (already synced, link will point to first path): ${page.id}`);
    return;
  }
  visited.add(page.id);
  currentPageIds.add(page.id);
  const slug = computeSlug(page);
  const path = parentPath ? `${parentPath}/${slug}` : slug;
  const title = titleOf(page);

  if (!slug || RESERVED_SLUGS.has(slug)) {
    console.warn(`  ✗ skip (invalid/reserved slug): ${page.id}`);
    stats.skipped++;
    return;
  }
  if (seenPaths.has(path)) {
    console.warn(`  ✗ skip (duplicate path): ${path}`);
    stats.skipped++;
    return;
  }
  seenPaths.add(path);
  pageIdToMeta[page.id] = { slug, path, title };

  let blocks = [];
  try {
    blocks = await getAllBlocks(page.id);
  } catch (e) {
    console.warn(`  ✗ blocks fetch failed ${path}: ${e.message}`);
  }
  all.push({ page, slug, path, title, category, lang, depth, blocks, parentPath, parentTitle: parentPath ? parentTitle : null });

  if (depth >= MAX_DEPTH) {
    console.warn(`  ! max depth reached at ${path}`);
    return;
  }

  const refTypes = new Set(["child_page", "child_database", "link_to_page"]);
  const refs = blocks.filter((b) => refTypes.has(b.type));
  if (refs.length) {
    const counts = {};
    refs.forEach((b) => { counts[b.type] = (counts[b.type] || 0) + 1; });
    console.log(`  … ${path}: ${Object.entries(counts).map(([t, c]) => `${t}×${c}`).join(", ")}`);
  }

  for (const b of blocks) {
    if (b.type === "child_page") {
      if (!b.id) { console.warn(`  ✗ child_page missing id at ${path}`); continue; }
      if (topLevelIds.has(b.id)) { console.warn(`  ○ top-level page, skip recurse: ${b.id}`); continue; }
      try {
        const childPage = await notionCall("pages.retrieve", () =>
          notion.pages.retrieve({ page_id: b.id })
        );
        await walk(childPage, path, category, lang, depth + 1, all, title);
      } catch (e) {
        console.warn(`  ✗ child_page recurse failed ${path}/${b.id}: ${e.message}`);
      }
    } else if (b.type === "child_database") {
      if (!b.id) { console.warn(`  ✗ child_database missing id at ${path}`); continue; }
      const dbTitle = b.child_database?.title || "database";
      let inline = null, how = "?";
      try {
        const db = await notionCall("databases.retrieve", () =>
          notion.databases.retrieve({ database_id: b.id })
        );
        if (typeof db.is_inline === "boolean") {
          inline = db.is_inline;
          how = `db.is_inline=${db.is_inline}`;
        } else {
          try {
            await notionCall("pages.retrieve", () =>
              notion.pages.retrieve({ page_id: b.id })
            );
            inline = false;
            how = "pages.retrieve OK → full-page";
          } catch {
            inline = true;
            how = "pages.retrieve fail → inline";
          }
        }
      } catch (e) {
        console.warn(`  ✗ skip db "${dbTitle}" ${b.id}: unreachable (${e.message})`);
        continue;
      }
      console.log(`  … db "${dbTitle}" ${b.id}: ${how}`);
      try {
        if (inline) {
          const rows = await queryDatabase(b.id);
          for (const row of rows) {
            await walk(row, path, category, lang, depth + 1, all, title);
          }
        } else {
          if (visited.has(b.id)) { console.warn(`  ○ db already synced: ${b.id}`); continue; }
          visited.add(b.id);
          const dbSlug = slugify(dbTitle);
          const dbPath = `${path}/${dbSlug}`;
          pageIdToMeta[b.id] = { slug: dbSlug, path: dbPath, title: dbTitle };
          currentPageIds.add(b.id);
          all.push({ page: null, slug: dbSlug, path: dbPath, title: dbTitle, category, lang, depth: depth + 1, blocks: [], isDatabase: true, dbId: b.id, parentPath: path, parentTitle: title });
          const rows = await queryDatabase(b.id);
          for (const row of rows) {
            await walk(row, dbPath, category, lang, depth + 2, all, dbTitle);
          }
        }
      } catch (e) {
        console.warn(`  ✗ child_database recurse failed ${path}/${b.id}: ${e.message}`);
      }
    } else if (b.type === "link_to_page") {
      const ref = b.link_to_page || {};
      const targetId = ref.page_id || ref.database_id;
      if (!targetId) { console.warn(`  ✗ link_to_page missing target at ${path}`); continue; }
      try {
        if (ref.type === "page_id") {
          if (topLevelIds.has(ref.page_id)) { console.warn(`  ○ top-level page, skip recurse: ${ref.page_id}`); continue; }
          const childPage = await notionCall("pages.retrieve", () =>
            notion.pages.retrieve({ page_id: ref.page_id })
          );
          await walk(childPage, path, category, lang, depth + 1, all, title);
        } else if (ref.type === "database_id") {
          const rows = await queryDatabase(ref.database_id);
          for (const row of rows) {
            await walk(row, path, category, lang, depth + 1, all, title);
          }
        }
      } catch (e) {
        console.warn(`  ✗ link_to_page recurse failed ${path}/${targetId}: ${e.message}`);
      }
    }
  }
}

function renderChildPageLink(block) {
  const title = String(block.child_page?.title || "page").replace(/[\[\]]/g, "");
  const meta = pageIdToMeta[block.id];
  const url = meta ? `/articles/${meta.path}/` : `https://www.notion.so/${block.id}`;
  return `> [${title}](${url})\n{: .child-page-link}`;
}

async function renderBlocks(segment) {
  if (!segment.length) return "";
  const mdBlocks = await n2m.blocksToMarkdown(segment);
  const mdStr = n2m.toMarkdownString(mdBlocks);
  return mdStr.parent || "";
}

function rewriteInternalLinks(body) {
  let out = body;
  for (const [pageId, meta] of Object.entries(pageIdToMeta)) {
    const re = new RegExp(`\\[([^\\]]*)\\]\\(https?://(?:www\\.)?notion\\.so/[^\\)]*${pageId}\\)`, "g");
    out = out.replace(re, (_, text) => {
      const t = !text || text === "link_to_page" ? meta.title : text;
      return `[${String(t).replace(/[\[\]]/g, "")}](/articles/${meta.path}/)`;
    });
  }
  return out;
}

// PASS 2: render each page (segment-walk for child_page, n2m for the rest,
// link rewrite at the end) and write to _articles/notion/<path>.md.
async function renderAndWrite(item) {
  const { page, slug, path, title, category, lang, depth, blocks, isDatabase, dbId } = item;

  const notionId = page?.id || dbId || "";
  const lastEdited = page?.last_edited_time || "";

  // Stale-location: if a prior file with the same notion_id exists at a
  // different path (slug renamed), delete the old file before writing new.
  if (notionId && existingById[notionId] && existingById[notionId].path && existingById[notionId].path !== path) {
    try {
      unlinkSync(existingById[notionId].filepath);
      stats.relocated++;
      console.log(`  ↻ relocated ${existingById[notionId].path} → ${path}`);
    } catch (e) {
      console.warn(`  ✗ stale-location delete failed: ${e.message}`);
    }
  }

  // Incremental: skip rendering if page unchanged (same notion_id + lastEdited).
  if (notionId && existingById[notionId] && existingById[notionId].lastEdited === lastEdited && existingById[notionId].lastEdited && existingById[notionId].filepath) {
    stats.unchanged++;
    console.log(`  = ${path}`);
    return;
  }

  let body;
  if (isDatabase) {
    body = (await renderDatabaseTable(dbId, title)).trimEnd();
  } else {
    body = "";
    let segment = [];
    for (const b of blocks) {
      if (b.type === "child_page") {
        if (segment.length) {
          body += (await renderBlocks(segment)) + "\n\n";
          segment = [];
        }
        body += renderChildPageLink(b) + "\n\n";
      } else {
        segment.push(b);
      }
    }
    if (segment.length) body += (await renderBlocks(segment)) + "\n\n";
    body = body.trimEnd();
  }
  body = rewriteInternalLinks(body);

  const nested = depth > 0;
  const frontmatter = [
    "---",
    `name: ${slug}`,
    `title: ${esc(title)}`,
    `description: ${esc(descriptionOf(page))}`,
    `tags: [${tagsOf(page).map(esc).join(", ")}]`,
    `category: ${category}`,
    `lang: ${lang}`,
    `permalink: /articles/${path}/`,
    `notion_id: ${notionId}`,
    `last_edited: ${lastEdited}`,
    nested ? "nested: true" : null,
    nested && item.parentPath ? `parent_url: /articles/${item.parentPath}/` : null,
    nested && item.parentTitle ? `parent_title: ${esc(item.parentTitle)}` : null,
    "excerpt_separator: <!-- end_excerpt -->",
    "source: notion",
    "---",
    "",
  ].filter((l) => l !== null).join("\n");
  // Wrap body in {% raw %} so any Liquid syntax ({{ }}) in Notion content is
  // not evaluated by Jekyll. Mitigates V1 (Liquid injection).
  const content = frontmatter + "{% raw %}\n" + body + "\n{% endraw %}\n";

  const filepath = join(ARTICLES_DIR, "notion", ...path.split("/")) + ".md";
  mkdirSync(dirname(filepath), { recursive: true });

  if (existsSync(filepath)) {
    if (readFileSync(filepath, "utf8") === content) stats.unchanged++;
    else {
      stats.updated++;
      writeFileSync(filepath, content, "utf8");
    }
  } else {
    stats.added++;
    writeFileSync(filepath, content, "utf8");
  }
  console.log(`  ✓ [${category}/${lang}] ${path}`);
}

// ID-based orphan cleanup: delete any notion-managed file whose notion_id
// is NOT in the current sync's page set. Robust to slug changes (handled
// separately by stale-location detection in renderAndWrite).
function deleteOrphans() {
  for (const [id, info] of Object.entries(existingById)) {
    if (currentPageIds.has(id)) continue;
    const rel = relative(ARTICLES_DIR, info.filepath).replace(/\\/g, "/");
    try {
      unlinkSync(info.filepath);
      stats.deleted++;
      console.log(`  − orphan (id: ${id}) ${rel}`);
    } catch (e) {
      console.warn(`  ✗ delete failed ${rel}: ${e.message}`);
    }
  }
  // prune empty directories left behind
  function prune(dir) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) {
        const sub = join(dir, e.name);
        prune(sub);
        try {
          if (readdirSync(sub).length === 0) {
            rmSync(sub, { recursive: true });
            stats.dirs++;
          }
        } catch {}
      }
    }
  }
  prune(ARTICLES_DIR);
}

// Scan existing notion-managed markdown files to build existingById map.
// Used for ID-based orphan detection, stale-location detection, and the
// incremental-skip optimization (skip render if last_edited unchanged).
function scanExisting() {
  function walk(dir) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".md") && isNotionManaged(full)) {
        const fm = readFileSync(full, "utf8").split("---\n", 3)[1] || "";
        const idMatch = fm.match(/^notion_id:\s*(.+)$/m);
        if (!idMatch) continue;
        const id = idMatch[1].trim();
        const editedMatch = fm.match(/^last_edited:\s*(.+)$/m);
        const pathMatch = fm.match(/^permalink:\s*\/articles\/(.+)\/\s*$/m);
        existingById[id] = {
          filepath: full,
          lastEdited: editedMatch ? editedMatch[1].trim() : "",
          path: pathMatch ? pathMatch[1] : null,
        };
      }
    }
  }
  walk(ARTICLES_DIR);
}

(async () => {
  mkdirSync(ARTICLES_DIR, { recursive: true });

  // Pass 0: scan existing notion-managed files to build existingById
  // (→ enables ID-based orphan detection, stale-location detection, and
  // incremental sync via last_edited comparison).
  scanExisting();

  const all = await collectTree();

  // Pass 2: render + write, grouped by category so `✓` lines appear under
  // the matching `=== category ===` header. `all` is already in walk order
  // (which followed category grouping in collectTree).
  let lastCategory = null;
  for (const item of all) {
    if (item.category !== lastCategory) {
      console.log(`\n=== ${item.category} ===`);
      lastCategory = item.category;
    }
    try {
      await renderAndWrite(item);
    } catch (e) {
      console.error(`  ✗ render failed ${item.path || item.page.id}: ${e.message}`);
    }
  }

  deleteOrphans();

  console.log(
    `\n=== done: +${stats.added} ~${stats.updated} =${stats.unchanged} ↻${stats.relocated} -${stats.deleted} (skipped ${stats.skipped}, dirs ${stats.dirs}) ===`
  );
})();
