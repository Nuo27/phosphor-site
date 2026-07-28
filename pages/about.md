---
layout: about
title: About
permalink: /about/
weight: 1

# ── 01 · Intro ──
intro:
  eyebrow: "01"
  title: About
  heading_tag: h1
  prompt: true
  paragraphs:
    - text: >-
        [Your intro paragraph goes here.] Replace this with 1–3 sentences about
        who you are, what you make, and what you care about. Markdown is supported.
    - text: >-
        [Optional second paragraph.] The intro section renders each `paragraphs[].text`
        entry as its own block — add as many or as few as you like.

# ── 02 · Currently ──
currently:
  eyebrow: "02"
  title: Currently
  items:
    - { label: LEARNING, value: "[What you’re learning]" }
    - { label: BUILDING, value: "[What you’re building]" }
    - { label: READING,  value: "[A book / article / paper]" }

# ── 03 · Skills ──
skills:
  eyebrow: "03"
  title: Skills
  items:
    - "[Skill one]"
    - "[Skill two]"
    - "[Skill three]"

skills_detailed:
  programming:
    title: Programming Languages
    items: ["[Language 1]", "[Language 2]"]
  tools:
    title: Tools & Technologies
    items: ["[Tool 1]", "[Tool 2]"]
  web:
    title: Web & Backend
    items: ["[Framework 1]", "[Framework 2]"]

# ── 04 · Experience ──
experience:
  eyebrow: "04"
  title: Experience
  items:
    - title: "[Role / Project title]"
      from: 2020
      to: 2023
      description: >-
        [What you did, the scope, and the outcome. Markdown supported.]
    - title: "[Next role / project]"
      from: 2023
      to: present
      description: >-
        [Add as many items as you need — the timeline renders newest-first.]

# ── 05 · Education ──
education:
  eyebrow: "05"
  title: Education
  items:
    - qualification: "[Qualification]"
      institution: "[Institution, City]"
      from: 2020
      to: 2023
      description: >-
        [Optional notes — coursework, honours, relevant projects. Markdown supported.]

# ── 06 · Languages ──
languages:
  eyebrow: "06"
  title: Languages
  note: "// [Optional one-liner about your language context]"
  items:
    - { name: "[Language]", level: Native }
    - { name: "[Language]", level: Fluent }

# ── 07 · Contact ──
contact:
  eyebrow: "07"
  title: Contact
  blurb: "[One line on what you’re open to — roles, collaborations, chat. Email renders from _config.yml social.]"
---

<!-- Content-driven page. Body is intentionally empty; _layouts/about.html composes the sections. -->
