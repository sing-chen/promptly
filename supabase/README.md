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
   [`0005_publish_webhook.sql`](migrations/0005_publish_webhook.sql) →
   [`0006_user_categories.sql`](migrations/0006_user_categories.sql) →
   [`0007_category_limit.sql`](migrations/0007_category_limit.sql) →
   [`0008_delete_account.sql`](migrations/0008_delete_account.sql).
   - 0001–0003 build up the *old* fork-based model, and 0004 then replaces it. That's
     wasteful on a fresh project but keeps one true migration history rather than a
     rewritten 0001 that no existing project matches. 0002 and 0003 are idempotent
     patches, so they're safe whichever revision of 0001 you happened to run.
   - After 0006 the schema is: `admins`, `prompts`, `catalog_versions`,
     `catalog_grants`, `categories`, `prompt_categories`, `category_grants`,
     `collections`, `collection_prompts`, `favorites`, plus RLS policies, the
     `ensure_seeded()` and `delete_category()` functions and the
     `prompts_write_catalog_version` trigger. `prompt_overrides` is dropped by 0004 —
     it belonged to the fork model — and `prompts.categories` plus its CHECK
     constraint by 0006.
   - 0006 needs an admin row to exist first (it seeds the catalog categories to
     them), so run it *after* step 6 below, not before. It raises rather than
     seeding nothing if you forget.
   - 0007 caps categories at 20 per user by adding a clause to 0006's
     `categories_insert` policy. It recreates that policy in full rather than
     patching it, so it must run after 0006, never interleaved.
   - 0008 adds `delete_my_account()`, the self-serve account-deletion RPC. It
     depends on every user-scoped table cascading from `auth.users`, which
     0001/0004/0006 already provide, so it can run any time after 0006.
   - Verify with [`verify_0004.sql`](verify_0004.sql) (11 checks),
     [`verify_0005.sql`](verify_0005.sql) (8 checks),
     [`verify_0006.sql`](verify_0006.sql) (27 checks),
     [`verify_0007.sql`](verify_0007.sql) (7 checks) and
     [`verify_0008.sql`](verify_0008.sql) (8 checks); all should read PASS, except
     0005's hook-URL check until step 7 below, 0006's checks 12/13, 0007's check 7
     and 0008's check 8, which read CHECK where the answer depends on what data
     the project happens to hold.
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
2. **A trigger on `prompts`** POSTs to a **Vercel Deploy Hook URL** to trigger a fresh build+deploy automatically ([`0005_publish_webhook.sql`](migrations/0005_publish_webhook.sql)). It fires on every change that would alter what the build produces - a catalog prompt published, unpublished, edited while published, or deleted - not just on publish, since otherwise a typo fix would never reach anonymous visitors. Statement-level, so a bulk change queues one build rather than one per row. Requires the Deploy Hook URL to be set (`select set_deploy_hook_url('…')`); until then it's inert. Historical note: this was originally specced as a Supabase Database Webhook, but that UI can't express "only when this transition happens", so it's a trigger instead. **The URL is set and the whole chain is verified working** (17 Aug 2026, OPEN_ITEMS.md C1 — now resolved): a publish confirmed through `/admin/` produced a `net._http_response` row with `status_code` 201 and a matching Vercel deployment labelled **Deploy Hook**. This paragraph previously called that an open question, because it once ended "Not yet configured" while the Status section recorded a real deployment — one of the two was stale and neither said which. Both are now reconciled against an actual test rather than against each other. Two things to keep if it ever looks broken again: it **cannot** be checked from app code — `deploy_settings` has RLS with no policies, so an anon read returns an empty set either way — and `request_static_rebuild()` deliberately swallows failures into a warning, so its return value proves nothing; look in `net._http_response`, and remember pg_net is async and queued, so a build lags the click by longer than a dashboard refresh. Signed-in users always see your own drafts/published rows live regardless, since that's a direct RLS-scoped read, not a build artifact.

## Categories are user-owned too

Specified in [BUILD_BRIEF_v6.md](../BUILD_BRIEF_v6.md) and applied by
[`0006_user_categories.sql`](migrations/0006_user_categories.sql). Categories follow the
same owned-copies model as prompts: an admin maintains a canonical `is_curated` set that
feeds the static build and seeds new accounts, and every signed-in user holds their own
rows and can diverge freely.

This replaced a hardcoded `CATEGORIES` array in `lib/schema.mjs` mirrored by a
`prompts_categories_valid` CHECK constraint. **Both are gone**, along with
`prompts.categories` (`text[]`) and `categoryHue()` — so the old "edit the array, then
write a migration to match the constraint" procedure no longer applies, and there is no
longer a code change involved in adding a category at all.

| Table | Purpose |
| --- | --- |
| `categories` | One row per category per user. `is_curated` marks the admin's canonical set. Carries `name`, `description`, `color`, `position`. |
| `prompt_categories` | Join table, keyed by category id. Replaces the `text[]` of slugs. |
| `category_grants` | Private bookkeeping, mirroring `catalog_grants`: which catalog categories a user has received, and which of their rows it is. |

Things worth knowing before touching any of it:

- **A join table, not `text[]`.** The deciding case is a user who deletes a category and
  is later granted a catalog prompt filed under it. Under `text[]` that copy arrives
  carrying a slug matching nothing they own and *nothing rejects it*; under a foreign key
  the insert can't happen, so `ensure_seeded()` is forced to state a policy (it re-grants
  the category — v6 §7.2). Silent and latent becomes loud and handled.
- **Slug is immutable; renaming changes `name`.** The slug is what seeding matches catalog
  categories on and what `/browse/<slug>/` is built from. Same trade v5 §9 already took for
  prompt slugs.
- **Every prompt must keep at least one category.** Enforced on removal by the
  `prompt_categories_assert_nonempty` statement-level trigger, and at creation by the app
  (a prompt row is always inserted before its join rows, so the trigger can't cover that
  end). Deleting a category is allowed *except* where it would strand a prompt — use the
  `delete_category(p_category_id, p_reassign_to)` RPC, which files the replacement and
  deletes in one transaction.
- **Colour is one stored hex per category.** The soft pill tint and the dark-mode variant
  are derived in CSS (`color-mix` against `--paper`), and badge text colour is computed
  from luminance (`readableInk()`), so the 24 hand-tuned `--cat-*` token values are gone.
  Two contrast numbers in `styles/tokens.css` and `styles/base.css` carry the measurements
  behind them — re-measure rather than nudging them.
- **Category pages stay catalog-only.** `/browse/<slug>/` is still statically generated per
  catalog category. A user-created category has no page; signed-in sidebar links point at
  `/?cat=<slug>` instead (v6 §5).
- **Rebuilds.** `0006` moves the `0005` rebuild trigger onto the new tables, so an admin
  renaming or recolouring a catalog category redeploys the static site. Without that, a
  recolour would never reach anonymous visitors — and nothing would error.
- **Table grants are not absent just because no `GRANT` was written.** Supabase ships
  `alter default privileges in schema public grant all on tables to anon, authenticated`,
  so every table created by a migration here arrives already granted to both roles. RLS
  is still the real boundary, but `0006` now explicitly revokes `anon` on the three
  bookkeeping tables (`category_grants`, `catalog_grants`, `catalog_versions`), which no
  client reads. `authenticated` keeps `catalog_grants` — `db.js`'s `loadMyGrants()` needs
  it for `/account/`. Caught by `verify_0006.sql` check 26 on the first live run; the
  exposure on the two `0004` tables had gone unnoticed because `verify_0004.sql` never
  tested for it.

To add, rename, recolour or remove a category now: use `/categories/` in the app. As an
admin, your library *is* the catalog, so your changes are the canonical set (and reach
anonymous visitors on the next rebuild; existing users keep theirs — divergence is the
point, so there is no notify-and-merge for categories).

## Auth settings that live only in the dashboard

Everything else in this file is reconstructible from `migrations/`. This section is not:
it records **project configuration**, which no migration captures and no amount of reading
the schema will reveal. If the project ever has to be rebuilt from this repo, these have
to be re-set by hand or they silently revert to Supabase's defaults.

Authentication → Sign In / Providers → Email:

| Setting | Value | Why |
|---|---|---|
| Minimum password length | **10** | Was Supabase's default of 6, which is inside offline-crack range in seconds. See BUILD_BRIEF.md §9ah. |
| Password Requirements | **No required characters** | Deliberate, not unconfigured. Requiring a capital/digit/symbol reliably produces `Password1!`; length does more work than variety. NIST SP 800-63B and NCSC both put length first. |
| Leaked password protection | **off — unavailable on Free tier** | Not a judgement. It is the highest-value auth setting here and costs one toggle on Pro. Tracked as OPEN_ITEMS.md E8. |
| **Confirm email** | **on** (required by §9ar) | Nobody can log in until they click the link in their welcome email. The app is written for this: `signUp()` returning no session is the signal that the mail went out. |

| **Custom SMTP** | **Gmail, as a deliberate interim** (Aug 2026) | `smtp.gmail.com:587` with a Google app password, sending as the controller's own address. Chosen to unblock testing without waiting on a domain decision (A5). It is temporary by design and the exit is written down before the entrance — see §1a and §6 of the runbook. Two consequences not to lose: the credential is a password to a whole mailbox, so it is revoked rather than merely abandoned at cutover; and the service's mail comes from a personal address, which is why this cannot still be the sender when sign-ups open. |

Authentication → URL Configuration, and Authentication → **Emails** (which
carries the SMTP settings *and* the templates — it is not under Project
Settings, whatever older guides say): both are covered in
[`email-templates/README.md`](email-templates/README.md), which is the
operator runbook for A1 — custom SMTP, the sending-domain problem, the two
email templates and the redirect allow-list, with a test sequence at the end.
**The redirect allow-list is the entry that fails quietly**: an unlisted target
is not rejected, it is silently replaced by the Site URL, so the visitor lands
on the home page instead of the page that was going to finish the job.

The minimum is **duplicated** in `public/scripts/password.js` as `MIN_PASSWORD_LENGTH`
(it lived in `auth.js` until §9ar moved it, so that `/reset-password/` enforces the same
rules sign-up does rather than a second copy of them), and
there is no mechanism keeping the two honest — the client cannot read the project's auth
settings back. Changing one without the other does not break anything loudly; it just
makes the form's message disagree with the server's answer. Change both.

Note the enforcement boundary: Supabase applies the minimum **when a password is set or
changed**, never at sign-in. Accounts predating a change keep working with shorter
passwords, and `auth.js` deliberately puts no length rule on the log-in form so that stays
true. Bringing such an account into line requires a password reset — which requires
working mail (OPEN_ITEMS.md A1).

## Deferred: `example_output`

The v3-era "attach an example output image, shown on the prompt detail page" feature (`prompts.example_output`, plus the matching frontmatter field and detail-page section) has been **removed from the shipped product**, not carried forward into the account tier. It may come back as a real feature later — if so, redesign it rather than resurrecting the column, since the old shape (a single image URL) was a v3-era placeholder, not a considered account-tier design. Tracked in BUILD_BRIEF_v4.md §7 and noted in BUILD_BRIEF.md. [`migrations/0003_remove_example_output.sql`](migrations/0003_remove_example_output.sql) drops the column from the live project (and updates `mark_edited_from_source`, which used to check it).

## Status

**Built - current model (BUILD_BRIEF_v5.md):**
- [`0009_collection_position.sql`](migrations/0009_collection_position.sql): adds
  `position` to `collections`, so `/collections/` offers the same
  drag-to-reorder `/categories/` has had since `0006`. **Applied and verified
  against the live project** - `select=id,title,position&order=position.asc`
  returns 200 where a fabricated column returns `42703`, which is the whole
  check this one needs. Same shape as `categories.position`, and idempotent
  (`if not exists` on both statements; the backfill only touches rows still at
  the default), so re-running is safe.
- [`0008_delete_account.sql`](migrations/0008_delete_account.sql):
  `delete_my_account()`, a SECURITY DEFINER function letting a signed-in user
  close their own account from `/account/`. **Applied and verified against the
  live project, and proven end to end** — all 8 checks in
  [`verify_0008.sql`](verify_0008.sql) as expected (7 PASS plus check 8 reading
  CHECK, which reports the admin count), and a throwaway non-admin account
  deleted through the real UI. That last test was the one that mattered and the
  one no script here could perform, since the function deletes straight out of
  `auth.users` — Supabase's own schema, where the supported path is the admin
  API.
  It takes no parameter and deletes `auth.uid()`, so it can only ever act on
  its caller; `search_path` is pinned, which is the standard escalation guard
  for SECURITY DEFINER. One row is deleted and ON DELETE CASCADE removes the
  rest — `verify_0008.sql` check 7 asserts that every FK to `auth.users` still
  cascades, enumerated from the catalog so a future table is covered without
  anyone updating the check. Checks 5 and 6 are the pair establishing that the
  function can reach `auth.users` at all, and both are worth reading because
  the answers are counter-intuitive. Its owner (`postgres`) holds DELETE there
  **by grant** — it is neither a superuser (Supabase revokes that; `supabase_admin`
  holds it) nor the table's owner (`supabase_auth_admin`). And `auth.users`
  **does have RLS enabled**, which sounds fatal and is not: `postgres` carries
  the `BYPASSRLS` attribute, so the policies do not apply to it. Check 6 tests
  for that exemption rather than for the absence of RLS, and prints which of
  the three exemptions applies plus `row_security_active()` as a second
  opinion. If that check ever reads FAIL, the delete would *succeed while
  removing nothing* — the account would survive and the UI would report it
  closed. **It refuses for admins**, and that refusal is the
  important part: an admin's library *is* the catalog, so deleting the admin
  would cascade every curated prompt and every version, then fire 0005's
  rebuild trigger, redeploying the site with an empty catalog and nothing to
  restore from. `/account/` shows an explanatory dialog rather than hiding the
  button; the database raises regardless. The client pairs the RPC with
  `signOut({ scope: 'local' })` — the default variant asks the auth server
  about a user who no longer exists and can fail, stranding the browser with a
  JWT for a deleted account.
- [`0007_category_limit.sql`](migrations/0007_category_limit.sql): a ceiling of
  20 categories per user, as a clause on `categories_insert`. Written to the
  RLS policy rather than a trigger **specifically so that `ensure_seeded()` is
  exempt** — it is SECURITY DEFINER and its owner owns `categories`, so it
  bypasses RLS. That is not incidental: a trigger would abort the whole seeding
  transaction for a user already at the ceiling, silently stopping their
  catalog prompts as well. Two intended consequences: a user can exceed 20 via
  seeding (the cap governs creation, not possession), and admins are not exempt,
  which is what keeps the catalog — and therefore every newly seeded account —
  at or under the ceiling. `verify_0007.sql` checks 4/5/6 assert the three
  properties the exemption rests on. Mirrored by `MAX_CATEGORIES_PER_USER` in
  `lib/schema.mjs`, which `/categories/` uses to disable the create button and
  explain itself before the database ever refuses. **Applied and verified against
  the live project**, all 7 checks in [`verify_0007.sql`](verify_0007.sql) as
  expected — 6 PASS plus check 7, which reads CHECK because it reports the
  largest per-user category count. That one is deliberately not an assertion: a
  user can legitimately sit above 20 after seeding grants them a new catalog
  category, so a script asserting `<= 20` would eventually fail while the system
  behaved exactly as designed.
- Schema + RLS through [`0006_user_categories.sql`](migrations/0006_user_categories.sql):
  `categories`, `prompt_categories`, `category_grants`, the
  `prompt_categories_assert_nonempty` trigger enforcing "every prompt keeps at least
  one category", `delete_category()`, and an `ensure_seeded()` that seeds categories
  before prompts and maps each copied prompt onto the caller's own category rows.
  `prompts.categories` and `prompts_categories_valid` are dropped; category colour is
  a per-category hex with the soft/dark variants derived in CSS and badge ink computed
  from luminance. See [BUILD_BRIEF_v6.md](../BUILD_BRIEF_v6.md) and BUILD_BRIEF.md §9s.
- `/categories/` (`public/scripts/categories.js`) - create, rename, recolour, reorder
  and delete your own categories, with a delete pre-flight that requires a replacement
  only for prompts the category is the *sole* one on. Sidebar category rows carry a
  colour dot; signed-in category links point at `/?cat=<slug>` since a user-created
  category has no statically generated page.
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
- `public/scripts/auth.js` - email/password sign-in/up/out, plus the three
  email-dependent flows added in §9ar: confirmation (including a resend that
  matches Supabase's own 60-second throttle), the "activate your account first"
  answer to a log-in against an unconfirmed address, and password reset, whose
  link lands on `/reset-password/` (`public/scripts/resetPassword.js`). The
  password rules are shared with that page from `public/scripts/password.js`,
  along with the reveal toggle — which carries a visible "Show"/"Hide" on the
  two screens where a password is *chosen* and stays a bare icon on log-in
  (§9au). There is deliberately **no confirm-password field**: that decision is
  recorded in §9au and rests partly on reset now existing, so it should not be
  added back as an oversight. `/account/` links to `/reset-password/` for a
  routine password change — a link, never a second form.
  **Sign out lives in the
  sidebar footer**, under the signed-in email, so it's reachable from any page.
  Sign-up also collects a **first name**, passed as `signUp({ options: { data } })` and
  stored by Supabase on `auth.users.raw_user_meta_data`, read back as
  `session.user.user_metadata.first_name`. This is the only thing this project keeps in
  user metadata, and deliberately not a column on a table of ours: a `profiles` row would
  have to be created in step with the auth user and deleted in step with it, which is a
  lot of machinery for one field used in one place (the `/account/` greeting). Note it is
  therefore **outside RLS** - metadata is scoped by Supabase Auth, not by a policy - so
  don't reach for it to hold anything that needs row-level protection.
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
- Verified against the live project: `0006` applied, with `verify_0006.sql` passing.
  Check 26 (`anon` cannot read the bookkeeping tables) **failed on the first run** and
  is the one worth remembering: Supabase's default privileges had granted `anon` on
  every new table in `public`, so the migration's "we never wrote a GRANT" reasoning
  was wrong. RLS was still returning zero rows throughout, so it was a missing layer
  rather than an exposure. `0006` now revokes explicitly, and the same fix was issued
  by hand against the live project for the two `0004` tables that had gone unnoticed
  because `verify_0004.sql` never tested for it. After migrating, `node scripts/build.mjs`
  runs green and the site is deployed.
- Verified against the live project: `0004` applied with all 11 checks in
  [`verify_0004.sql`](verify_0004.sql) passing; a non-admin test account was seeded 7
  copies automatically, and editing one updated it in place without creating a fork
  (`catalog_grants` stayed at 7). `0005` verified separately - editing a published
  catalog prompt triggered a Vercel deployment, and a newly published prompt reached
  anonymous visitors after the resulting rebuild.
- Verified against the live project during the `0007` pass, by querying PostgREST with
  the anon key: `categories` and `prompt_categories` return rows, and
  `prompts?select=categories` returns `42703 column prompts.categories does not exist`.
  That last one is the useful check — the *absence* of the dropped column is what
  distinguishes "0006 ran" from "0006's tables happen to exist", and it can be run in
  seconds without opening the SQL editor.

**Built, but needs configuration to take effect:**
- **`0008_delete_account.sql` depends on a Supabase role attribute, so re-run
  `verify_0008.sql` after any auth upgrade.** Deletion works today and has been
  proven end to end. But it rests on `postgres` carrying `BYPASSRLS`, because
  `auth.users` *does* have RLS enabled — and on `postgres` holding DELETE there
  by grant, being neither a superuser nor the table's owner
  (`supabase_auth_admin`). None of that is under this project's control, and
  the failure mode is the quiet one: if `BYPASSRLS` were withdrawn, the delete
  would succeed while removing nothing — the account survives and the UI
  reports it closed. `verify_0008.sql` check 6 is the only thing that would
  say so. The same applies to writing into `auth` at all, which is supported by
  convention rather than by contract.
- **Category CRUD and seeding are unexercised against a real database.** `0006` is
  applied and the schema is verified, but the signed-in paths — creating, renaming,
  recolouring and reordering a category, the delete-with-reassignment RPC, and
  `ensure_seeded()` handing a *new* account its categories — need a browser session,
  which the build tooling has no way to hold. The rest of the pass was verified against
  fixture data shaped like the post-migration reads (every page renders; colour,
  contrast, sidebar alignment and mobile overflow measured in-browser in both themes).
  Seeding in particular cannot be tested from the admin account at all: `ensure_seeded()`
  deliberately no-ops for admins, so it needs a throwaway non-admin signup (option D/E in
  [`reset_prompts.sql`](reset_prompts.sql) clears it again).
- Vercel env vars are **Production-only** - Preview/Development lack `SUPABASE_URL`/
  `SUPABASE_ANON_KEY`.

**Built, but needs dashboard configuration — the email flows (§9ar):**
- Sign-up, confirmation, resend and password reset are **built in the app** and
  verified in-browser: `/account/` carries the sign-up spam-folder warning, the
  "check your email" panel with a rate-limit-matched resend, a
  forgotten-password mode, and an "activate your account first" panel for a
  log-in against an unconfirmed address; `/reset-password/` is a new route
  where the reset link lands. Password rules moved to
  `public/scripts/password.js` so that page enforces the same ones sign-up
  does.
- **None of it delivers anything until custom SMTP is configured**, "Confirm
  email" is switched on, the two templates in
  [`email-templates/`](email-templates/) are pasted in, and `/account/**` and
  `/reset-password/**` are on the redirect allow-list. That is OPEN_ITEMS.md
  A1, and its blocking sub-problem is not a setting at all: a transactional
  sender needs a domain you control for SPF/DKIM, and this site is on a
  `*.vercel.app` subdomain. See the runbook for the three routes out of that.

**Not built:**
- **Notify-and-merge screen** (BUILD_BRIEF_v5.md §6) - versions and the `notifiable`
  flag are recorded now, but nothing consumes them yet. Deliberate: the feature has no
  users until a catalog prompt is edited *after* someone has signed up.
- **User-authored sequences.** Signed-in users see their *own* copies in every sequence
  rail (fixed in BUILD_BRIEF.md §9z — `initPersonalizedRail()`), but they cannot build a
  new chain of their own: sequence pages are generated at build time from the catalog, so
  a sequence a user invents on their own prompts has nowhere to render. See OPEN_ITEMS.md
  E4.
- Multiple admins: a second admin would see only their own catalog rows and couldn't
  edit the first admin's. Fine at one admin; needs a decision before a second.


## Next steps

**See [OPEN_ITEMS.md](../OPEN_ITEMS.md)** — the single register for everything
outstanding across the project, ordered by what has to be true before each item matters.

The **Status** section above stays here and is not duplicated there: it answers "what
exists in this database", which is a different question from "what is left to do".

The three things in the register that are specifically Supabase-side:

- **Custom SMTP, "Confirm email", the two templates and the redirect
  allow-list** — the dashboard half of A1, written up as a runbook in
  [`email-templates/README.md`](email-templates/README.md). The app side is
  built and waiting on it.

- ~~**Deploy Hook URL** (setup step 7)~~ — **done and verified end to end**, 17 Aug 2026.
  Left here as a pointer rather than deleted, because it was outstanding from `0005`
  until then and is the kind of entry that gets re-raised. See OPEN_ITEMS.md section H
  for the diagnosis, which is worth reading before debugging anything else that runs
  through pg_net.
- **Clearing test content before seeding canonical prompts**
  ([`reset_prompts.sql`](reset_prompts.sql)) — worth doing *before* any other account
  exists, because after that every edit to a published catalog prompt is a broadcast
  that cannot be recalled.
