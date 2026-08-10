# Promptly

Personal-use, static prompt catalog. Static HTML/CSS/vanilla JS, no framework, no backend, no database — see [BUILD_BRIEF.md](./BUILD_BRIEF.md) for the full spec.

## Setup

```bash
npm install
npm run build
```

There is no dev server — open the generated files in `dist/` directly, or serve them with any static file server while iterating.

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
- `scripts/build.mjs` — reads `prompts/`, validates, generates every static page + the search index into `dist/`
- `scripts/validate-prompts.mjs` — standalone content validation (required fields, duplicate slugs)
- `lib/sequences.mjs`, `lib/collections.mjs` — sequence/related-prompt/collection logic, consumed by `scripts/build.mjs`
- `styles/tokens.css`, `styles/base.css` — design tokens ("Stone & Signal")
- `public/scripts/favorites.js` — favorites (localStorage) + copy-to-clipboard, shared across generated pages
- `tools/sequence-builder/` — standalone local authoring tool

## Status

Rewrite in progress per `BUILD_BRIEF.md` v2 (Astro → custom static build script, Pagefind → Fuse.js). Astro scaffold removed; content, design tokens, and reusable logic ported. `scripts/build.mjs` (page generation) not yet written.
