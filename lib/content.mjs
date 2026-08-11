import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { CATEGORIES } from './schema.mjs';
import { getAllSequenceSlugs, getSequenceSteps } from './sequences.mjs';
import { collections as collectionDefs } from './collections.mjs';

export const PROMPTS_DIR = 'prompts';
export const PUBLIC_DIR = 'public';

// Reads and parses every prompt file into a flat object:
// { slug, title, categories, purpose, sequence, sequence_step, depends_on,
//   handoff, example_output, notes, added, updated, body }
// `handoff` is optional, only meaningful when `sequence` is set and this
// isn't the chain's last step - a short plain-language note on what this
// step produces for the next one (§9e sequence rail).
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
// decide how to react.
export function validatePrompts(prompts, publicDir = PUBLIC_DIR) {
  const errors = [];
  const slugs = new Map();
  const slugSet = new Set(prompts.map(p => p.slug));

  for (const p of prompts) {
    if (!p.title) errors.push(`${p.file}: missing "title"`);
    if (!Array.isArray(p.categories) || p.categories.length === 0) {
      errors.push(`${p.file}: needs at least one entry in "categories"`);
    } else {
      for (const c of p.categories) {
        if (!CATEGORIES.includes(c)) {
          errors.push(`${p.file}: "categories" entry "${c}" is not in the controlled vocabulary (${CATEGORIES.join(', ')})`);
        }
      }
    }
    if (p.sequence && p.sequence_step === undefined) {
      errors.push(`${p.file}: has "sequence" but no "sequence_step"`);
    }
    if (p.depends_on && !slugSet.has(p.depends_on)) {
      errors.push(`${p.file}: "depends_on: ${p.depends_on}" does not match any known prompt slug`);
    }
    if (p.example_output && !existsSync(join(publicDir, p.example_output.replace(/^\//, '')))) {
      errors.push(`${p.file}: "example_output: ${p.example_output}" does not exist under ${publicDir}/`);
    }

    if (slugs.has(p.slug)) {
      errors.push(`Duplicate slug: "${p.slug}" (${slugs.get(p.slug)} and ${p.file})`);
    }
    slugs.set(p.slug, p.file);
  }

  return errors;
}

// Builds the full derived data model consumed by page generation and search
// indexing. Assumes prompts have already been validated.
export function buildData(promptsDir = PROMPTS_DIR) {
  // Newest-updated-first - was previously a client-side "Sort" dropdown
  // default; the control was removed as unneeded, so this fixed order is
  // now the only order, applied once here rather than per-page.
  const prompts = loadPrompts(promptsDir)
    .sort((a, b) => new Date(b.updated || b.added || 0) - new Date(a.updated || a.added || 0));

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
      example_output: p.example_output || '',
      added: p.added || '',
      updated: p.updated || p.added || ''
    })),
    sequenceTotals: data.sequenceTotals
  };
}
