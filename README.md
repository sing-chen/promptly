# Promptly

Personal-use, static prompt catalog. Static HTML/CSS/vanilla JS, no framework, no backend, no database — see [BUILD_BRIEF.md](./BUILD_BRIEF.md) for the full spec.

## Setup

```bash
npm install
npm run build
```

There is no dev server (no live-reload, no local HTTP serving) — `dist/` is a plain static folder, open the generated files directly or serve them with any static file server while iterating.

Every change (content, templates, styles, client JS) requires a rebuild before it shows up in `dist/` — nothing in `dist/` is live-edited or watched by itself. For active editing sessions, run the watcher instead of calling `npm run build` by hand after every change:

```bash
npm run watch
```

This runs an initial build, then rebuilds automatically whenever anything under `prompts/`, `lib/`, `styles/`, or `public/` changes. A bad edit (invalid frontmatter, etc.) prints the validation error and keeps watching rather than crashing. Note: changes to `scripts/build.mjs` or `scripts/watch.mjs` themselves need a restart to take effect, since the watcher doesn't watch its own code.

## Adding a prompt

Add a Markdown file to `prompts/`, following the frontmatter shape documented in `BUILD_BRIEF.md` §3 (and on `/contributing` once built). Then:

```bash
npm run validate   # checks required fields + duplicate slugs
npm run build       # validates, then generates dist/ (pages + search index)
```

## Sequence Builder

A local drag-and-drop tool for managing prompt chains lives in `tools/sequence-builder/`. It's not part of the deployed site — open `tools/sequence-builder/index.html` directly in Chrome or Edge (requires the File System Access API) and point it at `prompts/`.

## Structure

- `prompts/` — one Markdown file per prompt, YAML frontmatter
- `scripts/build.mjs` — reads `prompts/`, validates, generates every static page + the search index into `dist/` (exports `runBuild()`, reused by `watch.mjs`)
- `scripts/watch.mjs` — rebuilds automatically on changes under `prompts/`, `lib/`, `styles/`, `public/`
- `scripts/validate-prompts.mjs` — standalone content validation (required fields, duplicate slugs)
- `lib/render.mjs` — HTML template functions for every page type; also reused client-side by `search.js` (it's plain browser-safe JS)
- `lib/content.mjs` — frontmatter loading/validation, the derived data model, and the search index shape
- `lib/schema.mjs` — controlled category/complexity vocabulary
- `lib/sequences.mjs`, `lib/collections.mjs`, `lib/useCases.mjs` — sequence/related-prompt/collection/use-case logic
- `styles/tokens.css`, `styles/base.css` — design tokens + component styles ("Stone & Signal")
- `public/scripts/` — client-side JS: `favorites.js` (favorites + copy-to-clipboard), `filters.js` (category/tag page facets), `search.js` (Fuse-powered search page)
- `tools/sequence-builder/` — standalone local authoring tool (sequence drag-and-drop + bulk delete/re-categorize)

## Status

Rewrite per `BUILD_BRIEF.md` v3 (Astro → custom static build script, Pagefind → Fuse.js) is functionally complete: content pipeline, full page generation, design system, search, favorites/copy, and Sequence Builder bulk admin are all built and verified. Remaining: deploy to Vercel, and a final accessibility QA pass.
