---
layout: home
permalink: /

hero:
  eyebrow: "YOUR ROLE · YOUR LOCATION"
  skills: [Skill One, Skill Two, Skill Three]
  cta_primary:   { label: "View Work",    url: "/portfolio/" }
  cta_secondary: { label: "Get in Touch", url: "/about/#contact" }

# Random work stream - picks `count` items at random (per page load) from the
# listed `types`. To add a new type: add it here, add a {% when %} branch in
# _includes/landing/stream.html, and add _includes/stream/<type>-card.html.
# `hide` excludes matching items from the random pool (falls back to the
# site-wide portfolio.hidden_* in _config.yml).
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
  kicker: "LET’S TALK"
  heading: "Have a project that needs to feel <em>just right</em>?"
  primary:   { label: "View Work",    url: "/portfolio/" }
  secondary: { label: "Get in touch", url: "/about/#contact" }
---

<!-- Content-driven page. Body is intentionally empty; _layouts/home.html composes the sections. -->
