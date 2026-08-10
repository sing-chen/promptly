import { existsSync, rmSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { loadPrompts, validatePrompts, buildData, PROMPTS_DIR, PUBLIC_DIR } from '../lib/content.mjs';
import {
  renderHomePage, renderBrowseHub, renderCategoryPage, renderTagPage,
  renderCollectionPage, renderSequencesIndex, renderSequencePage,
  renderFavoritesPage, renderSearchPage, renderPromptDetail,
  renderAboutPage, renderContributingPage
} from '../lib/render.mjs';

const DIST_DIR = 'dist';

function fail(messages) {
  console.error('\nPrompt validation failed:\n');
  messages.forEach(m => console.error(`  - ${m}`));
  console.error('');
  process.exit(1);
}

function writeRoute(routePath, html) {
  const dir = routePath ? join(DIST_DIR, routePath) : DIST_DIR;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
}

// --- validate + build data model ---
const prompts = loadPrompts(PROMPTS_DIR);
const errors = validatePrompts(prompts);
if (errors.length > 0) fail(errors);

const data = buildData(PROMPTS_DIR);

// --- clean-rebuild dist/ (no incremental build, so bulk-deleted prompts
// never leave an orphaned page behind) ---
if (existsSync(DIST_DIR)) rmSync(DIST_DIR, { recursive: true, force: true });
mkdirSync(DIST_DIR, { recursive: true });

// --- static assets ---
if (existsSync(PUBLIC_DIR)) cpSync(PUBLIC_DIR, DIST_DIR, { recursive: true });
cpSync('styles', join(DIST_DIR, 'styles'), { recursive: true });
writeFileSync(join(DIST_DIR, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

// --- pages ---
writeRoute('', renderHomePage(data));
writeRoute('browse', renderBrowseHub(data));
writeRoute('sequences', renderSequencesIndex(data));
writeRoute('favorites', renderFavoritesPage(data));
writeRoute('search', renderSearchPage());
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

console.log(`Built ${data.prompts.length} prompt page(s), ${data.categories.length} category page(s), ${data.tags.length} tag page(s), ${data.collections.length} collection page(s), ${data.sequences.length} sequence page(s), plus home/browse/sequences/favorites/search/about/contributing and robots.txt.`);
