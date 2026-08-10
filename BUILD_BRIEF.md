# Promptly — Build Brief (v3: Static HTML/CSS/Vanilla JS)

Personal-use AI prompt catalog, with planned future access for teammates as read-only viewers. Static site, no accounts/login/auth, no backend, no database. Everything below is locked from a design session — build against it directly rather than re-deriving decisions.

**This version supersedes the original Astro/Pagefind-based brief.** It realigns the stack to match the [amplified thinker](../amplified%20thinker) site — static HTML/CSS/vanilla JS, deployed to Vercel — while preserving every product decision from the original brief (sitemap, taxonomy, sequencing model, favorites, copy-to-clipboard, page templates, design system, accessibility baseline). v3 adds site identity (naming, logo, nav), bulk admin, and crawlability, on top of v2's stack change. Sections changed are marked **(revised)** or **(new)**; everything else is unchanged.

---

## 0. Naming

- Site name: **Promptly**. Repo: [github.com/sing-chen/promptly](https://github.com/sing-chen/promptly) (private). `package.json` `name`, page `<title>` tags, nav logo text, and the favorites `localStorage` key all use "Promptly."
- Access model: repo stays **private**. Teammates who need to view the deployed site get added as **Read-role collaborators** (view only, no commit/push rights) rather than the repo going public. Exact hosting mechanics (GitHub Pages vs. going straight to Vercel) are decided at deploy time (§11).

---

## 1. Project Constraints (revised)

- **Static site** — no server, no database, no login/accounts. Built for single-author editing; viewing may extend to invited teammates (see §0).
- **Stack**: no site-generator framework (Astro dropped). A small custom Node.js build script (`scripts/build.mjs`) reads `/prompts`, validates frontmatter, and statically pre-renders every page in the sitemap as real `.html` files at build time. Output uses `/prompt/<slug>/index.html`-style directories so Vercel serves clean URLs natively — no rewrites needed.
- **The build script fully clears and regenerates `dist/` on every run** (no incremental build) — required so a prompt deleted via bulk admin (§4a) doesn't leave an orphaned page live on the site.
- Content still lives as one Markdown file per prompt in a `/prompts` folder, YAML frontmatter. The build script generates all pages (category, tag, detail, sequence, etc.) from that folder at build time — same principle as the original brief, just without a framework runtime.
- Shared markup (nav, prompt card, chip, filter rail) is implemented as plain JS template functions invoked by the build script — not framework components — mirroring how `nav.js` works in amplified thinker.
- "Submitting a prompt" = adding a file and rebuilding — there is no live submission form or moderation queue.
- Search moves from Pagefind to a build-time-generated Fuse.js index (see §7).

---

## 1a. Site Identity (new, finalized)

- **Logo**: "Prompt cursor" mark — a rounded tile (`rx` matching the design system's 4px chip radius, scaled up) in `--accent` blue, containing a white `>` chevron and a short cursor bar. Reads as a literal command-prompt symbol, legible down to ~20px nav size. Fixed blue-tile-on-white-glyph lockup, not theme-swapped — the tile carries its own contrast regardless of surrounding `--paper` value. Source file: `public/images/promptly-logo.svg`.
- **Nav menu** (finalized, deviates from the original brief's literal nav wording — see note below): logo + "PROMPTLY" wordmark (links home) · **Browse** · **Sequences** (active state = accent underline) · always-visible pill-shaped search field (flex-grow, never icon-triggered) · favorites count (`☆ N`).
  - **Deviation flag**: the original brief's §8 Homepage spec named only "logo, search field, Sequences link, favorites count" in the nav — no explicit Browse link. Browse was added deliberately for direct wayfinding to `/browse` rather than relying solely on homepage category tiles.
- **About** and **Contributing** are secondary/footer-level links, not primary nav items, to keep the nav strip lean.

---

## 2. Full Sitemap

```
Home                              /
Browse                            (category hub)
  Category page                   /browse/[category]
  Tag page                        /tag/[tag]
  Collection page                 /collections/[slug]
Search                            /search  (?q=&tag=&category=&model=)
  Zero-result state — suggests nearest tags, never a dead end
Prompt detail                     /prompt/[slug]
  Example output (tab/section on the page)
  Related prompts module
Sequences                         /sequences  (index of all chains)
  Sequence page                   /sequence/[slug]
Favorites                         /favorites  (localStorage, no login)
Adding a Prompt                   /contributing  (docs page — explains the file-based workflow, not a form)
About                             /about
```

No account pages, no moderation queue, no login — deliberately cut since this is single-author, view-only for invited teammates.

Every route above is emitted as a real static HTML file by the build script (e.g. `dist/prompt/draft-the-brief/index.html`), not rendered client-side from JSON — this matters for SEO, no-JS robustness, and instant direct-link loads.

**Crawlability**: `robots.txt` disallows all crawlers — this is a private tool, not a promoted destination, so there's no reason to be search-indexed. Easy to reverse later.

---

## 3. Content / Taxonomy Schema

Three distinct axes — do not conflate them:

- **category** — single-select, structural (where a prompt lives). Set: `writing`, `code`, `marketing`, `research`, `data-analysis`, `product`, `education`, `creative`, `ops-admin`.
- **tags** — multi-select, descriptive (how it's found). Facets: task type (debug/draft/summarize/translate…), format (single-shot/chained/agentic), model (claude/gpt/gemini/model-agnostic), tone, skill level. Controlled vocabulary — new tags should route through a review step conceptually, not sprawl freely.
- **sequence** — relational, *not* a tag. See §4.

### Frontmatter shape (per prompt file)

```yaml
---
title: Post-meeting follow-up
category: writing
tags: [sales-outreach, follow-up, claude, gpt]
sequence: client-onboarding      # optional
sequence_step: 2                 # optional, only if sequence is set
depends_on: draft-the-brief      # optional, for forked chains
example_output: /assets/examples/follow-up.png   # optional
---
Prompt body goes here, with {{variable_placeholders}} in double braces.
```

- The build script's validation step checks: required fields present (title, category, ≥1 tag), no duplicate slugs, before allowing a build to complete.
- `example_output` renders contextually on the detail page: image → inline preview + lightbox; other file types → filename/type/download card; long text → expandable block.

---

## 4. Sequences (chains) — Important Design Principle

**Sequencing is additive, not the norm.** Most prompts are and will remain standalone. Design around that:

- A sequence badge/chip only ever appears on the minority of prompts that are actually chained — it is never a slot every card reserves space for.
- Every prompt in a chain must still render as a fully standalone, fully usable page. The sequence relationship is a layer on top, never a dependency to use the prompt.
- Data model: `sequence` (slug a prompt belongs to — a prompt can join more than one), `sequence_step` (its position), optional `depends_on` (names the exact prior slug when a chain forks). No `sequence` field = standalone, same template, no missing-field weirdness.
- Category and Search pages include a **"Chain" filter**: *All prompts* / *In a sequence only* — since chained prompts are rare, make isolating them a dedicated control, not something you scan for visually.
- Detail page shows a slim step rail only when chained: `← prior step · you are here (step X of Y) · next step →`, plus a plain-language note on what input/output the handoff involves.
- `/sequences` index page lists each chain as its own mini flow (connected step cards).

### Sequence Builder (local tool, not part of the public site) — unaffected by the stack change

A drag-and-drop authoring tool, separate from the deployed site:

- Runs locally in-browser using the **File System Access API**, pointed at the `/prompts` folder — no upload, no server, direct read/write to the actual files.
- Each sequence is a board of draggable cards (same card component as the rest of the site). An "unassigned prompts" pool sits below — drag a card in to add it to the sequence (sets `sequence` + `sequence_step`), drag it out to detach (clears both fields, prompt returns to standalone).
- Reordering a card rewrites that file's `sequence_step` frontmatter immediately, with a "saved" indicator confirming the disk write.
- New sequence = new named board. Deleting a sequence clears the field on member files; the prompts themselves are untouched.
- This tool was already plain HTML/JS operating directly on frontmatter files — the stack change to the main site does not require rewriting it, only re-verifying it against the (unchanged) `/prompts` folder structure.

### 4a. Bulk Admin (new, extends the Sequence Builder above)

- Multi-select prompt deletion and re-categorization are added to the **same Sequence Builder tool** (`tools/sequence-builder/`) — not a new tool, and not a capability on the deployed site. The tool already has File System Access API read/write access to `/prompts`; extending it keeps all local, file-mutating admin actions in one place, consistent with "no live submission form."
- **Multi-select delete**: select N prompt cards → confirm → tool deletes the corresponding `.md` files from `/prompts`, with an on-screen confirmation (same pattern as the existing sequence_step-rewrite "saved" indicator). Since `/prompts` is git-tracked, an accidental delete is recoverable via `git checkout` as long as it hasn't been committed and pushed over — that's the safety net, not an in-tool undo.
- **Multi-select re-categorize**: select N prompt cards → choose a new `category` (and optionally add/remove tags) → tool rewrites frontmatter across all selected files.
- A prompt removed here that was a sequence member is handled the same way a manual removal would be — no special-cased cleanup beyond what already exists.

---

## 5. Favorites

- No accounts — favorites are a **client-side preference**, stored as an array of prompt slugs in `localStorage`.
- Star icon toggles on every card and on the detail page. One click, no confirmation, no page reload.
- `/favorites` renders the same card grid as a category page, filtered client-side to starred slugs.
- Empty state: "Nothing starred yet" + link back to Browse.
- Optional JSON export of the favorites list, to carry over if switching browsers/devices (no sync backend needed for single-user).

---

## 6. Copy-to-Clipboard

- Every prompt must be one-click copyable.
- A pinned copy button sits top-right of the prompt body block on the detail page, and as a small icon action on every card in grids/search results.
- On click: button confirms "Copied" in place for ~2 seconds, then reverts. No toast notification needed.

---

## 7. Search (revised)

- Built at **build time** by the custom build script into a static JSON index (Fuse.js-compatible, replacing Pagefind) — same approach as amplified thinker's `search-index.json` + `fuse.min.js`. Queried entirely client-side, no server round trip.
- Weighting: tags & category weighted highest, title/purpose line next, full prompt body lowest — configured via Fuse's weighted `keys` option.
- Sequence membership is indexed too — searching a chain's topic should surface every step in it.
- Typo tolerance via Fuse's fuzzy matching (threshold-tuned); basic synonym mapping (e.g. "email" ↔ "outreach") is hand-rolled logic layered on top of the index — same effort this would've taken under Pagefind.
- Facets (category, tag, model, complexity) narrow results in real time without a full reload.
- Zero-result state suggests the 3 nearest tags — never a dead end.
- Client-side querying needs a browser build of Fuse.js (a vendored `fuse.min.js`, same pattern as amplified thinker) — the build-time index generation itself only needs to emit structured JSON, not Fuse as an npm dependency.

---

## 8. Page Templates (layout specs)

### Homepage `/`
Top to bottom: nav (logo, **always-visible** search field — never hidden behind an icon, Sequences link, favorites count) → one-line framing stat ("128 prompts across 9 categories, organized into 6 sequences") → category tile grid (icon + name + count) alongside a secondary "browse by use case" tile set (task-oriented: "Debugging," "First drafts") → one featured/curated collection rail → "recently added" rail of prompt cards → a quiet single-line contribute note (not a banner).

### Category page `/browse/[category]`
Breadcrumb (Home / Browse / [Category]) → sticky left filter rail: **Model**, **Complexity** (Simple/Multi-step/Agentic), **Chain** (All prompts / In a sequence only), **Sort** → result grid of prompt cards → load-more pagination (not numbered pages, to preserve filter state).

**Prompt card anatomy** (used everywhere — homepage rails, category grid, search results, favorites, related rails):
- Title (bold display weight)
- Purpose line — one sentence: what it's for, not what it says
- Tag chips (category/tag = primary-accent tint; sequence badge = secondary/amber tint, always includes literal text like "step 2 of 4" — never color alone)
- Favorite star + copy icon, top-right, always visible (not hover-only)
- Footer: updated date, small icon if an example output is attached

### Prompt Detail page `/prompt/[slug]`
Header (title, purpose line, category+tag chips, favorite toggle) → **sequence rail** (only rendered if chained) → prompt body block with pinned copy button, `{{variables}}` visually highlighted → example output section (image/file/text, only if attached) → notes ("when to use / when not to," authored per-prompt) → related prompts rail (same category, overlapping tags, or same sequence) → sidebar: compatibility (model badges, complexity), added/last-revised dates, sequence membership if any.

### Sequence page `/sequence/[slug]`
Breadcrumb → chain name + one-line description → horizontal flow of connected step cards (step number, title, one-line note on what it consumes/produces), left-to-right with a visible connector between them.

### Favorites page `/favorites`
Same grid/card component as Category page, filtered client-side to starred slugs. Empty state as above.

---

## 9. Design System — "Stone & Signal"

### Typography — "Grotesk Clean" (locked)

Sans-only. No serif anywhere. Hierarchy comes from **weight and size**, not a face change.

```css
--display: "Segoe UI Semibold", "Segoe UI", Arial, sans-serif;   /* anything titled or acted on */
--sans:    "Segoe UI", Calibri, Arial, sans-serif;               /* body / reading text */
--mono:    Consolas, "Cascadia Mono", "SF Mono", monospace;      /* prompt bodies, metadata labels */
```

Rules:
- Headings/titles/nav-logo/card-titles/buttons: `--display`, `font-weight:700`, tight negative letter-spacing (roughly `-0.005em` at small sizes down to `-0.02em` at large sizes).
- Body copy: `--sans`, regular weight.
- Chips and micro-labels: uppercase, bold, small (9–11px), `letter-spacing: .03–.06em`, **4px border-radius** (not pill-shaped) — deliberately denser/more utilitarian than a soft rounded chip.
- Approximate scale: h1 24–38px / h2 17–24px / card titles ~13–13.5px / body 13–15px / captions & mono labels 9.5–12.5px.
- Nav logo: uppercase, bold, small (~13px).

### Color tokens

**Light** (default):

```css
--paper:        #EEEAE1;  /* warm stone base — deliberately not blue/cool */
--surface:      #FFFFFF;
--well:         #DFD8C9;  /* recessed level — code blocks, filter rails */
--ink:          #1C1912;
--ink-soft:     #59544A;
--ink-faint:    #8A8477;
--line:         #CFC6B4;
--line-soft:    #DED7C8;
--accent:       #1B5FC2;  /* Royal Blue — primary, every action */
--accent-ink:   #FFFFFF;
--accent-soft:  #DCE8F7;
--accent-hover: #154C9C;
--accent-active:#113E7F;
--seq:          #9A5008;  /* Amber — secondary, sequence membership ONLY, never an action color */
--seq-soft:     #F2E2C8;
--danger:       #A6392E;
--danger-soft:  #F1DAD3;
```

**Dark**:

```css
--paper:        #131110;
--surface:      #1D1B17;
--well:         #100F0C;
--ink:          #F1ECE1;
--ink-soft:     #B8AF9C;
--ink-faint:    #7C7566;
--line:         #3A362C;
--line-soft:    #262319;
--accent:       #6FA8E8;
--accent-ink:   #0B1A2E;
--accent-soft:  #1E3352;
--accent-hover: #8CBBEE;
--accent-active:#4E86C7;
--seq:          #D79A4E;
--seq-soft:     #3A2A14;
--danger:       #E2948A;
--danger-soft:  #3A1F1B;
```

Theme switching: define tokens on `:root` (light default), redefine under `@media (prefers-color-scheme: dark)`, then again under `:root[data-theme="dark"]` / `:root[data-theme="light"]` so an explicit toggle overrides the OS preference in both directions.

**Radii & elevation**:

```css
--radius-sm: 4px;
--radius: 8px;
--radius-lg: 12px;
--shadow-sm: 0 1px 2px rgba(20,16,8,.10), 0 3px 8px rgba(20,16,8,.08);
--shadow:    0 3px 6px rgba(20,16,8,.12), 0 16px 40px rgba(20,16,8,.16);
```

(Use rgba(0,0,0,…) heavier values for the dark theme shadows — roughly double the alpha.)

### Why blue + amber (rationale to preserve, not re-derive)

- **Blue** = trust/dependability, carries every interactive action (buttons, links, active nav/filter states).
- **Amber** = warmth/energy, reserved *exclusively* for sequence membership — never used for buttons or general actions.
- They're **complementary** (opposite on the color wheel), not analogous — chosen specifically so the sequence badge is distinguishable from a normal tag chip through color alone, which matters because sequences are the rare case and need to visually stand out, not blend in. This pairing also stays legible under the common forms of color-blindness (unlike a blue/green pairing, which is a frequent confusion pair).
- Paper is a warm stone neutral, not cool/blue-grey — an earlier "Ice & Paper" direction read as clinical; this warmed version was the fix.

### WCAG accessibility baseline (verified, do not regress)

- `--accent` vs white: **6.07:1** (passes AA normal text, 4.5:1 threshold)
- `--seq` vs white: **5.96:1** (passes AA normal text)
- `--ink` vs `--paper`: **15.1:1** (passes AAA, 7:1 threshold)
- Every accent-on-soft-tint chip pairing (e.g. `--accent` text on `--accent-soft` background) must independently clear 4.5:1 — check against the tint, not just against white.
- **Never rely on color alone** for meaning: sequence badges always carry literal text ("step 2 of 4"), not just an amber color cue.
- All interactive elements need a visible `:focus-visible` state (not just `:hover`).
- Respect `prefers-reduced-motion`.

### Elevation system — three surface levels, not two

- `--well` sits *below* `--paper` — for recessed content (prompt body/code blocks, filter rails). Give it a subtle inset shadow.
- `--surface` sits *above* `--paper` — for raised content (cards, nav, buttons). Always carries a shadow: `--shadow-sm` at rest, `--shadow` on hover, with a small `translateY(-2px)` lift on cards specifically.
- Nothing should sit flush with `--paper` — every surface should visibly declare whether it's advancing or receding. This was a deliberate fix after an earlier pass felt too flat/clinical.

### Iconography

Single-weight outline icons, `stroke-width: 1.6`, rounded caps/joins, no fill except active/favorited states (the favorite star fills solid with `--accent` when starred). Icon set needed: search, favorite (star), copy, sequence (chain-link style), category (folder-ish), example (image frame), prompt (document).

### Core components (build these; each needs its real states, not just a resting frame)

- **Button** — primary (accent fill, white text, `shadow-sm`→`shadow` on hover, pressed/active = darker + slight translateY, disabled = faint grey/muted), secondary (outline, hover = accent border+text, focus = accent ring via `box-shadow`), ghost (text-only, hover = subtle background).
- **Copy-to-clipboard** — pinned button, default/hover/copied (checkmark icon, "Copied" text, reverts after ~2s).
- **Favorite star** — idle (outline)/hover (accent-tinted outline)/favorited (solid fill + soft accent-tinted ring).
- **Chip** — category/tag variant (accent-tinted, uppercase, bold, 4px radius); sequence variant (amber-tinted, same shape, always includes "step X of Y" text).
- **Search field** — pill-shaped, persistently visible in nav (not icon-triggered), focus state = accent border + soft ring.
- **Nav strip** — logo (bold uppercase display face), links (active = accent underline), search field, favorites count.
- **Prompt card** — see §8 anatomy above; `shadow-sm` at rest, lifts to `shadow` + `translateY(-2px)` on hover.

---

## 10. Build Order (revised)

1. ~~Scaffold custom build script + `/prompts` folder~~ — done.
2. ~~Remove Astro scaffold, relocate reusable content/logic~~ — done.
3. ~~Rename project to Promptly~~ — done.
4. ~~Create GitHub repo (private), push~~ — done: [github.com/sing-chen/promptly](https://github.com/sing-chen/promptly).
5. ~~Design site identity: logo + nav~~ — done (§1a).
6. Build the content pipeline (`scripts/build.mjs`): frontmatter parsing/validation, internal data model. Add an `example_output` field + placeholder asset to one seed prompt (none currently have one).
7. Build static page generation for every sitemap route, including `robots.txt`; clean-rebuild `dist/` every run.
8. Port design tokens + shared interactive JS (nav using the finalized logo/nav, prompt card, chip, copy button, favorite star, filter rail).
9. Wire up build-time Fuse index generation + client-side `search.js` (vendored Fuse browser build).
10. Wire up favorites `localStorage` logic.
11. Extend the Sequence Builder with bulk admin (§4a) and verify it against the renamed/relocated `/prompts` folder.
12. Deploy to Vercel (native URL).
13. QA pass against the accessibility baseline.

## 11. Deployment (revised)

- GitHub repo: private, teammates added as **Read-role collaborators** for view access (§0) — no commit/edit rights regardless of visibility.
- Vercel project, native `*.vercel.app` URL — no custom domain. Vercel supports deploying from a private repo without it needing to be public.
- Vercel build command runs the build script (e.g. `npm run build` → `node scripts/build.mjs`) before serving `dist/` — same zero-config static hosting model amplified thinker uses, with an actual build step instead of hand-edited HTML.
- A `deploy.bat` equivalent (git add/commit/push) triggers Vercel's Git-integration auto-deploy, matching amplified thinker's workflow.
- No Edge Middleware planned initially — every page here is fully pre-rendered at build time (unlike amplified thinker's client-rendered `news.html`, which needed middleware to serve crawlers a prerendered shell). Add middleware later only if a specific page turns out to need bot-specific handling.

---

*This brief reflects a completed design session — palette, type, component states, IA, and the sequencing/favorites mechanics are all decided. Nothing here should be re-litigated from scratch; treat deviations as a deliberate change to flag, not an open question. The stack change documented in this v2 (Astro → custom static build script, Pagefind → Fuse.js) was discussed and approved explicitly; it is itself locked, not open for re-derivation.*
