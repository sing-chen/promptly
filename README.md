# Promptly

Personal-use prompt catalog. Static HTML/CSS/vanilla JS, no framework.

Two tiers. **Anonymous visitors** get a pre-built static site — see
[BUILD_BRIEF.md](./BUILD_BRIEF.md). **Signed-in users** get a Supabase-backed
library of their own: signing up copies the whole published catalog into their
account, and from then on every prompt they see is theirs to edit, archive,
duplicate or delete. That model is specified in
[BUILD_BRIEF_v5.md](./BUILD_BRIEF_v5.md) and the schema is documented in
[supabase/README.md](./supabase/README.md).

[BUILD_BRIEF_v4.md](./BUILD_BRIEF_v4.md) is historical — it describes an
earlier fork-on-edit model that v5 replaced. Read it for the original *why*,
not for how anything works now.

## Setup

```bash
npm install
npm run build
```

`dist/` is a plain static folder. To preview it over HTTP (needed for the
client-side JS, which uses ES modules and so won't run from `file://`):

```bash
node scripts/dev-server.mjs    # serves dist/ on http://localhost:4173
```

Set `PORT` to use a different port. It's a zero-dependency static file server,
not part of the build pipeline.

Every change (content, templates, styles, client JS) requires a rebuild before it shows up in `dist/` — nothing in `dist/` is live-edited or watched by itself. For active editing sessions, run the watcher instead of calling `npm run build` by hand after every change:

```bash
npm run watch
```

This runs an initial build, then rebuilds automatically whenever anything under `prompts/`, `lib/`, `styles/`, or `public/` changes. A bad edit (invalid frontmatter, etc.) prints the validation error and keeps watching rather than crashing. Note: changes to `scripts/build.mjs` or `scripts/watch.mjs` themselves need a restart to take effect, since the watcher doesn't watch its own code.

## Adding a prompt

**Through the app, not the filesystem.** Prompts live in Supabase — `prompts/*.md`
is retired v3 test content and is no longer read by the build (see
[supabase/README.md](./supabase/README.md), "There is no markdown catalog").

- **A prompt for yourself**: sign in, "+ New Prompt".
- **A catalog prompt** (copied into every user's library): sign in as an admin,
  tick "Publish to everyone" — it's created as a draft — then publish it from
  `/admin/`. Publishing triggers a rebuild automatically if the deploy hook is
  configured, so it reaches anonymous visitors too.

`npm run validate` still lints `prompts/*.md`, but only as a standalone tool for
that legacy directory; it has no bearing on what ships.

## Sequence Builder

A local drag-and-drop tool for managing prompt chains lives in `tools/sequence-builder/`. It's not part of the deployed site — open `tools/sequence-builder/index.html` directly in Chrome or Edge (requires the File System Access API) and point it at `prompts/`.

## Structure

- `prompts/` — retired v3 test content; **not read by the build** (see "Adding a prompt")
- `scripts/build.mjs` — fetches published catalog prompts from Supabase, validates, generates every static page + the search index into `dist/` (exports `runBuild()`, reused by `watch.mjs`)
- `scripts/dev-server.mjs` — zero-dependency static server for previewing `dist/`
- `scripts/watch.mjs` — rebuilds automatically on changes under `prompts/`, `lib/`, `styles/`, `public/`
- `scripts/validate-prompts.mjs` — standalone content validation (required fields, duplicate slugs)
- `lib/render.mjs` — HTML template functions for every page type; also reused client-side by `search.js` (it's plain browser-safe JS)
- `lib/content.mjs` — frontmatter loading/validation, the derived data model, and the search index shape
- `lib/schema.mjs` — category helpers shared by the build and the browser (`promptHasCategory`, `readableInk`, the picker palette). Was the controlled category vocabulary until BUILD_BRIEF_v6.md made categories per-user rows; there is no hardcoded list any more
- `lib/sequences.mjs` — sequence logic (collections have no build-time equivalent - they're user-generated only, live in Supabase, see `supabase/README.md`)
- `styles/tokens.css`, `styles/base.css` — design tokens + component styles ("Stone & Signal"), now including the sidebar nav layout. Category colour is *not* a token: it is stored per category and inlined per element, with the soft/dark variants derived via `color-mix` (BUILD_BRIEF.md §9s)
- `public/scripts/` — client-side JS:
  - *data*: `supabaseClient.js`/`db.js` (data layer), `personalizeData.js` (loads the signed-in library, triggers seeding), `favoritesStore.js` (two-tier favourites: localStorage by slug when signed out, the `favorites` table by prompt id when signed in)
  - *rendering*: `personalize.js` (rebuilds a static prompt table as the caller's library; owns row actions and bulk select), `viewToggle.js` (table/grid), `quickview.js` (prompt modal), `search.js` (Fuse-powered search), `filters.js`/`categoryPills.js` (pill filter bars), `categoriesNav.js` (swaps the sidebar's catalog category list for the caller's own)
  - *pages/features*: `auth.js` (sign-in/up + nav state), `accountStats.js` (`/account/` library metrics), `newPrompt.js` (create/edit modal, incl. admin publish + notify controls), `newCollection.js`, `collections.js`, `collectionsNav.js`, `categories.js` (`/categories/` CRUD, incl. delete-with-reassignment), `archived.js`, `admin.js`
  - *chrome*: `favorites.js` (star/copy wiring, theme + mobile drawer), `sidebarCollapse.js`, `sidebarResize.js`, `confirmDialog.js`, `quickViewRegistry.js`
- `lib/env.mjs` — dependency-free `.env.local` loader used by `scripts/build.mjs`
- `supabase/` — account-tier schema/RLS migrations + setup docs (see [supabase/README.md](./supabase/README.md))
- `tools/sequence-builder/` — standalone local authoring tool (sequence drag-and-drop + bulk delete/re-categorize)

## Status

Both tiers are built and deployed to Vercel production.
[supabase/README.md](./supabase/README.md) is the source of truth for what's
built vs. outstanding.

**Anonymous tier**: content pipeline, full page generation, design system,
search, favourites/copy, and Sequence Builder bulk admin.

**Account tier** (owned copies — [BUILD_BRIEF_v5.md](./BUILD_BRIEF_v5.md)):
Supabase schema/RLS, sign-in/up, per-user libraries seeded from the catalog,
edit/archive/delete/duplicate with bulk actions, collections, database-backed
favourites, admin curation with promote/publish, and automatic redeploy when
the catalog changes. The nav is a left sidebar (replacing v3's top nav).

**Known gaps before public launch**: transactional email/SMTP is unconfigured,
so sign-up confirmation and password reset don't actually send; the
notify-and-merge screen for catalog updates is specced but not built; and the
database still holds test content to be cleared before canonical prompts are
seeded.
