# Supabase setup (account tier, BUILD_BRIEF_v4.md + default-prompt catalog)

Already provisioned and live in production — see "Status" below for what's actually built. Steps below are what stands up a fresh project from scratch (useful for a new environment, or if you're verifying/reproducing the existing one):

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine at this project's size — see BUILD_BRIEF_v4.md §1).
2. In the Supabase dashboard's SQL Editor, run [`migrations/0001_init_schema.sql`](migrations/0001_init_schema.sql). It creates `admins`, `prompts`, `prompt_overrides`, `collections`, `collection_prompts`, `favorites`, and RLS policies.
   - **Already ran an earlier version of 0001 against this project?** `0001_init_schema.sql` has been rewritten several times since (admin curation, forks, `prompt_overrides` all landed after the first run). Don't re-run it — instead run, in order, [`migrations/0002_admin_curation_and_forks.sql`](migrations/0002_admin_curation_and_forks.sql) and [`migrations/0003_remove_example_output.sql`](migrations/0003_remove_example_output.sql), idempotent patches that bring any earlier revision up to the current schema, whichever version you happened to run. (The live production project needs both — it predates each.)
3. From Project Settings → API, copy the **Project URL** and **anon public key**. These are safe to ship client-side — RLS is the actual security boundary, not key secrecy (§9).
4. Add them as env vars in Vercel's project settings (and locally, e.g. `.env.local`, gitignored) — consumed by `public/scripts/db.js`/`supabaseClient.js` client-side (via a generated `dist/scripts/config.js`, since browsers can't read `.env` files) and by `scripts/build.mjs`, which uses the same anon key server-side to fetch published default prompts at build time (see "Static build vs. live reads" below).
5. Enable email/password auth under Authentication → Providers (already on by default). OAuth providers are explicitly deferred (§7).
6. **Sign up for an account in the app once auth exists**, then in the SQL Editor run:
   ```sql
   insert into admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```
   This makes you the admin — the only role allowed to set `prompts.is_curated = true`.

## There is no markdown catalog

`prompts/*.md` was the v3 static site's original test content and is retired by this plan — it is **not** carried forward as "the official default prompts," and as of `scripts/build.mjs`'s Supabase switch, it's no longer read by the production build at all (`lib/content.mjs`'s `loadPrompts()`/`PROMPTS_DIR` now exist only for `scripts/validate-prompts.mjs`, a standalone lint tool, unrelated to what actually ships). Supabase is the single source of truth for default ("site-level") prompts, for every tier, anonymous visitors included. Concretely:

- You author and edit default prompts through the app's admin "create prompt" feature (the "+ New Prompt" modal's admin checkbox + the `/admin/` publish page), not by hand-editing files or committing to git.
- Anonymous visitors never talk to Supabase directly (see below) — they still get a fast static site — but the *content* those static pages are built from comes from Supabase at build time, not from files in this repo.
- **The 5 prompts that used to live in `prompts/*.md` are not automatically in Supabase** — nothing carries them over. [`seed_default_prompts.sql`](seed_default_prompts.sql) recreates them as published defaults if you want that continuity; see its header comment for how to run it and what's accepted as lost (the markdown-only `handoff` field).

## Admin curation, publishing, and per-user forks

`prompts.is_curated` and `prompts.published` gate admin authoring and visibility; `source_prompt_id`, `prompt_overrides`, and `edited_from_source` support the fork-on-edit model:

- A row with `is_curated = true, published = false` is a default prompt being tested — visible only to its admin owner (same as any other private prompt), so you can try it out in the real, production UI before anyone else sees it.
- Only a user listed in `admins` can insert or update a row with `is_curated = true` — enforced by `prompts_insert`/`prompts_update`, not just app code.
- Flipping `published = true` makes the row visible to **everyone** — `prompts_select`'s RLS allows `user_id = auth.uid() OR (is_curated AND published)`, and the `anon` role has a table-level `GRANT SELECT` too, so this covers signed-in users and anonymous visitors alike. It stays editable/deletable only by the owning admin, always.
- A signed-in user can favorite a published default or add it to their own collection directly — no copy required for that (`favorites_owner_all` / `collection_prompts_owner_all` allow it).
- **Editing** a default is what forks it: the app inserts a new row owned by that user (`is_curated = false`, `source_prompt_id = <the default's id>`, content copied from the default at fork time), then upserts a `prompt_overrides` row with `fork_prompt_id` set to the new fork and `is_archived = true` — the default is now shown as archived/superseded in that user's own view, while their fork carries a live pointer (`source_prompt_id`) back to the current admin version for "view original" (the admin may keep iterating it after the fork — this is a live reference, not a snapshot).
- The `mark_edited_from_source` trigger auto-flips a fork's `edited_from_source = true` the moment its content actually diverges from what it started as — a simple "edited from original" badge, computed by the DB rather than tracked by hand in app code.
- A user can also archive a default **without** editing it — just a `prompt_overrides` row with `is_archived = true` and `fork_prompt_id = null`. No row in `prompt_overrides` at all means "shown normally, unarchived, unforked."
- **Deleting** a fork removes it from that user's profile only — the admin's default and every other user's fork or override are untouched.
- If the admin unpublishes a default (`published = false`), it stops being visible to non-owners immediately, including to anyone who already forked it — an existing fork keeps working (it's the user's own independent row), but its "view original" link will fail to resolve until republished, since `prompts_select` no longer permits reading it.

## Static build vs. live reads (why both `anon` GRANT and a rebuild trigger exist)

Anonymous visitors stay on the existing static site rather than reading Supabase live on every page view — this keeps their pages fast, working without JS, and off the free tier's read quota. Two pieces make that work together with a single Supabase source of truth:

1. **`scripts/build.mjs` queries Supabase for published defaults** (`is_curated = true, published = true`) at build time (`lib/supabaseBuild.mjs`'s `fetchPublishedPrompts()`, a plain `fetch()` against PostgREST — no `@supabase/supabase-js` dependency needed for one GET request), using the `anon` key, instead of reading `prompts/*.md`. This is the only place `anon`'s `GRANT SELECT` actually gets used for anonymous traffic — real anonymous visitors hit pre-built HTML, not Supabase. If `SUPABASE_URL`/`SUPABASE_ANON_KEY` aren't set, the build proceeds with zero default prompts (a warning is logged) rather than failing.
2. **A Supabase Database Webhook on `prompts`**, firing on `UPDATE` where `published` turns `true`, POSTs to a **Vercel Deploy Hook URL** to trigger a fresh build+deploy automatically. Not yet configured — needs both a Vercel project (Deploy Hooks live under Project Settings → Git) and the webhook set up in the Supabase dashboard (Database → Webhooks) once the project exists. Until this is wired up, publishing requires a manual redeploy to reach anonymous visitors; signed-in users always see your own drafts/published rows live regardless, since that's a direct RLS-scoped read, not a build artifact.

## Keeping the schema in sync

`prompts_categories_valid` hardcodes the `CATEGORIES` vocabulary from [`lib/schema.mjs`](../lib/schema.mjs). Categories are **not** admin-manageable through the app UI — deliberately kept as a plain hardcoded array rather than a database table, since category pages are statically generated per slug at build time (`scripts/build.mjs`), not queried live. To add, rename, or remove one:

1. Edit the `CATEGORIES` array (and `CATEGORY_DESCRIPTIONS`, if you want a description on the category page) in [`lib/schema.mjs`](../lib/schema.mjs).
2. Add a migration that updates `prompts_categories_valid`'s `check` constraint to match — the two lists must stay identical since v4 mirrors the frontmatter shape field-for-field (§4). A renamed/removed category also needs a data migration for any existing rows still using the old value (the `check` constraint will otherwise reject their next update).
3. Rebuild (`npm run build`) — the New Prompt modal's category dropdown, category pages, and filter pills all regenerate from step 1's array automatically.

A real admin screen for this (add/rename/remove without a code change) is on the backlog — BUILD_BRIEF_v4.md §7 has the scoping note (it's a real architecture change: categories would need to move into a DB table and `scripts/build.mjs`'s static per-category page generation would need to read from it, not just a form).

## Deferred: `example_output`

The v3-era "attach an example output image, shown on the prompt detail page" feature (`prompts.example_output`, plus the matching frontmatter field and detail-page section) has been **removed from the shipped product**, not carried forward into the account tier. It may come back as a real feature later — if so, redesign it rather than resurrecting the column, since the old shape (a single image URL) was a v3-era placeholder, not a considered account-tier design. Tracked in BUILD_BRIEF_v4.md §7 and noted in BUILD_BRIEF.md. [`migrations/0003_remove_example_output.sql`](migrations/0003_remove_example_output.sql) drops the column from the live project (and updates `mark_edited_from_source`, which used to check it).

## Status (last updated after the scripts/build.mjs Supabase-read switch)

**Built:**
- Schema + RLS (`0001_init_schema.sql`, patched onto the live project via `0002_admin_curation_and_forks.sql` and `0003_remove_example_output.sql`) — admin curation/publish/fork model described above, live in Supabase.
- `lib/env.mjs` (build-time `.env.local` loader, no `dotenv` dependency) → `scripts/build.mjs` writes `dist/scripts/config.js` from `SUPABASE_URL`/`SUPABASE_ANON_KEY` every build.
- `public/scripts/supabaseClient.js` (client, loaded from the esm.sh CDN — not vendored, no bundler in this project) and `public/scripts/db.js` (full data layer: prompts CRUD, admin curate/publish, fork-on-edit, archive, favorites, collections).
- `public/scripts/auth.js` + `/account/` page — email/password sign-in/up/out, wired into the sidebar nav's account link, "New Prompt" button, and Admin link visibility.
- The "New Prompt" modal (`renderNewPromptModal` in `lib/render.mjs`, behavior in `public/scripts/newPrompt.js`) — collects `title`, `purpose` (with a hover/focus "(i)" tooltip explaining what it is), `categories` (a checkbox-backed dropdown, not a flat grid), `body`, and `notes`. No `slug` field — it's generated from the title at submit time (`createWithUniqueSlug()` in `newPrompt.js`), retrying with an incrementing numeric suffix on a Postgres unique-violation (23505) rather than exposing the slug for manual editing; `slug` is only unique per-user, so the only way to collide is the same user creating two same-titled prompts. `example_output` is gone (see above); `sequence`/`sequence_step`/`depends_on` are intentionally left out per BUILD_BRIEF_v4.md §7. The admin-only "make this a default prompt" checkbox routes the submit through `createCuratedPrompt()` instead of `createPrompt()`.
- `/admin/` page (`renderAdminPage` in `lib/render.mjs`, behavior in `public/scripts/admin.js`) — lists the signed-in admin's own curated prompts (drafts and published alike) with a publish/unpublish button per row, calling `db.js`'s existing `publishPrompt()`/`unpublishPrompt()`. Linked from the sidebar's `#nav-admin-link`, hidden unless `isAdmin()` resolves true.
- The admin-only "make this a default prompt" checkbox now defaults to **checked** when the signed-in user is an admin (still a plain checkbox — uncheckable for a one-off personal prompt); field-validation messages (`#np-message[role="alert"]`, e.g. "Choose at least one category.") render in `--danger` red instead of the default ink color.
- Verified end-to-end against the real Supabase project, **signed in as the real admin account**: created a regular prompt, created a default prompt as a draft, published it and confirmed the status flip in `/admin/`, unpublished it, all with a clean console. Confirmed live in the Vercel production build (`config.js` response inspected in prod DevTools).
- `scripts/build.mjs` reads default prompts from Supabase (`lib/supabaseBuild.mjs`) instead of `prompts/*.md` — `lib/content.mjs`'s `buildData()`/`validatePrompts()` now take a `prompts` array as a parameter instead of loading it themselves, so either source can feed them. `validatePrompts()`'s duplicate-slug check now matters for a real reason it didn't before: `slug` is only unique **per admin** in the DB (`unique(user_id, slug)`), not globally, so two different admins could otherwise publish colliding slugs with nothing stopping them at insert time — this is what catches that before two prompts silently collide on the same `/prompt/<slug>/` route. `runBuild()` is now async (network call); `scripts/watch.mjs` and the CLI entrypoint both await it. Verified locally against the live project: builds cleanly, every page (home, category, collections, sequences, search, prompt detail) degrades to its existing empty state rather than erroring when there's little/no Supabase content, no console errors.
- A New Collection modal (`renderNewCollectionModal` in `lib/render.mjs`, behavior in `public/scripts/newCollection.js`) mirroring the New Prompt modal's pattern — title + description, slug generated at submit time with the same dedupe-on-collision approach, calling `db.js`'s existing `createCollection()`. Opens from a "+" button in the sidebar's Collections section header (`#new-collection-btn`, hidden until signed in — collections have no admin/curated concept). **A created collection won't appear anywhere in the UI yet** — the sidebar's own Collections list is still server-rendered from `lib/collections.mjs`'s hardcoded set, not read live from Supabase's `collections` table (which `db.js` has full CRUD for already, just nothing reads it client-side). Same gap as the `/library/` work already on the backlog, not a new one.

**Open items:**
- Vercel env vars are **Production-only** — Preview/Development don't have `SUPABASE_URL`/`SUPABASE_ANON_KEY` set (the Environments dropdown wasn't cooperating in the dashboard when this was set up). Fine until preview-branch deployments or `vercel env pull` are actually used — add them then.
- **Content gap from the switch, expected, not a bug**: only whatever's actually been created via the admin UI (and published) shows up now — the old `prompts/*.md` catalog is no longer read, so its 5 prompts, the "client-onboarding" sequence, and the "Client Onboarding Kit" collection (which references two of those slugs) are all gone from the live site unless recreated in Supabase. [`seed_default_prompts.sql`](seed_default_prompts.sql) exists to restore them but **has not been run yet** — do that (or recreate via the admin UI) before or after deploying this, your call, but the site will look emptier than before until one happens.
- The Supabase→Vercel publish webhook (next item below) isn't wired up yet, so a newly published default won't reach anonymous visitors until a manual redeploy.

## Next steps

The Supabase→Vercel publish webhook (auto-redeploy when a default gets published) → `/library/` views + CRUD (fork-on-edit, archive, favorites, collections UI) → variable-fill (§6.1) → open items (BUILD_BRIEF_v4.md §7).
