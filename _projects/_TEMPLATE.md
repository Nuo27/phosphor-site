---
layout: project
name: PROJECT NAME                    # shown as hero title + nav cards
subtitle: Optional one-line italic lede under the title  # OPTIONAL - delete line if unused
image: /assets/image/projects/SLUG.png # hero background + card thumb (1200+px wide, landscape)
description: One-sentence pitch - this renders TWICE: as the deck lead under the hero AND as the card summary on the portfolio grid. Keep it to one line.
category: Game                       # drives the portfolio filter chips + the '// GAME' kicker on cards & hero. Keep values short & consistent (e.g. Game, iOS App, Tool, Web).
status: "2024"                        # year or range "2023-2024"; shows as hero meta + card kicker
tags: [Tool1, Tool2, Tool3]  # chips on cards + detail (clickable → list-page filter). Tags listed in _config.yml → portfolio.hidden_tags collapse behind the portfolio // SHOW toggle.
external_links:                       # OPTIONAL - delete the whole block if none
  - { name: "Live Demo", url: "https://...", icon: "external-link-alt" }
  - { name: "Source",    url: "https://github.com/...", icon: "github", prefix: "fab" }
---

<!-- ============ TEMPLATE NOTES (HTML comments are invisible when rendered) ============
   • Filenames: use the slug, lowercase-hyphenated, e.g. `my-cool-project.md`.
     The URL becomes /portfolio/my-cool-project
   • `category` powers the portfolio filter bar. Only categories with >1 project
     show chips, so a brand-new category won't appear in the filter until a second
     project shares it - but the '// CATEGORY' kicker on the card & hero always shows.
   • Do NOT open the body with a `**Name** is...` paragraph. `description` above already
     shows as the deck lead directly above this text, so an intro line here repeats it.
     Jump straight into ## Overview (only if you need a fuller pitch) or ## Role.
   • Keep section order: Role → Contributions → Technical Challenges → Lessons Learned
     → (optional Recognition) → outro divider → carousel/video.
   • Delete any section you don't need rather than leaving "N/A" placeholders.
====================================================================================== -->

## Overview

<!-- OPTIONAL. Only include if `description` was too short and you want a 2-3 sentence
     fuller pitch (engine, genre, team size, what makes it interesting). Otherwise
     delete this whole section and start at ## Role. -->

## Role

Your title (e.g. Solo Developer, Tech Lead, Designer). Add team size if relevant.

## Contributions

- Bullet - what you built, named by system
- Bullet - second area of ownership
- Bullet - third

## Technical Challenges

- One concrete problem → how you solved it, one sentence each. Name the actual mechanism
  (e.g. "event-bus chain", "server-authoritative snapshots", "deterministic fixed-timestep").
- Second challenge.
- Third.

## Lessons Learned

- One honest takeaway, what you'd do differently or double down on.
- Second.

## Recognition

<!-- OPTIONAL - awards, festival selection, press. Delete the section if none. -->

---

<!-- Outro: pick whichever you have. Keep it short. -->
Playable demo: [itch.io](https://...) · Source: [GitHub](https://...)

<!-- ============ MEDIA - use ONE of the two blocks below, delete the other ============ -->

<!-- Option A: image carousel (most projects) -->
{% capture carousel_images %}
/assets/image/projects/SLUG-1.png
/assets/image/projects/SLUG-2.png
/assets/image/projects/SLUG-3.png
{% endcapture %}
{% include elements/carousel.html %}

<!-- Option B: single YouTube embed (delete Option A if you use this) -->
<!-- {% include elements/video.html id="YOUTUBE_ID" %} -->
