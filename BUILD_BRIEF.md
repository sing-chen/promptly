# Promptly — Build Brief (v3: Static HTML/CSS/Vanilla JS)

Personal-use AI prompt catalog, with planned future access for teammates as read-only viewers. Static site, no accounts/login/auth, no backend, no database. Everything below is locked from a design session — build against it directly rather than re-deriving decisions.

**Status note:** the `example_output` field this document specifies (§ mentions below) has since been **removed from the shipped product** — it's not part of the account-tier schema either (BUILD_BRIEF_v4.md §7, `supabase/README.md`). It may return as a redesigned feature later; treat every `example_output` reference below as historical, not current behavior.

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
- "Submitting a prompt" = adding a file and rebuilding — there is no live submission form or moderation queue. **Pending, not yet built** (§12): a Claude Code skill is planned to review/add prompts (checking quality and required fields) rather than the author hand-authoring frontmatter directly — a workflow upgrade for the same single author, not a new public capability, so this still holds as written.
- Search moves from Pagefind to a build-time-generated Fuse.js index (see §7).

---

## 1a. Site Identity (new, finalized)

- **Logo**: "Prompt cursor" mark — a rounded tile (`rx` matching the design system's 4px chip radius, scaled up) in `--accent` blue, containing a white `>` chevron and a short cursor bar. Reads as a literal command-prompt symbol, legible down to ~20px nav size. Fixed blue-tile-on-white-glyph lockup, not theme-swapped — the tile carries its own contrast regardless of surrounding `--paper` value. Source file: `public/images/promptly-logo.svg`.
- **Nav menu** (finalized, deviates from the original brief's literal nav wording — see note below): logo + "PROMPTLY" wordmark (links home) · ~~**Browse**~~ · **Sequences** (active state = accent underline) · always-visible pill-shaped search field (flex-grow, never icon-triggered) · favorites count (`☆ N`). **Browse link removed in §9g** — Home absorbed the Browse hub's job, so a separate nav link to the same destination became redundant.
  - **Deviation flag**: the original brief's §8 Homepage spec named only "logo, search field, Sequences link, favorites count" in the nav — no explicit Browse link. Browse was added deliberately for direct wayfinding to `/browse` rather than relying solely on homepage category tiles; §9g's removal brings the nav back in line with that original spec, just for a different reason (the hub itself is gone, not a return to the original rationale).
- ~~**About** and **Contributing** are secondary/footer-level links, not primary nav items, to keep the nav strip lean.~~ **Contributing page and its footer link removed in §9j** — it documented the raw file+rebuild workflow, which is being superseded (§12); **About** remains as the one footer-level link.

---

## 2. Full Sitemap

```
Home                              /  (all-prompts table + live filters, §9g — absorbs the old Browse hub)
                                     (?cat=[slug] pre-activates a category pill, §9s)
  Category page                   /browse/[category]   (catalog categories only, §9s)
Search                            /search  (?q=&category=)
Prompt detail                     /prompt/[slug]
Sequences                         /sequences  (index of all chains)
  Sequence page                   /sequence/[slug]
Favorites                         /favorites  (localStorage signed out; DB-backed signed in — see v5)
About                             /about
Why sign in?                      /why-sign-in

Account tier (static shell, filled client-side from Supabase):
Account                           /account   (sign in/up, library stats §9r)
Collections                       /collections
Categories                        /categories  (§9s — create/rename/recolour/reorder/delete)
Archived prompts                  /archived
Admin                             /admin     (publish/unpublish catalog prompts)
```
`/contributing` (docs page explaining the file-based workflow) removed in §9j — superseded by the pending skill-based workflow (§12). The prompt detail page's "example output" section was removed with the `example_output` column (`0003_remove_example_output.sql`) and is not currently a feature.

**"No account pages, no moderation queue, no login" is historical** — that was the v3 static-only scope. Accounts arrived with the account tier (BUILD_BRIEF_v4.md, then v5's owned-copies model), so every route in the second block above exists and is auth-gated client-side. A moderation/submission queue is still *not* built — it's logged as a future idea in BUILD_BRIEF_v5.md §9.

Every route above is emitted as a real static HTML file by the build script (e.g. `dist/prompt/draft-the-brief/index.html`), not rendered client-side from JSON — this matters for SEO, no-JS robustness, and instant direct-link loads.

**Crawlability**: `robots.txt` disallows all crawlers — this is a private tool, not a promoted destination, so there's no reason to be search-indexed. Easy to reverse later.

---

## 3. Content / Taxonomy Schema

**`models`, `complexity`, and `tags` are no longer captured, as of the field-reduction pass (§9c) — at least for now.** The two axes below are what's left; §9c has the full rationale and what was removed as a result.

- **category** — multi-select as of the §9b tabular-browse pass (was single-select; most prompts still carry just one in practice), structural (where a prompt lives). Frontmatter field is `categories: [...]` (array, 1+ entries) — see §9b. **The fixed set below is historical as of §9s** ([BUILD_BRIEF_v6.md](BUILD_BRIEF_v6.md)): categories are per-user rows a signed-in user creates, renames, recolours and deletes, not a controlled vocabulary. The nine values `writing`, `code`, `marketing`, `research`, `data-analysis`, `product`, `education`, `creative`, `ops-admin` survive only as the admin's *catalog* set — what the static site is built from and what seeds a new account. The "1+ entries" rule is the one part that hardened rather than loosened: it is now enforced by a database trigger, not just by the form.
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
- ~~Category and Search pages include a **"Chain" filter**: *All prompts* / *In a sequence only* — since chained prompts are rare, make isolating them a dedicated control, not something you scan for visually.~~ **Removed site-wide in §9h** — wasn't earning its keep as a dedicated control.
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
- **Multi-select re-categorize**: select N prompt cards → choose a new `category` → tool rewrites frontmatter across all selected files. (Bulk add/remove-tag controls existed here too; removed in §9c along with the `tags` field itself.) **Retired in §9u** — categories became per-user rows with no fixed vocabulary for the tool to mirror, and the control had in any case been writing a frontmatter key the schema does not read. The rest of this section still describes the tool accurately.
- A prompt removed here that was a sequence member is handled the same way a manual removal would be — no special-cased cleanup beyond what already exists.

---

## 5. Favorites

- No accounts — favorites are a **client-side preference**, stored as an array of prompt slugs in `localStorage`. *(Still true for anonymous visitors. Signed in, favourites moved to the `favorites` table keyed by prompt id — the two key spaces can't be shared, since a user's copy has a different id from the catalog row. See BUILD_BRIEF_v5.md and `public/scripts/favoritesStore.js`.)*
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

### Category page `/browse/[category]` (revised — see §9a/§9c/§9g/§9i)
Breadcrumb (Home > [Category] — was Home / Browse / [Category] before §9g removed the Browse hub and §9i switched the separator to `>`) → heading + one-line category description (was a `CATEGORY_DESCRIPTIONS` map in `lib/schema.mjs` per §9i; now the `description` column on the category row, §9s) → result table (§9b) with quick-view modal, no filter toolbar at all. **These pages are generated for *catalog* categories only** (§9s): a user-created category has no static page, and signed-in sidebar links point at Home filtered by category instead. (Model/Complexity pills, then Chain + Sort, sat in a toolbar here at various points; all removed — Chain and Sort in §9i, the rest earlier in §9c.)

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

> **Superseded by §9s on the mechanism, not the intent.** The reasoning below — a category badge needs its own solid, theme-independent hue, distinct from the single-accent UI — still holds and is still what the site does. What changed is where the hue comes from: each category now *stores* its own colour, inlined per element as a `--cat` custom property, with the soft and dark-mode variants derived in CSS. `categoryHue()`, the six `--cat-*` token pairs, and the index-modulo assignment described here are all deleted. Read the palette below as the origin of the current default colours, not as a live mechanism — and note §9s fixed a real defect in it: nine categories over six hues meant three pairs silently shared a colour.

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

**Superseded almost immediately by §9h**: the "Promptly" title shown above and the Chain pill mentioned in this section's Decision paragraph were both cut within the same day — see §9h rather than treating this section's implementation description as current for those two details.

---

## 9h. Hero Refinement & Site-Wide Housekeeping (new)

A follow-up pass, partly refining §9g's Home implementation and partly a set of small site-wide fixes surfaced by looking at the shipped result in the browser rather than a new open design question.

**Home hero refinements** (same day as §9g, same rationale — grouped here since §9g's own text described the pre-refinement state):
- The visible **"Promptly" h1 is removed** from Home — nothing sits above the hero, and the nav already carries the site name directly above it, so showing it twice was redundant. Kept as an `.sr-only` heading (not deleted outright) so the page still has an h1 landmark for accessibility.
- `.home-hero-divider` — a hairline with 32px margin above / 24px below, between the framing stat and the filter toolbar. Without it the two sat directly against each other with no visual break.
- **Chain filter dropped from Home's toolbar** (it shipped with §9g, per that section's Decision paragraph) — not judged useful at the whole-catalog level. This was the first cut; see below for its full removal everywhere.

**Chain filter removed site-wide.** It only remained on the Category page toolbar by this point (Search never had it; Home dropped it above) — reviewing the result made it clear a single-purpose "in a sequence only" toggle wasn't earning a dedicated control anywhere, not just on Home. Fully removed, not just hidden: `chainGroup()` (`lib/render.mjs`) deleted, `renderCategoryPage`'s toolbar now passes an empty group array (keeps Sort), the `data-chain` attribute dropped from both card and table-row markup (`renderPromptCard`, `renderPromptTableRows`), and `initTableFilterToolbar`'s (`filters.js`) chain-matching branch removed along with it — dead code cleanup, not a UI-only change. §4's original "Chain filter" spec line is struck through accordingly. `sequence`/`sequence_step` themselves are untouched — this only removed the filter UI, not the underlying chain data or the detail-page/sequence-rail stepper.

**Nav/breadcrumb breathing room + sticky footer, site-wide.** Reviewing a Category page in the browser surfaced two related problems: breadcrumbs (and every page's top content) sat flush against the nav with zero gap, and the footer rode up directly under short pages' content instead of anchoring to the bottom of the viewport — both making every page feel cramped, not just Category specifically.
- `main { padding-top: 32px; }` gives every page uniform breathing room below the sticky nav. The prompt detail page's own `.pd-page { padding-top: 20px; }` is removed since it would've stacked on top of the new global padding.
- `body { display: flex; flex-direction: column; min-height: 100vh; }` + `main { flex: 1 0 auto; }` — the classic sticky-footer pattern. `main` takes a minimum height of (viewport − nav − footer) and grows past that once content needs more, so the footer sits at the bottom of the viewport on short pages (Category pages with only 1-2 prompts, as of this catalog's current size) without ever overlapping content on longer ones.

**Nav background color.** The nav was `--surface` (plain white in light mode) — same value as ordinary cards, giving it no visual identity of its own beyond the shadow/hairline from §9h's predecessor pass. Changed to `--accent-soft`, the same soft-teal tone already used everywhere for chip backgrounds and pill hover states, rather than introducing a new color or going to a fully-saturated `--accent` band (the latter was considered and rejected in an earlier pass as too heavy for Promptly's single-quiet-accent system — see the nav/footer elevation pass). Verified contrast in both themes: `--accent-soft` sits at similar lightness to `--surface` in both light and dark, so existing `--ink`/`--ink-soft` text colors on the nav remain readable without changes.

---

## 9i. Breadcrumb Separator, Sort Removed, Category Descriptions (new)

A third small housekeeping pass, same day as §9h.

**Breadcrumb separator changed from `/` to `>`** — `renderBreadcrumb` (`lib/render.mjs`) now joins crumbs with ` > ` instead of ` / `. Cosmetic only, no structural change; every page using breadcrumbs (Prompt detail, Category, Collection, Sequence) picks it up automatically since they all go through the one shared function.

**Sort control removed site-wide** (Home and Category were the only two pages that had it — Search and Favorites never did). Not just hidden: `renderFilterToolbar`'s `sort` option and the `<select class="filter-sort">` it rendered are gone from `lib/render.mjs`, along with `getSort()`/`sortSelect` handling in `initFilterToolbar` and the client-side re-sort in `initTableFilterToolbar`'s `apply()` (`public/scripts/filters.js`), the now-dead `.filter-sort` CSS rule, and the `data-title`/`data-updated` attributes on cards and table rows that only existed to feed that client sort (nothing else read them — confirmed before removing). Rows now render in whatever order `buildData()` (`lib/content.mjs`) produces, which is a **newest-updated-first sort applied once at build time** — replacing the removed dropdown's default rather than leaving order undefined.

**Category page**: gets a one-line description under its heading, from a new `CATEGORY_DESCRIPTIONS` map (`lib/schema.mjs`, keyed by category slug, degrades to no description line if a slug is missing an entry rather than breaking the build) — same idiom as Collection pages' `<h1>` + `.card-purpose` description. The **result-count line ("N of N shown") is removed on Category specifically** — with Chain, Sort, and (Category pages never had it) category pills all gone, Category's filter toolbar had nothing left to report a count *for*, so the whole `renderFilterToolbar`/`initTableFilterToolbar` wiring is removed from `renderCategoryPage` too, not just the visible count line — the page now renders the description straight into the table with no toolbar at all. Home's result-count line is unaffected (its category pills are still live, so the count is still meaningful there).

---

## 9j. Category Description Spacing, Contributing Page Removed (new)

A fourth small housekeeping pass, same day as §9i, on top of it rather than a separate design question.

**Category description spacing**: §9i's new description sat right on top of the result table with no gap — `.category-description` (a modifier on `.card-purpose`, `styles/base.css`) adds `margin-bottom: 28px`, matching the breathing-room scale used elsewhere in these housekeeping passes. `.card-purpose` itself stays `margin: 0` everywhere else it's used (cards, Collection page) — this is scoped, not a global change.

**`/contributing` page removed entirely** — `renderContributingPage` and its route are gone, along with the footer's "Adding a prompt" link and Home's bottom-of-page "Adding a prompt is just a file and a rebuild." note. The page documented the raw file-plus-rebuild authoring workflow (§1), which is being superseded by a planned Claude Code skill for reviewing/adding prompts — see §12 for that pending item. Removing the page now rather than leaving it describing a workflow that's on its way out.

---

## 9k. "What's New" Callout, Filter-Pill Hue Backgrounds (new)

A fifth pass, mocking up options before building rather than a straight fix like §9h–§9j.

**"What's New" callout.** Three directions were mocked (interactive HTML, not static comps) against the real card/table/pill components: (A) a single-toggle pill in the filter row, in the same slot Chain used to occupy; (B) the same toggle plus a small "New" chip inline on qualifying table rows; (C) a quiet one-line banner between the framing stat and the filter toolbar, closer to an announcement than a filter facet. **Decision: C.** Implemented as `.new-callout` in `renderHomePage` (`lib/render.mjs`) — "**N new prompts** added in the last 14 days · Show them ↓". A prompt counts as new based on `added` (falling back to `updated` only if `added` is missing — editing an existing prompt shouldn't make it read as newly created), with a `findNewPrompts()` / `NEW_WINDOW_DAYS = 14` helper; future-dated values are excluded rather than showing as perpetually new. **The callout only renders when `findNewPrompts()` returns anything** — no empty/zero state exists for it, per explicit instruction. Clicking "Show them" scrolls to and briefly highlights (`.is-new-highlight`, `--new-soft` background, fades over 1.2s) the matching rows in the table below, using slugs embedded directly in the page's own inline script (the server already knows exactly which prompts are new at build time — no client-side date math needed). New semantic color tokens `--new` / `--new-soft` added to `tokens.css` (light + dark) — a status color, kept separate from `--accent`, same reasoning as `--danger`.

**Filter-pill hue backgrounds.** Category filter pills (`renderFilterToolbar`'s hued groups, `renderCategoryFilterBar`) previously used a neutral `--surface` background at rest with a small colored dot indicating category, only picking up the solid hue fill once active. Changed so the **rest-state background itself is a soft tint of the category's hue** (new `--cat-*-soft` tokens, one per existing `--cat-clay/ochre/blue/plum/moss/rose`, theme-dependent unlike the fixed-hex solid hues) — aligning filter pills with their corresponding `cat-badge` color everywhere else (cards, table, detail page) at a glance, not just once selected. The dot is removed as redundant now that the background itself carries the color. Text stays neutral ink (not hue-colored) rather than mirroring the badge's white-on-solid treatment — the fixed, theme-independent `--cat-*` hex values are tuned for contrast as white-on-solid-fill (the badge use case), and a rough check found at least one hue would fail AA as *text* against a dark-mode tinted background (~3:1, needs 4.5:1); neutral ink sidesteps that without needing a second theme-varying text-color token per hue. Count numbers get a full-opacity override (`.filter-pill.cat-*.count { opacity: 1 }`, up from the base rule's `.65` dim) so they read clearly against the new tinted backgrounds, per explicit instruction to verify contrast there specifically. The `.is-active` solid-fill + white-text state (already existing, higher specificity via the third class) is unchanged.

---

## 9l. Filter-Pill Selection Ring (new)

A same-day follow-up to §9k, flagged immediately after that pass shipped: once every pill carries a hue-tinted background at rest, the old "selected" signal (soft tint → solid fill of the *same* hue) reads as a lightness change rather than a clear on/off state — weaker than the pre-§9k contrast of neutral-white → solid-color.

**Decision**: a two-layer ring on top of the existing solid fill — `box-shadow: 0 0 0 1px var(--paper), 0 0 0 3px var(--accent), var(--shadow-sm)` on `.filter-pill.is-active`. The 1px `--paper` layer cuts a clean gap between the pill's own edge and the ring so it doesn't blend into the fill; the 3px `--accent` layer is the visible ring. Sized to exactly fit `.filter-pill-group`'s existing 6px gap (3px ring each side of two adjacent active pills = 6px, so rings touch at most, never overlap — checked directly against multi-select, which this filter already supports).

**Why `--accent` and not the pill's own hue for the ring**: deliberately keeps "you selected this" (an interaction outcome) visually distinct from "this is a Writing prompt" (content identity, carried by the fill color) — the same separation of concerns behind §9's "one accent handles every action" rule and why sequence badges carry literal text rather than relying on their own color. A per-hue ring would have conflated the two signals back together.

---

## 9m. Site-Wide UI Pass — Result-Count Removed, New-Callout Personalization, Sequences Quick-View, Toggle/Sidebar Tooltips (new)

A sixth pass, six small independent fixes/additions bundled together rather than mocked individually — done against the account tier (BUILD_BRIEF_v4.md), so `supabase/README.md`'s Status section has the account-tier-specific detail; this entry covers the static-site-visible behavior.

**Result-count text removed everywhere, superseding §9i's rationale for keeping it on Home/Favorites.** §9i kept "N of N shown" on Home/Favorites because their category/status pills made the count meaningful; in practice it was rendering **twice with different numbers** on a signed-in Home — `personalize.js`'s merged-catalog rebuild replaces the filter toolbar via `bar.outerHTML`, and since `renderFilterToolbar` returned the toolbar div *and* a trailing result-count `<p>` as siblings, that swap inserted a second `<p id="...-result-count">` without removing the original; `getElementById` then kept wiring up the stale one on every filter interaction while the fresh one sat unpopulated. Rather than patch the duplicate-ID bug, the whole feature is removed instead — `renderFilterToolbar`'s/`renderCategoryFilterBar`'s trailing `<p class="filter-result-count">`, the `resultCount` option, and the `setResultText`/`resultEl` plumbing in `filters.js`, `categoryPills.js`, `favorites.js`, and `personalize.js` are all gone. Home and Favorites no longer show any "N of M" text — the pill toolbar itself (with its per-pill counts) still shows what's filterable and how many prompts match each option.

**"Show them" (§9k's new-callout) fixed for grid view and signed-in personalization.** Two bugs: (1) the click handler only ever queried `#home-grid tr[data-slug=...]`, so it silently did nothing once grid/card view (the view-toggle) was active. (2) the callout's "N new prompts" was computed once at build time from the static default-prompts list and never revisited after a signed-in merge, so a default a user had just edited — which forks and archives it, supabase/README.md's "Admin curation..." — kept being announced as new to the very user who'd just archived it. Fixed: `findNewPrompts()` (`lib/render.mjs`, now exported) excludes anything with `is_curated === false` — a no-op against build-time data (no `is_curated` field there) but exactly what's needed to exclude a signed-in user's own prompts/forks from the personalized merged list. The callout now carries its slug list in a `data-new-slugs` attribute rather than a closure variable, so `personalize.js` can recompute and rewrite it after every merge/edit, dropping the banner entirely once no un-archived new default is left to announce. The click handler checks both the table row and the grid card for each slug and highlights whichever is actually visible (`offsetParent !== null`) instead of assuming table view.

**Category filter label enlarged and relabeled.** The pill-group label rendered via `.filter-pill-group::before { content: attr(data-label) }` now reads "Category Filter(s)" (was "Category") at 13px/600 weight (was 10.5px) — same mechanism, just a different label string passed into `renderFilterToolbar`.

**Sequences open in the quick-view modal, not a page navigation.** `renderSequenceRail`'s step cards (§9e) were plain `<a href="/prompt/[slug]/">` links; both `/sequences/` (one rail per sequence) and `/sequence/[slug]/` (one rail) now carry a `data-slug` and an embedded quick-view JSON payload per rail, and each initializes its own `initQuickView()` instance — matching every other prompt list on the site, and keeping sequence navigation (Back/Next) scoped to that one sequence rather than blending multiple rails together. `quickview.js`'s internal selectors were generalized from `tr[data-slug]` to `[data-slug]` (previously coupled to the browse table's `<tr>` rows) so the same module works for the rail's `<a>` cards; its click handler now calls `e.preventDefault()` so the anchor's own navigation doesn't win the race — a no-op for `<tr>`, which has no default navigation to prevent. The `<a href>` itself stays in place as a no-JS/SEO fallback, same reasoning as the sequence-nav links already inside the quick-view modal.

**"(i)" tooltips added**: the header's theme and list/grid view toggles already carried `title` attributes but relied on the browser's native tooltip timing; added a CSS-only `::after` bubble (`content: attr(title)`) styled like the existing `.field-hint` idiom so both are immediate and visually consistent rather than left to browser/OS defaults. The sidebar's "Sequences" nav link and "Collections" section label each get a small "(i)" button + hint bubble explaining what the feature is (reusing `fieldInfo()`, the same helper the New Prompt modal's field hints use), sized and positioned (190px wide, opens downward) to stay inside the sidebar's own `overflow-x: hidden` instead of getting clipped.

---

## 9n. Sidebar Drag-to-Resize (new)

A same-week follow-up, prompted by long category names in the sidebar's Categories section getting clipped at the fixed 240px width.

**Decision**: a thin drag handle on the sidebar's right edge, widening only — 240px (the original fixed width) is the floor, not just the starting value, since the request was specifically "larger but not smaller than the starting size." Capped at 480px (`SIDEBAR_MIN`/`SIDEBAR_MAX` in `lib/render.mjs`, duplicated into `public/scripts/sidebarResize.js` — kept in sync by comment, not import, same pattern as the `NEW_WINDOW_DAYS` duplication elsewhere) as a sanity ceiling with no specific product reasoning behind the exact number, just "don't let a runaway drag eat the page."

**Implementation**: `.sidebar`'s `width`/`flex-basis` now read a `--sidebar-width` custom property (default `240px`) instead of a literal value, so the existing collapse animation (§ "Desktop sidebar collapse" in `styles/base.css`) and every other sidebar rule are untouched. `sidebarResize.js` (new, following `sidebarCollapse.js`'s structure) drags via `pointerdown`/`pointermove`/`pointerup` on a new `#sidebar-resize-handle` div (`role="separator"`, `aria-orientation="vertical"`, keyboard-operable — Left/Right or Up/Down nudge 16px, Home/End jump to min/max, per the WAI-ARIA window-splitter pattern), clamps every frame to `[MIN, MAX]`, and persists the final value to `localStorage` (`promptly:sidebarWidth`) the same way the theme/collapse preferences do. `SIDEBAR_WIDTH_INIT_SCRIPT` (`lib/render.mjs`) applies a stored width to `<html>`'s inline style before first paint — same anti-flash pattern as `THEME_INIT_SCRIPT`/`SIDEBAR_INIT_SCRIPT`, and it independently re-validates the stored value against `[MIN, MAX]` before applying it, so a hand-edited or stale `localStorage` value can't push the sidebar outside the design's bounds pre-JS. A `.sidebar.is-resizing` class suppresses the sidebar's own width transition while actively dragging, so the drag tracks the cursor instead of chasing a 0.2s ease behind it. The handle is hidden both while the sidebar is collapsed (nothing to grab) and below the 900px breakpoint (the mobile off-canvas drawer has no room to widen into) — same gating `sidebarCollapse.js` already uses.

---

## 9o. Why-Sign-In Rewrite, Sidebar Tooltip Fixes, Archive/Delete Icons, Archived Prompts Page (new)

A grab-bag pass covering a `/why-sign-in/` copy/layout pass, two sidebar tooltip bugs, and a genuinely new feature (prompt administration icons + an Archived Prompts page).

**`/why-sign-in/` widened and rewritten.** `.why-sign-in-page`'s `max-width` went from 680px to 820px, and `.why-compare` switched from a 2-column grid to a single stacked column (`display: flex; flex-direction: column`) - at 680px split into two ~320px columns, "Without an account"'s list items were wrapping badly. Copy changes: "Without an account" → "**Not signed in**" (plainer, and reads better against "Signed in" as a pair); "Write and edit your own prompts" → "**Full control over your own prompts - write, edit, archive, and delete them**", reflecting that editing is no longer the only thing a signed-in user can do to their own prompts (see the Archive/Delete icons below); "Fork a default prompt to customize it, or archive it if you'd rather not see it" → "**Make a default prompt your own by editing it, or archive one you'd rather not see**" - "fork" is accurate internally (`db.js`'s `forkPrompt()`, `supabase/README.md`) but not a term this page should assume a reader knows, especially post-§"the merged catalog" pivot where the user-facing verb for the same action has always just been "Edit."

**Collections sidebar tooltip hidden signed out.** The "(i)" tooltip added next to the sidebar's Collections label (§9m) is redundant while signed out, since `collectionsSignedOutCallout` (`renderNav`) already shows an explainer sentence in that state - showing both said the same thing twice. `fieldInfo()` gained a `btnHidden` option; the Collections call now starts `hidden` (server-rendered default, matching the majority signed-out case) and `auth.js`'s `setNavAccountState` reveals it once a session exists, alongside the other signed-in-only nav toggles already living there.

**Sequences sidebar tooltip: two real bugs, not one.** (1) *Visually truncated near the divider below it* - `.sidebar-info-hint` (§9m) and the pre-existing `.field-hint` it was meant to override are equal-specificity single-class selectors; since `.field-hint` sets `bottom: calc(100% + 6px)` and appears later in the stylesheet, that declaration was winning over `.sidebar-info-hint`'s `bottom: auto`, leaving **both** `top` and `bottom` set on an absolutely-positioned box with an auto-height, auto-content containing block - an over-constrained layout that squashed the tooltip's effective height instead of letting it grow downward to fit its text. Fixed with a compound selector (`.field-hint.sidebar-info-hint`, doubling specificity) so the sidebar override reliably wins regardless of source order, plus `z-index: 50` (up from `.field-hint`'s base 4) as a second guard. (2) *Icon looked right-aligned, misaligned with the favorites count above it* - `.sidebar-nav-item-row > a` was `flex: 1 1 auto`, stretching the Sequences link to the row's full width and pushing the (i) button (a sibling, not nested inside the `<a>` - can't nest a `<button>` in an `<a>`) to the far right edge. Changed to `flex: 0 0 auto` (content-width, matching `.sidebar-section-label-group`'s Collections-label pattern) so the button now sits immediately after "Sequences" with a plain 4px gap instead of floating alone at the row's edge.

**Archive and Delete icons on every personalized row/card.** `personalizedActions()` (`lib/render.mjs`, shared by `renderPromptCard` and `renderPromptTableRows` - one change covers both list and grid view) now renders an Archive button (`ICON.archive`) on any default (`is_curated`) alongside the existing Edit, and keeps Delete (`ICON.trash`) scoped to a row the caller actually owns, exactly as before. The two aren't symmetric on purpose: **Archive** just hides a default from view (`db.js`'s pre-existing `archiveDefault()`, previously only invoked internally by `forkPrompt()` - this is its first direct UI entry point) and is trivially reversible from the new Archived Prompts page below, so it fires immediately, no confirmation. **Delete** is `db.js`'s `deletePrompt()` - a real, unrecoverable row removal, only ever available on a prompt the caller owns - so it now opens a themed **confirm dialog** (`renderConfirmDialog` in `lib/render.mjs`, `public/scripts/confirmDialog.js`) instead of the plain browser `confirm()` both `personalize.js` and `quickview.js` used before; the dialog explicitly says the prompt "will be permanently deleted from the database" and needs an explicit click on a `--danger`-colored "Delete" button (new `.btn-danger` class) to proceed. `confirmDialog({title, message, confirmLabel})` returns a promise resolving `true`/`false`, mirroring `confirm()`'s call shape so both existing call sites only needed a one-line swap plus `await`.

**Archived Prompts page** (`/archived/`, `lib/render.mjs`'s `renderArchivedPage`, `public/scripts/archived.js`) - a new sidebar link below Sequences (hidden signed out, same toggle mechanism as the Admin link), listing the caller's archived defaults with the same category-pill treatment (`renderCatBadges`) as every other prompt table, and an "Unarchive" button per row (`db.js`'s pre-existing `unarchiveDefault()`) - same static-shell-plus-client-script pattern as `/admin/`, and its Unarchive control mirrors `/admin/`'s publish/unpublish button almost exactly. Deliberately **excludes** a default that's archived as a side effect of forking it (`prompt_overrides.fork_prompt_id` set) - that default's fork already has "View original" pointing back at it (§"The merged catalog" in `supabase/README.md`), so listing it here too would just be a second, confusing way to un-hide something the fork already supersedes. Only the standalone-archive case (`fork_prompt_id = null`) shows up.

**Backlog, not resolved here**: what admin *unpublishing* a default should actually do - flagged as worth a real discussion (today it just disappears from every non-owner's view with no warning, forked or not) and tracked in BUILD_BRIEF_v4.md §7 rather than decided in this pass.

---

## 9p. Always-Visible Row/Card Icons + Tooltips, Resize Handle Affordance (new)

An immediate follow-up to §9o/§9n, on two things that shipped too subtle to actually notice.

**Fav/Copy/Archive/Delete/Edit icons are now always visible**, not just on row hover/focus/selection. `.row-actions`'s `opacity: 0` (revealed only via `tr:hover`/`:focus-within`/`.is-selected`) is gone - the icons render at their normal `--ink-soft` color at rest, same as grid-view cards already did (`.card-actions` never had the opacity toggle to begin with, so this was a list-view-only inconsistency, not a site-wide one). Reasoning: a hover-only affordance is invisible on touch devices (no hover state) and easy to miss even with a mouse if you don't already know it's there.

**Every icon-only button gets a hover/focus tooltip now, not just the theme/view toggles from §9m.** `.icon-btn[title]::after` (`styles/base.css`) generalizes §9m's `attr(title)`-based CSS bubble to the whole `.icon-btn` class - `#theme-toggle` (already `.icon-btn`) folds into this and loses its now-redundant dedicated rule; `.view-toggle-btn` keeps its own copy since it isn't `.icon-btn`. Unlike the toggle-specific version (`white-space: nowrap`, short fixed strings), this one wraps (`white-space: normal`, `max-width: 190px`) since Archive/Delete's titles are short explanations, not just a label. New copy: Favorite → "Add to Favorites", Copy → "Copy Prompt", Archive → "Archive — hides this prompt from your view and filters", Delete → "Delete — permanently removes this prompt" (the confirm dialog itself, §9o, still carries the fuller warning).

**The sidebar resize handle (§9n) gets a visible grip.** The original hover state was just the 6px strip itself turning into a semi-transparent accent tint - too subtle against the sidebar's own border to read as "grab here." Added a small pill-shaped grip (`::after`, 4×36px, `border-radius: 999px`) centered on the handle, invisible at rest and fading/scaling in on hover, focus, *or* while `.sidebar.is-resizing` is set (so it doesn't flicker off if the cursor drifts off the thin strip mid-drag, since dragging is tracked via document-level pointer listeners, not the handle's own `:hover`).

---

## 9q. Fixed Sidebar/Header, Table Scrollbar Fix (new)

Two real layout bugs, both reported the same session: an unwanted scrollbar pair on the browse table, and the sidebar's logo being scrollable out of view despite `position: sticky` supposedly pinning it.

**Table's horizontal + vertical scrollbars.** `.browse-table` used the default `table-layout: auto`, where a `<th>`'s `width` is only a hint - the browser is still free to grow a column past it if that column's content can't shrink further. The actions column (`<th style="width:64px">`) held up to 4 icon buttons (§9o/§9p added Archive, on top of the existing Fav/Copy/Edit/Delete) needing ~118px, so the browser silently widened the whole table past its container once enough icons were present, and `.table-wrap`'s `overflow-x: auto` turned that into a horizontal scrollbar. The *vertical* scrollbar riding along with it was a second-order effect of the same rule: setting only `overflow-x` forces the browser to compute `overflow-y` as `auto` too (a CSS coupling rule, not a typo) - once the horizontal scrollbar appeared and ate a few pixels of the box's height, that computed `overflow-y: auto` turned the resulting few-pixel shortfall into a second, vertical scrollbar. Fixed at the root: `.browse-table` is now `table-layout: fixed` (Category 180px, Updated 100px, Actions 150px - wide enough for 4 icons plus padding - Title gets whatever's left), and `.table-wrap` drops `overflow-x` entirely, since a fixed-layout table can never grow past its own `width: 100%` in the first place - content wraps or truncates within its column instead. Applies everywhere `renderPromptTable` and Search's table are used (Home, Category, Favorites, Search).

**Sidebar no longer scrolls away - `position: fixed`, not `sticky`.** The sidebar looked right in principle (`position: sticky; top: 0; height: 100vh`) but a sticky element only stays pinned for as long as its containing block (`.app-shell`, sized to `main`'s natural content height in normal flow) has "slack" beyond the sticky element's own height. On a page whose content is only barely taller than the viewport - true of most pages here, without hundreds of prompts - that slack is tiny (tens of px), so the sidebar visibly detached and scrolled with the page well before reaching the bottom. This was invisible in principle but easy to trigger on any short-to-medium page. Switched the sidebar to `position: fixed; top: 0; left: 0` - fully out of document flow, pinned to the viewport unconditionally, so its own `overflow-y: auto` only ever engages for its *own* content (the Categories list growing past viewport height), completely decoupled from how tall or short `main`'s content is - exactly the "only scroll the sidebar when the number of categories requires it" behavior asked for. Since a fixed element no longer occupies space in the flex layout, `main` now reserves room for it explicitly via `margin-left: var(--sidebar-width, 240px)` - reading the *same* custom property the sidebar's own width already used (§9n's resize feature, §"Desktop sidebar collapse" for the collapsed state), so drag-resizing and collapsing still keep main's margin in sync automatically, no new JS needed. The mobile off-canvas drawer (`@media (max-width: 900px)`) already used `position: fixed` for its own reasons (sliding via `transform`) and needed no changes beyond dropping its now-redundant `position: fixed` declaration (inherited from the shared rule) and zeroing `main`'s margin-left below that breakpoint, since the drawer overlays rather than pushing content.

**Header bar (`.main-header`) is `position: sticky` within `main`**, not fixed - it doesn't need viewport-relative positioning the way the sidebar does, since it already sits at whatever horizontal offset `main`'s margin-left puts it at; sticky relative to the page's one real scroll container (html/body - nothing else scrolls) keeps it pinned at the top as content scrolls underneath, using the same single browser-level scrollbar the sidebar and everything else now share. Needed an explicit `background: var(--paper)` it didn't have before - sticky alone doesn't add opacity, so scrolling content would otherwise show through it.

---

## 9r. Owned-Copies UI Pass — Uniform Row Actions, Bulk Select, Tooltip Containment, Account Stats (new)

The UI half of the owned-copies model ([BUILD_BRIEF_v5.md](BUILD_BRIEF_v5.md)). The data-model reasoning lives there and in [`supabase/README.md`](supabase/README.md); recorded here is what changed on screen.

**Row/card actions are now uniform.** `personalizedActions()` (`lib/render.mjs`) previously branched on ownership: Edit on everything, Archive only on a default (`is_curated`), Delete only on a row the caller owned — so the two removal verbs never appeared together, and no row ever showed both. That asymmetry was the visible symptom of the borrowing model, and it's what triggered the v5 redesign. Every row and card now carries the same four: **Edit, Duplicate, Archive, Delete**, because every prompt in a signed-in view is one the caller owns. §9o's and §9p's icon lists are superseded accordingly (Archive is no longer default-only, Delete is no longer own-only, and Duplicate is new).

**Duplicate got its own icon.** It initially reused `ICON.copy`, the same overlapping-squares glyph as "Copy Prompt" — two adjacent buttons in one toolbar with the same icon and very different effects (clipboard vs. a new database row). `ICON.duplicate` is a page-with-a-plus instead.

**Catalog/Draft badge** (`libraryBadge()`, `lib/render.mjs`). An admin's library holds catalog prompts and personal ones side by side and they were indistinguishable, which matters because editing a published catalog prompt is a broadcast to everyone holding a copy while editing a personal one isn't. `Catalog` = accent pill, `Draft` = grey with a dashed border, no badge = personal. Only rendered for someone who owns a curated row, so regular users never see it (they can't own one — RLS forbids it).

**Bulk multi-select.** A new user's library starts as a copy of the whole catalog, so pruning it one row at a time was the obvious friction. Checkboxes on rows and cards, select-all in the header, and a bulk bar that appears once something is selected (Archive / Delete / Clear). Two details: the select column is rendered on **every** table, guest or not, and hidden by CSS until the block is personalized — `personalize.js` replaces only the `<tbody>`, so a column that appeared solely when signed in would leave `<thead>` a cell short and misalign the table. And selection is held in a `Set` rather than read from checkbox state, so it survives a repaint and stays in sync between the table and the card grid, which are two separate sets of checkboxes for the same prompts.

**Card layout reordered** to title / categories / description / actions / updated, and the grid's minimum column width went 260px → 320px. The title previously shared its row with what became a six-icon toolbar, leaving it ~90px to wrap in.

**Tooltips: `data-tip`, not `title`, and anchored to their row.** Two distinct bugs, one cause each:

1. *Doubled tooltips.* The styled `::after` tooltip read `content: attr(title)`, but `title` also makes the browser draw its **own** tooltip near the cursor — so both rendered. Invisible while the styled one sat under the cursor too; obvious once card tooltips moved to the card's left edge. There is no way to suppress a native tooltip while keeping the attribute, so every element with a styled tooltip now uses `data-tip` and drops `title` (`aria-label` was already present on all of them). Elements that only ever wanted the native tooltip — the modal's close/nav buttons, the resize handle, the Catalog/Draft chips — keep `title` and were never affected.
2. *Tooltips escaping their container.* A tooltip is up to 190px wide; a card is 320px and the quick-view modal's action row sits at its right edge. Anchored to its own button, a mid-row tooltip overflows one side whichever way it opens — and on the leftmost card that overflow lands **under the fixed sidebar**, invisibly, because `.prompt-card:hover` applies a `transform`, creating a stacking context that traps the tooltip's `z-index: 20` below the sidebar's `z-index: 15`. Raising the z-index would look like a fix and do nothing. Both `.card-actions` and `.pd-actions` now act as the containing block (their buttons go `position: static`) with tooltips pinned to the row edge and `max-width: 100%`, so they're inside the card/modal at any button position or width. Only one is ever visible at a time, so a shared position reads as a hint line. The quick-view modal's horizontal scrollbar (`scrollWidth` 814 vs `clientWidth` 680) was the same cause and went with it.

**Table column fixes.** The actions column went 150px → 200px (six icons measure 175px, and §9q's `table-layout: fixed` means an under-sized column doesn't reflow — the icons simply overflowed the table). The Updated column moved off an inline `width:100px` to 118px in CSS with `white-space: nowrap`, which was wrapping "Aug 13, 2026" onto two lines.

**Sidebar stopped growing its own scrollbar.** `.sidebar-section-list` had `overflow-y: auto`, giving Collections an internal scroll box. Removed. Both lists now cap at `SIDEBAR_LIST_CAP` (6) and hand the overflow to a native `<details>` disclosure (Categories — no JS, no extra page) or a "View all N →" link (Collections — `/collections/` already exists as a destination).

**Home's subtitle is now a fixed sentence.** It read "N prompts across M categories, organized into S sequences", built from the static catalog — wrong the moment a signed-in library differed from it, and `personalize.js` recomputes the table and the pills but never touched that line. Replaced with "Every prompt available to you, in one place." — true for both tiers and unable to go stale.

**`/account/` earned a reason to exist.** Sign out moved to the sidebar footer (under the signed-in email, reachable from anywhere), which left the account page showing an email and a button you could already reach. It now reports on the library: prompts, written-by-you vs. from-the-catalog, how many catalog prompts you've customised, collections, uncollected, recently added, favourites, and — for an admin — published vs. draft catalog counts. Two charts: a **composition bar** (written by you / from the catalog / catalog-adapted) showing the proportion the tiles can only state as numbers, and a **category distribution** bar chart. All derived from data the caller already owns; no new privileged read.

*Decision, tried and reversed:* the category chart briefly rendered **every** category in the vocabulary, drawing unused ones as empty tracks, on the reasoning that a chart captioned "where the gaps are" ought to show gaps. Reverted — nine rows for a handful of prompts read as clutter, and the empty rows drew attention without being actionable. The chart shows only categories in use, and the caption no longer promises otherwise.

**Favourites became two-tier.** Signed out they remain localStorage keyed by slug, exactly as §5 describes. Signed in they move to the `favorites` table keyed by prompt id — the key spaces can't be shared, since a user's copy has a different id (and possibly a different slug) from the catalog row it came from. Anonymous favourites merge in once on first sign-in, matched by slug, with the local copy kept so signing out doesn't strand you. `/favorites/` is personalized as a result, so a favourited *personal* prompt finally appears there.

**Also in this pass**: the category filter label was sized down to match the sitewide mono micro-label treatment (it ran 13px/600 against 10.5px everywhere else); a duplicated prompt is now placed directly after its original and flashes briefly, rather than jumping to the top of a newest-first list with nothing to show where it went.

---

## 9s. User-Owned Categories — Colour as Data, Sidebar Dots, /categories/ (new)

The UI half of user-owned categories ([BUILD_BRIEF_v6.md](BUILD_BRIEF_v6.md)). The data-model reasoning lives there and in [`supabase/README.md`](supabase/README.md); recorded here is what changed on screen. Migration `0006_user_categories.sql`.

**Category colour stopped being CSS and became data.** `categoryHue()` mapped a slug onto one of six `cat-*` classes by its index in `lib/schema.mjs`'s nine-element `CATEGORIES` array, modulo six — so three pairs silently shared a colour: writing+education, code+creative, marketing+ops-admin. It went unnoticed because the collisions sit six apart in a list rendered in order, putting them at opposite ends of the filter toolbar. Colouring the sidebar (below) would have stacked them adjacently, where the repeat is unmissable and the colour stops meaning anything. Both the function and the array are deleted; each category row now stores its own hex, and the nine seeded catalog colours are distinct (the six originals, so nothing currently on screen changed shade, plus teal/indigo/slate for the three that were collisions).

**The 24 hand-tuned tokens collapsed to one number.** `styles/tokens.css` carried `--cat-{clay,ochre,blue,plum,moss,rose}` plus a `-soft` variant of each, redefined per theme — six hues × light/dark × solid/soft. All of it is gone. The renderer inlines two custom properties per element (`--cat`, `--cat-ink`, from `catColorVars()`), and the soft pill tint is derived in CSS: `color-mix(in oklab, var(--cat) var(--cat-soft-mix), var(--paper))`. Because `--paper` is already theme-dependent, one declaration produces a pale wash in light mode and a dark one in dark, leaving `--cat-soft-mix` as the only per-theme value (16% / 22%). The per-consumer CSS went from six rules each to one, for badges, pills and the account page's bar chart alike. The useful consequence is that the anonymous and signed-in cases became the *same* mechanism — the static build writes the catalog colour into the span, `personalize.js` rewrites the same span with the user's — rather than needing a separate "inject a stylesheet of custom properties when signed in" step.

**Badge text is computed from luminance, not assumed white.** Badges used white because all six hues were picked to carry it; a user picking a pale colour would have made the label unreadable. `readableInk()` (`lib/schema.mjs`) runs WCAG relative luminance and returns white or `--ink`'s light value at a 4.5:1 threshold. The category editor's live preview renders the badge exactly as it will appear, ink and all, which explains the constraint better than a validation message would — so the picker warns by showing rather than by forbidding.

**Two contrast problems found by measuring, not by reading.** Both were introduced by this pass and both were invisible in the markup. (1) The filter pill's *label* is neutral ink rather than the category colour, so it gets no help from `readableInk()` — at the 28% dark-mode mix originally chosen, a user picking pure white would have left the label at 3.83:1, and in light mode a dark pick put a real seeded category at 4.22:1, both under AA. Fixed by overriding the base rule's `--ink-soft` with full-strength `--ink` on `.filter-pill.is-hued` and pulling the dark mix back to 22%: worst-case picks now measure 8.3:1 (light) and 8.6:1 (dark), while the tint stays at least as visible against `--paper` as the hand-picked values it replaced. (2) The sidebar dot was sized 18px to match `ICON.*`'s `width="18"` attribute, but those SVGs actually lay out at 16px, so every category label sat 2px right of the primary nav's. Both numbers are now recorded in the CSS with the measurements behind them, since neither is recoverable by reading the code.

**Sidebar category icons are coloured dots.** Every category shared one folder glyph. A folder can't carry the colour cleanly at 18px — stroked, a mid-tone hue reads as tinted grey and a light one nearly vanishes; filled, it's a large flat shape competing with the label. A 10px filled circle is the one form that reads unambiguously as "this colour" at that size, and it matches the badge fill exactly, so the sidebar and the pills agree at a glance. The folder glyph stays on the "Categories" section label itself.

**Category links are tier-dependent, and category pages stayed catalog-only.** A user-created category can't have a statically generated `/browse/<slug>/` page, and adding a catch-all route to a build that has never had a dynamic segment is real infrastructure for a page that shows what a filtered Home already shows. So `/browse/<slug>/` is still generated for catalog categories, and the sidebar sends anonymous visitors there while signed-in visitors go to `/?cat=<slug>` — Home with that pill pre-activated. Uniform within each tier, so no two categories in one sidebar behave differently. This also removed a standing oddity: a signed-in user on `/browse/writing/` saw a heading from the static catalog above contents `personalize.js` had already swapped out.

**`/categories/`** (`renderCategoriesPage`, `public/scripts/categories.js`) — create, rename, recolour, reorder by drag, delete. Modelled on `/collections/` rather than `/admin/`: categories belong to every user now, and an admin manages theirs on the same page, theirs simply being the catalog rows. Signed out it explains what signing in adds instead of showing a sign-in wall — guests do have categories, they just can't change them.

**Delete needed a policy, and it isn't "block while in use."** Removing a category from a prompt that has two others is an ordinary edit and shouldn't require ceremony; the rule that actually matters is narrower — never leave a prompt with *no* categories. So deletion pre-flights (`categoryUsage()`), and only where a prompt would be stranded does the dialog require a replacement before enabling the button. The work goes through a `delete_category()` RPC because the reassignment and the delete have to share a transaction: the database trigger rejects the delete the moment it would strand anything, so the replacement must already be filed, and PostgREST gives a client one statement per request.

**Search's filter pills are rebuilt on sign-in now.** They never were, which was harmless while the vocabulary was a shared nine-slug constant — the build-time pills were already right for everyone. With per-user categories it became a real gap: `/search/` would have shown the *admin's* categories while every other page showed the user's, including a pill for a category they had deleted.

**Also in this pass**: the New Prompt modal's category checkboxes are populated at runtime from the caller's own categories (they were server-rendered into every static page from the hardcoded array, which can't work when the vocabulary differs per user), and carry a colour swatch; `/why-sign-in/` gains "your own categories" as a listed benefit; and the account page's composition chart, which borrowed `--cat-ochre` for its "catalog, adapted" segment, moved to `--new` — that segment was never a category, and the token it was using no longer exists.

---

## 9t. Mobile Layout Repair, Filter Divider (new)

A follow-up to §9s, prompted by two things noticed after it shipped: the new `/categories/` page rendering far too narrow, and — found while measuring that — every page overflowing horizontally on a phone.

**`/categories/` was inheriting a sign-in-form width.** It reuses `.account-page` for its container, the way `/admin/` and `/collections/` do, but unlike those two it never added a `max-width` override — so it sat at `.account-page`'s 380px, which exists to size a sign-in form. With a badge, a count and two buttons on each row, the description column was left about two characters wide. Now `max-width: 900px` (rather than `/collections/`'s 860px, since these rows carry one more column), which measures 547px of description and no clipping across all nine rows. The description also gained a `title` so anything that does clip is still readable on hover.

**Every page scrolled sideways ~146px at phone widths, and the header was not the cause.** The visible symptom was the header's search field hanging past the right edge, and the first fix — letting `.main-header-right` shrink and clearing the `<input>`'s automatic content-based minimum — cut the overflow to 61px without eliminating it. That was the signal that something upstream was wrong: `.app-shell` is a **row** flex container (sidebar | main on desktop), and `.mobile-topbar` is a sibling inside it, so the moment it becomes `display: flex` below 900px it joins that row as a *second column*. Measured at 375px it took 166px, leaving `main` 209px of the viewport — so every fixed-width control inside main overflowed, the header simply being the first one wide enough to notice. Fixed by wrapping the shell (`flex-wrap: wrap`) and giving both the topbar and `main` a full-width line. `align-content: flex-start` is required alongside it: a multi-line flex container stretches its lines to fill its height by default, and `.app-shell` is `flex: 1 0 auto` inside a `min-height: 100vh` body, so without it the topbar's line stretched to ~290px and opened a large empty gap above the content. The two header changes were kept — they're not needed at 375px any more, but the input's ~172px content-based minimum is a genuine constraint at 320px.

**The browse table's fixed columns don't fit a phone, so two of them now drop.** Separate cause, pre-existing since §9q/§9r: `table-layout: fixed` with Category 180px + Updated 118px + Actions 200px is 498px of fixed width before Title gets anything, so at 360px the table ran ~164px past the screen edge. Below 700px, `.col-category` and `.col-updated` are hidden, leaving Title and the row actions. Hiding beat the alternatives — a horizontal scroll container would undo §9q's reason for removing `overflow-x` from `.table-wrap`, and shrinking would leave a badge and a date fighting over ~40px each; category remains reachable through the filter pills, and "Updated" is secondary on a phone. The Category column had no class to target (just an inline `width:180px` on the `<th>`), so it gained `col-category` on both header and cells with the width moved into CSS, matching how `col-updated` already worked. One rule covers all six tables, since Home, Category, Favorites, Search, `/archived/` and `/admin/` all share `.browse-table`.

**A hairline between the filter pills and the results.** `<hr class="home-hero-divider">` already sits *above* the pill row; the row now closes with a matching 1px `var(--line-soft)` border below it, so the filters read as a bounded band rather than as something floating above the list. Implemented as a border on `.filter-toolbar`/`.filter-bar` rather than an `<hr>` in the markup, because `personalize.js` and `search.js` both rebuild that element via `outerHTML` when the caller's own categories load — a sibling `<hr>` would have to be re-emitted from three render paths and kept in step, while a border travels with the element. Present on Home, Favorites and Search; Category pages have no filter row, being server-scoped to one category already.

**Verified by measurement, in-browser**: zero horizontal overflow at 320, 360, 375, 699 and 768; unchanged desktop layout at 1000 and 1280 (sidebar 240px, no wrap, topbar hidden); the table's column breakpoint flipping exactly between 699 and 701, with header and body cell counts staying in step at every width — `table-layout: fixed` misaligns badly if a `<th>` and its `<td>` disagree about being hidden.

---

## 9u. Category Ceiling, Legal Pages, Sequence-Builder Retirement (new)

Three unrelated register items in one pass — OPEN_ITEMS.md B3, A3 and D4 — plus a documentation contradiction found on the way in.

**CLAUDE.md was contradicting itself about v6.** One paragraph described user-owned categories as applied, verified and deployed; a later one described the same pass as "a design pass, not built", claiming categories were still the hardcoded `CATEGORIES` array in `lib/schema.mjs`. The second was written before the pass shipped and never revisited — `lib/schema.mjs` now opens by saying that array is gone. Removed rather than corrected, since the accurate paragraph already said everything the stale one was trying to. Recorded here because it is the third instance of the same failure mode this project has hit: a status claim going stale *in place*, where nothing about reading it suggests it is old.

**A per-user category limit of 20, enforced on the RLS insert policy** (`0007_category_limit.sql`). The design question that decided everything else was where *not* to enforce it. `ensure_seeded()` must never be capped: phase 1 can hand a user a newly published catalog category when they are already at the ceiling, and phase 4 re-grants a category they had deleted (v6 §7.2) — and both run inside the same transaction that seeds that user's *prompts*. A `BEFORE INSERT` trigger raising there would not refuse one category, it would abort seeding wholesale on every page load, silently, so the user would simply stop receiving catalog prompts with nothing on screen to explain it. An RLS clause avoids that structurally rather than by remembering an exemption: `ensure_seeded()` is `SECURITY DEFINER` and its owner owns `categories`, and a table's owner bypasses RLS unless the table is `FORCE ROW LEVEL SECURITY`. `verify_0007.sql` asserts all three legs of that (checks 4, 5 and 6), because if any stops holding, the cap silently becomes a cap on seeding.

Two consequences are deliberate. A user **can** exceed 20 — create 20, then be granted a 21st — because the cap governs what you can *create*, not what you can *hold*; reliability of seeding beats an exact ceiling for a limit whose worst case is a long sidebar. And **admins are not exempt**, which is what makes the cap mean anything: an admin's library *is* the catalog, so capping them at 20 is what guarantees a freshly seeded account starts at or under the ceiling. The known gap, stated rather than papered over: RLS `WITH CHECK` subqueries run against the command snapshot, so a single bulk insert straight at PostgREST could land more than 20 at once. Closing it would need the statement-level trigger this design just argued against.

The number lives in two places — the policy and `MAX_CATEGORIES_PER_USER` in `lib/schema.mjs` — because nothing can share a constant across Postgres and a browser. They disagree safely in one direction only, and both say so. `/categories/` disables "+ New category" at the limit and explains why, since an RLS refusal surfaces as `new row violates row-level security policy`, which reads as a bug rather than a limit; the policy is the backstop, and the form translates a `42501` in case it is ever reached.

**`/privacy/` and `/terms/`, drafted for the UK** (UK GDPR + DPA 2018, ICO as supervisory authority; governing law corrected to **Scots law** in §9w). Jurisdiction drives more of the text than it appears to: the Article 6 lawful-basis table, the international-transfer wording and the consumer-rights carve-out in the liability clause would each need rewriting, not renaming, elsewhere. The documents describe *this* system rather than a generic one — no analytics, no advertising, no tracking cookies, no third-party scripts beyond the esm.sh CDN (which does see visitor IPs, and is disclosed), four functional `promptly:*` localStorage keys plus the Supabase auth token, and Supabase and Vercel as the two processors. The Terms carry a section on the owned-copies model, because "the prompts we published are now copies you own and we will not alter them" is unusual enough that no template covers it. Identifying details sit in one `LEGAL_DETAILS` object rather than being repeated across two documents; `scripts/build.mjs` warns on every run while any placeholder remains, since a policy published with `[CONTROLLER NAME]` in it is worse than no policy.

**The sequence-builder's hardcoded category vocabulary is gone, and its bulk re-categorize control with it.** Two independent reasons, either sufficient: there is no fixed vocabulary left to copy (categories are per-user rows, so no hardcoded list can be correct for anyone, and `lib/schema.mjs`'s array no longer exists to sync against), and the control had stopped working regardless — it wrote a singular `category:` frontmatter key while the schema reads a `categories:` list, so a file it touched kept its old categories and gained a key nothing reads. §4a recorded the narrowing to `category` as deliberate in §9c; against the schema as it stands it was simply inert. Drag-and-drop sequence assignment and bulk delete are untouched: sequences are the part of that tool with a future (OPEN_ITEMS.md D1 and E4), and none of it depends on categories.

**Two CSS bugs found by measuring, neither visible in the source.** Both are the same mistake: `.legal-page p` is specificity (0,1,1) and quietly outranks anything with a single class or a bare element selector. First, `.legal-updated` (0,1,0) lost — the date line rendered at 14px/`--ink-soft` instead of 12px/faint, and the markup and the CSS each looked correct in isolation. Second and worse, the site's global `a { color: inherit; text-decoration: none }` lost too, so **every in-sentence link on both legal pages rendered identically to body text** — same colour, same weight, no underline — which is a WCAG 1.4.1 failure and, in plain terms, made the ICO complaints link and both contact addresses impossible to find. Links are now explicitly `--accent` plus an underline, scoped under `.legal-page`.

**`--ink-faint` measures 2.79:1 against `--paper`, below the 4.5:1 AA floor.** Found while checking the date line, which was going to use it. The token is used elsewhere on the site and changing it is a separate decision, not made here — but it was not adopted for either new piece of text: the legal date stamp uses `--ink-soft` at 12px (size carries the "secondary" signal instead), and so does the at-limit note on `/categories/`, which is the only thing on screen explaining why a button the user just pressed is disabled. Logged as an open item rather than fixed in passing.

**Verified by measurement, in-browser**, since reading the code could not have revealed any of the above. Light and dark both pass AA on every element of both legal pages: body 5.42 / 8.31, headings 13.48 / 15.22, table cells 5.42 / 8.31, links 5.76 / 7.99, and links confirmed distinct from body colour in both. No horizontal overflow at 375 or 1280 on either page; the lawful-basis table collapses to a stacked layout below 640px with its `<thead>` hidden and cells confirmed on separate rows. The `/categories/` at-limit state was measured by injecting exactly what `render()` emits: note and button share a row at 1280 with a 12px gap and wrap to separate right-aligned lines at 375, button disabled with `not-allowed`, note at 5.42:1, no overflow at either width. The sequence-builder was checked statically only — it is a `file://` tool the preview server does not serve — by confirming it parses and that every `getElementById` target still exists in its HTML with no orphaned ids left behind.

---

## 9v. First Name at Sign-Up, Privacy Rewrite Against the BBC Model, Footer Separators (new)

A review pass over §9u, before it was looked at in a browser.

**First name is collected at sign-up, and used.** One form serves both sign-in and sign-up, so the field is hidden and un-`required` in sign-in mode by the tab handler. Those two properties must move together and the code says so: a hidden `required` control is invalid and unfocusable, so the browser refuses to submit the form, logs a console warning, and shows the user nothing — a failure that looks like "the button is broken". Measured all three states rather than assumed: sign-in submits with the hidden field empty, sign-up blocks on an empty name, sign-up passes once given.

Stored via `signUp({ options: { data: { first_name } } })`, which lands on `auth.users.raw_user_meta_data` and comes back as `user.user_metadata`. No migration and no `profiles` table for one field — a table of ours would mean a row created in step with the auth user and deleted in step with it, which is a lot of machinery for a greeting.

It is **used on `/account/`**, and that is deliberate rather than decorative. Collecting a name and never showing it is collecting personal data with no purpose, which is precisely what UK GDPR's data-minimisation principle prohibits; either it earns a place on screen or the field should not ask for it. The email stays alongside it, since that identifies *which* account you are in. Escaped through `esc()` on the way into `innerHTML` — the exposure is only to yourself, but "only self-XSS" is not a reason to interpolate raw user input into markup.

**A syntax error worth recording, because the mechanism is invisible on review.** The comment first written above that field used backticks around the words `required` and `hidden` — inside a template literal, which ended the string. Every script on the page then failed to parse and `/account/` sat on "Loading…" forever. The lesson is not "be careful", it is that HTML comments inside template literals must not contain backticks; the replacement comment says so in place. A `node --check` sweep across every script now runs as part of verifying this kind of change.

**The privacy policy was rewritten against the BBC's, which is worth reading before touching it.** Three things were taken from it. Headings are questions in the reader's voice — "What information do you collect about me?" rather than "Data collection" — which changes who the document is addressed to. A numbered contents list makes it navigable rather than merely complete; the list and the headings are generated from one `PRIVACY_SECTIONS` array, since a contents list that disagrees with its headings is worse than none, and the numbering is now asserted to match in-browser. And cookies live *inside* the privacy policy: the BBC's is titled "Privacy and Cookies Policy" and covers them as its section 13, with a separate hub page that at their scale earns its place. At this scale a separate cookie policy would be one sentence on a page of its own, so it is section 5 and the footer link reads "Privacy & Cookies" so the word is findable.

**The cookie answer is "none at all", and that is stated rather than implied.** Verified in the browser: `document.cookie` is empty, and `createClient` is called with no options, so supabase-js uses localStorage for the session rather than a cookie. The policy says so plainly and then explains why the distinction does not matter — PECR governs storing *any* information on a user's device, not cookies specifically, so local storage carries the same obligation. The useful question is what is stored and whether it is necessary, which section 6 answers item by item. This also closes out the consent-banner question §9u had left open in the reader's mind: there is nothing to consent to.

**Footer links are pipe-separated.** The pipes are real `<span>` elements with `aria-hidden`, not CSS `::after`: an `::after` pipe lives inside the `<a>`, joining both its clickable area and its accessible name ("About |"). The space either side is the markup's own whitespace rather than margin, so the requirement survives the CSS being changed; the 3px margin on top is cosmetic, added after measuring the collapsed space at only 3.3px in a 12px footer.

**Verified by measurement**: contents list and headings identical (14 of each, zero broken anchors), contents block 4.88–5.19 light / 8.2–8.52 dark, body text 5.42 / 8.31, no horizontal overflow, footer rendering exactly `About | Why sign in? | Privacy & Cookies | Terms` with 6.3px each side of every pipe and no pipe inside any link's text, sign-up field order First name → Email → Password, and a clean console on a fresh load.

**Two corrections after the first look at it in a browser.**

*The contents list numbered everything twice* — "1. 1. What's in this policy?" It is an `<ol>`, so the browser renders a marker, and the link text carried an explicit `${i + 1}.` as well. What makes this worth recording is not the bug but that **the check written to catch exactly this class of problem passed throughout.** It compared the contents text to the heading text and found them identical — which they were, because both sides carried the same duplicated prefix. It was asserting internal consistency, which was never in doubt, rather than what a reader sees. The assertion now strips the headings' explicit `N.` and requires the link text to carry no number of its own, which is the property that actually matters. The headings keep their numbers; an `<h2>` has no list to number it.

*The footer contrast was fixed rather than left open.* `footer.site-footer` and `.footer-logo` move from `--ink-faint` to `--ink-soft`: 3.03 → **5.89** in light, 3.73 → **7.45** in dark, both clearing AA, with `.footer-logo` needing its own change because it carried its own declaration rather than inheriting. The separators stay `--ink-faint` deliberately — they are decorative and `aria-hidden`, so they carry no contrast obligation, and leaving them quieter than the links is what makes them read as punctuation rather than as a fifth item. The footer still reads as secondary through its 12px size and the `--surface` band behind it, which is the job `--ink-faint` was actually doing here. **This fixes the instance, not the token**: `--ink-faint` remains 2.79:1 against `--paper` everywhere else it is used, and OPEN_ITEMS.md D5b is still open.

---

## 9w. Legal Details Filled In; Scots Law, No Postal Address (new)

The step §9u and §9v deliberately left open: `LEGAL_DETAILS` now holds real values, so the build's placeholder warning is silent and the pages are publishable.

**Governing law is Scots law, not England and Wales.** The correction matters more than a find-and-replace, because the two documents have different scopes and only one of them changes. Data protection is reserved and UK-wide: the ICO regulates Scotland exactly as it does the rest of the UK, so the privacy notice needed no change at all. Contract law is not: the Terms' governing-law clause and the "cannot be limited under [X] law" carve-out in the liability section are Scottish. The carve-out also now names the Consumer Rights Act 2015 explicitly, which *is* UK-wide, so that a Scottish governing-law clause is not misread as narrowing consumer protection.

**No postal address, and this is a decision rather than a gap.** UK GDPR Article 13 requires the controller's identity and *contact details*; the ICO accepts an email address as satisfying that, and there is no separate duty on a sole trader to publish a home address. The wording originally drafted — "available on request by email" — was rejected on the owner's instruction and the reasoning is worth keeping, because it is not obvious: it reads as a courtesy but is a standing commitment to hand a home address to anyone who asks. Section 2 of the privacy notice now says plainly that Promptly is a personal project rather than a business with premises, and that email is the route for anything including rights requests. Recorded in `LEGAL_DETAILS` so nobody "fixes" the missing field later; if an address is ever genuinely required, the answer is a service address.

**The under-13 exclusion stays, pending a decision.** Raised as a question rather than an instruction, so nothing was changed. The research behind the recommendation to keep it: the ICO's Children's Code applies to under-18s and to any service "likely to be accessed by children", a threshold the ICO has deliberately refused to put a number on, describing it as more than a de minimis number of children. Removing an age floor is itself evidence toward that conclusion, and the Code's fifteen standards (a DPIA, high-privacy defaults, child-appropriate transparency) are a substantial burden for a personal project. There is also a Scotland-specific angle: the Terms are a contract, the lawful basis is contract, and under the Age of Legal Capacity (Scotland) Act 1991 an under-16 has capacity only for transactions "of a kind commonly entered into by persons of his age and circumstances, and on terms which are not unreasonable" — a free prompt library on ordinary terms plausibly qualifies, but a stated floor removes the question. The floor costs nothing and is the lower-risk position.

---

## 9x. The Privacy Notice Assumed an Account (new)

Prompted by one question — Promptly is usable without signing up, so does the policy account for that? It did not, and one of the gaps was substantive rather than presentational.

**The lawful-basis table had no basis covering anonymous visitors at all.** Every row was Article 6(1)(b), performance of a contract, except one on security. But a contract is a basis you can only rely on where a contract exists, and browsing a website is not one. So the single most common interaction with Promptly — someone arriving, reading prompts, and leaving — was processing (their IP reaching Vercel and Supabase) with **no stated legal basis whatsoever**. Two legitimate-interests rows now sit at the top of the table, covering serving the site at all and keeping it secure, with a line above saying the first two apply to everyone and the rest only once there is an account. That framing matters as much as the rows: it makes the contract/no-contract distinction visible rather than leaving a reader to work out which half applies to them.

**Verified, not assumed: an anonymous visitor really does reach esm.sh.** `supabaseClient.js` is loaded on every page, and its static import pulls the client and its whole dependency graph — five separate requests to esm.sh on the home page, before sign-in, and for a visitor who never creates an account at all. Notably these do **not** appear in the browser tool's network log; they only showed up in `performance.getEntriesByType('resource')`, which is worth remembering the next time third-party requests need auditing. The esm.sh entry in section 7 now says this happens on the first visit regardless of account, and is explicit that it is not covered by an agreement with us, unlike Supabase and Vercel.

**Rights are answered honestly for someone without an account.** Section 10 previously said "your library is yours to edit and delete", which is no answer to a visitor who has no library. It now has a second half: the only thing held that could relate to them is a log entry with their IP; they have the same rights over it including objection; and — stated plainly rather than glossed — we cannot tell which entries are theirs, and Article 11 does not require collecting more information about them purely to become able to identify them. Saying so is better than an implied promise that could not be kept.

Smaller consequences of the same audit: section 1 now leads with "most of Promptly works without an account" and flags esm.sh up front; section 3's three categories are labelled *everyone* / *only if you sign up* / *only if you sign up*, with the technical-data paragraph moved to the top since it is the only one that applies universally; sections 6 and 7 say which items apply before sign-in.

Nothing about the *Terms* needed changing — they already bind anyone using the site, and their account-specific clauses are self-evidently conditional.

**Verified by measurement**: six lawful-basis rows in the intended order with no duplicate left behind by the edit, contents list still matching its headings, no horizontal overflow at 375 or 1280, table still collapsing below 640px with `<thead>` hidden and cells stacked, and no placeholder text anywhere.

---

## 9y. Contact Page — a mailto, not a form (new)

The public contact address moves to `contact@promptly.simplelogin.com`, a SimpleLogin alias rather than a personal mailbox. It lives in `LEGAL_DETAILS` and therefore feeds **both** legal documents, which is the point of that object: one public address, changed in one place. Ten occurrences updated, zero left behind.

**A contact form was designed and rejected, and the reasoning is the useful part**, because "add a contact form" looks like the obvious answer to "we have Supabase". A form usable by guests means granting `anon` INSERT on a table — a permanently open write path into the database from the entire internet, and the one case where "RLS is the boundary, not key secrecy" works against you rather than for you. Making that safe needs length CHECKs, a honeypot, and an IP-keyed rate limit (feasible: Supabase exposes request headers to Postgres via `current_setting('request.headers')`). And then it still needs somewhere for messages to *go*, because a row in a table notifies nobody — which would have meant either an admin screen to remember to check, or a `pg_net` trigger to an email provider, and choosing that provider is OPEN_ITEMS.md A1, still unresolved. All of that to reproduce what an email client already does.

The alias is what makes the simple answer safe: publishing the address in plain text is exactly what makes it copyable and what makes the page work without JavaScript, and an alias can be burned and replaced without touching a personal address. The page uses subject-prefilled `mailto:` links — free in a static page, and it means a UK GDPR rights request arrives already labelled as one, which matters against the privacy notice's one-month commitment.

**`.legal-page` became `.prose-page` for the shared typography.** `/contact/` needed the same prose treatment without being a legal document, and styling it with a class called `legal-page` would have been a lie that the next reader has to untangle. The legal-only rules — contents list, lawful-basis table, last-updated line — stay scoped to `.legal-page`, which the two documents still carry alongside `.prose-page`. Verified after the rename that the legal pages are unchanged: 14px body, 15px headings, 32px heading margins, accent underlined links, the `.legal-updated` override still winning at 12px.

**The privacy notice changed with it, as it has to.** Emailing us is us processing personal data — an email address and free text — so section 3 gains a third category ("anything you email us", flagged as correspondence rather than anything in the database), section 4 gains a legitimate-interests row for replying, and section 9 gains a retention line. The count in section 4's intro moved from "the first two rows" to "the first three", which is the kind of thing that silently goes stale when a table gains a row.

**A wrap defect found by measuring, and worth the note because there is no clean CSS fix.** The fifth footer link pushed the row past one line on small screens, and at 320px the second line began `| Contact` — a separator with nothing before it. Pipes between inline items always dangle at a wrap point; gluing each pipe to its neighbour only moves the orphan to the end of the previous line, and CSS cannot hide a separator conditionally on it landing at a line start. So below 400px the pipes are dropped and `.footer-links` becomes a flex row with a gap, which is what the pipe was standing in for. 400px rather than the measured ~360px threshold, because between the two the row fits only by a few pixels. Verified at 320, 360 (gapped, no pipes, no orphan), 440 and 1280 (pipes, single line).

**Verified by measurement**: five `mailto:` links all pointing at the alias with four carrying prefilled subjects, the address rendering as selectable text rather than only a link, no horizontal overflow at 320/360/440/1280, and AA contrast throughout in both themes — body 5.42/8.31, headings 13.48/15.22, address link 5.19/8.20, list links 5.76/7.99, footer 5.89/7.45.

---

## 9z. Sequence Rails Are Personalized (new)

OPEN_ITEMS.md D1, the last place where the v5 promise that "every prompt you see is yours" visibly failed. A signed-in user browsing a chain was looking at the catalog's prompts.

**The register's corrected premise held up.** v4 had framed this as sequences being catalog-only, implying user copies carry no sequence data. They do: `ensure_seeded()` copies `sequence` and `sequence_step` and remaps `depends_on` onto the caller's own rows, so a signed-in library already forms complete chains. Only the rendering was missing, which is why this was a much smaller job than the original framing suggested — and worth noting as a case where the register's scepticism about an inherited note paid for itself.

**A rail is not a table, so this is `initPersonalizedRail()` rather than an option on `rebuildBlock()`.** No rows, no bulk-selection checkboxes, no per-row action buttons, no filter toolbar — a rail is cards joined by a connector line, and its owner actions are reached by opening a card in quick-view, which already offers Edit/Delete whenever personalization is non-null. Routing both layouts through one function would have meant a parameter switching most of it off. What the two do share is the renderer: `renderSequenceRailItems()` was split out of `renderSequenceRail()` and exported, so the static build and the browser draw the rail from one function instead of two that have to be kept looking alike.

**Personalized cards lose their `href`, and that is the subtle part.** A user's copy is `is_curated = false` and has no statically generated `/prompt/<slug>/` page. Worse, where their slug collides with a catalog prompt's — which `ensure_seeded()`'s suffix-retry makes possible — the page that *does* exist shows the catalog's text rather than theirs, so a link would be actively wrong rather than merely broken. This is the same test `quickview.js` already applies before offering "Open full page", and it was verified: opening a user copy whose slug has no page correctly hides that link. Dropping `href` costs an `<a>` its focusability, so `role="button" tabindex="0"` is added back — matching the browse table's rows, which were never links either. Confirmed the card still takes focus and that Enter opens the modal.

**Empty chains are a signed-in-only state and had to be designed.** An anonymous visitor cannot empty a sequence; a signed-in user can delete or archive every step in one. On `/sequences/` the whole section hides (a heading and a "View sequence" link over nothing reads as a bug), which is what the new `data-sequence` attribute on each section is for. On the detail page the rail *is* the content, so it explains itself and points at `/archived/`. The detail page's subtitle is also rewritten from the caller's step count — it is baked at build time, so a user who deleted a step would otherwise read "4 steps" above a rail showing three.

**Verified by measurement.** Signed out is a genuine no-op: rails render as before, all cards keep their `href`, none gain `role`, quick-view still opens, owner actions stay hidden, no console errors. The signed-in path was driven through the real renderer and the real quick-view instance with a stand-in library, since the tooling cannot hold a session: the rail repaints with the user's titles, the modal opens showing *their* title, purpose and body, Edit and Delete become available, "Open full page" is correctly hidden for a copy with no static page, and the click never navigates.

**One testing trap worth recording**, because it cost two runs and looked like a product bug both times. Importing `/scripts/quickViewRegistry.js` without the build's `?v=` query string loads a *second, separate module instance* with an empty registry — so `getQuickView()` returned undefined and the modal appeared not to populate. Nothing was wrong with the code. Any in-page test that imports a module the page has already imported must use the identical URL, cache-busting query included.

**Known residual, deliberately not fixed:** a sequence a user invents on their own prompts still has no page, because sequence pages are generated at build time from the catalog. That is E4, not this.

---

## 9aa. Why-Sign-In Rewritten, and an Invisible Button (new)

Logged late — the rewrite shipped in `9e05192` without an entry here, which is the omission this section exists to prevent.

**Two inaccuracies on `/why-sign-in/`, found by auditing the page against `db.js` and the render functions rather than against the docs.** "Make a default prompt your own by editing it" was fork-on-edit language from v4, a model `0004` deleted: catalog prompts are copied into a user's library at signup and are theirs from that moment, with no conversion step. And "Everything above, synced across devices" promised something the code does not do — `initPersonalizedTable` was called by Home, Category and Favorites only, so sequences showed the catalog's prompts. (§9z has since fixed that, but the page was rewritten first, and rewriting copy to match a promise you intend to keep later is how a page ends up lying for a release.)

**Six capabilities the page never mentioned**: owned copies stated plainly rather than implied, new catalog prompts arriving automatically via `ensure_seeded()`, duplicate, archiving being reversible via `/archived/`, bulk multi-select, and the `/account/` library stats — an entire page nothing linked to. A "what signing up asks for" section was added too: first name, email, password, no payment, no marketing list, linking to the privacy notice. That is where a just-in-time notice belongs, immediately before someone hands over three pieces of personal data.

**The invisible button, which is the part worth remembering.** The page took `.prose-page` for its new prose sections, and `.prose-page a` — specificity (0,1,1) — outranks `.btn-primary` (0,1,0). So the "Sign in / sign up" call to action had its label repainted in `--accent`, which is that button's own background colour: a solid green rectangle with text at **1:1 contrast**, plus an underline. The rule is now `.prose-page a:not(.btn)`.

This is the **third instance of one trap in a single pass**, and the pattern is worth stating rather than the individual fixes:

| Instance | Wrapper rule | What it silently beat | Symptom |
| --- | --- | --- | --- |
| §9u | `.legal-page p` | `.legal-updated` (0,1,0) | Date line rendered 14px/soft instead of 12px/faint |
| §9u | `.legal-page p` | global `a { color: inherit }` (0,0,1) | Every in-sentence link identical to body text |
| §9aa | `.prose-page a` | `.btn-primary` (0,1,0) | CTA label invisible on its own background |

**Any descendant rule added to a page wrapper silently outranks single-class component styles inside it.** The components keep working everywhere else, so nothing looks broken in review — only on the page that adopted the wrapper.

**And a limit of the verification worth being honest about.** All three survived a full contrast audit, because every measurement sampled prose elements — paragraphs, headings, list items, links in sentences — and none sampled a *component* inside the prose. The button was measured nowhere. It took a person looking at the page to find it. Measurement catches what it is pointed at; it does not notice what it was not asked about, and a page that has never been seen has not been checked.

---

## 9ab. "Log in" Everywhere, Split CTA, Account Greeting (new)

**Terminology: "Sign in" → "Log in", "Sign out" → "Log out". "Sign up" stays.** Signing up is a different action and "log up" is not English, so the pair is asymmetric on purpose.

What changed is **labels and user-facing prose only**. Deliberately untouched: identifiers (`nav-signout-btn`, `why-signin-cta`), the `sign-in`/`sign-up` mode strings in `auth.js`, and code comments — renaming those is churn with no reader benefit and a large diff to review.

**The `/why-sign-in/` route also stays**, while its title, `<h1>` and footer link become "Why log in?". That is not an oversight: it is the same trade §G3 already takes for prompt and category slugs — stable links win, the label is what changes. Changing the route would break the footer, the sidebar Collections callout, `categories.js`'s signed-out view, and any link anyone has already saved, to fix a mismatch nobody sees.

**The single "Sign in / sign up" button became two.** They are different actions with different destinations, and one control naming both makes the reader work out which half applies. Sign up links to `/account/#sign-up`, and `auth.js` reads that hash on load — **without it the split would be cosmetic**, since both buttons would land on the log-in form and the reader would still have to find the tab. The hash path calls the existing `setMode()` rather than assigning `mode` directly, which is what keeps the first-name field's `hidden`/`required` pair in step; setting the variable alone would render a sign-up form that silently refuses to submit, which is exactly the bug §9v already recorded once. Verified both ways round: `#sign-up` opens on Sign up with the name field required, no hash defaults to Log in with it hidden and the form still submittable.

**"What signing up asks for" now hides alongside the CTA when logged in**, via the same `setNavAccountState` toggle. Neither says anything to someone who already has an account: one lists what sign-up will ask for, the other offers to start it. Both start visible and hide on session — the inverse of every other toggle there — because this page exists to persuade logged-out visitors, so they are the ones who must never see a flash of the wrong state. Checked that what remains ends sensibly, on the "Also included" list rather than a dangling heading.

**The account page greeting moved into the identity line**: "Hi Sing, you are logged in as …". The greeting is not the `<h1>` — the heading stays "Account", so the page still announces what it is. The name is genuinely optional rather than assumed: accounts created before the first-name field existed have none, and the line degrades to "You are logged in as …" rather than "Hi , you are…".

**Verified**: nine routes checked for the sidebar link, the log-out button and the footer, all consistent, with no stray "Sign in"/"Sign out" anywhere in the built HTML. Both CTA buttons measured — 6.26:1 and 13.48:1, neither underlined, side by side with a 10px gap. The greeting itself is the one thing here that could not be exercised, since it needs a real session.

---

## 9ac. Why-Log-In Serves Two States, Not Three (new)

Three audiences are worth writing for on this page: a visitor with no account, a visitor who has one but is not logged in, and someone logged in. The instinct that the first two are "the same or very similar" is right, and the reason is stronger than similarity: **they are not distinguishable, and never can be.** A browser either presents a session or it does not, and "no session" says nothing about whether an account exists somewhere. The page cannot branch on it without guessing.

So it serves them together, by writing for the situation they actually share — you are browsing without a library — and letting the two buttons at the foot split the audience **by intent rather than by detection**: Log in for someone who has an account, Sign up for someone who does not. That is what §9ab's split is for, and it is why the split matters beyond tidiness.

**The logged-out intro now speaks to both.** It says browsing without an account is not a trial or a degraded mode but how the site works, and adds the line the returning-user case needs: logging in brings your library back, nothing in it expires, and browsing logged out never touches it. That was the real gap — a visitor with an account had no reassurance that ignoring the login for a while had cost them nothing.

**The logged-in state gets its own opening and its own ending.** Both live in the static markup and are toggled by `setNavAccountState`, the same mechanism as everything else on this page; the logged-out halves start visible because they are the majority audience. The opening states plainly that everything below is already theirs. The ending replaces the sign-up CTA — the wrong close for someone who already has an account, but so is nothing at all, since this page is reached from the footer and a logged-in reader arrived deliberately. It links the four screens the rest of the page describes and never linked: `/account/`, `/categories/`, `/collections/`, `/archived/`. That also closes the §9aa finding that nothing on the site pointed at the account stats.

The comparison panels and both prose sections stay in **both** states — they explain the model rather than sell it, which is as useful after signing up as before. One wording change was needed: "When you sign up, every published prompt is copied…" became "At sign-up, …", so it reads as an explanation rather than a future promise to someone for whom it already happened.

**Verified**: the two intros are mutually exclusive in both states, logged-in opens on its own intro and closes on the four links, all four resolve, and AA holds in both themes for every new element (intros 5.42/8.31, heading 13.48/15.22, links 5.76/7.99) with no overflow.

---

## 9ad. Library Export and Self-Serve Account Deletion (new)

Two features, built together because they are one flow, and because the second is unkind without the first.

**There was already an export, and it was not one.** `/favorites/` carried an "Export favorites" button that wrote a bare JSON array of slugs — a bookmark list with no titles and no bodies. Given a second, richer exporter for the deletion flow, the choice was one engine or two. Two would have agreed on the day they were written and drifted afterwards, and "what does Export give me?" would have depended on which button you pressed. So there is now one engine (`lib/export.mjs`), one place it is offered (`/account/`), and the favourites button is **retired**. Its one good idea is carried forward and is the rule the whole export follows: **cross-references are by slug, never by row id**, because an export keyed by ids is meaningless outside the account that produced it. The one real loss is that the old button worked signed out; a guest has no library, only local favourite slugs, so the honest replacement for them is an account rather than a file.

**Two formats, and CSV was considered and rejected.** JSON is the complete record — the only one that survives the many-to-many between prompts and categories without flattening — and carries `format`/`version` so a future importer can refuse a shape it does not understand. Markdown is the portable one in practice: every destination that matters for prompts takes it (Obsidian, Notion, a repo, a chat window), and a body in a fenced block is one click to copy as raw text. CSV was asked for on the grounds of easy copy-paste and is *worse* at exactly that — a multi-line body becomes one spreadsheet cell — and it carries a formula-injection footgun on any body starting with `=`, `+`, `-` or `@`. Single file rather than one-per-prompt in a zip, which would have meant the project's second vendored dependency for no gain.

**`fenceFor()` is not defensive tidiness.** A prompt body can contain triple backticks, and prompts about code very often do — precisely the ones someone most wants out intact. A hardcoded fence breaks there, and breaks *silently*: the Markdown still renders, with the wrong text inside and outside the block.

**Deletion is a `SECURITY DEFINER` RPC, not a backend.** `auth.users` is unreachable with the anon key and Supabase exposes no client-side delete-my-account call. A Vercel or Edge function would have worked and would have introduced a `service_role` key — a secret strictly more powerful than anything this project stores anywhere — plus a server surface, to perform one fixed operation. `0008_delete_account.sql` does it with no new secret and the same shape as `delete_category()`. It takes **no parameter**: it acts on `auth.uid()`, so there is no id to substitute and no filter to widen. The blast radius is limited by the function's shape rather than by a check that could later be edited away — the same move §9u made when it put the seeding exemption in table ownership.

**The admin cannot delete themselves, and this is the load-bearing rule.** An admin's library *is* the catalog. Deleting the admin cascades every curated prompt, every version and every user's grants, then fires `0005`'s trigger — so the site would rebuild and redeploy itself with an empty catalog, automatically, with nothing to restore from. There is exactly one admin and it is the operator's own account. The UI shows an explanatory pane rather than hiding the button, because a missing control teaches nothing; the database raises regardless. Closing an admin account is a deliberate operator action that belongs in the SQL editor.

**One row is deleted and Postgres does the rest.** Every user-scoped table cascades from `auth.users`, so there is no cleanup script and no half-deleted state. `verify_0008.sql` check 7 asserts that property from the catalog rather than from a list of table names, so a future migration adding a user table without `ON DELETE CASCADE` is caught — the failure otherwise appears only when someone tries to close their account. Signing up again yields a new user id and a fresh `ensure_seeded()`, so nothing is resurrected; that "start over" behaviour falls out of owned copies rather than being built.

**The session outlives the row**, so the flow ends with `signOut({ scope: 'local' })` — not the default, which calls the auth server about a user that no longer exists and can fail. A failed sign-out there would leave the browser holding a JWT for a deleted account: nothing leaks, since RLS returns nothing, but the UI would look signed in and behave as though everything had vanished. Guest continuity then costs nothing: `favoritesStore.js` already keeps the local slug copy alive, so their pre-account favourites are simply there again.

**Verified**: 17 assertions against the export engine in Node (slug resolution, dangling `depends_on` → null, unknown members dropped, archived prompts exported but sectioned last, empty library, and the nested-fence case — a body containing ` ``` ` gets a four-backtick fence and its inner block survives). In-browser, both themes: every new element clears AA (light 4.88–13.48, dark 7.68–15.62), the two export panels sit side by side at equal width with their buttons bottom-aligned, and nothing overflows at a simulated 320px — the dialog's button rows measure 231px inside a 236px content box, and the export row wraps rather than clipping.

**Two findings, neither fixed here.** `.btn-danger` in dark mode is white on `#E2948A` at **2.38:1**, a pre-existing site-wide AA failure that also affects the existing prompt-delete confirm dialog and bulk Delete; logged in [OPEN_ITEMS.md](OPEN_ITEMS.md) §D. And `--ink-faint`'s 2.79:1 (§9u's finding, D5b) was *not* inherited by the new sections: `.stat-section-note` uses it for the same visual role, and copying that would have been consistent and wrong, so the new text starts at `--ink-soft`.

**A verification-script lesson worth more than the feature.** `verify_0008.sql` checks 5 and 6 each FAILed on a *correct* migration, on consecutive runs, for the same underlying reason.

Check 5 asked whether the function's owner was a superuser *or* owned `auth.users`. On Supabase `postgres` is neither — superuser is revoked, `supabase_auth_admin` owns the table — while still holding DELETE **by grant**, the route the list left out. Check 6 then asserted `auth.users` has no RLS enabled. It does; Supabase turns it on. And that proved nothing either, because *RLS enabled is not RLS applying* — `postgres` carries `BYPASSRLS`, so the policies never reach it.

Both checks reconstructed the conditions under which something would be true instead of asking whether it was true, and a check built from a list of sufficient conditions is only ever as complete as the list. They now ask directly: `has_table_privilege` for the grant, and the three documented RLS exemptions (superuser, `BYPASSRLS`, table owner unless FORCE) with `row_security_active()` printed as an independent second opinion. That second list is legitimate to enumerate because it is closed *by definition* rather than by inspection — which is the line worth remembering.

The compounding detail: **a wrong check fails closed.** A red row sends you to read the migration, not the test, so an over-strict assertion costs more than a missing one. This is now the fourth time this project has been misled by an assertion rather than by the thing asserted — §8a's two, §9v's doubled contents list which passed *because* both halves shared the same defect, and this.

**Applied and verified**: `0008` is on the live project and `verify_0008.sql` reads 7 PASS plus check 8 as CHECK. Two of those answers are worth keeping, because both are the opposite of what the first draft of the script assumed: the function's owner (`postgres`) reaches `auth.users` **by grant**, not by superuser or ownership; and `auth.users` **has RLS enabled**, which is harmless only because `postgres` carries `BYPASSRLS`. That second one is a standing dependency on a Supabase role attribute this project does not control — if it is ever removed, deletion would succeed while deleting nothing, and check 6 is the only thing that would say so.

**Proven end to end.** A throwaway non-admin account was created, seeded, exported and then deleted through the real UI, and the rows went with it. That test was the whole point of A7 and could not be performed from the build tooling, which holds no session — everything above it establishes that the delete *should* be permitted, and only this establishes that it *is*. What remains true rather than resolved: `auth` is Supabase's own schema and the supported path is the admin API, so this works **by convention, not by contract**. It also rests on `postgres` carrying `BYPASSRLS`, since `auth.users` has RLS enabled — an attribute this project does not control, whose withdrawal would make the delete succeed while removing nothing. Re-run `verify_0008.sql` after any Supabase auth upgrade; check 6 is the only thing that would report it.

---

## 9ae. `--danger-ink`, and the Project's First Test (new)

Two follow-ups from §9ad, both closing findings rather than adding features.

**`.btn-danger` hardcoded `#fff`.** That is right on the light theme's deep red (`#A6392E`, 6.47:1) and wrong on the dark theme's pale one (`#E2948A`, **2.38:1**), which is a WCAG AA failure on every destructive button on the site — the prompt-delete confirm, bulk Delete, `.btn-danger-outline`'s hover state, and §9ad's account deletion. The principle is the one `readableInk()` already applies to category badges: **a fill light enough to read against a dark background is necessarily too light to carry white text**, so the label has to follow the fill rather than be assumed.

Fixed with a `--danger-ink` token paired to `--danger`, exactly as `--accent-ink` is paired to `--accent` — the pattern already existed, which is the strongest argument for using it. White in light, `#2A0F0B` in dark (hue-tinted rather than neutral black, matching `--accent-ink`'s treatment). Both `.btn-danger` and `.btn-danger-outline:hover` consume it; hardcoding `#fff` in the second would have left half the problem behind, since a hover state on a danger fill is a filled danger button in all but name. Measured after: **6.47:1 light, 7.54:1 dark.**

**A measurement note that cost three re-runs and is worth writing down.** `getComputedStyle()` returned *stale* values for nodes that had already been measured under the previous theme — the token resolved correctly on the element (`--danger: #E2948A`) while its computed `background-color` still reported the light hex, which is not a state that can actually exist. It is a caching artefact of measuring the same node repeatedly across a theme switch, and it produces a plausible wrong number rather than an error. **Measure on a freshly created node** (append a probe element with the same classes) or clone-and-replace the one under test. The same session also produced two other artefacts of this kind — a button briefly reading 1.25:1, and a whole page reading 21:1 because the stylesheet had been fetched mid-rebuild and parsed to zero rules. In all three the discipline that saved it was the same: an impossible number is a broken measurement until proven otherwise, so re-measure by a different route before believing it.

**`scripts/test-export.mjs`, run by `npm test`** — 22 assertions, and the project's first automated test. Not the start of a testing policy: `lib/export.mjs` is the one piece here that is both pure and genuinely fiddly (id→slug resolution across four relations, dropped unresolvable references, computed fence lengths), and **every one of those fails by producing a plausible-looking file rather than an error**. The stakes are also asymmetric in a way nothing else here is: the export is what someone downloads immediately before deleting their account, so a silent corruption is discovered only once the original is gone. Dependency-free and assertion-library-free, printing PASS/FAIL and exiting non-zero, deliberately in the same idiom as `supabase/verify_*.sql` — readable top to bottom without knowing a framework. Fixtures are shaped exactly as `db.js` returns rows, since testing a hand-simplified shape would prove the engine works on data it will never see. It does **not** cover `accountDelete.js`, which needs a DOM and a session; that half stays with in-browser measurement and A7's throwaway signup.

---

## 9af. Export Discoverability, and a Duplicated Account Page (new)

Three fixes on top of §9ad, one of which was a real bug shipped to production.

**The account page rendered Export and Delete twice.** Reported from a live signed-in session, and the cause is a race worth recording because neither half looks wrong alone. `auth.js` renders `/account/` twice — once from `init()` after `getSession()`, once from `onAuthStateChange` — and each render resets `#account-root`'s `innerHTML` first, which would normally make a second render harmless. What breaks it is §9ad's own optimisation: `initAccountTools` is reached through a **dynamic `import()`**, so both appends are deferred past both resets. Nothing cleans up, and the sections stack.

Fixed by removing any previous `#account-tools-host` before appending, rather than by early-returning if one exists. That distinction matters: the second call may carry a *different* user — a sign-in completing after the initial signed-out paint — and an early return would leave the first user's markup wired to stale handlers. The listeners are also scoped to the new host rather than bound by `getElementById`, so they cannot bind to a stray copy that survives.

**An "Export library" link in the sidebar footer**, beside Log out, hidden signed out. Deliberately a **link to `/account/#export`, not a second download button**: offering the export in exactly one place is the property bought by retiring the `/favorites/` export, and a second button that downloads would hand it straight back. This solves discoverability only — someone working in their library had no way of knowing an export existed. It takes `--ink-soft` rather than inheriting `.sidebar-signout`'s `--ink-faint` (D5b, 2.79:1), and an accent hover rather than Log out's danger red, since red signals destructive and downloading your own work is the opposite.

**The export buttons were too faint inside their panels.** `.btn-secondary` is a transparent fill with a `--line` border tuned to sit on `--paper`; on `--well` that boundary falls well under the 3:1 WCAG 1.4.11 asks of a UI component, and the buttons read as labels. Now `--paper` fill plus an `--ink-soft` border: **4.88:1 light, 8.52:1 dark** against the panel.

**A deferred scroll, and why not `requestAnimationFrame`.** `#export` does not exist when the browser resolves the hash — it is appended after a session check and a dynamic import — so the link would land on `/account/` and do nothing. Scrolling explicitly once the markup exists fixes it, but *not synchronously after `appendChild`*: the section is in the DOM while the document has not been laid out at its new height, so the call silently no-ops with no error. rAF was the first fix and is the wrong one — it does not fire while a tab is not compositing, so in a background tab the scroll would be deferred indefinitely, and it made the behaviour untestable here. `setTimeout(…, 0)` yields a task and flushes layout without depending on the page being painted.

**Two more false signals from the tooling, both mine.** A check for `requestAnimationFrame` in the shipped file matched **the comment explaining why it wasn't used**, and separately the browser served a cached page whose build id was two builds stale, so an already-fixed bug kept reproducing. Both cost a round trip; both are the same lesson §9ae recorded — verify the *code*, not text that mentions it, and confirm the build id you are testing before believing a result.

---

## 9ag. The Sidebar Footer Says What It Does (new)

The signed-in email in the sidebar was itself the link to `/account/`, and nothing said so. An email address does not read as a control — it reads as a label telling you which account you are in — so the account page was effectively unreachable from the nav unless you thought to click your own address. §9af's Export library link sat beside it as a second text row, which helped that one action and left the underlying problem alone.

**The address is now inert text, and the actions are named.** Both halves are needed. Naming the actions fixes discoverability; making the address plain fixes the other failure, because a link styled as text is worse than no link — it neither invites a click nor explains what happens if you take one. Three icon buttons sit beneath it: **View account** (`/account/`), **Export library** (`/account/#export`), **Log out**, each with a `data-tip` tooltip and a matching `aria-label`, since an icon alone names nothing.

The footer is now two mutually exclusive states in the static markup, toggled by `setNavAccountState` like everything else session-dependent: signed out, a "Log in" link and nothing more; signed in, the email plus the three actions. The three share **one** toggle rather than three, so they cannot drift apart — every one of them is meaningless without a session.

Export stays a **link**, not a download button, for §9ad's reason: one export offered in one place is the property bought by retiring the `/favorites/` one, and a second control that downloads would give it back.

**Tooltips had to flip above.** The shared `.icon-btn[data-tip]` rule places them at `top: calc(100% + 8px)`, which is right everywhere else and wrong here — this row is the last thing in the sidebar, hard against the bottom of the viewport. Measured: the buttons sit at y=852 in a 900px viewport, so an unflipped tooltip would span 888–912 and be clipped. Flipped, they land near y=820. The first button also anchors its tooltip from the left rather than centred, since it sits at the sidebar's left edge.

**A duplicate rule, found while doing this.** `.sidebar-footer-row` was declared **twice**, roughly 1,360 lines apart, the later one quietly overriding the earlier's `display`/`flex-direction`/`align-items`/`gap` by document order. It is the same hazard as §9aa's specificity collisions but cheaper to trip over, because it needs no specificity difference at all — only a reader who finds the first declaration and stops. Editing the first has no effect, and working out why is the whole cost. Both are now one rule; `.sidebar-signout` and `.sidebar-export` went with them, having no users left.

**The icons sit on a pad, not bare.** Grouped on `--well` with a `--line` border and 26px buttons — the header's `.sidebar-view-toggle` treatment, borrowed rather than invented so the two icon clusters on screen read as one idea (verified: background, border, radius and padding all resolve identically). Bare icons on the sidebar's own ground read as decoration, and the pad is what says "controls" before anyone hovers far enough to find a tooltip. One deliberate departure: `.view-toggle-btn` colours its icons `--ink-faint`, the 2.79:1 token from D5b, so these stay `--ink-soft` rather than copying a known failure into a new component.

**Verified**: signed-out shows only "Log in"; signed-in shows the email with three correctly-labelled actions, all inside the sidebar and on one line at 240px (the resize floor) and on mobile at 375px. AA holds in both themes (5.89 light, 7.45 dark for both the address and the icons). A 66-character address wraps to two lines without pushing the sidebar wide, clipping, or breaking the button row. The 21px of sidebar horizontal overflow is `#sidebar-resize-handle`, is identical signed-out, and is by design.

---

## 9ah. Password Rules (new)

The sign-up form asked for six characters, because that is Supabase Auth's default and nothing had ever revisited it. Six characters is inside offline-crack range in seconds. This pass raises it — and settles what *kind* of rule to impose, which mattered more than the number.

**Length, not composition.** No required capitals, digits or symbols. That is a deliberate rejection of the familiar rule set, not an omission: "must contain an uppercase letter, a digit and a symbol" reliably produces `Password1!`, which satisfies every clause and is far weaker than a long lowercase phrase. Current guidance (NIST SP 800-63B, NCSC) is length-first, and both halves of the implementation follow it.

**The rule is enforced in Supabase, not here.** Dashboard → Authentication → Sign In / Providers → Email: **Minimum password length 10**, **Password Requirements** left at *no required characters*. `auth.js` mirrors that in `MIN_PASSWORD_LENGTH`, and the two are kept in step **by hand and by nothing else** — the client cannot read the setting back. Change one, change the other. Everything in `auth.js` is a better error message and an earlier one; none of it is a security control, and it should never be mistaken for the boundary.

**Leaked-password protection is not on, and the reason is the plan tier.** Supabase's HIBP check (k-anonymity, so no password leaves the browser intact) would catch far more bad passwords than any composition rule can, and it is a Pro feature. This project is on Free. Worth switching on the day the tier changes; recorded here so it is not rediscovered as a design question.

**`maxlength` is 72 for a mechanical reason, not a policy one.** Supabase hashes with bcrypt, which ignores everything past 72 bytes — a longer password is silently truncated, and two passwords sharing their first 72 bytes are the same password at the login prompt. Better said out loud than left to happen invisibly.

**The one content rule is containment**: the password may not contain the email's local part or the first name typed into the field directly above it. This catches a pattern composition rules never do. Both checks have a 3-character floor, which is what stops them being obnoxious — a two-letter name would reject most passwords for containing two letters in order.

**Both length attributes are sign-up-only, and that asymmetry is load-bearing.** `setMode()` sets `minlength`/`maxlength` entering sign-up and **removes** them entering sign-in, the same both-together discipline §9v established for the first-name field's `hidden`/`required` pair. A stale `minlength` on the log-in form would make the browser block submission of a password that genuinely works, using its own message, which no code here could intercept or explain — a lockout with no stated cause. Accounts predating this policy still have shorter passwords; the admin account is one of them.

**The strength meter is advisory and cannot veto.** A meter that blocks is a composition rule wearing a different hat and fails the same way. Scoring is length-dominant on purpose: a meter rewarding something other than the rule it sits under is arguing with itself on screen. Variety earns at most one step, and only past 12 characters. No zxcvbn — the better estimator by some distance, and ~400KB for a hint on a site whose entire dependency list is two packages.

**Verified** in the browser across both themes: meter scores 0/1/2/3 at 5, 10, 12 and 19 characters with fills resolving to `--danger`, `--danger`, `--new`, `--accent` (light) and their dark-theme counterparts; all four validator messages fire, several at once when several apply; the submit button re-enables after a blocked submit; switching to sign-in strips both attributes and a 6-character password passes `checkValidity()`; switching back restores them, and a typed 6-character password is refused by the browser's own constraint.

**A measurement note worth more than the feature.** `background-color` reads came back as `--accent` at *every* score — wrong, and not a cascade problem. The Browser pane was not compositing frames, so CSS transitions never advanced and `getComputedStyle()` returned values frozen mid-transition. Disabling the transition gave the correct colours immediately. This is a second entry in the same family as §9ae's stale-`getComputedStyle` warning: **treat an impossible measurement as a broken measurement first.** Here the tell was that the base rule's own `var(--danger)` was not showing either, which no selector could explain.

---

## 9ai. Show Password (new)

§9ah raised the minimum to 10 characters and added a strength meter, both of which push people toward longer passwords — and a longer password typed blind is a longer password to mistype. The reveal toggle is the other half of that change rather than a separate convenience.

**On both tabs, not just sign-up.** The obvious use is checking a password manager's generated string actually landed in the field. The one that matters more is the log-in form, where a repeated failure is usually a typo and the masking is what stops you seeing it. Restricting the toggle to sign-up would remove it from the case with the worse failure mode — especially now, with password reset unavailable until A1.

**The icon names the action, not the state.** Open eye means "show it" and appears while the password is masked; the slashed eye appears once it is visible. Same convention as the theme toggle, which shows the mode you would switch *to*. `aria-pressed` carries the state, `aria-label` and `data-tip` carry the action, and both flip with the icon — an eye with no label reads equally as "is shown" and "click to show".

**Caret restoration is the only non-obvious mechanic.** Changing an input's `type` discards its selection in every engine tested, so a naive toggle dumps the cursor to one end of the field — precisely when someone is mid-typing, which is when they reach for this control. `setPasswordVisible()` saves `selectionStart`/`selectionEnd`, restores them after the type change, and only if the input had focus to begin with (restoring focus it never had would be its own bug). The early-return guard matters for the same reason: `setMode()` calls this on every tab click, and without it each click would rebuild the icon and reset the selection for nothing.

**It re-masks on tab switch.** The reveal was asked for in one context and should not silently carry into another. Not re-masked on a *failed* submit, deliberately — a failed sign-in is exactly when you want to look at what you typed.

**`ICON` is now exported from `lib/render.mjs`.** Every other icon in that map is consumed by a render function in the same file; these two are the first needed by a client script that builds its own markup. Exporting it was the smaller change than starting a second icon set in `auth.js`, which is the outcome actually worth avoiding.

**A contrast decision, made rather than inherited.** The toggle first used `--ink-faint`, which measures **2.79:1** on the field ground and **fails WCAG 1.4.11's 3:1 for a user-interface component** — the non-text threshold, which is the one that applies to a control. That is D5b's token, and §9ag had already refused to copy it into the sidebar icons for the same reason. Changed to `--ink-soft` before shipping: **5.42:1 light, 8.31:1 dark**, with `--accent` at 5.76/7.99 in the pressed state. Caught by measuring rather than by looking, which is the only way this class of thing is caught.

**Verified**: icon, `aria-pressed`, `aria-label` and tooltip all flip together; caret held at offset 5 through both directions of a toggle with focus retained; re-masks on tab switch; `type="button"` so it cannot submit the form (asserted, not assumed); the strength meter is unaffected by revealing; the button sits inside the field with a 4px gutter, vertically centred, at desktop and 375px, with a 60-character password and no horizontal overflow; DOM order puts it between the password input and Submit.

---

## 9aj. A Control That Lied, and Type That Was Too Small (new)

Two unrelated reports from looking at production, sharing a session.

**The sidebar "+" beside Categories never created a category.** `categoriesNav.js`'s handler is one line — `location.href = '/categories/'`. The icon was `plus`, the `aria-label` "New category", the tooltip "New category": three separate promises of a creation step, delivered as a navigation. Two aggravating factors. It was **redundant** — the "Categories" label immediately to its left is already a link to the same page, so two adjacent controls shared one destination and only one of them described it. And it was **inconsistent** — the identical `+` on Collections directly above *does* open a create modal, so the same icon in the same position in the same list meant two different things.

Now a **gear**, labelled and tooltipped "Manage categories", with the id renamed `manage-categories-btn` — `#new-category-btn` read as a create control to anyone grepping for one, which is how the mislabelling would have propagated. Navigating rather than opening an editor stays the right call and is not what was wrong: `/categories/` is where add, rename, recolour and delete all live, and duplicating any of it in a modal would mean two places to keep in step. Creation is one click further on, via that page's own "+ New category" button, where a plus is accurate.

**Titles were set smaller than body copy.** `.title-cell` and `.card-title` were both 13.5px against a 15px body — the most important text in each row rendered below ordinary prose, leaving weight and the display face to carry the hierarchy alone. That is what read as cramped. Both are now **15px**: level with body rather than above it, because bold display type at the same size already reads as a heading, and going larger costs rows on screen. Measured cost as it stands: **67px → 72px per row**, 6px.

**The list subline was failing AA, and that is why it looked small.** `.purpose-line` was 11.5px at `--ink-faint` — **3.03:1** against the table's white ground, against the 4.5:1 text minimum. It was simultaneously the smallest text on the page and the lowest contrast, and the two compounded: low contrast reads as *smaller* even when the size is fine, which is exactly how it was reported. Now 13px at `--ink-soft`, **5.89:1 light / 7.45:1 dark**.

That fix also closed a drift nobody had noticed: `.card-purpose` in grid view was **already** 13px/`--ink-soft`, so the same subline had two different treatments depending on which view you were in. `max-width` went 480 → 540px with the type, since a larger face in the same box shows fewer characters before the ellipsis, and the words are the point of the line.

This is the second contrast issue **fixed rather than logged** (after §9ai), and it removes another `--ink-faint` instance. D5b remains open for the rest.

**Found while measuring, not fixed here**: `.sidebar-section-add` (22px, `--ink-faint`, `--accent` on hover) is **entirely dead**. `.icon-btn` declares the same properties at equal specificity ~480 lines later and wins on document order, so those buttons are 28px at `--ink-soft`. Same hazard as §9ag's duplicated `.sidebar-footer-row` and worth noting for the same reason: no specificity difference is involved, only a reader who stops at the first match. Left alone deliberately — the *rendered* result is the accessible one, and "fixing" the cascade would apply the 2.79:1 token this pass just spent effort removing.

**Verified**: gear renders 15×15 in its 28×28 box and is visually distinct from the Collections plus (14×14); no `new-category-btn` reference survives outside an explanatory comment; titles 15px and sublines 13px in **both** list and grid, passing AA in both themes (title 14.65 light / 13.66 dark, subline 5.89 / 7.45).

---

## 9ak. Cleaning Up After the Gear (new)

Three follow-ons from §9aj, all in the same sidebar row.

**The dead `.sidebar-section-add` rule is gone.** §9aj found it and left it; this removes it. Every declaration in it — 22px box, `--ink-faint`, `--accent` on hover — was overridden by `.icon-btn` at identical specificity ~480 lines later, so document order decided it and the buttons have always rendered at 28px/`--ink-soft`.

Deleted rather than made to win, which is the part worth understanding: honouring the old values would have shrunk the buttons and repainted them in the 2.79:1 token §9ai and §9aj spent effort removing. **The broken cascade was producing the accessible result and the "correct" one would have regressed it.** That is the argument for reading what a page actually computes rather than what its stylesheet appears to say.

One piece of intent survives — `--accent` on hover, which `.icon-btn:hover`'s `--ink` was also swallowing. It is re-expressed as `.sidebar-section-label-row .sidebar-section-add:hover`, **(0,3,0), so it wins on specificity rather than on position in the file.** Winning by document order is exactly the fragility being repaired; a rule that only works because of where it sits is one edit away from not working.

**The tooltip was clipped.** `.sidebar` sets `overflow-x: hidden` — deliberate, so it never grows its own scrollbar — and the shared `.icon-btn[data-tip]` rule centres tooltips with `translateX(-50%)`. This button sits hard against the sidebar's right edge, so a centred tooltip put its right half outside and lost it. Measured: **"Manage categories" overflowed by 17px**. Now anchored to the button's right edge and extending leftward, spanning 120–221px inside a 240px sidebar. The horizontal counterpart of §9ag, which flipped the footer tooltips above for the vertical version of the same problem. Note this was latent before §9aj — "New category" was narrow enough to get away with it, so the longer label exposed a bug rather than causing one.

**The Categories label is no longer a link — signed in only.** With the gear beside it going to `/categories/`, a linked label put two controls with one destination side by side, and the label is a section heading rather than a control.

Signed *out* it stays a link, and that asymmetry is the whole design: the gear is hidden from anonymous visitors, and `/categories/` has a real signed-out state (`categories.js`'s `signedOutView` — what categories are, and what logging in gets you). Unlinking in both states would have left that page reachable only by typing its URL. **The link survives exactly where it is the only route and disappears exactly where it is a duplicate.** Both halves ship in the static markup and are toggled by `setNavAccountState`, the same pattern as the account footer.

Collections keeps its link unconditionally, and that is not an inconsistency to tidy: its `+` opens a modal instead of navigating, so the label is the only route to `/collections/` in either state.

The gear inherits `aria-current="page"`, since the label that used to carry it can no longer. Same treatment as `.sidebar-account-actions .icon-btn[aria-current]`.

**Verified**: no `.sidebar-section-add` rule remains except the four scoped ones; signed out, the label link is the sole route and the gear is hidden; signed in, the gear is the sole control in the row, renders `--accent` on `/categories/`, and the inert label is visually identical to the link it replaces.

---

## 9al. Both Section Labels Become Headings; the (i) Hints Do the Work (new)

§9ak unlinked the Categories label when signed in and left it a link when signed out. That fixed the duplicate destination and bought a worse problem: **the same word behaved differently depending on who was looking at it** — a control for logged-out visitors, inert text for everyone else. Neither state was wrong on its own; having both was.

**Both labels are now plain headings, in both states.** Collections lost its link too, so the two sections match. What replaces the routes is the `(i)` hint each section carries, which now holds a permanent link.

**The hints are click-to-pin.** They were CSS-only — `.field-info:hover + .field-hint` and nothing else — which is right for a sentence you read and move on from and useless the moment the hint contains something to reach: no rule keeps it open while the pointer travels, so **moving toward a link inside dismissed the thing you were moving toward.** `public/scripts/fieldInfo.js` adds click (and Enter/Space, free from `<button>`) to pin until dismissed by a second click, an outside click, Esc, or focus leaving. Hover is untouched and still the common case. One pinned hint at a time, since two would overlap in the sidebar.

It applies to **every** `.field-info` on the page, not only the sidebar's — the Sequences label and the New Prompt modal use the same idiom, and a control that pins in one place but not another is worse than one that never pins. The modal's instances need the handler's `preventDefault`: they sit inside `<label>` elements, where a click would otherwise be forwarded to the labelled input and focus a text field every time you asked for help.

**`fieldInfo()` takes a structured `cta`, not HTML.** `hintText` stays `esc()`'d — that escaping is what makes the helper safe to hand arbitrary strings, and an `html: true` flag would quietly remove it for anyone who reached for it. The wrapper becomes a `<div>` when a cta is present, since a block-level link inside an inline element renders inconsistently.

**The cta text is session-dependent, and this is the one thing that has to stay that way.** Signed out it is a pitch to `/why-sign-in/`; signed in it is navigation to the page. Collections needs it more than Categories: its `+` opens a modal rather than navigating, and `collectionsNav.js` only links to `/collections/` **once you have a collection** — so a signed-in account with none had no route there at all, which is precisely the state every new account starts in. That hole existed before this pass and would have been made permanent by unlinking the label without replacing the route.

Content in a hint differing by session is not the inconsistency §9al set out to fix. A *label* that changes affordance is, because it changes what kind of thing it is; contextual help saying something relevant to the reader is what help is for.

**The Collections callout is gone**, its text now in the hint. Consequence, accepted: signed out the section is a heading with an empty list beneath it (measured at 20px). The explanation moved somewhere every visitor can reach rather than only logged-out ones — which reverses §9ag-era reasoning that hid the Collections `(i)` when signed out precisely *because* the callout existed. Both `(i)` buttons are now permanent and `auth.js` no longer toggles either.

**Verified**: both labels render as `<span>`; all six `.field-info` instances pin, unpin, move the pin between them, survive a click on their own cta, and close on outside click and on Esc with focus returned to the button; hover still works; the hint fits the sidebar (190px wide spanning 16–206px inside 240px); the cta reads 13.48:1 light and 15.22:1 dark against the bubble. `--accent` was rejected for the cta — the bubble's ground is `--ink`, against which the light theme's accent measures 1.9:1 — so the link is marked by weight and an underline instead of hue.

Not verified in-browser: the signed-in cta text, for the same reason as the gear — it needs a session this environment cannot create.

---

## 9am. The Symmetry §9aj Was Reaching For

§9al put permanent links inside the `(i)` hints because neither section label was a link any more and `/collections/` needed a route. That was solving the wrong problem. **The Collections `+` was the odd one out, not the label** — and replacing it with a gear makes both sections identical, at which point the hints go back to being plain text and the link machinery is unnecessary.

**Both sections are now: heading, `(i)` hint, gear → management page.** Nothing about them differs.

**Creation moves onto the page, which is the trade Categories already made.** `/collections/` renders its own create form at the top (`collections.js`), so nothing is lost but a click. That is exactly why the category editor was never duplicated into a modal — one place for management, not two to keep in step — and applying the same rule to Collections is what §9aj should have done instead of relabelling one button and leaving the other.

It also closes the hole §9al had to route around: `collectionsNav.js` links to `/collections/` only once you *have* a collection, so a signed-in account with none had no way there. A gear does not care how many you have.

**`renderNewCollectionModal()` and `newCollection.js` are deleted.** With no trigger left, the modal was unreachable markup shipped on every page. Removed rather than orphaned — git has it if the fast path is ever wanted back. `collections:changed` survives; `collections.js` still fires it.

**`fieldInfo()` loses its `cta` option** and goes back to escaped text only. The wrapper is a `<span>` again. §9al's warning about never adding an `html` flag stands, and is now easier to honour.

**`fieldInfo.js` survives, for a different reason than it was written.** It existed to make a link inside a hint reachable. It stays because of what testing it surfaced: **the hints do not work on touch at all.** A tap fires neither `:hover` (no pointer) nor `:focus-visible` (deliberately keyboard-only), so an emulated tap left the hint at `visibility: hidden` — the (i) buttons did nothing on a phone, silently.

That was true long before this run, and it now matters more, since the hint is the only place the Collections explanation lives after §9al folded the callout into it. Keeping ~40 lines to make three tooltips work on mobile is a better trade than deleting them and shipping controls that are inert for half the site's likely traffic. The script is narrowed to that job: open, close, Esc, close on focus leaving — no link handling.

The "log in to create one" wording moves into the hint text as a plain sentence rather than a link. The sidebar footer already carries a real Log in control, so the route exists; what was lost is a shortcut, not a path.

**Verified**: both gears render identically (28×28, same icon, same right-anchored tooltip, both fitting the sidebar); both labels are `<span>`; all three sidebar hints are plain `<span>` with no `<a>` inside; the Collections gear carries `aria-current` and renders `--accent` on `/collections/`; no `nc-modal` markup or `newCollection.js` request remains; a simulated touch tap opens the hint, a second closes it, an outside tap closes it. `npm test` 22/22.

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

## 12. Backlog / Pending Ideas (new)

**Moved to [OPEN_ITEMS.md](OPEN_ITEMS.md).** The three entries this section carried —
prompt authoring assistance, collections/sequences discoverability on Home, and whether
`tags` return to complement categories — are in the single register.

The last two turned out to be the same question as one raised by BUILD_BRIEF_v6.md, and
the register merges them: **what is a category, a collection, and a tag for, now that
categories are user-owned, coloured and reorderable?** They read as three small backlog
items and are really one design decision; answering any of them alone is likely to be
wrong.

---

*IA, the sequencing/favorites mechanics, and the stack change (Astro → custom static build script, Pagefind → Fuse.js) are locked from the original design session; nothing there should be re-litigated from scratch. §9 (palette/type) is locked as of commit `d90c04b`. §9a (layout/depth) is an active, still-partial pass — its "Done" items are locked, its "explicitly open" items are not yet designed and should be treated as open questions, not oversights, until §9a is revisited. §9b (tabular browse + quick-view) is implemented and locked. §9c (filter rail → pills, `models`/`complexity`/`tags` capture paused) is implemented and locked — but explicitly reversible "for now," not a permanent taxonomy decision. §9d (card chip = solid badge) is implemented and locked, closing out §9a's card/chip question. §9e (sequence rail = vertical connected rail, new `handoff` field) is implemented and locked, closing out §9a's sequence-rail question. §9f (card depth = richer hover, option C) is implemented and locked, closing out §9a's depth/interactivity question — §9a has no remaining open items as of §9f. §9g (Home = all-prompts table, Browse hub removed) is implemented and locked for the table/pills/hero shape and the hub removal; the collections/sequences discoverability question it surfaces is explicitly open — pending the tags-return/architecture decision, now consolidated as one question in [OPEN_ITEMS.md](OPEN_ITEMS.md) §F1 — and should not be treated as solved by anything currently on Home. §9h (hero refinement, Chain filter removed site-wide, nav/breadcrumb spacing + sticky footer, nav background color) is implemented and locked — treat §9g's own Decision/Implementation text as superseded on the specific points §9h calls out (Home's title and Chain pill), not as still-current. §9i (breadcrumb separator = `>`, Sort control removed site-wide, Category page descriptions + result-count removed) is implemented and locked — §8's Category page template text is superseded accordingly. §9j (category description spacing, `/contributing` page removed) is implemented and locked. §9k ("What's New" callout = option C from a three-way mockup, filter-pill rest-state hue backgrounds) is implemented and locked. §9l (filter-pill selection ring, --accent not per-hue) is implemented and locked, closing out the selection-clarity gap §9k introduced. §9m (result-count removed site-wide, new-callout personalization fix, sequences quick-view, toggle/sidebar tooltips) is implemented and locked — §9i's "Home's result-count line is unaffected" is superseded (Home/Favorites no longer show it either, for the reason given in §9m), and §9k's new-callout description is superseded on the "slugs embedded directly in the page's own inline script" point (now a `data-new-slugs` attribute, recomputed after a signed-in merge). §9n (sidebar drag-to-resize, 240px floor / 480px ceiling) is implemented and locked. §9o (why-sign-in rewrite, sidebar tooltip fixes, Archive/Delete icons + confirm dialog, Archived Prompts page) is implemented and locked — the admin-unpublish question it surfaces was largely answered by v5 — unpublishing stops future grants and leaves existing copies untouched, and §9o's fork-era framing of it is obsolete; the residual question (whether holders should be *told*) is in [OPEN_ITEMS.md](OPEN_ITEMS.md) §H. §9p (always-visible row/card icons + generalized icon-btn tooltips, resize-handle grip) is implemented and locked — §9o's icon list is unaffected by this (still Fav/Copy/Archive/Delete/Edit), just no longer hover-gated. §9q (sidebar/header `position: fixed`/`sticky` instead of the sidebar's old `position: sticky`, table-layout:fixed fixing the browse table's scrollbars) is implemented and locked - §9's original "Sticky + 100vh height so it scrolls independently" framing for the sidebar is superseded on the *mechanism* (fixed, not sticky) though not the intent, which §9q's fixed positioning actually achieves more reliably than sticky did. §9r (owned-copies UI: uniform four-action rows, bulk select, `data-tip` tooltips anchored to their row, account-page stats, two-tier favourites) is implemented and locked — it supersedes §9o's and §9p's icon lists (Archive is no longer default-only, Delete no longer own-only, Duplicate is new) and §5's "favorites are localStorage" on the signed-in side only, which §5 now notes inline. §9s (user-owned categories: colour as per-category data, derived soft/dark variants, computed badge ink, sidebar colour dots, tier-dependent category links, `/categories/`) is implemented and locked — it supersedes §9k's filter-pill description on the *mechanism* (the rest-state tint is derived via `color-mix` from a stored colour, not a hand-picked `--cat-*-soft` token) though not its intent, and supersedes §9k's "text stays neutral ink" on the specific shade: the label is now full-strength `--ink`, because a user-chosen colour has no guaranteed contrast against a mid-grey label the way the old hand-picked pastels did. §3's controlled-vocabulary framing for `categories` is historical — the vocabulary is per-user data, not a fixed list, and §3 now says so inline. §9t (mobile layout repair: `.app-shell` wrapping so the mobile topbar stops taking a column from `main`, browse-table Category/Updated columns hidden below 700px, `/categories/` widened off `.account-page`'s form width, hairline under the filter pills) is implemented and locked — it supersedes §9q's implicit assumption that the table's fixed column widths always fit, which held only above ~700px. §9u (per-user category ceiling of 20 enforced via RLS, `/privacy/` and `/terms/` drafted for the UK, sequence-builder's hardcoded category vocabulary and bulk re-categorize control retired) is implemented and locked on the *mechanism* — specifically that the cap is enforced on the interactive insert path only and that `ensure_seeded()` is exempt by way of table ownership, which is the part that must not be "simplified" into a trigger later. The *number* 20 is not locked and is expected to move; it lives in `0007_category_limit.sql` and `MAX_CATEGORIES_PER_USER` together. §4a's bulk re-categorize bullet is superseded and says so inline. The legal pages are locked as to structure and as to their description of this system, and explicitly **not** as to content: they are researched drafts pending both the identifying details and whatever review OPEN_ITEMS.md A3 ends up calling for. §9u also records that `--ink-faint` fails AA at 2.79:1 against `--paper`; that is a finding, not a decision — the token is untouched and the question of what to do about it is open in [OPEN_ITEMS.md](OPEN_ITEMS.md) §D. §9v (first name at sign-up and shown on `/account/`, privacy policy restructured on the BBC's question-heading + contents-list model with cookies folded in as section 5, pipe-separated footer) is implemented and locked on structure — in particular that `PRIVACY_SECTIONS` generates both the contents list and the headings, which is what keeps them from drifting, and that the first-name field's `hidden` and `required` are toggled together. The policy *text* remains explicitly unlocked for the same reason §9u gave. §9v also records that the footer's links measure 3.03:1, which is a finding rather than a decision and belongs to the same open question as §9u's — [OPEN_ITEMS.md](OPEN_ITEMS.md) §D5b. §9w (real `LEGAL_DETAILS`, Scots law, no postal address) and §9x (the privacy notice extended to cover visitors without an account) are implemented. §9w's postal-address decision is locked and is a safety decision, not a drafting gap — do not "complete" it later. §9x's lawful-basis structure is locked: the two legitimate-interests rows exist because contract cannot cover anonymous browsing, so removing them reintroduces a real gap. The under-13 exclusion is **decided and locked**: it stays, for the reasons in §9w and [OPEN_ITEMS.md](OPEN_ITEMS.md) §A3 (removing it invites the ICO's Children's Code, and Scots law limits an under-16's capacity to contract). `0007_category_limit.sql` is **applied and verified** against the live project, so B3 is complete and sits in [OPEN_ITEMS.md](OPEN_ITEMS.md) §H. §9y (`/contact/` as a mailto page rather than a form, `.legal-page` → `.prose-page`) and §9z (sequence rails personalized) are implemented and locked on mechanism. §9y's "no contact form" is a decision with reasons recorded, not an omission — see [OPEN_ITEMS.md](OPEN_ITEMS.md) §H before proposing one. §9z's dropping of `href` on personalized rail cards is load-bearing and must not be "restored": a user's copy has no static page, and where the slug collides the page that exists shows the catalog's text, so the link would be wrong rather than missing. §9aa (`/why-sign-in/` rewritten against actual behaviour; `.prose-page a:not(.btn)`) is implemented and locked — the `:not(.btn)` is load-bearing, not tidiness: without it the page's own call-to-action is invisible. Its table of three specificity collisions is the most reusable thing in §9u–§9aa: a descendant rule on a page wrapper outranks single-class component styles inside it, and a contrast audit that samples only prose will not catch it. §9ab ("Log in"/"Log out" terminology, split CTA with a `#sign-up` deep link, account greeting) is implemented and locked on two points: "Sign up" deliberately does *not* become "Log up", and the `/why-sign-in/` route stays while its label changes — the same stable-links trade as §G3, not an inconsistency to tidy up. §9ad (one export engine on `/account/`, the `/favorites/` slug export retired, self-serve deletion via `delete_my_account()`) is implemented and locked on three mechanisms that must not be "simplified" later. The RPC takes **no parameter** — adding one to make it reusable would convert a function that can only delete its caller into one that can delete anybody. The **admin refusal is in the database**, not only in the dialog; the UI pane explains, the `raise` enforces, and an admin's library being the catalog is what makes the difference between an inconvenience and an unrecoverable one. And the sign-out after deletion is **`scope: 'local'`** deliberately, because the default asks a server about a user who no longer exists. The export's slug-not-id rule is likewise locked: it is what makes the file mean anything after the account is gone. Not locked: the two formats offered, and CSV's exclusion, which is a judgement about portability rather than a constraint — it would become worth revisiting if a spreadsheet workflow ever appears, with formula-injection escaping as the price of entry. §9ad also records that `.btn-danger` fails AA in dark mode at 2.38:1 site-wide; like §9u's and §9v's contrast notes that is a **finding, not a decision**, and belongs to [OPEN_ITEMS.md](OPEN_ITEMS.md) §D. Whether `delete from auth.users` works against Supabase's own schema is **unverified** and cannot be verified from the build tooling — treat A7 as incomplete until a throwaway signup has proven it. §9ae (`--danger-ink`, `npm test`) is implemented and locked on the principle rather than the hex: **a filled button's label colour follows its fill**, which is why the token is paired with `--danger` the way `--accent-ink` is with `--accent`. Do not reintroduce a literal `#fff` on anything sitting on `--danger` — that is precisely the regression this closes, and it fails in only one theme, so it will not be noticed casually. The two hex values are not locked and can be retuned as long as both are re-measured. `scripts/test-export.mjs` is locked as *the* place export behaviour is asserted: extend it when `lib/export.mjs` changes rather than testing the engine by eye, because every failure mode it covers produces a plausible file rather than an error. §9ae's measurement warning is the most portable thing in it — `getComputedStyle()` can return stale values for a node already measured under a previous theme, so measure on a fresh node and treat any impossible number as a broken measurement first. §9af (duplicate account sections fixed, sidebar Export link, stronger export-button borders) is implemented and locked on one point in particular: the sidebar entry is a **link**, and must not become a second download button — one export offered in one place is what §9ad bought by retiring the `/favorites/` one. Also locked is that `initAccountTools` *removes* a previous host rather than early-returning, because the second call can carry a different user. The rest is tuning. §9af's deferred scroll should stay a `setTimeout`, not `requestAnimationFrame`, for the reason given there. §9ag (email as inert text, three named icon actions in the sidebar footer) is implemented and locked, and **supersedes §9af's description of the Export link** as a text row beside Log out — the link survives, its presentation does not. Two points not to undo: the email is **not a link**, because a link styled as plain text is worse than none, and Export remains a **link** rather than a download control for §9ad's reason. The three actions share one `hidden` toggle deliberately; splitting it re-creates the drift it prevents. §9ag also records a duplicate `.sidebar-footer-row` declaration 1,360 lines from the original — worth knowing as a class of bug distinct from the specificity collisions in §9aa, since it needs no specificity difference, only a reader who stops at the first match. §9ah (password rules: 10-character minimum, no composition requirements) is implemented and locked on the **kind** of rule, not the number. Length-first with no required character classes is the decision; adding "must contain a symbol" later would undo it, and would make passwords worse rather than better for the reason §9ah gives. Also locked: the length attributes are **sign-up-only** — restoring `minlength` to the shared input locks out every account whose password predates the policy, which currently includes the admin account — and the strength meter is **advisory**, never a gate. The *number* 10 is not locked and lives in two places that must move together, `MIN_PASSWORD_LENGTH` and the Supabase dashboard setting, since neither can read the other. Leaked-password protection is **off because the project is on Supabase's Free tier**, not because it was judged unnecessary; it is the single highest-value thing to switch on if the tier ever changes. §9ai (show-password toggle) is implemented and locked on three points: it is available on **both** tabs, because the log-in form is where a typo costs most and where reset is unavailable until A1; the icon names the **action** rather than the state, matching the theme toggle; and it **re-masks on tab switch** but deliberately not on a failed submit. `ICON` is now exported from `lib/render.mjs` — the alternative was a second icon set inside `auth.js`, which is the thing to keep avoiding. §9ai also adds a third entry to the §9u/§9v/§9ad contrast series, and the first that was **fixed rather than logged**: `--ink-faint` on a control fails 1.4.11's 3:1, not merely the text threshold, so D5b's token was replaced with `--ink-soft` here before shipping rather than recorded as another finding. §9aj (sidebar gear for category management; prompt titles and sublines resized) is implemented and locked on the diagnosis rather than the pixels. The control must not go back to a **plus**: it navigates, it has never created anything, and a plus there is also the Collections button's icon, which does. Navigating instead of opening an editor is likewise deliberate and was never the fault — `/categories/` is the single place category management lives. The sizes (15px title, 13px subline) are tuning and may move; what is locked is that the subline stays off `--ink-faint`, which failed AA at 3.03:1 and is the reason it read as small. §9aj also records that `.sidebar-section-add` is dead CSS overridden by `.icon-btn` on document order — deliberately **not** repaired, because the rendered result is the accessible one and honouring the dead rule would reapply the failing token. §9ak (dead `.sidebar-section-add` removed, sidebar tooltip right-anchored, Categories label unlinked when signed in) is implemented and locked on three points. The surviving hover rule is scoped to **(0,3,0) deliberately** — it must not be "simplified" back to a bare class, because winning by document order is the exact fragility being repaired. The tooltip's right-edge anchoring is required by `.sidebar`'s `overflow-x: hidden`, which is itself deliberate and must not be relaxed to fix a future tooltip. And the Categories label's link is **session-dependent, not simply removed**: signed out it is the only route to a page with a real signed-out state, so restoring the "consistency" with Collections in both directions orphans that page. Collections' unconditional link is correct for its own reason — its `+` opens a modal rather than navigating. §9ak also records the most portable lesson of the §9ai–§9ak run: a broken cascade can be producing the *accessible* result, so read what a page computes rather than what the stylesheet appears to say, and fix dead CSS by deleting it unless you have checked what honouring it would do. §9al (both section labels become headings; `(i)` hints click-to-pin and carry the routes) is implemented and locked, and **supersedes §9ak's session-dependent Categories link** — that arrangement is the thing being fixed, so do not restore it. Locked: both labels are headings in **both** states, because a label that is a control for one visitor and text for another changes what kind of thing it is; and `fieldInfo()` keeps `esc()` on its text, never an HTML escape hatch. **§9al's cta links are superseded by §9am** and should not be reinstated — the route belongs on each section's gear, not inside a tooltip. §9am completes the symmetry: Collections' `+` becomes a gear too, both sections read heading / `(i)` / gear, creation moves onto `/collections/` where its form already existed, and `renderNewCollectionModal()` plus `newCollection.js` are deleted as unreachable. Locked there: **do not reintroduce a create modal for one section without the other** — one navigating and one opening a modal, behind identical-looking buttons, is the original defect. `fieldInfo.js` is kept on a **different justification than it was written for** and must not be deleted as leftover: measured, a touch tap fires neither `:hover` nor `:focus-visible`, so without it the (i) hints are silently inert on mobile. §9al also records why `--accent` cannot be used inside a `.field-hint`: the bubble's ground is `--ink`, where light-theme accent measures 1.9:1. §12 is now a pointer to [OPEN_ITEMS.md](OPEN_ITEMS.md), which is the single register for everything outstanding and is explicitly *not* locked — nothing in it should be treated as decided.*
