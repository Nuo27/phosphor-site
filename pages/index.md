---
layout: home
permalink: /

hero:
  eyebrow: "JEKYLL TEMPLATE · TACTICAL TELEMETRY"
  skills: [Jekyll, SCSS, Vanilla JS]
  cta_primary: { label: "View Work", url: "/portfolio/" }
  cta_secondary: { label: "About", url: "/about/" }

# Random work stream - picks `count` items at random (per page load) from the
# listed `types`. To add a new type: add it here, add a {% when %} branch in
# _includes/landing/stream.html, and add _includes/stream/<type>-card.html.
# `hide.tags` excludes items whose tags contain any entry; `hide.category`
# excludes items whose category field matches (single value).
random_work:
  types: [project, article]
  count: 3
  hide:
    tags: []
    categories: []

stream:
  kicker: "RANDOM_WORK"
  heading: "Some of my works"
  labels:
    read_project: "Read case"
    read_article: "Read article"
    all_projects: "View all projects"
    all_articles: "View all articles"

cta:
  kicker: "OPEN SOURCE"
  heading: "Want a site that feels <em>just right</em>?"
  primary: { label: "View Work", url: "/portfolio/" }
  secondary: { label: "Source", url: "https://github.com/Nuo27/phosphor-site" }
---

<!-- Content-driven page. Body is intentionally empty; _layouts/home.html composes the sections. -->
