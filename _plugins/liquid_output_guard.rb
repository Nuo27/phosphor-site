# frozen_string_literal: true

# LiquidOutputGuard — fail the build when a hand-written markdown document
# contains a Liquid OUTPUT tag ({{ ... }}) outside a {% raw %} block.
#
# Why: Jekyll already fails loudly on unbalanced BLOCK tags ({% if %} with no
# {% endif %}). It does NOT fail on a bare {{ var }} that resolves to nothing —
# that silently renders as empty, eating prose (e.g. writing `{{from}}` to
# describe a template variable). This guard catches that second case at build
# time, naming the file and the offending tag.
#
# Scope: only hand-written collections (projects, articles). Notion-synced docs
# under _articles/notion/ are skipped — their bodies are already wrapped in
# {% raw %} by scripts/notion-sync and may legitimately echo Notion content.
# Intended block tags ({% capture %}, {% include %} for carousels) are untouched.

module LiquidOutputGuard
  # Match ONLY a bare-identifier output tag: {{ bareword }} with no spaces,
  # dots, or filters — the shape of an accidentally-pasted template var in
  # prose (e.g. `{{from}}`). Real Liquid (`{{ site.data.x }}`, `{{ x | f }}`,
  # `{{page.title}}`) has spaces/dots/pipes and is intentionally exempt.
  OUTPUT_TAG_RE = /\{\{[a-zA-Z_]\w*\}\}/.freeze
  RAW_BLOCK_RE  = /\{%-?\s*raw\s*-?%\}.*?\{%-?\s*endraw\s*-?%\}/m.freeze
  # ponytail: collections covered are only the hand-written ones.
  WATCHED       = %w[projects articles].freeze
  NOTION_PREFIX = "_articles/notion/".freeze

  def self.first_offending(raw)
    stripped = raw.to_s.gsub(RAW_BLOCK_RE, "")
    stripped.match(OUTPUT_TAG_RE)
  end
end

Jekyll::Hooks.register :documents, :pre_render do |doc, _payload|
  next unless doc.is_a?(Jekyll::Document)
  next unless LiquidOutputGuard::WATCHED.include?(doc.collection.label.to_s)
  next if doc.relative_path.to_s.start_with?(LiquidOutputGuard::NOTION_PREFIX)

  match = LiquidOutputGuard.first_offending(doc.content)
  next unless match

  raise(
    "[LiquidOutputGuard] Bare Liquid output #{match[0].strip.inspect} in " \
    "#{doc.relative_path} would render empty. Wrap literal {{ }} in " \
    "{% raw %}…{% endraw %}, or use {% assign %} for a real variable."
  )
end
