---
title: "Example Article"
description: >-
  A short example article demonstrating article front matter — category, tags,
  and lang — alongside the markdown prose styles (_headings, lists, code, quotes_).
  Edit or delete this file; markdown-reference.md stays as the full style demo.
category: tech
tags: [Example, Markdown]
lang: en
---

## Why this file exists
`markdown-reference.md` shows every prose style but uses `layout: article`
defaults — it doesn't set `category` or `tags`. This file fills those in so the
/articles/ index, filter chips, and tag pages render something on a fresh fork.

## Front matter contract
- `category` must match a `slug` in `_data/categories.yml` (here: `tech`).
- `tags` are free-form. Tags that match a project tag will share a chip.
- `lang` is informational for now — reserved for future i18n.

## Deleting me
Safe to delete once you've added your own articles. The portfolio and article
collections both render zero-state UI when empty, so you won't break anything.

> This is a blockquote. It renders in the phosphor accent border on article pages.

```js
// Code blocks keep the phosphor syntax theme.
function greet(name) {
  return `Hello, ${name}`;
}
```
