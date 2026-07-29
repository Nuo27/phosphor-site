---
name: markdown-reference
permalink: /articles/markdown-reference/
title: "Markdown Reference"
description: "Every markdown element rendered in one place — the kitchen sink for styling verification."
tags: [Reference]
category: notes
lang: en
---

## Headings

# H1 Heading

## H2 Heading

### H3 Heading

#### H4 Heading

##### H5 Heading

###### H6 Heading

## Inline Formatting

Body text with **bold**, *italic*, ***bold italic***, ~~strikethrough~~, `inline code`, and [a link](https://example.com).

A paragraph mixing everything: **bold with *italic* and `code` inside**, followed by [a link **with bold**](https://example.com) and ~~deleted text~~.

## Lists

Unordered:

- First item
- Second item
  - Nested under second
  - Another nested
    - Deeper still
- Back to top level

Ordered:

1. Open the file
2. Run the build
3. Verify output
   1. Check `_site/`
   2. Check console for errors
4. Ship it

Task list:

- [x] Set up Jekyll
- [x] Write content
- [ ] Add tests
- [ ] Deploy

## Code Blocks

Inline: run `bundle exec jekyll serve` to start.

```scss
@use "variables" as *;
@use "mixins" as *;

.button {
  @include phosphor-glow;
  background: $phosphor;
  color: $bg-void;
  padding: 1rem 2rem;

  &:hover { background: $phosphor-bright; }
  &:active { transform: translateY(1px); }
}
```

```ruby
# Render the site
site = Jekyll::Site.new(Jekyll.configuration({}))
site.process
puts "Built in #{site.time}ms"
```

```yaml
name: example
title: "Sample Article"
tags: [Tag1, Tag2]
```

```
Plain code block — no language hint.
Should still render readably.
```

## Blockquotes

> A blockquote with **bold**, *italic*, and `code` inside it.
>
> Second paragraph in the same quote.
>
> > Nested blockquote — quieter accent stripe.

## Tables

| Element | Dark Mode | Light Mode |
|---|---|---|
| Body text | `--ink` | `--carbon` |
| Accent | `--phosphor` | `--print-phosphor` |
| Substrate | `--bg-void` | `--paper` |
| Code bg | `--bg-deep` | `--paper-deep` |

## Horizontal Rule

Text above.

---

Text below.

## Image

![Phosphor](/assets/image/logo/phosphor-avatar.svg)

## Definition List

Jekyll
: Static site generator written in Ruby.

Bundler
: Manages Ruby gem dependencies via `Gemfile.lock`.

Rouge
: Pure-Ruby syntax highlighter used by Jekyll.

## Footnote

The site uses a PJAX router for soft navigation[^1]. It also supports a custom cursor[^2] on fine-pointer devices.

[^1]: Intercepts link clicks, fetches HTML, swaps `<main id="app">`.
[^2]: Inverted ring with per-element state changes — hover, zoom, pulse, drag.

## Keyboard & Special

Press <kbd>Ctrl</kbd> + <kbd>C</kbd> to copy. Use <kbd>Esc</kbd> to close the lightbox. The <mark>highlighted phrase</mark> stands out from surrounding text. Hover over <abbr title="Hypertext Markup Language">HTML</abbr> for the expansion.

## Mixed Content

1. **First**, set up the project:

   ```bash
   bundle init
   bundle add jekyll
   ```

2. **Then**, configure `_config.yml`:

   > The config file controls collections, permalinks, and excludes. Keep it minimal.

3. **Finally**, build and serve:

   ```bash
   bundle exec jekyll serve --livereload
   ```

   The site runs at `http://127.0.0.1:4000/`.
