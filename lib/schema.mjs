// Category helpers, shared by the build (lib/content.mjs, scripts/build.mjs,
// lib/render.mjs) and the browser (public/scripts/*, which import this file
// from dist/scripts/lib/schema.mjs - see scripts/build.mjs's copy step).
//
// This file used to hold CATEGORIES: a hardcoded nine-slug vocabulary
// mirrored by the prompts_categories_valid CHECK constraint. Both are gone
// (BUILD_BRIEF_v6.md §3). Categories are rows a user owns, so there is no
// constant left to export - what remains is the small amount of logic that
// still has to agree across every consumer.
//
// A prompt's `categories` is an array of category OBJECTS
// ({id, slug, name, color, position}), not slug strings. Every consumer that
// draws a badge needs the colour alongside the slug, and carrying two
// parallel arrays would just be one more thing to keep in step.

// The one place that knows how to compare a prompt's categories against a
// slug. Tolerates plain strings so the markdown lint tool
// (scripts/validate-prompts.mjs), whose frontmatter is still slug strings,
// keeps working against the same helper.
export function promptHasCategory(prompt, slug) {
  return (prompt.categories || []).some(c => (typeof c === 'string' ? c : c.slug) === slug);
}

export function categorySlugs(prompt) {
  return (prompt.categories || []).map(c => (typeof c === 'string' ? c : c.slug));
}

// Badge text colour, computed rather than assumed.
//
// Badges have always used white text because the six hand-picked hues were
// chosen to carry it. Now that a user picks the colour, a pale one would make
// the label unreadable - so the text colour follows from the fill.
//
// WCAG 2.1 relative luminance, then contrast ratio against white. 4.5:1 is
// the AA threshold for normal text; the badge's 11px/600 type is nowhere near
// large enough to claim the 3:1 large-text allowance. The dark fallback is
// --ink's light-mode value, so a pale badge reads as the site's own ink
// rather than as pure black.
export const INK_ON_LIGHT = '#1A1613';

export function readableInk(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return '#FFFFFF';
  const channels = [0, 2, 4].map(i => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return (1.05 / (L + 0.05)) >= 4.5 ? '#FFFFFF' : INK_ON_LIGHT;
}

// Fallback for a category row that somehow arrives without a colour. Not
// expected - the column is NOT NULL with a hex CHECK - but the renderers
// inline this value into a style attribute, and `undefined` there produces
// an invisible badge rather than an error anyone would notice.
export const FALLBACK_CATEGORY_COLOR = '#4E5A66';

// The picker's presets. The first six are the original --cat-* hues, kept so
// the palette still looks like the site it came from; the last six extend it
// far enough that a user with a dozen categories isn't forced into
// near-duplicates. All twelve clear 4.5:1 against white text, so readableInk()
// returns white for every preset and a picked colour only ever flips to dark
// ink if the user reaches for the free-form hex field.
export const CATEGORY_COLOR_PRESETS = [
  '#A8552A', // clay
  '#8A6817', // ochre
  '#34647F', // blue
  '#7A4780', // plum
  '#566627', // moss
  '#8A3B4E', // rose
  '#2F6F63', // teal
  '#4F5AA8', // indigo
  '#4E5A66', // slate
  '#9A4B1F', // rust
  '#3F6B34', // fern
  '#6E4630'  // bark
];
