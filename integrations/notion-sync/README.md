# notion-sync

Syncs published pages from Notion databases into `_articles/notion/<path>.md`,
ready for the Jekyll build. This integration is **opt-in** — the site builds
fine without it.

## Quick start (local)

```powershell
cd integrations/notion-sync
npm install
# Copy .env.example (in this directory) to .env and fill in real values.
cd ../..
node --env-file=integrations/notion-sync/.env integrations/notion-sync/index.js
```

You should see categories queried, pages walked recursively, and `.md` files
written under `_articles/notion/`. Run `bundle exec jekyll serve` to preview.

## Prerequisites: Notion setup

1. **Create an internal integration** at https://www.notion.so/profile/integrations.
   - Capabilities: Read content + Read user info without user identity.
   - Copy the token (`ntn_…`) → this is `NOTION_TOKEN`.
2. **Create one database per category** (e.g. *Tech*, *Notes*, *Games*).
   Each database row becomes a top-level article. Required columns:
   - `Title` (Title)
   - `Slug` (Rich text, optional — falls back to slugified title)
   - `Status` (Select with options `Published`, `Draft`)
   - `Description`, `Tags`, `Language` — optional, used for frontmatter
3. **Share each top-level database** with the integration (database → ⋯ menu
   → Connections → add your integration).
4. **Share every embedded child database** too — child blocks of type
   `child_database` and linked `link_to_page → database_id` each need their own
   share, otherwise the sync will skip them ("unreachable").
5. Copy each database's 32-char ID from its URL (the part before `?v=…`).

## Environment variables

Loaded from `.env` inside this directory (local) or GitHub Secrets (CI).

| Variable | Required | Example | Notes |
|---|---|---|---|
| `NOTION_TOKEN` | yes | `ntn_…` | Integration secret. Hard error if missing. |
| `NOTION_DB_<CATEGORY>` | per category | `3aa94892d49f…` | One per category in `_data/categories.yml`. The suffix is the CATEGORY slug in UPPER_SNAKE. Env-var unset → category is skipped (warned). |

`categories.yml` is the single source of truth for category slugs. The script
derives the env-var name from each slug automatically.

### Adding a new category

1. **Append** an entry to `_data/categories.yml`:
   ```yaml
   - slug: ai
     name: AI
     eyebrow: "// CHANNEL_AI"
     tagline: "AI writeups and experiments."
   ```
2. **Create** the Notion database with the standard columns (Title/Slug/Status/Description/Tags/Language).
3. **Share** the database with the integration.
4. **Add a GitHub Secret** named `NOTION_DB_AI` whose value is the database ID.
5. **Add `NOTION_DB_AI=<id>` to your local `.env`**.
6. Push the yml change → CI picks up the new category next run.

## Output structure

```
_articles/notion/
  <slug>.md                          ← top-level article (Status=Published)
  <slug>/<child-slug>.md             ← child_page nested page
  <slug>/<child-slug>/<row>.md      ← database row
  <slug>/<db-slug>/<row>.md         ← full-page database row
```

Every file has explicit `permalink: /articles/<path>/` and the
**ID-based tracking fields** in frontmatter:

```yaml
---
name: notion-link-test
title: "Notion Link test"
permalink: /articles/notion-link-test/
notion_id: 3aa94892d49f80fa9840df349ea57250   # Notion page UUID
last_edited: 2026-07-27T18:59:00.000Z          # page.last_edited_time
excerpt_separator: <!-- end_excerpt -->         # suppress Jekyll excerpt warnings
source: notion
---
```

Sub-pages carry `nested: true` and are excluded from the `/articles/` listing, the home stream, and the RSS feed.
The body is wrapped in `{% raw %}…{% endraw %}` so any Liquid syntax
(`{{ }}`, `{% %}`) in Notion content is not evaluated by Jekyll.

## Diagnostics

The script prints a compact diagnostic per interesting page:

```
… notion-link-test: child_page×1, link_to_page×1
… notion-link-test/inside-page: child_database×2
… db "inline database" …: db.is_inline=true
… db "page database"   …: db.is_inline=false
○ skip (already synced, link will point to first path): <id>
○ top-level page, skip recurse: <id>
○ db already synced: <id>
✗ skip db "x" <id>: unreachable (<err>)
= notion-link-test/inside-page/123         ← unchanged (last_edited same)
✓ [tech/en] notion-link-test/inside-page
↻ relocated notion-link-test → test-note     ← slug renamed, old path deleted
− orphan (id: <id>) notion-link-test/test.md ← unpublished / page deleted
```

If you see `✗ skip db … unreachable`, the integration can't see that database
— go to Notion → ⋯ → Connections and add it.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `✗ NOTION_TOKEN missing` | `.env` not set or wrong path | `cp .env.example .env` and fill. Run from **repo root** with `--env-file=integrations/notion-sync/.env`. |
| `○ skip category "tech" (NOTION_DB_TECH not set)` | env-var name mismatch | Env-var name is `NOTION_DB_<SLUG_UPPER>`. Check `_data/categories.yml` slug matches. |
| `✗ child_page recurse failed … validation_error` | API called with bare id instead of `{page_id: …}` | Bug — report it. The script uses object args. |
| `✗ skip db … unreachable` | DB not shared with integration | Share the DB → ⋯ → Connections. Works recursively for nested DBs. |
| `✗ … path.page_id should be a valid uuid, instead was "undefined"` | Bare id passed to SDK | Bug — report. Should not happen after rate-limit rewrite. |
| Cron doesn't fire | Workflow's `schedule` runs only on the repo **default** branch | Ensure `dev` is the default branch (Settings → Branches), or mirror the workflow to whichever branch is default. |
| `node` throws "Cannot find package '@notionhq/client'" | `node_modules` was cleaned (e.g. branch switch) | `cd integrations/notion-sync && npm install && cd ../..` |
| `Excerpt modified in <file>! Found a Liquid block containing …` during build | Stale notion files (pre-excerpt_separator) missing the field | Re-run sync — the script writes `excerpt_separator: <!-- end_excerpt -->` to all files |
| Images broken after an hour | Notion S3 URLs expire | Known accepted trade-off. Future: download to `assets/articles/<slug>/` (not implemented). |
| `dirs N > 0` in stats | Orphan cleanup removed empty directories after deletes | Normal. |
| Old file `test.md` survives re-sync | File was generated before ID tracking — no `notion_id` in frontmatter, sync can't identify it | `git rm _articles/notion/test.md` (one-time cleanup) |

## Implementation notes

- **Three-phase sync**:
  - *Pass 0 (`scanExisting`)*: walk `_articles/notion/**/*.md`, parse frontmatter, build
    `existingById = { notion_id → { filepath, lastEdited, path } }`. Enables ID-based
    tracking without a separate index file.
  - *Pass 1 (`collectTree`)*: pre-register all top-level page ids in `topLevelIds`
    so nested `link_to_page` references to them resolve to the top-level path
    (no duplicate nested copies). Recursively walk `child_page` / `link_to_page`
    / `child_database` blocks. Each visited page's id is added to `currentPageIds`.
  - *Pass 2 (`renderAndWrite`)*: render + write per page, grouped by category.

- **ID-based page identity (`notion_id` + `last_edited`)**: every generated file
  stores `notion_id: <page.id>` and `last_edited: <page.last_edited_time>` in
  frontmatter. This makes the file track the *Notion page*, not the disk path —
  so renaming a slug moves the file to the new path cleanly (stale-location
  detection deletes the old file at the old path). It also enables the
  incremental-skip optimization: if `existingById[id].lastEdited === last_edited`,
  the page is unchanged and we skip rendering entirely (just register the path
  for link rewriting). For personal sites this is small; for a workspace with
  hundreds of pages it is significant.

- **Recursive walk** with `visited` set for cycle detection, `seenPaths` for
  duplicate-slug detection, `RESERVED_SLUGS` (category slugs) to prevent URL
  collisions.

- **Inline vs full-page databases** distinguished via `db.is_inline` from
  `databases.retrieve`. Fallback: `pages.retrieve` probe (full-page DBs are
  themselves pages). Unreachable DBs (unshared, throw on both) are skipped.
  Inline databases render as a table inside the parent body; full-page
  databases become their own nested page with the rows hanging off it.

- **Internal link rewriting**: `pageIdToMeta` (built during walk) maps every
  page id → its path. A post-process regex replaces `notion.so/<id>` markdown
  links with `/articles/<path>/` and fills empty/ugly text with the title.

- **Stale-location detection** (slug-rename): when writing a page, if
  `existingById[id]` exists at a different `path` (e.g. user changed the
  Notion `Slug` property), the old file is deleted before the new file is
  written. `stats.relocated` increments.

- **ID-based orphan cleanup**: after all pages are rendered, any file in
  `existingById` whose `notion_id` is NOT in `currentPageIds` is deleted
  (page unpublished, deleted, or moved out of the synced DBs). Robust to
  `git` restoring old files — the next sync will remove them again.

- **Liquid raw wrapping** (`{% raw %}…{% endraw %}`): every generated file
  wraps the body so any Liquid syntax (`{{ }}`, `{% %}`) in Notion content
  is *not* evaluated by Jekyll. Mitigates Liquid injection from a Notion
  author with a typo or a malicious editor. Edge case: if a body literally
  contains the string `{% endraw %}`, the wrap breaks. For a personal site
  this is acceptable.

- **`excerpt_separator`**: each generated file sets a custom
  `excerpt_separator: <!-- end_excerpt -->` to suppress Jekyll's auto-excerpt
  warnings about Liquid blocks containing the default `\n\n` separator.

- **`esc()`** escapes `\\`, `"`, and `\n` so multi-line titles/descriptions
  don't break frontmatter YAML.

- **Rate limiting**: `p-limit(3)` caps concurrency at 3 (matches Notion's
  ~3 req/s budget). Retries on 429 / 5xx with exponential backoff, honouring
  `Retry-After`. All Notion API calls go through `notionCall(label, fn)`.

- **Branch model**: single `dev` branch. The workflow lives at
  `.github/workflows/jekyll.yml` and runs on push to `dev` and on `schedule`.
  The Notion sync steps are gated by `vars.ENABLE_NOTION_SYNC == 'true'`, so
  the `schedule` trigger is a no-op for forks that haven't opted in.