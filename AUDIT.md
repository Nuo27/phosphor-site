# Phosphor — Audit & Fix Record

> **Status:** Implemented (both `phosphor-site` and `Nuo27.github.io`).
> **Scope:** Correctness bugs + missing SEO/feed/sitemap baseline. Refactors, perf, tokens, abstractions — out of scope.

---

## Baseline — untouched

Working and not under review: front-matter-driven pages, two-layer token system, PJAX router, custom cursor, modular SCSS, config-driven nav, image `loading`/`aspect-ratio` basics. `main.js` (1114L) stays as-is — split is pure refactor with PJAX regression risk.

---

## Fixes shipped

### 1. baseurl-bypass hrefs → `relative_url`
Five hardcoded `href="/..."` broke on any non-empty `baseurl` deploy (which README instructs) → 404.

`_includes/landing/stream.html:52,53` · `_layouts/article.html:14,55` · `_layouts/project.html:109`.

### 2. SEO meta (absolute + missing tags)
`_config.yml` had no `url:` (every absolute address depended on it) → added.
`_includes/head.html`:
- `og:image` / `og:url` → `absolute_url + xml_escape` (relative → blank social previews).
- `<link rel="canonical">` (duplicate-content prevention).
- `twitter:card=summary_large_image` + title/description/image.

### 3. Sitemap + RSS
- **Sitemap:** `jekyll-sitemap` plugin (Gemfile `:jekyll_plugins` + `_config.yml plugins:`) → auto `/sitemap.xml`.
- **RSS:** hand-written `feed.xml` (root) — **not** `jekyll-feed`. `jekyll-feed` can't filter by front matter, so nested child pages (Notion-synced sub-pages, `nested: true`) leaked into the feed. The custom template filters them. `head.html` advertises it via a hand-written `<link rel="alternate" ... href="/feed.xml">` (not `{% feed_meta %}`).
- `robots.txt` (root, Liquid) → `Sitemap:` line.
- Skipped `jekyll-seo-tag` (OG hand-rolled; plugin would rewrite `<title>` logic + front-matter contract).

### 4. Homepage stream excludes nested articles
`_includes/landing/stream.html` article loop now `{% if a.nested %}{% continue %}{% endif %}` — matches the existing filter in `_includes/articles/index.html`. Nested child pages no longer appear in the random-work pool. Projects unchanged (no nested concept).

---

## Verify
`bundle exec jekyll build` clean → `_site/feed.xml` + `_site/sitemap.xml` present, `_site/feed/articles.xml` absent → feed titles are top-level only (no `inside-page` / child slugs) → homepage `index.html` contains no nested slugs → share URL in a card validator → image renders.

<!-- End. -->
