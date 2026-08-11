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
- Content still lives as one Markdown file per prompt in a `/prompts` folder, YAML frontmatter. The build script generates all pages (category, detail, sequence, etc.) from that folder at build time — same principle as the original brief, just without a framework runtime.
- Shared markup (nav, prompt card, chip, filter rail) is implemented as plain JS template functions invoked by the build script — not framework components — mirroring how `nav.js` works in amplified thinker.
- "Submitting a prompt" = adding a file and rebuilding — there is no live submission form or moderation queue.
- Search moves from Pagefind to a build-time-generated Fuse.js index (see §7).

---

## 1a. Site Identity (new, finalized)

- **Logo**: "Prompt cursor" mark — a rounded tile (`rx` matching the design system's 4px chip radius, scaled up) in `--accent` blue, containing a white `>` chevron and a short cursor bar. Reads as a literal command-prompt symbol, legible down to ~20px nav size. Fixed blue-tile-on-white-glyph lockup, not theme-swapped — the tile carries its own contrast regardless of surrounding `--paper` value. Source file: `public/images/promptly-logo.svg`.
- **Nav menu** (finalized, deviates from the original brief's literal nav wording — see note below): logo + "PROMPTLY" wordmark (links home) · ~~**Browse**~~ · **Sequences** (active state = accent underline) · always-visible pill-shaped search field (flex-grow, never icon-triggered) · favorites count (`☆ N`). **Browse link removed in §9g** — Home absorbed the Browse hub's job, so a separate nav link to the same destination became redundant.
  - **Deviation flag**: the original brief's §8 Homepage spec named only "logo, search field, Sequences link, favorites count" in the nav — no explicit Browse link. Browse was added deliberately for direct wayfinding to `/browse` rather than relying solely on homepage category tiles; §9g's removal brings the nav back in line with that original spec, just for a different reason (the hub itself is gone, not a return to the original rationale).
- **About** and **Contributing** are secondary/footer-level links, not primary nav items, to keep the nav strip lean.

---

## 2. Full Sitemap

```
Home                              /  (all-prompts table + live filters, §9g — absorbs the old Browse hub)
  Category page                   /browse/[category]
  Collection page                 /collections/[slug]
Search                            /search  (?q=&category=)
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

**`models`, `complexity`, and `tags` are no longer captured, as of the field-reduction pass (§9c) — at least for now.** The two axes below are what's left; §9c has the full rationale and what was removed as a result.

- **category** — multi-select as of the §9b tabular-browse pass (was single-select; most prompts still carry just one in practice), structural (where a prompt lives). Set: `writing`, `code`, `marketing`, `research`, `data-analysis`, `product`, `education`, `creative`, `ops-admin`. Frontmatter field is `categories: [...]` (array, 1+ entries) — see §9b.
- **sequence** — relational, *not* a tag. See §4.

### Frontmatter shape (per prompt file)

```yaml
---
title: Post-meeting follow-up
categories: [writing]            # array, 1+ entries — see §3 note on the §9b multi-category change
sequence: client-onboarding      # optional
sequence_step: 2                 # optional, only if sequence is set
depends_on: draft-the-brief      # optional, for forked chains
example_output: /assets/examples/follow-up.png   # optional
---
Prompt body goes here, with {{variable_placeholders}} in double braces.
```

- The build script's validation step checks: required fields present (title, ≥1 category), no duplicate slugs, before allowing a build to complete.
- `example_output` renders contextually on the detail page: image → inline preview + lightbox; other file types → filename/type/download card; long text → expandable block.

---

## 4. Sequences (chains) — Important Design Principle

**Sequencing is additive, not the norm.** Most prompts are and will remain standalone. Design around that:

- A sequence badge/chip only ever appears on the minority of prompts that are actually chained — it is never a slot every card reserves space for.
- Every prompt in a chain must still render as a fully standalone, fully usable page. The sequence relationship is a layer on top, never a dependency to use the prompt.
- Data model: `sequence` (slug a prompt belongs to — a prompt can join more than one), `sequence_step` (its position), optional `depends_on` (names the exact prior slug when a chain forks), optional `handoff` (plain-language note on what this step produces for the next one — see §9e). No `sequence` field = standalone, same template, no missing-field weirdness.
- Category and Search pages include a **"Chain" filter**: *All prompts* / *In a sequence only* — since chained prompts are rare, make isolating them a dedicated control, not something you scan for visually.
- Detail page shows a slim step rail only when chained: `← prior step · you are here (step X of Y) · next step →`. The "plain-language note on what input/output the handoff involves" originally scoped for *this* rail was never built here — it landed instead on the `/sequence/[slug]` rail (§9e) as the `handoff` field. Revisit if the detail page's own stepper wants it too.
- `/sequences` index page lists each chain as its own mini flow — a compact version of the same vertical connected rail described in §9e, not a separate component.

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
- **Multi-select re-categorize**: select N prompt cards → choose a new `category` → tool rewrites frontmatter across all selected files. (Bulk add/remove-tag controls existed here too; removed in §9c along with the `tags` field itself.)
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
- Weighting: category weighted highest, title/purpose line next, full prompt body lowest — configured via Fuse's weighted `keys` option. (Tags were weighted highest alongside category; dropped along with the field in §9c.)
- Sequence membership is indexed too — searching a chain's topic should surface every step in it.
- Typo tolerance via Fuse's fuzzy matching (threshold-tuned); basic synonym mapping (e.g. "email" ↔ "outreach") is hand-rolled logic layered on top of the index — same effort this would've taken under Pagefind.
- The **category** facet narrows results in real time without a full reload. (Tag/model/complexity facets and the zero-result "nearest tags" suggestion existed here too; removed in §9c along with those fields.)
- Client-side querying needs a browser build of Fuse.js (a vendored `fuse.min.js`, same pattern as amplified thinker) — the build-time index generation itself only needs to emit structured JSON, not Fuse as an npm dependency.

---

## 8. Page Templates (layout specs)

### Homepage `/` (superseded — see §9g)
~~Top to bottom: nav (logo, **always-visible** search field — never hidden behind an icon, Sequences link, favorites count) → one-line framing stat ("128 prompts across 9 categories, organized into 6 sequences") → category tile grid (icon + name + count) → one featured/curated collection rail → "recently added" rail of prompt cards → a quiet single-line contribute note (not a banner). (A secondary "browse by use case" tile set — task-oriented: "Debugging," "First drafts" — sat here too, keyed off `tags`; removed in §9c along with that field.)~~ Replaced in §9g with the all-prompts table + live category/chain pills (the same pattern §9b built for Category/Search/Favorites) under a minimal hero, absorbing the Browse hub's job.

### Category page `/browse/[category]` (revised — see §9a/§9c/§9g)
Breadcrumb (Home / [Category] — was Home / Browse / [Category] before §9g removed the Browse hub) → filter toolbar: **Chain** (All prompts / In a sequence only), **Sort** → result table (§9b) with quick-view modal. (Model and Complexity pills sat in this toolbar too, per the original §9a rail spec below; removed in §9c along with those fields.)

**Prompt card anatomy** (used everywhere a card grid still renders — homepage rails, collections, sequences, favorites card view):
- Title (bold display weight)
- Purpose line — one sentence: what it's for, not what it says
- Category chips (soft accent tint; sequence badge uses the same single accent, always includes literal text like "step 2 of 4" — never color alone). Tag chips sat alongside these too; removed in §9c.
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
- **Tags**, **compatible models**, and **complexity** — originally just hidden from the detail page while staying in frontmatter/search (this was a display-only cut). As of §9c, all three are no longer captured at all — a full data-model removal, not a display cut.
- **Source / attribution link** — considered during the layout session, explicitly decided against. Not implemented.

~~**Standing open item, not yet designed**: browsing a list and opening a prompt is still a full navigation away from results — no quick-view/slide-over/prev-next-through-results exists yet.~~ Resolved by §9b's quick-view modal (`renderQuickViewModal`, `quickview.js`) — clicking a row now opens full detail-page content in a dialog with prev/next through the filtered result set, no round-trip to `/prompt/[slug]/` required.

### Sequence page `/sequence/[slug]` (revised — see §9e)
Breadcrumb → chain name + step count → **vertical connected rail**: numbered dot per step on a connecting line, each dot's step a small surface card (title, category badges, purpose), with a plain-language handoff note between non-final steps when the prompt's `handoff` field is set. Replaced the original horizontal box-and-chevron flow — see §9e for why.

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
- ~~**Sequence-rail treatment** on other pages (the `/sequence/[slug]` flow view, `/sequences` index) — still the original box/connector treatment.~~ Resolved in §9e: vertical connected rail (option A of three mocked directions).
- ~~**Filter rail** (category/search pages, §8) — still the original layout; the live filter-pill pattern designed in §9b is a candidate replacement, not yet decided.~~ Resolved: swapped for the live pill toolbar, then simplified further — see §9c.
- ~~**Chip/tag visual style** in card grids generally (as opposed to the detail-page category badge, which this pass did redesign).~~ Moot for tags as of §9c (field removed); category chip style resolved in §9d (solid badge).
- ~~**Depth and interactivity** — shadows, possible flip-card or modal patterns, are unexplored for the card grid specifically (the quick-view modal pattern below covers the table view). Every other page still uses the pre-existing shadow/card treatment untouched.~~ Resolved in §9f: richer hover depth (option C of three mocked directions).
- ~~**Prompt card + Chip redesign** — three directions mocked (soft chip pill / solid badge / dot+label eyebrow); not decided, superseded in relevance by the §9b tabular direction for browse-heavy pages but still the open question for Home/Sequences, which stay card-based.~~ Resolved in §9d: solid badge (option B) chosen, ported to `renderPromptCard`.
- **Tags, compatible models, complexity, and source/attribution on the detail page** — all explicitly considered and cut for now (§8); source was tried and rejected. Tags/models/complexity superseded by §9c: no longer a display cut, the fields themselves aren't captured.

Design references cited going into this pass: Amplified Thinker (sibling site, same teal/sage identity) and MasterClass (clean, modern, easy to navigate) — originally cited for the §9 color/font work, carried forward as a general quality bar rather than a literal reference for layout.

---

## 9b. Tabular Browse & Quick-View Pass (implemented)

Third design pass, addressing the "quick-view / reduced back-and-forth" item flagged as open in §9a, plus a scale concern raised separately: a card grid gets unwieldy once the catalog has many prompts. Went through mockup rounds (card/chip directions first, then a pivot to a tabular layout once the scale problem was raised) before landing here. **Implemented** across `lib/schema.mjs`, `lib/content.mjs`, `lib/render.mjs`, `styles/base.css`, and three client scripts (`public/scripts/quickview.js`, `public/scripts/categoryPills.js`, updates to `filters.js`/`favorites.js`/`search.js`).

**Scope**: replaces the card grid on browse-heavy, non-curated pages — Category page, Tag page, Search, Favorites. Browse hub itself still lists category tiles (not prompts), so it was never in scope — corrected here after the design pass mistakenly listed it. ~~Home and Sequences stay card-based (curated, not browsed-at-volume)~~ — **Home moved to this same tabular pattern in §9g**; Sequences is unaffected and still card-based (chain-flow rail, not a browsed list). Collections pages are also still card-based (not explicitly in scope; revisit if a collection ever gets large).

**Table layout**:
- Columns: **Category** (badges) · **Title** (with purpose subline stacked underneath, and a sequence-step pill inline when chained) · **Updated** · row actions (Favorite/Copy, icon-only, visible on hover/focus).
- No separate Tags/Models columns — matched their removal from the detail page (§8) at the time; as of §9c those fields are gone entirely, not just hidden from this table.
- Purpose stays stacked under the title rather than its own column: a dedicated column would need a fixed width for text of very different lengths (misaligned truncation, or a wide column forcing horizontal scroll). Stacked, title+purpose read as one unit — the same idiom GitHub's issue list and Linear's list view use for a title/description pair.
- **Comfortable density** locked in (a denser "compact" variant was mocked and rejected in favor of comfortable).
- Category uses the **solid badge** treatment (ported from the detail page's `pd-cat-badge` / §9's fixed-hex hues) rather than a soft chip or dot+label — chosen specifically because it scales cleanly to multi-category (below), where a plain dot or soft chip reads weakly with 2+ per row.

**Multi-category** (see §3): a prompt can now belong to more than one category. Rendering rule: no "primary" category is picked — every category badge shows, in category order. The table cell wraps and caps at 2 visible badges + a neutral "+N" overflow badge to protect row height; the detail-page header has no cap since it isn't space-constrained the same way.

**Live filter pills**: one pill per category (`renderCategoryFilterBar`, controller in `categoryPills.js`), positioned above the table, colored to match its badge hue (soft outline unselected, solid fill + white text selected), each showing a live count. Multi-select, OR logic within category (selecting Marketing + Product shows anything tagged with either). Filtering is instant client-side, no page reload; a result-count line and a "Clear filters" control (appears only once ≥1 pill is active) sit just above the table. **Shipped on Search and Favorites only** at the time — Category and Tag pages already scope the listing by category/tag, so pills there were judged redundant for now and were left on the existing filter rail (model/complexity/chain) instead. Superseded by §9c: the checkbox filter rail itself was later swapped for the same live-pill pattern (generalized to non-category facets) on Category and Search; Tag pages no longer exist.

**Quick-view modal**: clicking a row opens the **full detail-page content** (§8's exact structure — header with title + category badges + purpose, the two-box bento with Prompt box and Notes box, sequence stepper, Created/Modified) inside a modal shell (`renderQuickViewModal`, controller in `quickview.js`), not a condensed summary. Modal chrome adds: prev/next chevrons + a position counter ("3 / 7") that step through the **currently filtered/visible** result set (not the whole catalog), an "Open full page ↗" link that really navigates to `/prompt/[slug]/`, and a close control. Static pages (Category/Tag/Favorites) embed each row's full data as a JSON script tag at build time; the Search page (client-rendered results) feeds the modal live Fuse match objects instead and resolves sequence prev/next from the flat search index on the fly (`resolveSeqInfoFlat` in `quickview.js`) since it has no per-page precomputed sequence data.

**Row selection persists**, deliberately not a brief flash: opening a row gives it a held highlight (tinted background + left rail) behind the modal; stepping prev/next in the modal moves the highlight to match in real time; closing the modal (Esc or backdrop click) leaves the highlight in place until a different row is opened. Chosen over a timed flash because a flash still requires guessing "how long is long enough" — a held state removes the question and directly answers the original ask: comparing several candidate prompts without losing your place or round-tripping through the full detail page each time.

**Still open / deliberately deferred**:
- ~~Whether the filter-pill pattern should also replace the filter rail's implicit category scoping on Category/Tag pages, or the two stay split as they are now.~~ Resolved in §9c: filter rail replaced by pills on Category/Search; Tag pages removed outright.
- ~~Card/chip treatment for Home, Sequences, and Collections, which stay card-based (§9a card/chip directions were mocked but never decided).~~ Resolved in §9d.

---

## 9c. Field Reduction Pass (new) — `models`/`complexity`/`tags` capture paused

Two changes landed back-to-back and are documented together since the second immediately superseded parts of the first:

**1. Filter rail → live pill toolbar** (the §9a item flagged above): the checkbox-based filter rail on Category, Tag, and Search pages was replaced with the same live, multi-select pill pattern §9b shipped for categories — one pill per facet value, instant client-side filtering, a "Clear filters" control, and (on Category/Tag) a result-count line. Implemented in `renderFilterToolbar`/`initFilterToolbar`/`initTableFilterToolbar` (`lib/render.mjs`, `public/scripts/filters.js`), replacing `renderFilterRail`/`renderSearchFilterRail`. Search's separate category-pill bar and facet checkboxes merged into one toolbar.

**2. `models`, `complexity`, and `tags` stopped being captured on prompts, at least for now.** Decision, not a bug fix — the facets weren't earning their maintenance cost for a single-author catalog this size. This is a full data-model removal, not a display cut (contrast with tags/models/complexity's earlier detail-page-only removal in §8/§9a).

**What that removed, concretely**:
- `lib/schema.mjs`'s `MODELS` and `COMPLEXITY_LEVELS` vocab, and `lib/content.mjs`'s validation requiring ≥1 tag / a valid `complexity` value.
- The **Tag page route** (`/tag/[tag]`) entirely — `renderTagPage`, its `scripts/build.mjs` route loop, and `data.tags` in the build data model.
- The homepage's **"Browse by use case" section** and `lib/useCases.mjs` (it was a hand-picked tag → tile mapping with no other reason to exist).
- **Model/Complexity pills** from the Category page's filter toolbar (now just Chain + Sort) and from Search's toolbar (now just Category); Search's **tag pill group** and its zero-result **"nearest tags" suggestion** (`tagFuse` in `search.js`) are gone too.
- **Tag chips** on prompt cards (`renderPromptCard`); `data-model`/`data-complexity` attributes on cards and table rows.
- The Sequence Builder tool's (`tools/sequence-builder/`) bulk **add/remove-tag** controls — bulk re-categorize now only sets `category`.
- The dead, tag-dependent `getRelatedPrompts` in `lib/sequences.mjs` (already unused — related prompts were cut back in §8 — but it still referenced `p.tags`, so removed while touching this area).
- `models`/`complexity`/`tags` lines from every prompt's frontmatter (`/prompts/*.md`) and from the contributing-page example snippet.

**What stayed**: `categories` (still captured, filtered, and badge-colored), `sequence`/`sequence_step`/`depends_on` (the Chain filter and sequence stepper are untouched — chain-ness is derived from `sequence`, never from the removed fields), Favorites, quick-view, and search by title/purpose/body/category.

**Reversibility**: nothing here was a one-way door — re-adding `tags` means restoring the schema/validation/build-data pieces above plus the Tag route and its filter-pill group; re-adding `models`/`complexity` is narrower (just the two pill groups and their data attributes). If reintroduced, revisit the design rather than reverting wholesale — the pill toolbar pattern this pass landed didn't exist the first time these fields were designed.

---

## 9d. Card Chip Decision (new) — solid badge (option B)

Resolves the §9a "Prompt card + Chip redesign" open item: three directions had been mocked (soft chip pill / solid badge / dot+label eyebrow) for how a card shows its category, on the pages that stayed card-based after §9b's tabular pivot — Home, Sequences, Collections. Mocked side-by-side with real prompts before deciding (soft pill blurred together on the two-category card; dot+label was quietest but shrank the sequence-step chip's visual weight; solid badge won on legibility and consistency with the already-shipped detail-page/table badge).

**Decision**: solid badge, same treatment as `renderCatBadges` (detail-page header, §9b table). `renderPromptCard` (`lib/render.mjs`) now calls `renderCatBadges(p.categories)` instead of the generic soft `.chip` for category chips — one consistent category-badge component across the whole site, not a card-specific variant. The sequence-step chip is unchanged (`.chip-seq`, soft accent tint) since it was never part of this decision and stays visually distinct from category by design (§4's "never color alone" rule — it's the only chip with literal "step X of Y" text).

**Scope note**: at the time this was written, Sequences' flow-view cards (`.seq-step-card`) never rendered category chips at all — a different, simpler component (step number + title only) — so this decision only visibly changed Home's rails and Collection pages. Superseded by §9e: the sequence rail was redesigned and now shows `renderCatBadges` too (the same solid badge this section chose), so the two are consistent by inheritance rather than by this decision covering Sequences directly.

---

## 9e. Sequence-Rail Redesign (new) — vertical connected rail (option A)

Resolves the §9a "Sequence-rail treatment" open item: the `/sequence/[slug]` flow view and `/sequences` index still used the original horizontal box-and-chevron strip from before the §9 retheme — small cards connected by a lone chevron, scrolling sideways past two steps. Three directions were mocked with the real Client Onboarding chain before deciding: a numbered horizontal stepper (closest to the original, but keeps the horizontal-scroll problem), a single bento box with steps as divided rows (quiet and consistent with the detail page's box pattern, but reads as a list rather than a flow), and the vertical rail below.

**Decision**: vertical connected rail. Steps stack top-to-bottom along a line with a numbered dot per step; each step is a small surface card (title, category badges via `renderCatBadges`, purpose). Chosen for two reasons that trace back to earlier decisions in this doc, not a fresh preference: it never needs horizontal scroll at any chain length or viewport width — the same mobile-first reasoning that ruled out a side rail on the prompt detail page (§8) — and chains are "additive, not the norm" (§4), so a quiet checklist register fits better than a horizontal process-wizard stepper would.

**New field: `handoff`** (optional, per-prompt frontmatter). §4 originally specified that the detail page's own step rail should carry "a plain-language note on what input/output the handoff involves" — that line sat unbuilt since before this pass. It's now implemented, but on the `/sequence/[slug]` rail rather than the individual detail page's mini-stepper: a step with `handoff: the drafted brief` set (and not the chain's last step) shows `↳ hands off: the drafted brief` beneath its card. The detail page's own prev/next stepper still doesn't show it — an open follow-up if that's wanted too, not assumed done by this pass.

**Compact variant**: `/sequences`' per-sequence preview uses the identical rail component (`renderSequenceRail` in `lib/render.mjs`) with a `compact` flag — same dots and connecting line, but no purpose, category badges, or handoff note, keeping multiple sequence previews scannable on one index page. Not a separate component to maintain.

**Implementation**: `renderSequenceRail` (`lib/render.mjs`), replacing the inline chevron-strip markup in both `renderSequencesIndex` and `renderSequencePage`. CSS: `.seq-rail`/`.seq-rail-item`/`.seq-rail-marker`/`.seq-rail-dot`/`.seq-rail-line`/`.seq-rail-body`/`.seq-rail-card`/`.seq-rail-handoff` in `styles/base.css`, replacing `.seq-flow`/`.seq-step-card`/`.seq-connector`.

---

## 9f. Card Depth Decision (new) — richer hover (option C)

Resolves §9a's last open item: "shadows, possible flip-card or modal patterns, unexplored for the card grid." Worth noting first that the card grid already had a baseline hover treatment (2px lift + shadow escalation, `.surface`/`.prompt-card` from before the §9 retheme) — this was never actually in question, so the exploration was about what to add on top of it, including the legitimate option of leaving it alone.

Three directions were mocked live (real hover/click behavior, not static comparisons) against the real "Draft the brief" / "Post-meeting follow-up" cards: quick-view for cards (reusing the §9b modal instead of navigating straight to the full page — the only option that changes behavior, not just visuals, but requires wiring the embedded-JSON-payload pattern the table pages carry and cards don't), and a flip-card reveal (hover/focus flips the card to show notes on the back).

**Decision**: richer hover depth — bigger shadow (`--shadow-lg`, new token in `tokens.css`), a slight scale (`scale(1.015)`) alongside the existing lift, and the card's border (transparent at rest, to avoid a layout shift) picks up `--accent` on hover. `.prompt-card:hover` in `styles/base.css`.

**Why not the others**: flip-card was rejected specifically for the reason this doc has favored the plainer option every time it came up (solid badge over dot+label in §9d, vertical rail over a fancier horizontal stepper in §9e) — a flip reveal is the most "designed" and performative of the three, with real accessibility snags (no hover on touch; screen readers need the back content exposed some other way), and the read going in was that the novelty wears off fast on a personal catalog someone opens daily. Quick-view for cards is the most defensible runner-up (it's genuinely new capability, not just polish, and reuses proven infrastructure) — not chosen now, but not rejected on merits either; revisit if round-tripping to the full page from Home/Collections starts to feel slow in practice.

---

## 9g. Home Simplification — all-prompts table replaces curated rails, Browse hub removed (new)

A later, separate pass, prompted by a simplification question rather than an open item from §9a: with the tabular/live-pill pattern already proven on Category/Search/Favorites (§9b/§9c), does Home need its own bespoke curated layout at all, or can it just be the same table scoped to everything?

**What prompted it**: a review of Home surfaced that its curated layout (category tile grid, one featured collection rail, a recently-added rail) had real problems at the catalog's current size — the Featured Collection and Recently Added rails were independently duplicating the same two prompts, and five of nine category tiles led to empty "no prompts yet" pages with no visual signal they were dead ends before the click (fixed for the old layout in the prior Home pass, but the underlying tension — a curated homepage needs enough content to curate *from* — doesn't go away as the catalog grows either).

**Decision**: Home is now the all-prompts table (`renderPromptTable`) with the same live Category + Chain pill toolbar (`renderFilterToolbar`) and quick-view modal §9b built for Category/Search/Favorites, under a minimal hero — just the "Promptly" title and the existing one-line framing stat ("N prompts across N categories..."), not a fuller marketing-style header. This is a personal, single-author tool where the primary job is finding and copying a prompt fast; the table+pills pattern already does that better than a curated landing page, and reusing it here instead of maintaining a bespoke Home layout is less surface area to keep consistent as the design system evolves.

**Browse hub (`/browse/`) removed entirely** — `renderBrowseHub` and its route are gone. Home now does that job (browsing everything, filterable by category). Individual category pages (`/browse/[category]/`) are unaffected and still exist — only the hub index that listed all nine category tiles is gone. Nav's **Browse** link is removed for the same reason (§1a) — it pointed at a now-redundant destination. Breadcrumbs that rooted at Browse (Category page, Collection page, Prompt detail) now root at Home (`Home / [Category] / ...`) instead.

**Explicitly deferred, not decided**: what replaces the old Featured Collection rail's job of surfacing curated collections and sequences on Home. Collections currently have no discovery path at all besides being in the all-prompts table like any other prompt — a real regression for the one existing collection (Client Onboarding Kit), accepted for now rather than solved with a placeholder mechanism. The right fix depends on an architecture question that's still open: whether collections/sequences get their own surfacing mechanism, and whether tags return (dropped in §9c) to complement categories as the thing that lets a collection be defined/found in the first place. Revisit this once that's decided — don't bolt on a rail here first and redesign it later.

**Implementation**: `renderHomePage` (`lib/render.mjs`) rewritten to the table+pills shape (mirrors `renderFavoritesPage`'s structure most closely). `renderCategoryTiles` (a shared helper the prior Home pass had just extracted for Home + Browse hub's matching tile grids) is deleted along with both call sites — dead code once neither page uses tiles. `initTableFilterToolbar` (`public/scripts/filters.js`) extended to optionally match a `category` pill group against each row's `data-categories` attribute (OR-within-category, same logic Favorites' bespoke handler already used) — additive and backward-compatible, since Category page's toolbar has no category group and so triggers none of the new matching logic.

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

*IA, the sequencing/favorites mechanics, and the stack change (Astro → custom static build script, Pagefind → Fuse.js) are locked from the original design session; nothing there should be re-litigated from scratch. §9 (palette/type) is locked as of commit `d90c04b`. §9a (layout/depth) is an active, still-partial pass — its "Done" items are locked, its "explicitly open" items are not yet designed and should be treated as open questions, not oversights, until §9a is revisited. §9b (tabular browse + quick-view) is implemented and locked. §9c (filter rail → pills, `models`/`complexity`/`tags` capture paused) is implemented and locked — but explicitly reversible "for now," not a permanent taxonomy decision. §9d (card chip = solid badge) is implemented and locked, closing out §9a's card/chip question. §9e (sequence rail = vertical connected rail, new `handoff` field) is implemented and locked, closing out §9a's sequence-rail question. §9f (card depth = richer hover, option C) is implemented and locked, closing out §9a's depth/interactivity question — §9a has no remaining open items as of §9f. §9g (Home = all-prompts table, Browse hub removed) is implemented and locked for the table/pills/hero shape and the hub removal; the collections/sequences discoverability question it surfaces is explicitly open — pending the tags-return/architecture decision — and should not be treated as solved by anything currently on Home.*
