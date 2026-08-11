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

**Prompt card anatomy** (used everywhere — homepage rails, category grid, search results, favorites):
- Title (bold display weight)
- Purpose line — one sentence: what it's for, not what it says
- Tag chips (soft accent tint; sequence badge uses the same single accent, always includes literal text like "step 2 of 4" — never color alone)
- Favorite star + copy icon, top-right, always visible (not hover-only)
- Footer: updated date, small icon if an example output is attached

### Prompt Detail page `/prompt/[slug]` (revised — see §9a for the layout session that produced this)
Single-column, two-box **bento** layout — deliberately mobile-first, no side rail (a right rail was tried and rejected specifically because it doesn't collapse cleanly to narrow widths):

- **Header**: title with a solid-fill **category badge** inline beside it (not a soft-tint chip — see §9 for the badge color system), purpose line underneath.
- **Prompt box**: box label "Prompt" with **Favorite** (icon + text, toggles to "Favorited") and **Copy** (icon-only) actions together in the box header, top-right. Body text below with `{{variables}}` visually highlighted. No pinned/floating button — both actions live in the box header.
- **Notes box**: box label "Notes" (renamed from "when to use / when not to"), authored per-prompt free text. Below a hairline divider: the **sequence stepper** (chain name, "Step X of Y", back/next links) — only rendered if the prompt is chained. Below a second hairline divider: **Created** / **Modified** dates.
- **Example output** section (image/file/text) renders below the bento pair, only if `example_output` is attached.

**Deliberately cut from this page for now** (flagged as reintroduce-later, not a final decision):
- **Related prompts module** — removed entirely, including its query-time computation. If reintroduced, needs its own design pass, not a straight port of the old card-grid rail.
- **Tags** and **compatible models** — no longer surfaced on the detail page. Still fully present in frontmatter and still used for search/filtering.
- **Complexity** — removed from the detail page specifically (reasoning: it's a *pre-click* filtering signal for browse/search results, not something a reader needs once they've already opened the prompt). Still used in the category/search filter rail (§8, category page spec) and in `lib/schema.mjs`'s `COMPLEXITY_LEVELS` — this is a display-only cut, not a data model change.
- **Source / attribution link** — considered during the layout session, explicitly decided against. Not implemented.

**Standing open item, not yet designed**: browsing a list and opening a prompt is still a full navigation away from results — no quick-view/slide-over/prev-next-through-results exists yet. Flagged during the layout session as something to prototype once the depth/interactivity pass (§9a) is scoped, not forgotten.

### Sequence page `/sequence/[slug]`
Breadcrumb → chain name + one-line description → horizontal flow of connected step cards (step number, title, one-line note on what it consumes/produces), left-to-right with a visible connector between them.

### Favorites page `/favorites`
Same grid/card component as Category page, filtered client-side to starred slugs. Empty state as above.

---

## 9. Design System — "Botanical Quiet A" (revised — supersedes "Stone & Signal")

**§9 was fully retheme'd in a later design session (commit `d90c04b`) and is locked as of that commit; the layout/depth work in §9a is a separate, later, not-yet-complete pass on top of it.** The blue/amber "Stone & Signal" system originally documented here (Segoe UI display face, royal blue + amber accents) was replaced wholesale — treat this section as current truth, not the excerpt above.

### Typography (locked)

Single sans stack for **both** display and body text — no serif, no separate mono for the prompt body. Mono is kept only for genuinely tabular/code-flavored spots (the contributing-page snippet, filter-group micro-labels).

```css
--sans: system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
--display: var(--sans);   /* same stack — hierarchy comes from weight/size only */
--mono: ui-monospace, "Cascadia Mono", "SF Mono", Consolas, monospace;
```

- Headings/titles/nav-logo/card-titles/buttons: `font-weight:700`, tight negative letter-spacing (`-0.01em` to `-0.02em`).
- Chips: uppercase, bold, 10px, `letter-spacing: .05em`, **4px border-radius** (not pill-shaped).
- Approximate scale unchanged from the original brief: h1 24–38px / h2 17–24px / card titles ~13.5px / body 13–15px.

### Color tokens

**Light** (default) — source of truth is `styles/tokens.css`:

```css
--paper:        #F4F6F3;  /* warm sage paper */
--surface:      #FFFFFF;
--well:         #E7EBE4;
--ink:          #1F2B27;  /* dark ink */
--ink-soft:     #586860;
--ink-faint:    #8B978F;
--line:         #DCE4DD;
--line-soft:    #E6EEE4;
--accent:       #2D6A63;  /* deep teal — the ONLY accent, carries every action AND sequence membership */
--accent-ink:   #FFFFFF;
--accent-soft:  #E1EBE6;
--accent-hover: #245650;
--accent-active:#1C433F;
--seq:          #2D6A63;  /* same value as --accent — the old indigo/amber "sequence" pair was consolidated */
--seq-soft:     #E1EBE6;
--danger:       #A6392E;
--danger-soft:  #F1DAD3;
```

**Dark**:

```css
--paper:        #121614;
--surface:      #1B211D;
--well:         #0F1311;
--ink:          #EFEAE0;
--ink-soft:     #B3AFA0;
--ink-faint:    #7A796D;
--line:         #333A34;
--line-soft:    #242923;
--accent:       #62BBA8;
--accent-ink:   #08211C;
--accent-soft:  #1B3530;
--accent-hover: #7ECDBC;
--accent-active:#4C9C8C;
--seq:          #62BBA8;
--seq-soft:     #1B3530;
--danger:       #E2948A;
--danger-soft:  #3A1F1B;
```

Theme switching mechanics are unchanged from the original brief: tokens on `:root` (light default), redefined under `@media (prefers-color-scheme: dark)`, then again under `:root[data-theme="dark"]` / `:root[data-theme="light"]` so an explicit toggle overrides the OS preference in both directions.

**Radii & elevation** (values carried over unchanged from the original brief):

```css
--radius-sm: 4px;
--radius: 8px;
--radius-lg: 12px;
--shadow-sm: 0 1px 2px rgba(20,16,8,.10), 0 3px 8px rgba(20,16,8,.08);
--shadow:    0 3px 6px rgba(20,16,8,.12), 0 16px 40px rgba(20,16,8,.16);
```

### Category badge colors (new — from the §9a layout session)

The prompt detail page's category badge (§8) needs to read as distinct from the single-accent UI, so it uses its own small palette of **solid, theme-independent** hues — fixed hex values, not `:root`/dark-mode tokens, so a given category's color doesn't shift between light and dark (same logic as a language-color dot in a repo file list). Assigned by index into `CATEGORIES` (`lib/schema.mjs`) modulo the hue list, via `categoryHue()` in `lib/render.mjs`:

```css
--cat-clay:  #A8552A;
--cat-ochre: #8A6817;
--cat-blue:  #34647F;
--cat-plum:  #7A4780;
--cat-moss:  #566627;
--cat-rose:  #8A3B4E;
```

White text on all six. These are intentionally a separate system from the soft-tint `.chip` used for tags — solid fill reads as a badge next to a title, soft tint reads as a filterable facet in a list. If tags/models return to the detail page (see §8), they should stay on the soft-tint `.chip` system, not borrow these solid hues.

### Why a single accent (rationale — supersedes the old blue+amber rationale)

- The original two-color system (blue for actions, amber exclusively for sequence membership) was replaced with **one accent doing both jobs**. Sequence badges still always carry literal text ("step X of Y") — that was the actual accessibility requirement, not the second hue — so dropping the color split didn't reintroduce a color-only-meaning problem.
- Paper stayed a warm neutral (sage now, stone before) — the "not cool/clinical" rationale from the original brief still holds, just re-anchored to green rather than beige.
- The category badges (above) are where a multi-hue system now lives instead — deliberately scoped to *one field* (category) rather than spread across accent/sequence/action colors, so it can't be confused with interactive/action styling.

### WCAG accessibility baseline (recomputed against current tokens — do not regress)

- `--accent` (light) vs white: **6.26:1** (passes AA normal text, 4.5:1 threshold)
- `--accent` (dark) vs `--surface` (dark): **7.17:1**
- `--ink` vs `--paper` (light): **13.48:1** / (dark): **15.22:1** (both pass AAA, 7:1 threshold)
- `--accent` text on `--accent-soft` background (light): **5.14:1**
- Category badges (white text on solid fill) — all six re-verified after the layout session caught `--cat-ochre` originally failing at 4.41:1; darkened to `#8A6817` (**5.16:1**). Full set: clay 5.25, ochre 5.16, blue 6.41, plum 6.91, moss 6.31, rose 7.46 — all clear AA.
- **Never rely on color alone** for meaning: sequence badges always carry literal text ("step 2 of 4"), not just a color cue.
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
- **Chip** — soft accent-tinted, uppercase, bold, 4px radius, used for tags/sequence badges in card grids (always includes "step X of Y" text on sequence badges — never color alone). The prompt detail page's category badge is a separate solid-fill component — see §9's "Category badge colors."
- **Search field** — pill-shaped, persistently visible in nav (not icon-triggered), focus state = accent border + soft ring.
- **Nav strip** — logo (bold uppercase display face), links (active = accent underline), search field, favorites count.
- **Prompt card** — see §8 anatomy above; `shadow-sm` at rest, lifts to `shadow` + `translateY(-2px)` on hover.

---

## 9a. Layout & Depth Pass (new — in progress, started after §9's retheme shipped)

A second design pass, separate from and later than the §9 retheme, focused on layout/structure/interactivity rather than color/type. Status as of the most recent work:

**Done:**
- Prompt detail page rebuilt as the single-column bento layout described in §8 — went through several mockup rounds (6 broad layout directions → narrowed to bento vs. single-card → refined into the current two-box version) before implementation.
- Category badge color system (§9) introduced as part of this pass.

**Explicitly open / not yet touched by this pass** — the color/font retheme (§9) recolored these in place without redesigning their structure:
- **Sequence-rail treatment** on other pages (the `/sequence/[slug]` flow view, `/sequences` index) — still the original box/connector treatment.
- **Filter rail** (category/search pages, §8) — still the original layout.
- **Chip/tag visual style** in card grids generally (as opposed to the detail-page category badge, which this pass did redesign).
- **Depth and interactivity** — shadows, possible flip-card or modal patterns, are unexplored. Every other page still uses the pre-existing shadow/card treatment untouched.
- **Quick-view / reduced back-and-forth** between a list (browse/search) and the detail page — flagged during the detail-page mockup rounds as worth prototyping once this pass reaches interactivity, not designed yet.
- **Tags, compatible models, complexity, and source/attribution on the detail page** — all explicitly considered and cut for now (§8); tags/models may return with their own design treatment, complexity is judged not worth detail-page space, source was tried and rejected.

Design references cited going into this pass: Amplified Thinker (sibling site, same teal/sage identity) and MasterClass (clean, modern, easy to navigate) — originally cited for the §9 color/font work, carried forward as a general quality bar rather than a literal reference for layout.

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

*IA, the sequencing/favorites mechanics, and the stack change (Astro → custom static build script, Pagefind → Fuse.js) are locked from the original design session; nothing there should be re-litigated from scratch. §9 (palette/type) is locked as of commit `d90c04b`. §9a (layout/depth) is an active, still-partial pass — its "Done" items are locked, its "explicitly open" items are not yet designed and should be treated as open questions, not oversights, until §9a is revisited.*
