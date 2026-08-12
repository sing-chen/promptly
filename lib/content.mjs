import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { CATEGORIES } from './schema.mjs';
import { getAllSequenceSlugs, getSequenceSteps } from './sequences.mjs';
import { collections as collectionDefs } from './collections.mjs';

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
export function validatePrompts(prompts) {
  const errors = [];
  const slugs = new Map();

  for (const p of prompts) {
    const label = p.file || p.slug || '(unknown)';
    if (!p.title) errors.push(`${label}: missing "title"`);
    if (!Array.isArray(p.categories) || p.categories.length === 0) {
      errors.push(`${label}: needs at least one entry in "categories"`);
    } else {
      for (const c of p.categories) {
        if (!CATEGORIES.includes(c)) {
          errors.push(`${label}: "categories" entry "${c}" is not in the controlled vocabulary (${CATEGORIES.join(', ')})`);
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
export function buildData(prompts) {
  // Newest-updated-first - was previously a client-side "Sort" dropdown
  // default; the control was removed as unneeded, so this fixed order is
  // now the only order, applied once here rather than per-page.
  prompts = [...prompts].sort((a, b) => new Date(b.updated || b.added || 0) - new Date(a.updated || a.added || 0));

  const categories = CATEGORIES.map(slug => ({
    slug,
    count: prompts.filter(p => p.categories.includes(slug)).length
  }));

  const sequences = getAllSequenceSlugs(prompts).map(slug => ({
    slug,
    steps: getSequenceSteps(prompts, slug)
  }));

  const collections = collectionDefs.map(c => ({
    ...c,
    prompts: c.promptSlugs.map(s => prompts.find(p => p.slug === s)).filter(Boolean)
  }));

  const sequenceTotals = Object.fromEntries(sequences.map(s => [s.slug, s.steps.length]));

  return { prompts, categories, sequences, collections, sequenceTotals };
}

// Search index consumed client-side by public/scripts/search.js. Kept as a
// separate, lighter record shape (not the full prompt objects) so the JSON
// payload stays small and doesn't leak internal-only fields.
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
