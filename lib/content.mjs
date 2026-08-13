import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { promptHasCategory } from './schema.mjs';
import { getAllSequenceSlugs, getSequenceSteps } from './sequences.mjs';

export const PROMPTS_DIR = 'prompts';
export const PUBLIC_DIR = 'public';

// `prompts/*.md` is retired as the site's content source (supabase/README.md
// "There is no markdown catalog") - scripts/build.mjs now sources default
// prompts from Supabase (lib/supabaseBuild.mjs) instead. loadPrompts() and
// PROMPTS_DIR stay only for scripts/validate-prompts.mjs, a standalone lint
// tool over whatever's still sitting in prompts/ (historical reference, not
// part of the production build path).
//
// Reads and parses every prompt file into a flat object:
// { slug, title, categories, purpose, sequence, sequence_step, depends_on,
//   handoff, notes, added, updated, body }
// `handoff` is optional, only meaningful when `sequence` is set and this
// isn't the chain's last step - a short plain-language note on what this
// step produces for the next one (§9e sequence rail). Note: Supabase-sourced
// prompts never have `handoff` (no such column - supabase/README.md), and
// their `depends_on` is a UUID FK rather than markdown's slug - neither is
// validated or rendered anywhere (grep confirms nothing reads depends_on
// beyond this comment), so the shape mismatch between sources is harmless.
export function loadPrompts(promptsDir = PROMPTS_DIR) {
  const files = readdirSync(promptsDir).filter(f => f.endsWith('.md'));
  return files.map(file => {
    const slug = file.replace(/\.md$/, '');
    const raw = readFileSync(join(promptsDir, file), 'utf-8');
    const { data, content } = matter(raw);
    return { slug, file, ...data, body: content.trim() };
  });
}

// Validates the full prompt set. Returns an array of error strings — empty
// means valid. Does not exit the process, so callers (build script, tests)
// decide how to react. Shared across both prompt sources (markdown via
// validate-prompts.mjs, Supabase-sourced via scripts/build.mjs) - `p.file`
// is markdown-only, so messages fall back to `p.slug` when it's absent.
// `knownCategories` is the vocabulary to validate against: the catalog set,
// read from the database at build time (lib/supabaseBuild.mjs). It used to be
// lib/schema.mjs's hardcoded CATEGORIES array, but the vocabulary is per-user
// data now (BUILD_BRIEF_v6.md §3) and there is no constant to check against.
// Omitted or empty means "don't check membership" - which is what
// scripts/validate-prompts.mjs, the standalone markdown lint tool, gets: it
// has no database connection, so it can still check that a prompt HAS
// categories but not that they exist.
export function validatePrompts(prompts, knownCategories = []) {
  const errors = [];
  const slugs = new Map();
  const vocabulary = new Set(knownCategories.map(c => (typeof c === 'string' ? c : c.slug)));

  for (const p of prompts) {
    const label = p.file || p.slug || '(unknown)';
    if (!p.title) errors.push(`${label}: missing "title"`);
    // The ≥1 rule (BUILD_BRIEF_v6.md §4.3). Enforced in the app on save and
    // by 0006's trigger on removal; this is the build-time backstop, and the
    // only one of the three that can see the whole catalog at once.
    if (!Array.isArray(p.categories) || p.categories.length === 0) {
      errors.push(`${label}: needs at least one entry in "categories"`);
    } else if (vocabulary.size) {
      for (const c of p.categories) {
        const slug = typeof c === 'string' ? c : c.slug;
        if (!vocabulary.has(slug)) {
          errors.push(`${label}: "categories" entry "${slug}" is not a catalog category (${[...vocabulary].join(', ')})`);
        }
      }
    }
    if (p.sequence && p.sequence_step === undefined) {
      errors.push(`${label}: has "sequence" but no "sequence_step"`);
    }
    if (slugs.has(p.slug)) {
      // A real risk for Supabase-sourced prompts specifically: `slug` is
      // only unique per-user (unique(user_id, slug)) in the DB, not
      // globally - two different admins can each publish a default with
      // the same slug with nothing stopping them at insert time. This is
      // the build-time check that catches it before two prompts silently
      // collide on the same /prompt/<slug>/ route.
      errors.push(`Duplicate slug: "${p.slug}" (${slugs.get(p.slug)} and ${label})`);
    }
    slugs.set(p.slug, label);
  }

  return errors;
}

// Builds the full derived data model consumed by page generation and search
// indexing. Assumes `prompts` has already been validated (validatePrompts).
// `catalogCategories` is the admin's category set, fetched at build time.
// Categories are data now, not a constant, so they have to be passed in.
export function buildData(prompts, catalogCategories = []) {
  // Newest-updated-first - was previously a client-side "Sort" dropdown
  // default; the control was removed as unneeded, so this fixed order is
  // now the only order, applied once here rather than per-page.
  prompts = [...prompts].sort((a, b) => new Date(b.updated || b.added || 0) - new Date(a.updated || a.added || 0));

  // Carries name/colour/description through alongside the count, since every
  // consumer downstream (badges, pills, sidebar dots, the category page's
  // heading and description) now reads them from here rather than from
  // lib/schema.mjs. Ordered by the admin's own `position`.
  const categories = [...catalogCategories]
    .sort((a, b) => a.position - b.position || a.slug.localeCompare(b.slug))
    .map(c => ({
      ...c,
      count: prompts.filter(p => promptHasCategory(p, c.slug)).length
    }));

  const sequences = getAllSequenceSlugs(prompts).map(slug => ({
    slug,
    steps: getSequenceSteps(prompts, slug)
  }));

  const sequenceTotals = Object.fromEntries(sequences.map(s => [s.slug, s.steps.length]));

  // No `collections` field - collections are permanently user-generated only
  // (db.js's createCollection() has no admin/curated concept), managed
  // entirely through /collections/ and Supabase live reads, not built here.
  return { prompts, categories, sequences, sequenceTotals };
}

// Search index consumed client-side by public/scripts/search.js. Kept as a
// separate, lighter record shape (not the full prompt objects) so the JSON
// payload stays small and doesn't leak internal-only fields.
//
// `categories` carries the full objects rather than slugs, which does repeat
// each category's name and colour once per prompt that uses it. That is
// deliberate: search results are rendered by renderPromptTableRows, the same
// helper every other listing uses, and it needs the colour to draw a badge.
// At catalog scale (a handful of categories, ~100 prompts) the duplication is
// a few KB; the alternative - a slug lookup table plus a rehydration step on
// the client - is more moving parts than the saving is worth.
export function buildSearchIndex(data) {
  return {
    prompts: data.prompts.map(p => ({
      slug: p.slug,
      title: p.title,
      purpose: p.purpose || '',
      categories: p.categories,
      body: p.body,
      notes: p.notes || '',
      sequence: p.sequence || '',
      sequence_step: p.sequence_step,
      added: p.added || '',
      updated: p.updated || p.added || ''
    })),
    sequenceTotals: data.sequenceTotals
  };
}
