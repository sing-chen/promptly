# Supabase setup (account tier, BUILD_BRIEF_v4.md + default-prompt catalog)

Nothing here is provisioned yet. Steps to stand up the backend:

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine at this project's size — see BUILD_BRIEF_v4.md §1).
2. In the Supabase dashboard's SQL Editor, run [`migrations/0001_init_schema.sql`](migrations/0001_init_schema.sql). It creates `admins`, `prompts`, `prompt_overrides`, `collections`, `collection_prompts`, `favorites`, and RLS policies.
   - **Already ran an earlier version of 0001 against this project?** `0001_init_schema.sql` has been rewritten several times since (admin curation, forks, `prompt_overrides` all landed after the first run). Don't re-run it — instead run [`migrations/0002_admin_curation_and_forks.sql`](migrations/0002_admin_curation_and_forks.sql), which is an idempotent patch that brings any earlier revision up to the current schema, whichever version you happened to run.
3. From Project Settings → API, copy the **Project URL** and **anon public key**. These are safe to ship client-side — RLS is the actual security boundary, not key secrecy (§9).
4. Add them as env vars in Vercel's project settings (and locally, e.g. `.env.local`, gitignored) — consumed by `public/scripts/db.js`/`supabaseClient.js` client-side (via a generated `dist/scripts/config.js`, since browsers can't read `.env` files) and by `scripts/build.mjs` today (only to write that config file — `build.mjs` itself doesn't query Supabase for content yet, see below).
5. Enable email/password auth under Authentication → Providers (already on by default). OAuth providers are explicitly deferred (§7).
6. **Sign up for an account in the app once auth exists**, then in the SQL Editor run:
   ```sql
   insert into admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```
   This makes you the admin — the only role allowed to set `prompts.is_curated = true`.

## There is no markdown catalog

`prompts/*.md` was the v3 static site's original test content and is retired by this plan — it is **not** carried forward as "the official default prompts." Supabase is the single source of truth for default ("site-level") prompts, for every tier, anonymous visitors included. Concretely:

- You author and edit default prompts through the app's admin "create prompt" feature, not by hand-editing files or committing to git.
- Anonymous visitors never talk to Supabase directly (see below) — they still get a fast static site — but the *content* those static pages are built from comes from Supabase at build time, not from files in this repo.

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

1. **`scripts/build.mjs` needs to change** (not yet done) to query Supabase for published defaults (`is_curated = true, published = true`) at build time, using the `anon` key, instead of reading `prompts/*.md`. This is the only place `anon`'s `GRANT SELECT` actually gets used for anonymous traffic — real anonymous visitors hit pre-built HTML, not Supabase.
2. **A Supabase Database Webhook on `prompts`**, firing on `UPDATE` where `published` turns `true`, POSTs to a **Vercel Deploy Hook URL** to trigger a fresh build+deploy automatically. Not yet configured — needs both a Vercel project (Deploy Hooks live under Project Settings → Git) and the webhook set up in the Supabase dashboard (Database → Webhooks) once the project exists. Until this is wired up, publishing requires a manual redeploy to reach anonymous visitors; signed-in users always see your own drafts/published rows live regardless, since that's a direct RLS-scoped read, not a build artifact.

## Keeping the schema in sync

`prompts_categories_valid` hardcodes the `CATEGORIES` vocabulary from [`lib/schema.mjs`](../lib/schema.mjs). If a category is ever added/removed there, add a migration updating this `check` constraint to match — the two lists must stay identical since v4 mirrors the frontmatter shape field-for-field (§4).

## Status (last updated after the sidebar nav rebuild + cache-busting work, deployed to production)

**Built:**
- Schema + RLS (`0001_init_schema.sql`, patched onto the live project via `0002_admin_curation_and_forks.sql`) — admin curation/publish/fork model described above, live in Supabase.
- `lib/env.mjs` (build-time `.env.local` loader, no `dotenv` dependency) → `scripts/build.mjs` writes `dist/scripts/config.js` from `SUPABASE_URL`/`SUPABASE_ANON_KEY` every build.
- `public/scripts/supabaseClient.js` (client, loaded from the esm.sh CDN — not vendored, no bundler in this project) and `public/scripts/db.js` (full data layer: prompts CRUD, admin curate/publish, fork-on-edit, archive, favorites, collections).
- `public/scripts/auth.js` + `/account/` page — email/password sign-in/up/out, wired into the sidebar nav's account link and "New Prompt" button visibility.
- Verified end-to-end against the real Supabase project (admin seeded, sign-in tested, `isAdmin()`/`loadPrompts()` confirmed live) and confirmed live in the Vercel production build (`config.js` response inspected in prod DevTools).

**Open items:**
- Vercel env vars are **Production-only** — Preview/Development don't have `SUPABASE_URL`/`SUPABASE_ANON_KEY` set (the Environments dropdown wasn't cooperating in the dashboard when this was set up). Fine until preview-branch deployments or `vercel env pull` are actually used — add them then.

## Next steps

Auth UI + nav, `db.js`, and the "New Prompt" modal are done. The modal (`renderNewPromptModal` in `lib/render.mjs`, wired up in `public/scripts/newPrompt.js`) is rendered site-wide (one shell per page, same pattern as the quick-view modal) and opens from the sidebar's `#new-prompt-btn`. It collects `title`, `slug` (auto-filled from title until hand-edited), `purpose`, `categories` (checkboxes from `lib/schema.mjs`'s `CATEGORIES`), `body`, `notes`, and `example_output` — `sequence`/`sequence_step`/`depends_on` are intentionally left out per BUILD_BRIEF_v4.md §7. An admin-only "make this a default prompt" checkbox is shown only when `isAdmin()` resolves true (checked fresh each time the modal opens); checking it routes the submit through `createCuratedPrompt()` instead of `createPrompt()`. There's no `/library/` view yet to send the user to, so a successful create just shows an inline success message inside the modal with "Create another" / "Done" actions, rather than redirecting.

Verified in the browser preview (against the live Supabase project, signed out): modal open/close (button, backdrop click, Esc), title→slug auto-fill, the "choose at least one category" client-side validation, and the signed-out error path (`db.js`'s `requireUserId()` rejecting with "Not signed in.", surfaced correctly in the modal). **Not yet verified**: the actual signed-in create paths (regular user and admin-curated) — that needs a real sign-in, which wasn't done in that session since it would write real rows to the production database and no test account credentials were available. Verify both paths (and the admin checkbox's visibility toggle) end-to-end before relying on this further.

Remaining, roughly in order: `scripts/build.mjs` switched to query Supabase for default prompts instead of `prompts/*.md`, + the Supabase→Vercel publish webhook → `/library/` views + CRUD (fork-on-edit, archive, favorites, collections UI) → variable-fill (§6.1) → open items (BUILD_BRIEF_v4.md §7).
