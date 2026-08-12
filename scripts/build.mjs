import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPrompts, validatePrompts, buildData, buildSearchIndex, PROMPTS_DIR, PUBLIC_DIR } from '../lib/content.mjs';
import {
  renderHomePage, renderCategoryPage,
  renderCollectionPage, renderSequencesIndex, renderSequencePage,
  renderFavoritesPage, renderSearchPage, renderPromptDetail,
  renderAboutPage, renderAccountPage, renderAdminPage, setAssetVersion
} from '../lib/render.mjs';
import { loadEnv } from '../lib/env.mjs';

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

// Cache-busting for cross-file import specifiers inside our own JS/CSS
// (e.g. favorites.js importing './categoryPills.js', base.css importing
// './tokens.css') - without this, a browser that already cached an old
// version of one of these files keeps using it even after a fresh deploy,
// since none of these URLs are otherwise versioned or hashed. Safe to do as
// a blind regex here specifically because every file under dist/scripts and
// dist/styles is developer-authored or vendored (Fuse.js), never prompt/
// user content - unlike rendered HTML pages, which embed untrusted prompt
// JSON and get versioned via lib/render.mjs's explicit av() instead.
function versionScriptRefs(text, buildId) {
  return text.replace(
    /(["'])((?:\/scripts\/|\/styles\/|\.\/)[^"'?]+?\.(?:m?js|css)|\/search-index\.json)\1/g,
    (match, quote, path) => `${quote}${path}?v=${buildId}${quote}`
  );
}

function versionAssetFiles(dir, buildId) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) versionAssetFiles(full, buildId);
    else if (/\.(m?js|css)$/.test(entry.name)) writeFileSync(full, versionScriptRefs(readFileSync(full, 'utf8'), buildId));
  }
}

// Runs the full build once: validate -> data model -> clean-rebuild dist/.
// Throws ValidationError on bad content rather than exiting the process, so
// watch.mjs can catch it, report it, and keep watching instead of dying.
export function runBuild() {
  const prompts = loadPrompts(PROMPTS_DIR);
  const errors = validatePrompts(prompts);
  if (errors.length > 0) throw new ValidationError(errors);

  const data = buildData(PROMPTS_DIR);

  // One version stamp per build, applied to every /scripts and /styles
  // reference this build emits (see setAssetVersion/versionAssetFiles) -
  // doesn't need to be a content hash, just needs to differ build-to-build.
  const BUILD_ID = Date.now().toString(36);
  setAssetVersion(BUILD_ID);

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

  // lib/render.mjs + lib/sequences.mjs + lib/schema.mjs are plain browser-safe
  // JS (no Node built-ins) - reused client-side by search.js/quickview.js so
  // search results and the quick-view modal render with the exact same
  // markup helpers (renderPromptTableRows, renderCatBadges, esc) as every
  // server-rendered page. schema.mjs must ship too: render.mjs imports
  // CATEGORIES from it, and a static import that 404s fails the whole module.
  mkdirSync(join(DIST_DIR, 'scripts', 'lib'), { recursive: true });
  cpSync('lib/render.mjs', join(DIST_DIR, 'scripts', 'lib', 'render.mjs'));
  cpSync('lib/sequences.mjs', join(DIST_DIR, 'scripts', 'lib', 'sequences.mjs'));
  cpSync('lib/schema.mjs', join(DIST_DIR, 'scripts', 'lib', 'schema.mjs'));

  // Account-tier config, generated fresh every build from SUPABASE_URL/
  // SUPABASE_ANON_KEY (read from .env.local locally, or real env vars in
  // Vercel) - browsers can't read either of those directly, so this file is
  // how public/scripts/supabaseClient.js gets them. Safe to bake the anon
  // key into a public static file: RLS is the real security boundary, not
  // key secrecy (supabase/README.md).
  const env = loadEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    console.warn('SUPABASE_URL/SUPABASE_ANON_KEY not set - account-tier features (sign-in, admin authoring) will be inert in this build.');
  }
  writeFileSync(join(DIST_DIR, 'scripts', 'config.js'), `// Generated at build time - do not edit by hand.
export const SUPABASE_URL = ${JSON.stringify(env.SUPABASE_URL || '')};
export const SUPABASE_ANON_KEY = ${JSON.stringify(env.SUPABASE_ANON_KEY || '')};
`);

  // Cache-bust every cross-file import inside our own dist/scripts and
  // dist/styles files now that they're all in place (must run after every
  // copy/write above, and before any HTML references them).
  versionAssetFiles(join(DIST_DIR, 'scripts'), BUILD_ID);
  versionAssetFiles(join(DIST_DIR, 'styles'), BUILD_ID);

  writeFileSync(join(DIST_DIR, 'search-index.json'), JSON.stringify(buildSearchIndex(data)));

  // --- pages ---
  writeRoute('', renderHomePage(data));
  writeRoute('sequences', renderSequencesIndex(data));
  writeRoute('favorites', renderFavoritesPage(data));
  writeRoute('search', renderSearchPage(data));
  writeRoute('about', renderAboutPage(data));
  writeRoute('account', renderAccountPage(data));
  writeRoute('admin', renderAdminPage(data));

  for (const category of data.categories) {
    const inCategory = data.prompts.filter(p => p.categories.includes(category.slug));
    writeRoute(`browse/${category.slug}`, renderCategoryPage(category.slug, inCategory, data));
  }

  for (const collection of data.collections) {
    writeRoute(`collections/${collection.slug}`, renderCollectionPage(collection, data));
  }

  for (const sequence of data.sequences) {
    writeRoute(`sequence/${sequence.slug}`, renderSequencePage(sequence, data));
  }

  for (const prompt of data.prompts) {
    writeRoute(`prompt/${prompt.slug}`, renderPromptDetail(prompt, data));
  }

  return `Built ${data.prompts.length} prompt page(s), ${data.categories.length} category page(s), ${data.collections.length} collection page(s), ${data.sequences.length} sequence page(s), plus home/sequences/favorites/search/about and robots.txt.`;
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
