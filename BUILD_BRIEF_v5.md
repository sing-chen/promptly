# Promptly — Build Brief v5: owned copies

**Status: Pass 1 is built and live** (migrations `0004_owned_copies.sql` and
`0005_publish_webhook.sql`, applied to production). This document is the design
rationale; [`supabase/README.md`](supabase/README.md) is the reference for the
schema as it now stands and for what is still outstanding.

Still deferred, and specced here rather than built: the **notify-and-merge screen**
(§6). It has no users until a catalog prompt is edited after someone has already
signed up, so the schema for it landed in Pass 1 while the UI did not.

This supersedes the **fork-on-edit / merged-catalog** model described in
`supabase/README.md` ("Admin curation, publishing, and per-user forks" and "The
merged catalog") and in BUILD_BRIEF_v4.md §6. Read this for the target model.

---

## 1. Why this changes

The shipped model treats a signed-in user's view as a *merge* of two things they
don't equally own: the admin's published catalog (borrowed, read-only, hidden via
an overrides table) and their own prompts (owned, editable, deletable). Editing a
borrowed prompt silently forks it.

That produces user-visible incoherence that isn't fixable by UI polish, because it
is the data model showing through:

- Two different removal verbs that never both appear — **Archive** for prompts you
  don't own, **Delete** for prompts you do. This was the trigger for the redesign.
- A fork that happens invisibly, at edit time, with no user intent behind it.
- An `/archived/` page whose contents are defined by a relationship
  (`prompt_overrides`) rather than by anything the user did deliberately.
- Per-user state on a borrowed prompt needing its own override mechanism, forever —
  every new personal field is another table or column.

**The new model: every prompt a signed-in user can see is genuinely theirs.** The
catalog still exists — it must, since the anonymous static site is built from it —
but authenticated users hold *copies*, not references.

### What this resolves

| Existing problem | Resolution |
| --- | --- |
| Archive vs. Delete inconsistency | Both verbs apply to every prompt, because every prompt is owned |
| Silent fork-on-edit | No forking exists; editing is just editing |
| `prompt_overrides` complexity | Table dropped |
| Merged-catalog client rebuild | Reduced to "load my prompts" |
| Open item: "what should unpublishing do?" | Unpublishing stops *future* grants; existing copies are untouched, because they were never references |

### What it costs

Admin edits no longer reach existing users automatically. §6 addresses this with a
notify-and-merge feature, specced here but **scheduled separately** — see §7.

### Scale

~100 catalog prompts × ~1,000 users ≈ 100k rows ≈ **~250MB**. Within the free tier,
comfortable on Pro (8GB). Revisit tier beyond that.

---

## 2. The model in plain terms

- The **catalog** is admin-authored prompts (`is_curated = true`). Publishing one
  makes it available to be granted, and puts it on the anonymous static site.
- **Signing up copies the whole published catalog into your library.** From that
  moment there is no such thing as a "default prompt" from your point of view —
  they are all just your prompts.
- You can **edit, archive, or delete** anything in your library, individually or in
  bulk. Archive hides and is reversible; Delete is permanent.
- **New catalog prompts** you publish later reach existing users too (§4), appearing
  as new prompts in their library.
- **Guests** (not signed in) see the catalog as a read-only static site. No Edit, no
  Archive, no Delete. Unchanged from today.
- **Admins don't get copies.** Their library *is* the catalog — the prompts they
  write are the canonical ones. Publishing makes a prompt canonical; editing it
  afterwards is a release to everyone who holds it.
- If you later **improve** a catalog prompt, users are notified and can pull the
  change in (§6). Untouched copies update silently.

---

## 3. Schema changes

SQL below is a sketch for review, not the final migration.

### 3.1 Dropped

- **`prompt_overrides`** — the entire table. Its two jobs (archive a borrowed
  prompt, point at a fork) no longer exist.
- **`prompts.source_prompt_id`** — no user-facing provenance, per explicit decision.
- **`prompts.edited_from_source`** — replaced by version comparison (§3.3).
- **`mark_edited_from_source()`** trigger and its `prompts_mark_edited_from_source`
  binding.
- Index `prompts_source_prompt_id_idx`.

### 3.2 Retained, newly meaningful

- **`prompts.is_archived`** — already in the schema but **currently unused by any
  app code** (all archiving goes through `prompt_overrides` today). It becomes the
  real mechanism: archive your own prompt.
- **`prompts.is_curated` / `published`** — now only ever true on admin-owned catalog
  rows. A user's copy is always `is_curated = false`.

### 3.3 New: `catalog_versions`

Version history of catalog prompts. **One row per admin edit of a published catalog
prompt** — a few hundred rows over the project's lifetime, because this scales with
the catalog, not with users.

```sql
create table catalog_versions (
  id                uuid primary key default gen_random_uuid(),
  catalog_prompt_id uuid not null references prompts (id) on delete cascade,
  title             text not null,
  categories        text[] not null default '{}',
  purpose           text,
  body              text not null,
  notes             text,
  notifiable        boolean not null default true,
  created_at        timestamptz not null default now()
);

create index catalog_versions_prompt_idx
  on catalog_versions (catalog_prompt_id, created_at desc);
```

Written by a trigger when a catalog prompt is **first published**, and on **every
subsequent content change while published**. Draft edits produce no versions.

`notifiable` carries the significant-vs-minor distinction (§6.2) — it does *not*
control whether a version row is written. Versioning every change is what keeps
`catalog_grants.granted_version_id` an exact record of the content each user was
handed; see §6.2 for the false-conflict bug that appears if minor edits are left
unversioned.

### 3.4 New: `catalog_grants`

Private bookkeeping. **Never read by the UI for display.** It answers three
questions: has this user already received this catalog prompt, which of their rows
is it, and which version were they handed.

```sql
create table catalog_grants (
  user_id            uuid not null references auth.users (id) on delete cascade,
  catalog_prompt_id  uuid not null references prompts (id) on delete cascade,
  user_prompt_id     uuid references prompts (id) on delete set null,
  granted_version_id uuid references catalog_versions (id),
  granted_at         timestamptz not null default now(),
  primary key (user_id, catalog_prompt_id)
);
```

`on delete set null` on `user_prompt_id` is load-bearing: if the user deletes their
copy, the grant row survives so seeding never resurrects it, while the pointer
clears so update-pushes correctly skip it.

RLS: owner-only, same shape as the old `prompt_overrides_owner_all`.

### 3.5 RLS

`prompts_select` is **unchanged** — `user_id = auth.uid() or (is_curated and
published)`. Catalog rows must stay readable for the merge screen (§6) and for the
anonymous static build. Separation of catalog from library is a *query* concern,
not an access concern:

> **Display rule: a signed-in user's library is their own rows.**

No predicate beyond ownership, because admins skip seeding (§4):

- A **regular user** can never own a curated row (RLS forbids setting
  `is_curated = true`), so their library is exactly their copies plus anything they
  wrote.
- An **admin** owns the catalog rows themselves and holds no copies, so their
  library *is* the catalog — drafts and published alike. Editing a prompt in their
  library edits the canonical version.

`/admin/` remains the place publish state is managed. Library rows owned by an admin
should carry a draft/published badge so the two views don't disagree about what's
live.

---

## 4. Seeding — pull, not push

A single idempotent `ensure_seeded()` RPC (SECURITY DEFINER, operating on
`auth.uid()`):

> Insert a copy of every **published catalog prompt** for which the caller has no
> `catalog_grants` row, and record the grant against the catalog prompt's current
> latest version.

**Admins are excluded — it no-ops for anyone in `admins`.** An admin already owns
the catalog rows; copying them would give the admin two of everything, one of which
would silently drift from the version everyone else is being served. Their library
is the catalog (§3.5).

Called on authenticated page load. This one function covers **both** cases:

1. **Signup** — no grants exist, so the whole catalog is copied.
2. **Newly published catalog prompts** — each user picks them up on their next
   visit.

This means **no publish-time fan-out job and no batch writes across all users.**
Publishing stays a single row update. A user who never signs in is simply never
written to. It is also self-healing: any partial failure is repaired on next load.

A trigger on `auth.users` insert calling the same logic is worth keeping as a
latency optimisation, so a brand-new user's first paint isn't waiting on ~100
inserts. It is strictly optional — the RPC is the correctness guarantee.

### Details that need care

- **Slug collisions.** `prompts.slug` is unique per user. At signup there's no
  conflict, but a later publish can collide with a personal prompt the user already
  wrote. Needs suffix-retry (`-2`, `-3`) inside the seeding function. This exact
  bug already bit `forkPrompt()` once — see `supabase/README.md`.
- **`depends_on` remapping.** It's a FK to another prompt row. A copied prompt must
  point at *the user's copy* of the dependency, not the catalog's. Two-pass insert
  (copy all, then remap), or null it if sequences don't use it in practice.
  `sequence` / `sequence_step` are plain values and copy cleanly.

---

## 5. Application changes

### 5.1 Removed

- `public/scripts/personalizeData.js` — merge logic, override loading,
  `resolveOwnPromptForEdit()`. Reduces to "load my prompts."
- `forkPrompt()`, `archiveDefault()`, `unarchiveDefault()` in `db.js`, replaced by
  `archivePrompt()` / `unarchivePrompt()` operating on `prompts.is_archived`.
- "View original" throughout `quickview.js` and `render.mjs`.
- The two-class branching in `personalizedActions()` (`render.mjs`) — Edit always,
  Archive only if curated, Delete only if owned.

### 5.2 Changed

- **`personalizedActions()`** → Edit + Archive + Delete on every row and card.
- **`/archived/`** → lists *your own archived prompts* with Unarchive, instead of
  archived defaults. Sidebar link stops being conditional on the fork model.
- **Home / Category / Search** → client-side swap to your library (the display rule
  in §3.5), no merging. `personalize.js` keeps its "rebuild the rendered page"
  role but loses the hard part.
- **`findNewPrompts()`** → keys off the copy's own `added` timestamp rather than
  `is_curated`, which naturally surfaces newly granted prompts as new.
- **`/why-sign-in/`** (`renderWhySignInPage`) → add Duplicate to the signed-in
  benefits list, alongside the existing write/edit/archive/delete entries.

### 5.3 New

- **Multi-select bulk Archive / Delete** on list and grid views, so a new user
  facing ~100 prompts can cut it down quickly. Bulk Archive is the gentler default;
  bulk Delete goes through the existing themed confirm dialog
  (`confirmDialog.js`).
- **Duplicate** — an explicit "make a copy of this prompt" action on any row the
  caller owns, producing an independent personal prompt (`is_curated = false`).
  Cheap: one insert reusing the slug-suffix retry the seeding function already needs.
  It serves two distinct purposes:
  - **For any signed-in user** — a fast route to subtle variants of a prompt that go
    beyond editing one in place ("the formal version", "the version for client X").
    Signed-in only, since guests have no library to duplicate into, so it belongs on
    `/why-sign-in/` as a listed benefit (§5.2).
  - **For an admin** — the only route to a personal variant of a published catalog
    prompt, since editing the catalog row itself is a broadcast (§6.4).

- **"Personal" vs "Publish to everyone"** on create and on duplicate. The mechanism
  already exists — the admin-only `is_curated` checkbox in the New Prompt modal,
  currently labelled "Make this a default prompt" and defaulting to checked for
  admins. This reframes it as an explicit two-way choice with clearer wording, and
  extends it to the Duplicate flow, which defaults to **Personal** regardless of who
  is duplicating. Non-admins never see the choice; their prompts are always personal
  (RLS enforces it independently).

- **Promote a personal prompt to the catalog** — an admin action on any personal
  prompt they own, so "start private, decide later" is a supported path rather than
  a decision locked in at creation.

  **No schema work required.** `prompts_update`'s WITH CHECK already permits an admin
  to set `is_curated = true` on their own row; the constraint
  `prompts_published_requires_curated` already forbids `published` without
  `is_curated`. What's missing is only the UI — a personal prompt is invisible to
  `/admin/` today because that page lists curated rows only.

  **Promotion lands the prompt as a draft** (`is_curated = true, published = false`),
  not straight to published. That keeps the reversible step and the irreversible one
  apart:

  - *Promote* → appears in `/admin/`, visible only to the admin, fully reversible.
  - *Publish* → distributed to every user on their next visit, and cannot be
    recalled (§9).

  Publish should therefore carry the weightier confirmation, and promotion should
  not silently perform it. Everything downstream works unchanged: the version trigger
  writes v1 on first publish, and `ensure_seeded()` hands the prompt to every user
  with no grant row for it — which is exactly the "push it out to all users"
  behaviour, with no separate mechanism.

### 5.4 Unchanged

- The anonymous static build (`scripts/build.mjs` → `fetchPublishedPrompts()`)
  still reads `is_curated + published` server-side.
- Guest experience end to end.
- Collections, and the New Prompt / New Collection modals.

---

## 6. Catalog updates: notify and merge (specced, deferred)

### 6.1 Behaviour

On login, if any of the caller's granted prompts have a newer catalog version:

- **Copy untouched** → the update is applied **silently**.
- **Copy modified** → held for review.
- The user gets one notification summarising both, with a link to view exactly which
  prompts changed so they can jump in rather than hunt.

### 6.2 What counts as an update

Not every admin edit deserves everyone's attention. Fields are classified:

| Field | Triggers a notification? |
| --- | --- |
| `title`, `purpose`, `body` | **Yes** — significant |
| `notes`, `categories` | No — minor |

So the admin can refine notes or recategorise freely without it reaching anyone. The
moment a significant field changes, **the whole accumulated diff is pushed**,
minor-field changes included — they ride along rather than being dropped.

**A version row is still written for every change**, minor ones included; only
`notifiable` differs. This matters more than it looks:

> If minor edits produced no version, a user granted the prompt *after* a notes edit
> would receive the current content while their grant pointed at an older snapshot
> with the old notes. At the next significant change, the merge would compare their
> copy's notes against that stale base, see a difference, and conclude **the user**
> had edited the notes — flagging a false conflict on a field they never touched.

Versioning every change and gating only the *notification* avoids this entirely, at
a cost of a few extra rows in a table that holds a few hundred.

Notification therefore fires when a grant has **any newer version marked
`notifiable`**. The merge itself always works against `granted_version_id`, so
nothing is lost either way.

**Asymmetry worth noting:** this classification only governs whether the *admin's*
edit notifies. For detecting whether the *user* customised their copy, every field
counts — a user who edited only the notes still has a modified copy.

**Manual override.** Field classification is a sensible default, not a rule. Save
should offer a "notify users of this change" checkbox, pre-set from the classifier
but overridable both ways: important guidance added to `notes` can be pushed
deliberately, and a typo fix in `body` can be released quietly.

### 6.2.1 Risk: important notes can sit unpushed

The real downside. `notes` carries usage guidance, and some of it matters — "this
one hallucinates on numeric input, check the output." Under the classifier that sits
undelivered until an unrelated `body` edit happens to ship it, which could be never.

The manual override above is the mitigation, and it's why the override needs to
exist rather than being a nice-to-have. Worth watching in practice: if notes-only
edits routinely get force-pushed, the classification is wrong and `notes` should be
promoted to significant.

### 6.3 Field-level, three-way

Per explicit decision, granularity is **per field** (`title`, `purpose`, `body`,
`notes`, `categories`) — not line-by-line hunks.

For each field, compare three points: the version the user was **granted**, the
**catalog now**, and **their copy**.

| Admin changed field? | User changed field? | Outcome |
| --- | --- | --- |
| No | — | Ignored entirely |
| Yes | No | Applied silently |
| Yes | Yes | **Conflict** — side-by-side, user chooses or edits |

The granted version is what makes this possible. Without it, a two-way compare
cannot distinguish "the admin changed this" from "I changed this," so every field
the user ever customised would be re-litigated on every catalog edit — including
offering to overwrite their own work. It is never shown to the user and is not
provenance; it is merge arithmetic.

After resolution, the grant's `granted_version_id` advances to current.

### 6.4 Editing a published catalog prompt is a broadcast

A consequence of admins holding the canonical rows rather than copies: once a
catalog prompt is published, **every admin edit to it is a release**. It writes a
new `catalog_versions` row, which silently updates untouched copies and flags a
review for modified ones.

That is the intended behaviour, but it removes the ability to casually tweak a
published prompt for one's own convenience. Two escape hatches:

- **Drafts are free.** Edits while `published = false` create no version and notify
  nobody, so iteration before release is unaffected.
- **Duplicate** (§5.3) for a genuinely personal variant that shouldn't reach anyone.

A "save without notifying" option for trivial corrections (a typo the whole flow
shouldn't fire for) is worth considering when §6 is built. Not needed in Pass 1,
since nothing consumes versions until then.

### 6.5 Why it can be deferred safely

**This feature has zero users until the first time a catalog prompt is edited after
someone has already signed up.** On launch day every copy is identical to its
source. Provided §3.3 and §3.4 land now, the screen can be built later with no
further migration.

---

## 7. Sequencing

**Pass 1 — the migration. Built and live.** Schema changes, `catalog_versions`,
`catalog_grants`, `ensure_seeded()`, the display rule, existing-data migration
(§8), Archive/Delete on own prompts, bulk multi-select, removal of the forking
machinery, `supabase/README.md` rewrite.

Shipped alongside it, beyond the original list: Duplicate, promote/demote between
personal and catalog, the notify override, database-backed favourites with a
one-time merge from localStorage, a personalized `/favorites/`, account-page
library stats, and `0005_publish_webhook.sql` (automatic redeploy when the catalog
changes). The UI detail is logged as BUILD_BRIEF.md §9r.

Done as one pass rather than two: the moment copies exist, a signed-in
`loadPrompts()` returns both the catalog original and the user's copy — **every
prompt appears twice** — so the display rule cannot be deferred. With that in, the
remaining cleanup is deletion, which is easier to review inside the same change than
alongside a half-live second model.

**Pass 2 — notify and merge (§6). Not built.** Separate and self-contained, and
deliberately deferred: it has no users until a catalog prompt is edited *after*
someone has signed up. Worth building before that first edit, since the schema it
needs is already recording versions.

---

## 8. Migrating existing data

One live account, and it is the **admin's own**. Confirmed: no other users.

**Every prompt currently in the database is test data** — accumulated while building
and testing site features, including the five rows from `seed_default_prompts.sql`.
None of it is canonical, and canonical content will be seeded into a cleared
database before release. So there is nothing to preserve, and the migration needs no
data-preservation logic:

1. Create a `catalog_versions` row per published catalog prompt (§5 of the
   migration). Exercises the backfill against real rows.
2. Clear `source_prompt_id` / `edited_from_source` on existing forks — they become
   ordinary personal prompts.
3. Drop `prompt_overrides` and the dropped columns/trigger from §3.1.

`supabase/reset_prompts.sql` is the reusable clean-slate script: wipe all prompts,
or only personal ones, or test accounts as well. Expected to be run repeatedly
through pre-release development, and once more before canonical seeding.

The per-user steps a multi-user migration would need (create copies, write grants,
remap favourites and collections onto those copies) are **not required here**,
because no existing account receives copies — admins skip seeding, and there are no
other accounts. They would only matter if this migration ran against a project that
already had non-admin users.

### Testing the new model needs a second account

An admin cannot exercise seeding, because `ensure_seeded()` deliberately no-ops for
admins (§4). Verifying the model end to end — signup seeding, catalog distribution
on publish, Archive/Delete on a copy, bulk actions, Duplicate — requires a
**non-admin test account**. Option D of `reset_prompts.sql` clears such accounts
again afterwards.

---

## 9. Open items

**Moved to [OPEN_ITEMS.md](OPEN_ITEMS.md).** The items this section carried — the merge
screen's dependants, multiple admins, demotion semantics, submission/moderation, slug
drift, publish irreversibility, the storage and build-minute watch points, and the SMTP
blocker — are in the single register, with their current status rather than their status
as of this pass.

One entry here was already struck through as resolved (`/favorites/` coherence); the
register records it under "do not re-raise" so it doesn't come back a third time.

The design rationale for all of it stays above: §6 for notify-and-merge, §4 for
pull-based seeding, §3 for the schema.
