# Phosphor Site — Template Extraction Plan

> **Purpose:** Carry this document to the new `phosphor-site` repo. A fresh agent session can read it and execute the full template extraction without prior context.
>
> **Source repo:** `Nuo27/Nuo27.github.io` (branch `dev`, commit `6f5e483`)
> **Target repo:** `Nuo27/phosphor-site` (new, public)
> **License:** MIT

---

## 1. What This Is

`phosphor-site` is an open-source Jekyll personal site template extracted from a production portfolio. It features:

- **Tactical telemetry aesthetic** — phosphor-green-on-void-dark HUD UI with CRT grain, scan lines, editorial magazine layout
- **Custom cursor** — inverted triangle + blend-difference ring + aurora, with velocity-based tilt/scale/trail
- **PJAX soft router** — `fetch()` + DOMParser swaps only `<main>`, shell (cursor/navbar/footer/atmosphere) lives for the tab lifetime; View Transitions API cross-fade
- **Token-driven design system** — two-layer (`_sass/_variables.scss` compile-time + `_sass/_tokens.scss` runtime CSS custom properties), auto-theme via `[data-theme]`
- **Front-matter-driven pages** — content lives in YAML front matter, not in HTML; layouts compose sections via `{% if page.X %}` guards (omit a key → section doesn't render)
- **Portfolio + blog collections** — projects (`/portfolio/`) and articles (`/articles/`) with tag/category filtering, search, visibility toggles
- **Animation systems** — WAAPI border-trace on cards, scroll-reveal (IntersectionObserver), typewriter, glitch burst, parallax, magnetic buttons, galleries/lightbox, random work stream
- **Optional Notion CMS** — sync Notion databases → Markdown files at build time (moved to `integrations/`, opt-in)

---

## 2. Current State (Post-Optimization)

The source repo has already been optimized for templatability. The following work is DONE (commit `6f5e483` on `dev` and `deploy` branches):

### Completed optimizations

| Done | What |
|---|---|
| ✅ | Inline `<style>` in `_layouts/project.html` (560 lines) → `_sass/_project-detail.scss` |
| ✅ | Inline cursor controller in `_includes/head.html` (430 lines) → `_sass/_cursor.scss` + `assets/js/cursor.js` |
| ✅ | jQuery + Bootstrap JS removed; navbar collapse rewritten in vanilla JS (~25 lines in `main.js`) |
| ✅ | 4 hardcoded personal strings decoupled to config (`site.title`, `site.portfolio.subtitle`, `site.portfolio.accent_tag`) |
| ✅ | Orphaned `assets/avatar_set/` deleted (7 files, zero source references) |
| ✅ | `_includes/scripts.html` deleted (jQuery/Bootstrap loader) |
| ✅ | `notion-as-cms.md` de-personalized (first-person → impersonal) |
| ✅ | Cursor scrollbar drag tracking (delta-based, follows thumb without freezing) |
| ✅ | Bootstrap CSS retained (layout utilities used in ~50+ places; full removal is a separate future effort) |

### What still needs doing (this plan)

- Strip all personal content (name, photo, projects, articles, social links)
- Create example/placeholder content
- Move Notion sync to optional integration
- Write README + LICENSE
- Simplify CI workflow for single-branch template use
- Config cleanup with placeholder values + comments

---

## 3. Architecture Reference

### File structure (what to copy)

```
_config.yml              # Site config — STRIP personal values
Gemfile / Gemfile.lock   # Jekyll 4.3 — copy as-is
.github/workflows/
  jekyll.yml             # CI — SIMPLIFY (single branch, conditional Notion)
_scripts/notion-sync/    # → MOVE to integrations/notion-sync/
_articles/
  notion-as-cms.md       # DELETE (personal)
  unity-vs-unreal.md     # DELETE
  rebuilding-the-portfolio.md  # DELETE
  leading-a-game-team.md # DELETE
  design-philosophy.md   # DELETE
  markdown-reference.md  # KEEP (style demo, no personal content)
  notion/**              # DELETE (all test sync output)
_projects/
  _TEMPLATE.md           # KEEP (excellent scaffold)
  Shatter.md             # DELETE
  wistful.md             # DELETE
  thetragedyofpondiberrylodge.md  # DELETE
  Ascension to Immortal.md       # DELETE
  reservenow.md          # DELETE
  forzadrift.md          # DELETE
pages/
  index.md               # STRIP personal hero/stream/cta text
  about.md               # STRIP personal bio (keep 7-section schema)
  projects.md            # KEEP as-is (just includes projects/index.html)
  articles.md            # KEEP as-is
  404.html               # KEEP as-is
_includes/               # ALL KEEP — already parameterized, no personal content
  common/                # tag-chips, section-head, search, external-links
  landing/               # hero, stream, cta
  about/                 # 11 section includes (intro, currently, skills, etc.)
  projects/              # index (grid), project-card
  articles/              # index (list)
  stream/                # project-card, article-card
  elements/              # carousel, video
  head.html, navbar.html, footer.html, social.html, 404.html
_layouts/                # ALL KEEP
  default.html, home.html, about.html, project.html, article.html
_sass/                   # ALL KEEP — design system + components
  _variables.scss, _tokens.scss, _mixins.scss, _base.scss, _theme.scss
  _navbar.scss, _landing.scss, _projects.scss, _cards.scss, _detail.scss
  _project-detail.scss, _cursor.scss, _gallery.scss, _footer.scss
  _about.scss, _timeline.scss, _search.scss, _markdown.scss, _notfound.scss
assets/
  css/style.scss         # KEEP (SASS entry point)
  js/                    # ALL KEEP (theme.js, router.js, main.js, cursor.js)
  image/
    bio-photo.png        # DELETE (personal photo)
    projects/*.png       # DELETE (21 project screenshots)
    favicon.ico          # KEEP
_data/
  categories.yml         # KEEP (structural — article category definitions)
```

### Front-matter contracts

**`home` layout** (`pages/index.md`):
- `hero`: `{ eyebrow, skills[], cta_primary: {label,url}, cta_secondary: {label,url} }`
- `random_work`: `{ types[], count, hide: {tags[], categories[]} }`
- `stream`: `{ kicker, heading, labels{} }`
- `cta`: `{ kicker, heading, primary: {label,url}, secondary: {label,url} }`

**`about` layout** (`pages/about.md`):
7 sections, each `{ eyebrow, title, ... }`:
1. `intro`: `{ paragraphs: [{ text: "Markdown text" }] }`
2. `currently`: `{ items: [{ label, value }] }`
3. `skills`: `{ items: ["Skill 1", "Skill 2"] }`
4. `skills_detailed`: `{ programming: {title, items[]}, tools: {title, items[]}, web: {title, items[]} }`
5. `experience`: `{ items: [{ title, from, to, description }] }`
6. `education`: `{ items: [{ qualification, institution, from, to, description }] }`
7. `languages`: `{ note, items: [{ name, level }] }`
8. `contact`: `{ blurb }`

**`project` layout** (files in `_projects/`):
- `name`, `subtitle` (optional), `image`, `description`, `category`, `status`, `tags[]`, `external_links[]` (optional)

**`article` layout** (files in `_articles/`):
- `title`, `description`, `tags[]`, `category` (must match `_data/categories.yml` slug), `lang`

### Key design decisions (already made)

1. **Bootstrap CSS retained** — `container`/`row`/`col-lg-*`/flex utilities used in ~50+ template locations. Full removal touches every file; deferred to a separate effort.
2. **Notion sync is opt-in** — moved to `integrations/`, CI gated by `vars.ENABLE_NOTION_SYNC == 'true'`.
3. **Single `dev` branch** — no deploy/main dual-branch trick. Push → build → deploy. `dev` is the working/default branch for this template repo.
4. **Example content: 1 project + 1 article + `_TEMPLATE.md`** — fork-and-see-it-work approach.
5. **`_config.yml` stays monolithic** — Jekyll convention, no benefit to splitting.

---

## 4. Execution Plan

### Phase 1 · Repo setup + file copy

```bash
gh repo create Nuo27/phosphor-site --public \
  --description "Magazine-grade Jekyll personal site template with tactical telemetry aesthetics"

# Clone to sibling directory
cd C:\Users\nuo\Documents\GitHub
git clone https://github.com/Nuo27/phosphor-site.git
cd phosphor-site
```

Copy from source repo (exclude `.git/`, `_site/`, `.jekyll-cache/`, `.env`, `.claude/`, `scripts/notion-sync/node_modules/`):

```bash
# From the source repo root:
robocopy . ..\phosphor-site /E /XD .git _site .jekyll-cache .claude node_modules /XF .env
```

Then in `phosphor-site`:
```bash
git add -A
git status  # review what was copied
```

### Phase 2 · Delete personal content

```bash
# Personal projects (keep _TEMPLATE.md)
rm _projects/Shatter.md
rm _projects/wistful.md
rm _projects/thetragedyofpondiberrylodge.md
rm "_projects/Ascension to Immortal.md"
rm _projects/reservenow.md
rm _projects/forzadrift.md

# Personal articles (keep markdown-reference.md)
rm _articles/unity-vs-unreal.md
rm _articles/rebuilding-the-portfolio.md
rm _articles/leading-a-game-team.md
rm _articles/notion-as-cms.md
rm _articles/design-philosophy.md
rm -rf _articles/notion/

# Personal images
rm assets/image/bio-photo.png
rm assets/image/projects/*.png

# Personal docs
rm CONTENT-SUPPLEMENT.md

# Secrets (if copied)
rm -f .env
```

### Phase 3 · Create example content

**`_projects/example-project.md`** — neutral demo filling all front matter fields:

```markdown
---
name: Aurora
subtitle: A generative visual engine powered by WebGL shaders
image: /assets/image/projects/_placeholder.svg
description: Real-time procedural visuals driven by audio input — built to explore GPU shader composition at scale.
category: Web
status: "2024"
tags: [TypeScript, WebGL, Three.js, Shaders]
external_links:
  - { name: "Live Demo", url: "https://example.com", icon: "external-link-alt" }
  - { name: "Source", url: "https://github.com/example/aurora", icon: "github", prefix: "fab" }
---

## Role
Solo developer — architecture, shader pipeline, and audio analysis.

## Contributions
- Designed a modular shader graph supporting 40+ concurrent visual layers
- Built an FFT audio analyzer feeding 16 frequency bands into uniform inputs
- Implemented adaptive quality scaling for 60fps on mobile GPUs

## Technical Challenges
- **Shader compilation stutter** — Solved by pre-compiling all shader variants at load time and hot-swapping pipelines.
- **Audio latency** — Reduced from 120ms to 18ms via Web Audio API's AnalyserNode with a custom smoothing kernel.

## Lessons Learned
- GPU profiling early would have caught the fill-rate bottleneck before the final week.
- A data-driven shader graph (JSON config) beats hardcoded pipelines for iteration speed.
```

**`assets/image/projects/_placeholder.svg`** — reusable SVG placeholder:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0e0d"/>
      <stop offset="100%" stop-color="#0d1f1a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <text x="600" y="400" font-family="monospace" font-size="36" fill="#1a3d33"
        text-anchor="middle" dominant-baseline="middle" letter-spacing="4">
    1200 × 800
  </text>
  <rect x="20" y="20" width="1160" height="760" fill="none" stroke="#1a3d33"
        stroke-width="1" stroke-dasharray="8 4" rx="4"/>
</svg>
```

**Optional: `_articles/example-article.md`** — if you want a second article demonstrating article front matter (markdown-reference.md demonstrates prose styling but not article-specific front matter like tags/category).

### Phase 4 · Config cleanup

**`_config.yml`** — replace personal values with placeholders:

```yaml
### Site Settings ###
title               : Your Name
description         : >-
                      Your site description. Keep it to 1-2 sentences — appears in
                      the hero, footer, and SEO meta tags.
baseurl             : ""
repository          : your-username/phosphor-site


### Author Info ###
author:
  name              : Your Name
  image             : assets/image/bio-photo.png   # replace with your photo (800×800px)
  location          : Your City, Country


### Social Links ###
social:
  - name            : Email
    icon            : envelope
    url             : "mailto:you@example.com"
  - name            : GitHub
    icon            : github
    prefix          : fab
    url             : "https://github.com/your-username"
  - name            : LinkedIn
    icon            : linkedin-in
    prefix          : fab
    url             : "https://www.linkedin.com/in/your-username"


### Collections ###
collections:
  projects:
    output: true
    permalink: /portfolio/:name
  articles:
    output: true
    permalink: /articles/:name


### Defaults ###
defaults:
  - scope: { path: "", type: "projects" }
    values: { layout: "project" }
  - scope: { path: "", type: "articles" }
    values: { layout: "article" }


### Portfolio config ###
# accent_tag: tag name highlighted in accent color on cards/chips (e.g. "Open Source").
# hidden_*:   tags/categories collapsed behind the SHOW toggle on the portfolio grid.
# dimmed_*:   tags/categories shown but de-emphasized.
# Page front matter (pages/projects.md → portfolio:) overrides these per-field.
portfolio:
  subtitle: "Your portfolio tagline appears here."
  accent_tag: ""
  hidden_tags: []
  hidden_categories: []
  dimmed_tags: []
  dimmed_categories: []
  hidden_label: "hidden"
  filter_label: "FILTER"
  show_label: "SHOW"


### Exclude ###
exclude:
  - README.md
  - CONTRIBUTING.md
  - LICENSE
  - "*.log"
  - integrations/
```

**`pages/index.md`** — strip personal hero text:

```yaml
hero:
  eyebrow: "YOUR ROLE · YOUR LOCATION"
  skills: [Skill One, Skill Two, Skill Three]
  cta_primary: { label: "View Work", url: "/portfolio/" }
  cta_secondary: { label: "Get in Touch", url: "/about/#contact" }
# ... (stream/cta/cta sections: keep structure, generic text)
```

**`pages/about.md`** — keep 7-section schema, replace bio with placeholders. Each section: 1-2 example items with `[Your content here]` text. The schema structure is the documentation — users fill it in.

### Phase 5 · Notion → optional integration

```bash
mkdir -p integrations
mv scripts/notion-sync integrations/notion-sync
mv .env.example integrations/notion-sync/.env.example
rmdir scripts  # if empty after move

# Keep _articles/notion/ as empty target with instructions
mkdir -p _articles/notion
echo "# Notion sync output\n\nGenerated Markdown files from the Notion CMS integration appear here.\nEnable sync in \`integrations/notion-sync/\`." > _articles/notion/.gitkeep
```

**`.github/workflows/jekyll.yml`** — simplify:

```yaml
name: Build and Deploy

on:
  push:
    branches: [dev]
  schedule:
    - cron: '*/10 * * * *'   # only fires for Notion users (see if below)
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    if: github.event_name != 'schedule' || vars.ENABLE_NOTION_SYNC == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ruby/setup-ruby@v1
        with:
          ruby-version: '3.3'
          bundler-cache: true
      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      # Optional Notion sync — set ENABLE_NOTION_SYNC=true in repo Variables to activate
      - name: Sync Notion articles
        if: vars.ENABLE_NOTION_SYNC == 'true'
        working-directory: integrations/notion-sync
        run: |
          npm ci
          node index.js
        env:
          NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
          # Add one NOTION_DB_<SLUG> per category in _data/categories.yml
          NOTION_DB_TECH: ${{ secrets.NOTION_DB_TECH }}
          NOTION_DB_NOTES: ${{ secrets.NOTION_DB_NOTES }}
      - name: Commit synced articles
        if: vars.ENABLE_NOTION_SYNC == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add _articles
          git diff --staged --quiet || (git commit -m "chore: sync notion articles" && git push)

      - name: Build Jekyll
        run: bundle exec jekyll build
      - uses: actions/upload-pages-artifact@v3

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### Phase 6 · Documentation

**`README.md`** (new — currently excluded from Jekyll processing):

Structure:
1. **Header** — name, tagline, badges (MIT, Jekyll)
2. **Screenshot** — placeholder for a screenshot/GIF
3. **Features** — bullet list of all capabilities
4. **Quick Start** — fork → edit `_config.yml` → add photo → push
5. **Content Guide** — how to add projects, articles, customize pages
6. **Customization** — design tokens, theme, portfolio config
7. **Notion CMS (optional)** — link to `integrations/notion-sync/README.md`
8. **Tech Stack** — Jekyll 4.3, vanilla JS, Bootstrap CSS (layout only), Font Awesome, Google Fonts
9. **License** — MIT

**`LICENSE`**:
```
MIT License

Copyright (c) 2026 Nuo27

Permission is hereby granted, free of charge, to any person obtaining a copy...
(standard MIT text)
```

### Phase 7 · Final cleanup + ship

**`.gitignore`** changes:
- Add `.claude/`
- Remove `DESIGN.md` line (template doesn't预设 this)
- Keep everything else

**Verify:**
```bash
bundle exec jekyll build   # must compile clean
```

**Ship:**
```bash
git add -A
git commit -m "initial: phosphor-site template"
git push origin dev
```

The template commit lands on `dev` (the repo's working branch). Personal content copied in Phase 1 is removed in the same commit, so the template never ships personal data in its public history.

---

## 5. Cursor System Reference

The custom cursor is this template's signature interaction. The new agent must understand it to avoid regressions.

### Architecture (3 files)

| File | Role |
|---|---|
| `_sass/_cursor.scss` | All cursor CSS (triangle, ring, aurora, states, `:has()` hover, `cursor:none` gate) |
| `assets/js/cursor.js` | Renderer IIFE — rAF loop, smoothing, trail, tilt, scrollbar tracking. Runs once (router keeps shell alive). Exposes `window.__cursor.{setStates, bindScrollables}` |
| `assets/js/main.js` §CURSOR | Hover resolver — owns `.is-hover`/`.is-traced` on cards, `elementFromPoint` on scroll, `pointerdown`/`pointerup` → `setStates({down,drag,zoom,...})` |

### Scrollbar drag tracking (the tricky part)

**Problem:** During native scrollbar drag, the OS captures the pointer — `mousemove` stops firing. The custom cursor position (`p.x`/`p.y`) freezes.

**Solution (delta-based):** On `scroll` events, if `mousemove` hasn't fired for >80ms AND `wheel` hasn't fired for >150ms, apply the scroll delta proportionally to the cursor position:

```js
// Page vertical scrollbar
p.y += (scrollY - prevScrollY) * innerHeight / scrollHeight;

// Element horizontal scrollbar (<pre>, <table>)
p.x += (scrollLeft - prevLeft) * clientWidth / scrollWidth;
```

**Why delta, not absolute:** Absolute position (computing thumb center from scrollY) causes an initial jump to the thumb center, which is wrong if the user grabbed the thumb at a different point. Delta-based tracking starts from the last known mouse position and moves proportionally — no jump.

**Why wheel exclusion:** During wheel scroll, `mousemove` also doesn't fire, but the mouse hasn't moved (cursor position is correct). Without wheel exclusion, the cursor would incorrectly jump to the scrollbar position.

**Element scrollbars:** `window.addEventListener('scroll', ...)` doesn't catch `<pre>` element scroll. `bindScrollables(scope)` is called by `main.js` after each PJAX navigation to directly bind scroll listeners to `pre, table` elements. `__sbBound` flag prevents double-binding.

**The cursor is NEVER hidden during scrollbar drag.** Previous failed approaches tried hiding the custom cursor and showing the native one — this doesn't work because browsers cache cursor CSS during scrollbar drag and don't re-evaluate `cursor:none` when the class is toggled.

### `window.__cursor` API

```js
window.__cursor.setStates({ hover, zoom, pulse, drag, down })  // called by main.js
window.__cursor.bindScrollables(scope)  // called by main.js after each navigation; binds scroll listeners to pre/table
```

### Gate

Cursor.js early-returns (keeps native cursor) on:
- `(hover: none), (pointer: coarse)` — touch devices
- `(prefers-reduced-motion: reduce)` — accessibility

---

## 6. Known Issues & Future Work

| Item | Status | Notes |
|---|---|---|
| Bootstrap CSS removal | Deferred | Used in ~50+ template locations (`container`, `row`, `col-lg-*`, flex utils). Separate PR. |
| `~4% scrollbar drag drift` | Accepted | Windows classic scrollbar arrow buttons reduce track length vs `innerHeight`. Error accumulates ~22px over full-page drag. Not fixable without detecting arrow button height. |
| Notion image download | Not implemented | Notion S3 URLs expire after ~1hr. Downloading to `assets/articles/<slug>/` during sync is a future feature. |
| `_data/categories.yml` Notion coupling | Accepted | Category slugs drive both nav and Notion env-var names (`NOTION_DB_<SLUG_UPPER>`). Adding a category requires a new secret + workflow line. |

---

## 7. Checklist

- [ ] Create `phosphor-site` repo
- [ ] Copy files (exclude `.git`, `_site`, `.jekyll-cache`, `.env`, `.claude`, `node_modules`)
- [ ] Delete personal projects (6 files)
- [ ] Delete personal articles (5 files + `notion/` directory)
- [ ] Delete personal images (`bio-photo.png`, `projects/*.png`)
- [ ] Delete `CONTENT-SUPPLEMENT.md`
- [ ] Create `_projects/example-project.md`
- [ ] Create `assets/image/projects/_placeholder.svg`
- [ ] Strip `_config.yml` (title, author, social, repository, portfolio defaults)
- [ ] Strip `pages/index.md` (hero/stream/cta text)
- [ ] Strip `pages/about.md` (7 sections → placeholder content)
- [ ] Move `scripts/notion-sync/` → `integrations/notion-sync/`
- [ ] Move `.env.example` → `integrations/notion-sync/.env.example`
- [ ] Create `_articles/notion/.gitkeep` with README
- [ ] Simplify `.github/workflows/jekyll.yml` (single branch, conditional Notion, conditional cron)
- [ ] Create `README.md`
- [ ] Create `LICENSE` (MIT)
- [ ] Update `.gitignore` (add `.claude/`, remove `DESIGN.md`)
- [ ] `bundle exec jekyll build` — verify clean compile
- [ ] Initial commit + push to `dev`
