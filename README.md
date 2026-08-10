# Prompt Library

Personal-use, static prompt catalog. Astro + Pagefind, no backend, no database.

## Setup

```bash
npm install
npm run dev
```

## Adding a prompt

Add a Markdown file to `src/content/prompts/`, following the frontmatter shape documented on `/contributing`. Then:

```bash
npm run validate   # checks required fields + duplicate slugs
npm run build       # builds the site + pagefind search index
```

## Sequence Builder

A local drag-and-drop tool for managing prompt chains lives in `tools/sequence-builder/`. It's not part of the deployed site — open `tools/sequence-builder/index.html` directly in Chrome or Edge (requires the File System Access API) and point it at `src/content/prompts`.

## Structure

- `src/content/prompts/` — one Markdown file per prompt (content collection, schema in `src/content/config.ts`)
- `src/pages/` — routes (category, tag, collection, prompt detail, sequence, search, favorites, etc.)
- `src/components/` — PromptCard, Chip, FilterRail, SequenceRail, Icon
- `src/styles/tokens.css` — design tokens ("Stone & Signal")
- `scripts/validate-prompts.mjs` — pre-build content validation
- `tools/sequence-builder/` — standalone local authoring tool

## Status

Scaffolded per the build brief (§10 order 1–6 done; step 7, seeding with a full sequence + standalone prompts, included; step 8, the Sequence Builder, included). Not yet run through `npm install` / `npm run build` in this environment (no Node.js available) — verify locally before relying on it.
