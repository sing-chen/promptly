import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { CATEGORIES, COMPLEXITY_LEVELS } from './schema.mjs';
import { getAllSequenceSlugs, getSequenceSteps } from './sequences.mjs';
import { collections as collectionDefs } from './collections.mjs';
import { useCases } from './useCases.mjs';

export const PROMPTS_DIR = 'prompts';
export const PUBLIC_DIR = 'public';

// Reads and parses every prompt file into a flat object:
// { slug, title, category, tags, purpose, sequence, sequence_step,
//   depends_on, example_output, models, complexity, notes, added,
//   updated, body }
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
    if (!p.category) errors.push(`${p.file}: missing "category"`);
    else if (!CATEGORIES.includes(p.category)) {
      errors.push(`${p.file}: "category: ${p.category}" is not in the controlled vocabulary (${CATEGORIES.join(', ')})`);
    }
    if (!Array.isArray(p.tags) || p.tags.length === 0) {
      errors.push(`${p.file}: needs at least one tag`);
    }
    if (p.complexity && !COMPLEXITY_LEVELS.includes(p.complexity)) {
      errors.push(`${p.file}: "complexity: ${p.complexity}" must be one of ${COMPLEXITY_LEVELS.join(', ')}`);
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
  const prompts = loadPrompts(promptsDir);

  const categories = CATEGORIES.map(slug => ({
    slug,
    count: prompts.filter(p => p.category === slug).length
  }));

  const tagCounts = new Map();
  for (const p of prompts) {
    for (const t of p.tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  }
  const tags = Array.from(tagCounts, ([slug, count]) => ({ slug, count }))
    .sort((a, b) => b.count - a.count);

  const sequences = getAllSequenceSlugs(prompts).map(slug => ({
    slug,
    steps: getSequenceSteps(prompts, slug)
  }));

  const collections = collectionDefs.map(c => ({
    ...c,
    prompts: c.promptSlugs.map(s => prompts.find(p => p.slug === s)).filter(Boolean)
  }));

  const sequenceTotals = Object.fromEntries(sequences.map(s => [s.slug, s.steps.length]));

  return { prompts, categories, tags, sequences, collections, sequenceTotals, useCases };
}
