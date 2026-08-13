import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePrompts, buildData, buildSearchIndex, PUBLIC_DIR } from '../lib/content.mjs';
import { fetchPublishedPrompts, fetchCatalogCategories } from '../lib/supabaseBuild.mjs';
import { promptHasCategory } from '../lib/schema.mjs';
import {
  renderHomePage, renderCategoryPage,
  renderSequencesIndex, renderSequencePage,
  renderFavoritesPage, renderSearchPage, renderPromptDetail,
  renderAboutPage, renderAccountPage, renderAdminPage, renderCollectionsPage,
  renderArchivedPage, renderWhySignInPage, renderCategoriesPage, setAssetVersion
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

// Runs the full build once: fetch -> validate -> data model -> clean-rebuild
// dist/. Throws ValidationError on bad content rather than exiting the
// process, so watch.mjs can catch it, report it, and keep watching instead
// of dying. Async now (fetchPublishedPrompts is a network call) - the CLI
// entrypoint and watch.mjs both await it.
export async function runBuild() {
  // Loaded once, up front - used both for the prompt fetch below and for
  // generating dist/scripts/config.js further down.
  const env = loadEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    console.warn('SUPABASE_URL/SUPABASE_ANON_KEY not set - building with zero default prompts, and account-tier features (sign-in, admin authoring) will be inert in this build.');
  }

  // Default prompts now come from Supabase, not prompts/*.md
  // (supabase/README.md "There is no markdown catalog") - only published
  // (is_curated=true, published=true) rows, exactly what an anonymous
  // visitor's own RLS-scoped read would return.
  //
  // Categories come from the database too as of BUILD_BRIEF_v6.md - the
  // admin's curated set, which is what lib/schema.mjs's CATEGORIES array used
  // to be. Fetched separately rather than derived from the prompts, since an
  // empty category still needs a sidebar entry and a /browse/<slug>/ page.
  const [prompts, catalogCategories] = await Promise.all([
    fetchPublishedPrompts(env),
    fetchCatalogCategories(env)
  ]);

  if (catalogCategories.length === 0 && prompts.length > 0) {
    console.warn('No catalog categories found, but there are published prompts - every badge, pill and sidebar entry will be missing. Has 0006_user_categories.sql been applied?');
  }

  const errors = validatePrompts(prompts, catalogCategories);
  if (errors.length > 0) throw new ValidationError(errors);

  const data = buildData(prompts, catalogCategories);

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
  // server-rendered page. schema.mjs must ship too: render.mjs imports the
  // category helpers (promptHasCategory, readableInk) from it, and a static
  // import that 404s fails the whole module.
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
  writeRoute('collections', renderCollectionsPage(data));
  writeRoute('categories', renderCategoriesPage(data));
  writeRoute('archived', renderArchivedPage(data));
  writeRoute('why-sign-in', renderWhySignInPage(data));

  // Statically generated for CATALOG categories only (BUILD_BRIEF_v6.md §5).
  // A user-created category can't have a build-time page, and rather than add
  // a catch-all route to a build that has never had a dynamic segment, a
  // signed-in user reaches any of their categories - catalog or personal -
  // through Home filtered by it (/?cat=<slug>). These pages stay for
  // anonymous visitors, for SEO, and for anyone arriving by link.
  for (const category of data.categories) {
    const inCategory = data.prompts.filter(p => promptHasCategory(p, category.slug));
    writeRoute(`browse/${category.slug}`, renderCategoryPage(category.slug, inCategory, data));
  }

  for (const sequence of data.sequences) {
    writeRoute(`sequence/${sequence.slug}`, renderSequencePage(sequence, data));
  }

  for (const prompt of data.prompts) {
    writeRoute(`prompt/${prompt.slug}`, renderPromptDetail(prompt, data));
  }

  return `Built ${data.prompts.length} prompt page(s), ${data.categories.length} category page(s), ${data.sequences.length} sequence page(s), plus home/sequences/favorites/search/about/why-sign-in, the account-tier shells (account/admin/collections/categories/archived) and robots.txt.`;
}

// CLI entrypoint: `node scripts/build.mjs` (also what `npm run build` runs).
// watch.mjs imports runBuild() directly instead and never hits this branch.
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  try {
    console.log(await runBuild());
  } catch (err) {
    console.error('\n' + err.message + '\n');
    process.exit(1);
  }
}
