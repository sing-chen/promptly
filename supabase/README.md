# Supabase setup (account tier — owned-copies model)

The current model is **owned copies**, specified in [BUILD_BRIEF_v5.md](../BUILD_BRIEF_v5.md):
signing up copies the whole published catalog into the user's library, so every prompt a
signed-in user can see is genuinely theirs. This file is the schema/setup reference for
that; v5 is the design rationale. BUILD_BRIEF_v4.md's fork-on-edit and merged-catalog
sections are **historical** — that model was removed by `0004_owned_copies.sql`.

Already provisioned and live in production — see "Status" below for what's actually built. Steps below are what stands up a fresh project from scratch (useful for a new environment, or if you're verifying/reproducing the existing one):

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine at this project's size — see BUILD_BRIEF_v4.md §1).
2. In the Supabase dashboard's SQL Editor, run the migrations **in order**:
   [`0001_init_schema.sql`](migrations/0001_init_schema.sql) →
   [`0002_admin_curation_and_forks.sql`](migrations/0002_admin_curation_and_forks.sql) →
   [`0003_remove_example_output.sql`](migrations/0003_remove_example_output.sql) →
   [`0004_owned_copies.sql`](migrations/0004_owned_copies.sql) →
   [`0005_publish_webhook.sql`](migrations/0005_publish_webhook.sql).
   - 0001–0003 build up the *old* fork-based model, and 0004 then replaces it. That's
     wasteful on a fresh project but keeps one true migration history rather than a
     rewritten 0001 that no existing project matches. 0002 and 0003 are idempotent
     patches, so they're safe whichever revision of 0001 you happened to run.
   - After 0004 the schema is: `admins`, `prompts`, `catalog_versions`,
     `catalog_grants`, `collections`, `collection_prompts`, `favorites`, plus RLS
     policies, the `ensure_seeded()` function and the `prompts_write_catalog_version`
     trigger. `prompt_overrides` is dropped by 0004 — it belonged to the fork model.
   - Verify with [`verify_0004.sql`](verify_0004.sql) (11 checks) and
     [`verify_0005.sql`](verify_0005.sql) (8 checks); all should read PASS, except
     0005's hook-URL check until step 7 below.
3. From Project Settings → API, copy the **Project URL** and **anon public key**. These are safe to ship client-side — RLS is the actual security boundary, not key secrecy (§9).
4. Add them as env vars in Vercel's project settings (and locally, e.g. `.env.local`, gitignored) — consumed by `public/scripts/db.js`/`supabaseClient.js` client-side (via a generated `dist/scripts/config.js`, since browsers can't read `.env` files) and by `scripts/build.mjs`, which uses the same anon key server-side to fetch published default prompts at build time (see "Static build vs. live reads" below).
5. Enable email/password auth under Authentication → Providers (already on by default). OAuth providers are explicitly deferred (§7).
6. **Sign up for an account in the app once auth exists**, then in the SQL Editor run:
   ```sql
   insert into admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```
   This makes you the admin — the only role allowed to set `prompts.is_curated = true`.
7. **Auto-rebuild for anonymous visitors** (optional but recommended): in Vercel,
   Project Settings → Git → Deploy Hooks, create a hook for `main`, then run
   `select set_deploy_hook_url('<the URL>');` in the SQL editor. Without this,
   publishing or editing a catalog prompt won't reach anonymous visitors until
   someone redeploys by hand. Signed-in users are unaffected either way.

## There is no markdown catalog

`prompts/*.md` was the v3 static site's original test content and is retired by this plan — it is **not** carried forward as "the official default prompts," and as of `scripts/build.mjs`'s Supabase switch, it's no longer read by the production build at all (`lib/content.mjs`'s `loadPrompts()`/`PROMPTS_DIR` now exist only for `scripts/validate-prompts.mjs`, a standalone lint tool, unrelated to what actually ships). Supabase is the single source of truth for default ("site-level") prompts, for every tier, anonymous visitors included. Concretely:

- You author and edit catalog prompts through the app: the "+ New Prompt" modal's
  "Publish to everyone" checkbox creates one as a draft (or promotes an existing
  personal prompt into the catalog on edit), and the `/admin/` page publishes it.
  Not by hand-editing files or committing to git.
- Anonymous visitors never talk to Supabase directly (see below) — they still get a fast static site — but the *content* those static pages are built from comes from Supabase at build time, not from files in this repo.
- The 5 prompts that used to live in `prompts/*.md` didn't carry over automatically —
  [`seed_default_prompts.sql`](seed_default_prompts.sql) recreated them as published
  catalog prompts; its header comment documents what's accepted as lost in that
  migration (the markdown-only `handoff` field). **Review before reusing**: it predates
  the owned-copies model, and everything currently in the database is test content to be
  cleared (see [`reset_prompts.sql`](reset_prompts.sql)) before canonical prompts are
  seeded for release.

## Owned copies (how the catalog reaches users)

`prompts.is_curated` and `published` gate admin authoring and visibility. What changed
in [`0004_owned_copies.sql`](migrations/0004_owned_copies.sql) is what happens *after*
publishing: users receive **copies**, not references (BUILD_BRIEF_v5.md).

- A row with `is_curated = true, published = false` is a catalog prompt being drafted -
  visible only to its admin owner, so you can try it in the real UI before anyone else
  sees it. Editing a draft notifies nobody and writes no version.
- Only a user listed in `admins` can insert or update a row with `is_curated = true` -
  enforced by `prompts_insert`/`prompts_update`, not just app code. That same policy is
  what lets an admin **promote** a personal prompt into the catalog later, and demote it
  again; no extra policy was needed.
- Flipping `published = true` makes the row eligible for distribution. `ensure_seeded()`
  then hands every user a copy on their next visit.
- **Every prompt a signed-in user can see is their own row.** They can edit, archive
  (`prompts.is_archived`), delete or duplicate any of it. There is no borrowing, so no
  fork-on-edit, no `prompt_overrides`, and no "view original".
- **An admin's library *is* the catalog.** `ensure_seeded()` no-ops for admins, so they
  hold the canonical rows rather than copies. The consequence worth knowing: editing a
  *published* catalog prompt is a broadcast to everyone holding a copy. Drafts are free,
  and `duplicatePrompt()` is the escape hatch for a personal variant.
- **Deleting** only ever affects the caller's own row. The catalog original and every
  other user's copy are untouched - they were never the same row.
- **Unpublishing** now has a clean meaning it didn't before: it stops *future* grants.
  Anyone already holding a copy keeps it, and won't be re-granted, because their
  `catalog_grants` row persists.

### The three tables

| Table | Purpose |
| --- | --- |
| `prompts` | Both the catalog (admin-owned, `is_curated`) and every user's own rows. |
| `catalog_versions` | History of catalog prompts - one row per content change while published. Scales with the catalog, not with users. `notifiable` marks significant changes (title/purpose/body) apart from minor ones (notes/categories). |
| `catalog_grants` | Private bookkeeping: who has what, which row it is, which version they got. Never rendered. |

`catalog_grants.user_prompt_id` is `ON DELETE SET NULL` deliberately: deleting your copy
leaves the grant behind, so seeding never resurrects it, while the pointer clears.

A version row is written for **every** content change, not just notifiable ones. That
looks redundant but isn't - a grant must point at an exact snapshot of what was handed
over, or a user seeded between two edits would later have that difference misread as an
edit *they* made, raising a false conflict. See BUILD_BRIEF_v5.md §6.2.

### Seeding is pull-based

`ensure_seeded()` (SECURITY DEFINER, called on authenticated page load) copies every
published catalog prompt the caller has no grant for. One function covers both signup
and later publishes, so **there is no fan-out job** and publishing stays a single row
update. It is idempotent and self-healing: a partial failure is repaired next load.

It handles two details that bite otherwise - slug collisions (`slug` is unique per user,
so a later publish can collide with something the user already wrote) and `depends_on`
remapping (a copied prompt must point at *the user's* copy of its dependency).


## Static build vs. live reads (why both `anon` GRANT and a rebuild trigger exist)

Anonymous visitors stay on the existing static site rather than reading Supabase live on every page view — this keeps their pages fast, working without JS, and off the free tier's read quota. Two pieces make that work together with a single Supabase source of truth:

1. **`scripts/build.mjs` queries Supabase for published defaults** (`is_curated = true, published = true`) at build time (`lib/supabaseBuild.mjs`'s `fetchPublishedPrompts()`, a plain `fetch()` against PostgREST — no `@supabase/supabase-js` dependency needed for one GET request), using the `anon` key, instead of reading `prompts/*.md`. This is the only place `anon`'s `GRANT SELECT` actually gets used for anonymous traffic — real anonymous visitors hit pre-built HTML, not Supabase. If `SUPABASE_URL`/`SUPABASE_ANON_KEY` aren't set, the build proceeds with zero default prompts (a warning is logged) rather than failing.
2. **A trigger on `prompts`** POSTs to a **Vercel Deploy Hook URL** to trigger a fresh build+deploy automatically ([`0005_publish_webhook.sql`](migrations/0005_publish_webhook.sql)). It fires on every change that would alter what the build produces - a catalog prompt published, unpublished, edited while published, or deleted - not just on publish, since otherwise a typo fix would never reach anonymous visitors. Statement-level, so a bulk change queues one build rather than one per row. Requires the Deploy Hook URL to be set (`select set_deploy_hook_url('…')`); until then it's inert. Historical note: this was originally specced as a Supabase Database Webhook, but that UI can't express "only when this transition happens", so it's a trigger instead. Not yet configured — needs both a Vercel project (Deploy Hooks live under Project Settings → Git) and the webhook set up in the Supabase dashboard (Database → Webhooks) once the project exists. Until this is wired up, publishing requires a manual redeploy to reach anonymous visitors; signed-in users always see your own drafts/published rows live regardless, since that's a direct RLS-scoped read, not a build artifact.

## Keeping the schema in sync

`prompts_categories_valid` hardcodes the `CATEGORIES` vocabulary from [`lib/schema.mjs`](../lib/schema.mjs). Categories are **not** admin-manageable through the app UI — deliberately kept as a plain hardcoded array rather than a database table, since category pages are statically generated per slug at build time (`scripts/build.mjs`), not queried live. To add, rename, or remove one:

1. Edit the `CATEGORIES` array (and `CATEGORY_DESCRIPTIONS`, if you want a description on the category page) in [`lib/schema.mjs`](../lib/schema.mjs).
2. Add a migration that updates `prompts_categories_valid`'s `check` constraint to match — the two lists must stay identical since v4 mirrors the frontmatter shape field-for-field (§4). A renamed/removed category also needs a data migration for any existing rows still using the old value (the `check` constraint will otherwise reject their next update).
3. Rebuild (`npm run build`) — the New Prompt modal's category dropdown, category pages, and filter pills all regenerate from step 1's array automatically.

A real admin screen for this (add/rename/remove without a code change) is on the backlog — BUILD_BRIEF_v4.md §7 has the scoping note (it's a real architecture change: categories would need to move into a DB table and `scripts/build.mjs`'s static per-category page generation would need to read from it, not just a form).

## Deferred: `example_output`

The v3-era "attach an example output image, shown on the prompt detail page" feature (`prompts.example_output`, plus the matching frontmatter field and detail-page section) has been **removed from the shipped product**, not carried forward into the account tier. It may come back as a real feature later — if so, redesign it rather than resurrecting the column, since the old shape (a single image URL) was a v3-era placeholder, not a considered account-tier design. Tracked in BUILD_BRIEF_v4.md §7 and noted in BUILD_BRIEF.md. [`migrations/0003_remove_example_output.sql`](migrations/0003_remove_example_output.sql) drops the column from the live project (and updates `mark_edited_from_source`, which used to check it).

## Status

**Built - current model (BUILD_BRIEF_v5.md):**
- Schema + RLS through [`0004_owned_copies.sql`](migrations/0004_owned_copies.sql):
  `catalog_versions`, `catalog_grants`, `ensure_seeded()`, the
  `prompts_write_catalog_version` trigger. `prompt_overrides`, `source_prompt_id`,
  `edited_from_source` and `mark_edited_from_source` are dropped.
- [`0005_publish_webhook.sql`](migrations/0005_publish_webhook.sql): `deploy_settings`,
  `request_static_rebuild()` and statement-level triggers that redeploy the static
  site whenever a published catalog prompt is added, edited, unpublished or deleted.
- `lib/env.mjs` -> `scripts/build.mjs` writes `dist/scripts/config.js` from
  `SUPABASE_URL`/`SUPABASE_ANON_KEY` every build.
- `public/scripts/supabaseClient.js` (esm.sh CDN, not vendored) and
  `public/scripts/db.js` - prompts CRUD, admin curate/publish, promote/demote,
  archive/unarchive, duplicate, seeding, favorites, collections.
- `public/scripts/auth.js` - email/password sign-in/up/out. **Sign out lives in the
  sidebar footer**, under the signed-in email, so it's reachable from any page.
- `/account/` (`public/scripts/accountStats.js`) - library metrics: prompts, written
  by you vs. received from the catalog, how many catalog prompts you've customised,
  collections, uncollected, recently added, favourites, a category-distribution bar
  chart, and published/draft counts for an admin. All derived from rows the caller
  already owns.
- The New/Edit Prompt modal. For an admin it also carries the publish-to-everyone
  choice (promote/demote) and, for an already-published catalog prompt, the notify
  override.
- `/admin/` - lists the admin's curated prompts with publish/unpublish per row.
- `/archived/` - the caller's own archived prompts, with Unarchive.
- Home/Category/Search render the caller's library via `personalizeData.js` +
  `personalize.js`; every row carries Edit, Duplicate, Archive and Delete, plus bulk
  multi-select Archive/Delete.
- `/collections/` and the live sidebar Collections list.
- Favourites, two-tier by design (`public/scripts/favoritesStore.js`): anonymous
  visitors store slugs in localStorage, signed-in users get the `favorites` table keyed
  by prompt id. The key spaces can't be shared - a user's copy has a different id, and
  possibly a different slug, from the catalog row it came from. Anonymous favourites
  merge into the table once on first sign-in, matched by slug; the local copy is kept
  so signing out doesn't strand you. `/favorites/` is personalized, so a favourited
  personal prompt appears there.
- `scripts/build.mjs` reads published catalog prompts from Supabase
  (`lib/supabaseBuild.mjs`) rather than `prompts/*.md`.
- Verified against the live project: `0004` applied with all 11 checks in
  [`verify_0004.sql`](verify_0004.sql) passing; a non-admin test account was seeded 7
  copies automatically, and editing one updated it in place without creating a fork
  (`catalog_grants` stayed at 7). `0005` verified separately - editing a published
  catalog prompt triggered a Vercel deployment, and a newly published prompt reached
  anonymous visitors after the resulting rebuild.

**Built, but needs configuration to take effect:**
- **Auto-rebuild on catalog change** (`0005_publish_webhook.sql`) is inert until a
  Deploy Hook URL is set - see setup step 7. Confirmed working once configured: an
  edit to a published catalog prompt produced a Vercel deployment. Without it, a
  catalog change won't reach *anonymous* visitors until someone redeploys by hand.
  Signed-in users get it on their next visit via `ensure_seeded()` either way.
- Vercel env vars are **Production-only** - Preview/Development lack `SUPABASE_URL`/
  `SUPABASE_ANON_KEY`.

**Not built:**
- **Notify-and-merge screen** (BUILD_BRIEF_v5.md §6) - versions and the `notifiable`
  flag are recorded now, but nothing consumes them yet. Deliberate: the feature has no
  users until a catalog prompt is edited *after* someone has signed up.
- **Transactional email / SMTP** - unconfigured, and blocks public launch. Sign-up says
  "check your email", but that mail comes from Supabase's built-in test-only sender.
  Password reset has the same dependency. See BUILD_BRIEF_v5.md §9.
- `/sequences/` and `/sequence/[slug]/` aren't personalization-aware.
- Multiple admins: a second admin would see only their own catalog rows and couldn't
  edit the first admin's. Fine at one admin; needs a decision before a second.


## Next steps

1. **Transactional email / SMTP** — blocks public launch (BUILD_BRIEF_v5.md §9).
2. **Notify-and-merge screen** (v5 §6) — the schema for it is already in place; build it
   before editing any published catalog prompt that users already hold.
3. Clear test content and seed canonical prompts ([`reset_prompts.sql`](reset_prompts.sql)).
4. **Categories redesign** — user-managed categories with editable colours. A real
   architecture change: the vocabulary is a hardcoded array mirrored by a CHECK
   constraint, and `/browse/<slug>/` pages are statically generated from it. Needs a
   global-vs-per-user decision first, the same fork v5 resolved for prompts.
5. Variable-fill, and the remaining open items above.

Auto-rebuild on catalog change is **done** (`0005_publish_webhook.sql`) — it only
needs the Deploy Hook URL wired up, setup step 7.
