import { existsSync, rmSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPrompts, validatePrompts, buildData, buildSearchIndex, PROMPTS_DIR, PUBLIC_DIR } from '../lib/content.mjs';
import {
  renderHomePage, renderBrowseHub, renderCategoryPage, renderTagPage,
  renderCollectionPage, renderSequencesIndex, renderSequencePage,
  renderFavoritesPage, renderSearchPage, renderPromptDetail,
  renderAboutPage, renderContributingPage
} from '../lib/render.mjs';

const DIST_DIR = 'dist';

class ValidationError extends Error {
  constructor(messages) {
    super('Prompt validation failed:\n' + messages.map(m => `  - ${m}`).join('\n'));
    this.messages = messages;
  }
}

function writeRoute(routePath, html) {
  const dir = routePath ? join(DIST_DIR, routePath) : DIST_DIR;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
}

// Runs the full build once: validate -> data model -> clean-rebuild dist/.
// Throws ValidationError on bad content rather than exiting the process, so
// watch.mjs can catch it, report it, and keep watching instead of dying.
export function runBuild() {
  const prompts = loadPrompts(PROMPTS_DIR);
  const errors = validatePrompts(prompts);
  if (errors.length > 0) throw new ValidationError(errors);

  const data = buildData(PROMPTS_DIR);

  // clean-rebuild dist/ (no incremental build, so bulk-deleted prompts
  // never leave an orphaned page behind)
  if (existsSync(DIST_DIR)) rmSync(DIST_DIR, { recursive: true, force: true });
  mkdirSync(DIST_DIR, { recursive: true });

  // --- static assets ---
  if (existsSync(PUBLIC_DIR)) cpSync(PUBLIC_DIR, DIST_DIR, { recursive: true });
  cpSync('styles', join(DIST_DIR, 'styles'), { recursive: true });
  writeFileSync(join(DIST_DIR, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

  // Vendored Fuse.js browser build (v7 ships ESM only, no UMD - imported
  // directly as a module, no global-exposing <script> tag needed).
  cpSync('node_modules/fuse.js/dist/fuse.min.mjs', join(DIST_DIR, 'scripts', 'fuse.min.mjs'));

  // lib/render.mjs + lib/sequences.mjs are plain browser-safe JS (no Node
  // built-ins) - reused client-side by search.js so search results render
  // with the exact same prompt-card markup as every server-rendered page.
  mkdirSync(join(DIST_DIR, 'scripts', 'lib'), { recursive: true });
  cpSync('lib/render.mjs', join(DIST_DIR, 'scripts', 'lib', 'render.mjs'));
  cpSync('lib/sequences.mjs', join(DIST_DIR, 'scripts', 'lib', 'sequences.mjs'));

  writeFileSync(join(DIST_DIR, 'search-index.json'), JSON.stringify(buildSearchIndex(data)));

  // --- pages ---
  writeRoute('', renderHomePage(data));
  writeRoute('browse', renderBrowseHub(data));
  writeRoute('sequences', renderSequencesIndex(data));
  writeRoute('favorites', renderFavoritesPage(data));
  writeRoute('search', renderSearchPage(data));
  writeRoute('about', renderAboutPage());
  writeRoute('contributing', renderContributingPage());

  for (const category of data.categories) {
    const inCategory = data.prompts.filter(p => p.category === category.slug);
    writeRoute(`browse/${category.slug}`, renderCategoryPage(category.slug, inCategory, data));
  }

  for (const tag of data.tags) {
    const withTag = data.prompts.filter(p => p.tags.includes(tag.slug));
    writeRoute(`tag/${tag.slug}`, renderTagPage(tag.slug, withTag, data));
  }

  for (const collection of data.collections) {
    writeRoute(`collections/${collection.slug}`, renderCollectionPage(collection, data));
  }

  for (const sequence of data.sequences) {
    writeRoute(`sequence/${sequence.slug}`, renderSequencePage(sequence));
  }

  for (const prompt of data.prompts) {
    writeRoute(`prompt/${prompt.slug}`, renderPromptDetail(prompt, data));
  }

  return `Built ${data.prompts.length} prompt page(s), ${data.categories.length} category page(s), ${data.tags.length} tag page(s), ${data.collections.length} collection page(s), ${data.sequences.length} sequence page(s), plus home/browse/sequences/favorites/search/about/contributing and robots.txt.`;
}

// CLI entrypoint: `node scripts/build.mjs` (also what `npm run build` runs).
// watch.mjs imports runBuild() directly instead and never hits this branch.
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  try {
    console.log(runBuild());
  } catch (err) {
    console.error('\n' + err.message + '\n');
    process.exit(1);
  }
}
