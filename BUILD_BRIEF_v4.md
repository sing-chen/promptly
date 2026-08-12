# Promptly — Build Brief v4: Two-Tier Supabase Architecture

**Status: partially implemented — this document is now historical for §4/§5/§11, not current.** It was originally a plan produced from a design conversation; real implementation has since diverged from and extended what's written below (an admin curation/publish/fork model, no markdown catalog for default prompts, and a full sidebar nav rebuild replacing v3's top nav — none of which this document originally specified). **[`supabase/README.md`](supabase/README.md) is the up-to-date source of truth** for the actual schema and what's built vs. pending; read this document for the original *why* (§1, §2, §7, §10 still hold), not for current implementation detail in §4/§5/§11. v3's static content pipeline, taxonomy, and design system remain unchanged except for the nav (see below).

This document does not replace v3 — it **extends** it. v3's static site (content model, sitemap, design system, taxonomy, sequencing, page templates) stays exactly as-is and becomes the **Anonymous tier** described below, unchanged in code or product decisions. v4 adds a second, optional **Account tier** on top, backed by Supabase, for visitors who want to create, edit, delete, and permanently keep their own prompts. Read v3 first — this document assumes it and doesn't re-explain what's unchanged.

---

## 1. Why a second tier, and why Supabase

The original ask was cross-device, cross-browser prompt management with no backend and no accounts. That turns out to be unsolvable as stated: browser storage (`localStorage`/IndexedDB) is sandboxed per-browser-per-device by design — there is no web-platform mechanism for one browser to read another's data, and no way to get real cross-device sync without *some* server-side component. The only honest no-backend answer is manual export/import between browsers, which is real but not automatic.

**Decision: accept a real backend, scoped to only the visitors who want persistence.** Supabase (managed Postgres + Auth + PostgREST + RLS) gives every signed-in account true cross-browser, cross-device sync, without writing or hosting a custom API server — Supabase's client SDK talks to the database directly from the browser, with Row-Level Security as the entire authorization layer. Anonymous visitors pay none of this cost: the existing static site is untouched.

**Self-hosting Supabase was considered and rejected for now** — it would trade a managed, near-zero-maintenance service for real sysadmin responsibility (VPS, backups, upgrades, uptime) to solve a cost/scale problem the free tier doesn't actually have at this project's size (free-tier storage math comfortably covers thousands of user accounts at typical prompt-library sizes). Revisit only if usage genuinely outgrows Supabase Cloud's free or paid tiers.

---

## 2. Design principle: stateless vs. stateful, not read-only vs. everything

The anonymous tier is **not** "the free demo." Most of Promptly's functionality has no persistence requirement at all and stays fully available without an account. Only actions that write durable, user-owned state require signing in:

| Feature | Persists data? | Anonymous tier | Account tier |
|---|---|---|---|
| Browse / Category / Search (Fuse.js) | No | ✅ unchanged from v3 | ✅ (own prompts + curated catalog) |
| Prompt detail pages | No | ✅ unchanged | ✅ |
| Copy to clipboard | No | ✅ unchanged | ✅ |
| **Variable-fill workflow (new)** | No — pure client-side, in-memory per page view | ✅ **available**, no account needed | ✅ |
| Sequences (curated chains) | No (read-only today) | ✅ unchanged | ✅ (curated only — see §7) |
| Favorites | Yes | ⚠️ `localStorage`, ephemeral, per-browser (unchanged from v3) | ✅ synced, cross-device |
| Create / edit / delete prompts | Yes | ❌ (not offered — no UI surface for it) | ✅ |
| Collections management | Yes | ❌ (curated collections stay read-only) | ✅ (own collections, separate from curated) |

This table is the north star for every UI decision below: **never gate a stateless feature behind sign-in.** The variable-fill workflow in particular should ship to the existing static prompt-detail template, not be held back as an account perk — it needs no new data source, only the raw prompt body already present in the DOM via the prompt box's data attribute.

---

## 3. Anonymous tier (= v3, unchanged)

No product or code changes to the existing static site. Explicitly retained, verbatim from v3:

- Home (all-prompts table + live filters), Category pages, Collection pages, Search, Prompt detail, Sequences index + sequence pages, Favorites (`localStorage`), About.
- The full build pipeline (`scripts/build.mjs`, `lib/content.mjs`, `lib/render.mjs`, `lib/schema.mjs`), content model (`prompts/*.md` + YAML frontmatter), and design system ("Stone & Signal") — all untouched.
- `robots.txt` disallow-all and the private-repo/Read-collaborator access model for teammates (v3 §0) stay as the model for anyone who never signs up.

**Added on top, still anonymous, still no account:**
- Variable-fill workflow on the prompt detail page (§6).
- Lightweight, contextual sign-up prompts placed only where persistence is the actual missing piece (§8) — not a global gate or banner.

---

## 4. Account tier: data model

Supabase Postgres, mirroring the existing markdown frontmatter shape from `lib/content.mjs` field-for-field so the two tiers share a conceptual schema:

```sql
prompts
  id uuid pk, user_id uuid fk -> auth.users, slug text,
  title text, categories text[], purpose text, body text,
  notes text, sequence text, sequence_step int, depends_on uuid,
  example_output text, added timestamptz, updated timestamptz
  unique (user_id, slug)

collections
  id uuid pk, user_id uuid fk, slug text, title text, description text
  unique (user_id, slug)

collection_prompts
  collection_id uuid fk, prompt_id uuid fk
  primary key (collection_id, prompt_id)

favorites
  user_id uuid fk, prompt_id uuid fk
  primary key (user_id, prompt_id)
```

- `categories` stays constrained to the existing `CATEGORIES` vocabulary from `lib/schema.mjs` — enforced both as a Postgres `CHECK` and client-side for instant form feedback.
- **Every table gets RLS**: `user_id = auth.uid()` on select/insert/update/delete, no exceptions. This is the entire security boundary for the account tier — there is no other authorization layer, since there's no custom API server in front of Postgres.

---

## 5. Account tier: sign-up, seeding, and continuity from anonymous use

- **Sign-up** via Supabase Auth (email/password to start; OAuth providers optional later).
- **Starter catalog seeding**: on account creation, bulk-insert the current curated prompt set (same content `scripts/build.mjs` already parses from `prompts/*.md`) into the new user's `prompts` rows — fully theirs, editable and deletable like anything else they create. The curated markdown catalog becomes a seed template, not a separate read-only reference.
- **Favorites migration**: on sign-up, read whatever's in the visitor's `localStorage` favorites (same key/shape as today's `favorites.js`) and bulk-insert into their new `favorites` table, so pre-account activity carries forward instead of resetting to zero.
- No account pages are pre-built at deploy time (impossible — content is per-user and created after deploy). See §9 for how this is served.

---

## 6. Account tier: client architecture

**Key existing asset this plan leans on**: `lib/render.mjs` is already written as an isomorphic renderer — plain browser-safe JS with no Node built-ins, imported both at build time (Node) and at runtime in the browser (`public/scripts/quickview.js` and `search.js` already do this today to render server-identical markup from live data). The account tier reuses this exact pattern instead of inventing a second rendering system:

- **`public/scripts/db.js` (new)** — thin wrapper around `supabase-js`, shaped like `lib/content.mjs`'s functions (`loadPrompts`, `buildData`) but backed by live queries instead of file reads. Keeps the data shape identical to what `render.mjs` already expects.
- **`/library/` (new route, client-rendered shell)** — once a session is confirmed, fetches the signed-in user's prompts and re-renders Browse/Search/Detail using the same `renderPromptCard`, `renderCatBadges`, `renderCardGrid`, etc. functions the static site already uses.
- **Create / edit / delete UI** — form/modal in the shared layout, writing directly via `supabase-js` `insert`/`update`/`delete`; RLS enforces ownership, so there's no server-side validation layer to build beyond the DB constraints in §4.
- **Variable-fill (§6.1)** and **favorites/collections CRUD** reuse this same client-rendered library view.

### 6.1 Variable-fill workflow (ships to both tiers)

- Extract `{{variable}}` tokens from the prompt body (regex over the text already present via the prompt box's `data-raw-text` attribute on the static template, or the `body` field from `db.js` in the library view).
- Render one input per variable, a live-formatted preview, and a copy action — directly analogous to the pattern already proven client-side in this codebase's quick-view modal.
- No new data source, no account requirement, no persistence — built once, used by both the static prompt-detail page and the `/library/` detail view.

---

## 7. Explicitly out of scope for v1 (open items)

Mirroring v3's convention of flagging what's deliberately undecided rather than silently assumed:

- **Sequences for user-owned prompts** — v3's sequence chaining (`lib/sequences.mjs`) stays applied to the curated catalog only. Whether signed-in users can build their *own* sequences (step ordering, `depends_on` validity across their own prompt set, handoff notes) is a real feature with real complexity, not a given extension of the schema — deferred, not decided.
- **Password reset / email confirmation UX** — Supabase handles the mechanics; the actual pages/copy for "check your email," "reset password," "confirm your address" states still need designing.
- **Terms of Service / Privacy Policy** — becomes necessary, not optional, once real emails and personal libraries are being stored. Not yet drafted.
- **Rate limiting / sign-up abuse protection** — Supabase has some baseline protection; whether it's sufficient at whatever scale this reaches is unassessed.
- **OAuth providers** — decided: Google sign-in is a confirmed **nice-to-have**, not required for v1. Email/password (already built and working) is the v1 baseline; add Google once core account-tier features (admin authoring, `/library/`, forks) are further along. Needs a Google Cloud Console OAuth client + consent screen + redirect URI, then wiring the provider in Supabase's Auth settings — real setup overhead, which is why it's deferred rather than bundled into the initial auth work.

---

## 8. UX guidance for the upgrade path

- **Contextual, not global.** Sign-up prompts appear only at genuine friction points — e.g., where a `localStorage` favorite would vanish on browser change, or where an Edit/Delete affordance would otherwise exist on a curated card. No banner, no paywall interstitial, no gating of anything in the stateless column of §2's table.
- **Continuity on conversion.** The favorites-migration and starter-catalog-seeding steps (§5) exist specifically so signing up feels additive ("now this is permanent and yours") rather than a reset to zero.
- **Nav integration.** Sign-in/sign-out state renders through the existing shared `renderNav` function (same one that already renders the favorites-count icon today), so auth state is consistent across every page for free rather than re-implemented per route.

---

## 9. Build / deploy implications

- **Anonymous tier deploys exactly as today** — `npm run build` → `dist/` → Vercel, unchanged. This plan adds routes and client code; it does not modify the existing build pipeline's output for the static catalog.
- **`vercel.json` rewrite (new)** — unmatched `/library/*` (and any per-user prompt slug that doesn't exist in the static build) routes to the client-rendered shell described in §6, which resolves content live via Supabase rather than from a pre-built file.
- **Environment variables (new)** — Supabase project URL + anon key, added to Vercel's project settings; no secrets belong in client-shipped code beyond the anon key, which is safe to expose by Supabase's design (RLS is the real gate).
- **No custom API server anywhere in this plan** — Supabase's PostgREST + RLS fully replaces the custom local-server idea explored earlier in this design process; that approach is superseded and should not be built alongside this one.

---

## 10. Relationship to earlier explored approaches (for context, not action)

Two other architectures were designed and explicitly **rejected** in favor of this one — noted here so they aren't rediscovered or half-built later:

1. **Local Node server + write-to-markdown** — solved only *your own* cross-browser authoring convenience on one machine; not viable for arbitrary site visitors, since it requires running local software beyond the browser.
2. **Client-only IndexedDB per visitor** — satisfied "no backend, no accounts" literally, but capped at same-browser persistence with no real cross-device story and a fragile "your only backup is a manual export" safety net. Superseded entirely by the Supabase account tier; `localStorage` survives in this plan only as the anonymous-tier favorites mechanism, unchanged from v3.

---

## 11. Status

**Superseded by [`supabase/README.md`](supabase/README.md)** — read that for current schema and next steps. Summary as of the last update here:

**Built and deployed to production:**
- Supabase project provisioned; schema + RLS live (`supabase/migrations/`) — extended well beyond §4's original table shapes with an admin curation/publish/fork model (`admins`, `prompts.is_curated`/`published`/`source_prompt_id`/`edited_from_source`/`is_archived`, `prompt_overrides`) — §4/§5 above no longer describe the actual schema or seeding model.
- Auth UI (email/password sign-in/up, `/account/`) wired into a **left sidebar nav that replaced v3's top nav site-wide** — a bigger change than §8's "nav integration" implied, decided separately (a "New Prompt" reference screenshot prompted reconsidering the whole nav, not just adding an account link).
- `public/scripts/db.js` — the full account-tier data layer (§6), including admin curate/publish, fork-on-edit, archive, favorites, collections CRUD.
- Build-time cache-busting for `/scripts` and `/styles` references (not originally scoped in this document at all — caught during nav-rebuild testing).

**Not yet built:**
- The "New Prompt" button's actual behavior (create-prompt modal) — it's rendered in the sidebar (hidden until signed in) but has no click handler yet.
- `scripts/build.mjs` switched to query Supabase for default prompts, and the Supabase→Vercel publish webhook (§9) — the static site still builds from `prompts/*.md`, which is planned to be retired but hasn't been yet.
- `/library/` views + CRUD UI, variable-fill (§6.1), collections CRUD UI.
- Everything in §7's open items list (still accurate/current).
