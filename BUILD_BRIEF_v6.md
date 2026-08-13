# Promptly — Build Brief v6: user-owned categories

**Status: built and live.** All four passes in §10 are implemented, and
`0006_user_categories.sql` has been applied to the production project and verified
with `verify_0006.sql`. The static build runs green against the migrated schema and
the change is deployed. The UI half is logged as BUILD_BRIEF.md §9s, with the
follow-up layout repairs in §9t.

One check failed on that first live run — see §8a, which is worth reading before
writing the next migration, because the lesson is about how these verify scripts
earn their keep rather than about categories.

What is **not** independently verified: the signed-in CRUD paths (category
create/rename/recolour/reorder, delete-with-reassignment) and seeding into a fresh
non-admin account. Those need a browser session, which the build tooling here has no
way to hold. `supabase/README.md`'s Status records the same caveat.

This document is the design rationale; `supabase/README.md` is the reference for the
schema as it now stands. It is the category equivalent of
[BUILD_BRIEF_v5.md](BUILD_BRIEF_v5.md), which did the same job for prompts.

**Two things changed during implementation** and are corrected in place below —
§6.2's dark-mode mix (28% → 22%) and the filter pill's label colour, both after
measuring contrast in a browser rather than reasoning about it. §9 records what that
turned up.

The instruction is settled and not re-opened here: **categories become
user-owned, following the owned-copies model.** An admin maintains a canonical
set that feeds the static site and seeds new accounts; each signed-in user holds
their own rows and can diverge freely. Guests get the admin's set, read-only —
the same relationship they already have with catalog prompts. Scoping back to
admin-managed categories was explicitly rejected and is not an option considered
below.

`supabase/README.md`'s "Keeping the schema in sync" section — which documents
categories as a hardcoded array mirrored by a CHECK constraint, and says a real
admin screen "is on the backlog" — is what this supersedes.

---

## 1. Why this changes

Categories are the last part of the product that is still *the admin's*. Since
v5, a signed-in user's prompts are genuinely theirs: they can write, edit,
duplicate, archive and delete any of them. But the vocabulary those prompts are
filed under is a nine-element array in `lib/schema.mjs`, mirrored by a CHECK
constraint, and changing it takes a code change plus a hand-run migration.

That produces the same kind of incoherence v5 removed:

- A user can write a prompt about anything, then must file it under one of nine
  words chosen by someone else.
- The one axis of organisation the user *can* control (collections) is a
  separate, weaker concept — no colour, no filter pills, no sidebar counts.
- "Add a category" is a developer task. There is no product surface for it at
  all, for anyone, including the admin.

### The existing colour defect

This is not only a feature request. `categoryHue()` (`lib/render.mjs:24`) maps
nine categories onto six hues **by array index, modulo six**, so three pairs
already share a colour:

| Colliding pair | Shared hue |
| --- | --- |
| `writing` + `education` | `cat-clay` |
| `code` + `creative` | `cat-ochre` |
| `marketing` + `ops-admin` | `cat-blue` |

It is currently disguised because colliding pills rarely appear next to each
other — the collisions are 6 apart in an array rendered in order, so on the
filter toolbar they sit at opposite ends. Colouring the sidebar's nine category
icons (goal 3) puts them in one vertical stack where the repeats are obvious,
and at that point the colour stops carrying information. Per-category stored
colour fixes this properly, rather than by widening the hue array to nine and
leaving the same bug latent at ten.

### What this costs

The honest accounting, since this is knowingly a heavier lift:

- **The CHECK constraint has to go.** A CHECK cannot validate against a
  dynamic, per-user list. Integrity moves to a foreign key (§3).
- **Static category pages become catalog-only** (§5). A user-created category
  cannot have a build-time page.
- **Colour becomes data, not CSS** (§6), which means the soft and dark-mode
  variants must be derived programmatically instead of hand-picked, and badge
  text colour must be computed from luminance rather than assumed white.
- **41 references to the category vocabulary across 8 files** move from "read
  the constant" to "read the caller's data".

### Scale

Categories are tiny compared to prompts. ~9–20 categories × ~1,000 users ≈
20k rows in `categories`, plus roughly 1.5 rows per prompt in
`prompt_categories` — ~150k rows against v5's projected ~100k prompts. Both are
narrow tables. No change to the storage review point in v5 §9.

---

## 2. The model in plain terms

- A **category** is a row owned by a user: slug, name, description, colour,
  position.
- The **catalog categories** are the admin's own rows (`is_curated = true`),
  exactly parallel to catalog prompts. They are what the static site is built
  from and what new accounts are seeded with.
- **Signing up copies the admin's categories into your account**, the same
  pull-based way prompts are copied. From that moment they are just your
  categories.
- You can **create, rename, recolour, reorder and delete** them. Nothing you do
  reaches anyone else.
- **Guests** see the admin's categories, read-only, as the statically generated
  filter pills, sidebar list and `/browse/<slug>/` pages. Unchanged in feel from
  today.
- **Admins don't get copies** — their library *is* the catalog, per v5 §3.5.
  Editing a catalog category is a change to the canonical set.
- **Every prompt still has at least one category** (§4.3). That rule now has
  teeth in the database rather than only in the create form.

---

## 3. Decision 1 — storage: a join table, not `text[]`

**Decision: a `categories` table plus a `prompt_categories` join table keyed by
category id. `prompts.categories` (`text[]`) and the
`prompts_categories_valid` CHECK constraint are both dropped.**

### The two candidates

| | `text[]` of slugs, slugs unique per user | `prompt_categories` join table |
| --- | --- | --- |
| Diff size | Small — `prompts.categories` keeps its shape | Larger — every read path needs an embed, every write needs a second statement |
| Rename | Free *only if* slug is immutable and just the label changes; otherwise rewrite every affected prompt's array | Free unconditionally |
| Delete policy | Needs a trigger to scrub arrays, and scrubbing can silently empty one | FK, plus one trigger for the ≥1 rule |
| Orphan slug possible? | **Yes, silently** | **No — the FK forbids it** |

### Why the join table wins

The deciding factor is the seeded-prompt interaction the brief flags, because it
is the case where `text[]` fails *quietly*:

> A user deletes the `code` category. Later, the admin publishes a new catalog
> prompt filed under `code`. `ensure_seeded()` hands the user a copy.

Under `text[]`, that copy arrives carrying the string `'code'`, which now matches
nothing the user owns. Nothing rejects it. `categoryHue()` falls through to index
`-1` and paints it clay; the filter toolbar grows a pill for a category the user
deleted; the sidebar doesn't list it because the sidebar is built from the
categories table. The prompt satisfies "has at least one category" only in the
sense that its array is non-empty. Every consumer disagrees about whether the
category exists.

Under the join table the same scenario cannot compile: there is no row to point
at, so the insert fails and `ensure_seeded()` has to state a policy (§7.2). The
failure moves from silent and latent to loud and at the one point that can
handle it.

The same argument covers deletion. `text[]` deletion requires a trigger that
rewrites arrays across the user's prompts, and that trigger can drive a prompt to
zero categories — the exact invariant §4.3 is trying to hold. The join table
expresses deletion as row removal, where the ≥1 check is a single statement-level
trigger over the affected prompts.

`text[]`'s advantage — a smaller diff — is real but smaller than it looks,
because **a `categories` table has to exist either way**. Colour, description and
ordering are per-category data, and there is nowhere else to put them. So the
choice was never "table vs. no table"; it was only how prompts reference the
table, and an id reference is the one that can be enforced.

### The schema

```sql
create table categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  slug        text not null,
  name        text not null,
  description text,
  color       text not null,          -- '#RRGGBB', see §6
  position    int  not null default 0,
  is_curated  boolean not null default false,
  added       timestamptz not null default now(),
  updated     timestamptz not null default now(),
  unique (user_id, slug),
  constraint categories_color_hex check (color ~* '^#[0-9a-f]{6}$'),
  constraint categories_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table prompt_categories (
  prompt_id   uuid not null references prompts (id)    on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  primary key (prompt_id, category_id)
);

create index prompt_categories_category_idx on prompt_categories (category_id);
create index categories_user_idx on categories (user_id, position);
```

Notes on choices that aren't obvious:

- **`is_curated`, not `published`.** Catalog *prompts* need a draft state because
  publishing one distributes content to every user. A category is a label; there
  is no meaningful half-published category, and adding a second flag would mean
  the static build and the seeder could disagree about which set is canonical.
  Admin-owned + `is_curated` is the whole condition, mirroring
  `prompts_curated_published_idx`'s purpose with one less state.
- **`slug` unique per user, and immutable after creation.** It is the join key
  for seeding (§7) and the URL segment for catalog categories (§5). Renaming
  changes `name`; `slug` is generated once from the name at creation and then
  left alone. This is the same trade v5 §9 already accepted for prompts ("slug
  drift on title change" — stable links win), so it is a consistent rule rather
  than a new exception.
- **`on delete cascade` on `prompt_categories.category_id`**, deliberately *not*
  `restrict`. Restrict would block deleting a category from a prompt that has two
  others, which is a safe deletion. The real rule is narrower — see §4.3.
- **No `catalog_versions` equivalent.** There is no notify-and-merge for
  categories (§9). A user's category set diverging from the admin's is the
  intended outcome, not a conflict to resolve.

### RLS

Straightforward, and it mirrors `prompts` closely enough to be reviewable
side-by-side:

```sql
-- Read: your own, plus the catalog (needed by the anonymous static build and
-- by the seeder's source query). Same shape as prompts_select.
create policy categories_select on categories for select
  using (user_id = auth.uid() or is_curated);

-- Write: your own rows only, and only an admin may set is_curated.
create policy categories_insert on categories for insert to authenticated
  with check (
    user_id = auth.uid()
    and (not is_curated or exists (select 1 from admins a where a.user_id = auth.uid()))
  );

create policy categories_update on categories for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (not is_curated or exists (select 1 from admins a where a.user_id = auth.uid()))
  );

create policy categories_delete on categories for delete to authenticated
  using (user_id = auth.uid());
```

`prompt_categories` has no `user_id` of its own; its policies test ownership
through `prompt_id`:

```sql
create policy prompt_categories_select on prompt_categories for select
  using (exists (
    select 1 from prompts p where p.id = prompt_id
      and (p.user_id = auth.uid() or (p.is_curated and p.published))
  ));

create policy prompt_categories_write on prompt_categories for all to authenticated
  using (exists (select 1 from prompts p where p.id = prompt_id and p.user_id = auth.uid()))
  with check (
    exists (select 1 from prompts p where p.id = prompt_id and p.user_id = auth.uid())
    and exists (select 1 from categories c where c.id = category_id and c.user_id = auth.uid())
  );
```

The second `with check` clause is load-bearing and easy to omit: without it a
user could file **their** prompt under **someone else's** category id, which is
both a data-integrity bug and a small information leak (the join row would prove
that category id exists).

### Reading it back without rewriting every consumer

Every rendering helper today takes `prompt.categories` as an array of slugs
(`renderCatBadges`, `filters.js`'s `data-categories` attribute, `search.js`'s
Fuse field, `accountStats.js`'s tally). That shape is worth preserving.

PostgREST embeds through a join table natively, so both readers — `db.js`
client-side and `lib/supabaseBuild.mjs` at build time — can ask for:

```
select=*,prompt_categories(category:categories(id,slug,name,color,position))
```

and normalise once, at the data-layer boundary, into the existing shape plus the
new colour:

```js
p.categories = row.prompt_categories
  .map(pc => pc.category)
  .sort((a, b) => a.position - b.position);   // objects now, not strings
```

**The one shape change that does propagate:** `p.categories` becomes an array of
objects rather than strings, because every consumer that renders a badge now
needs the colour alongside the slug. Rather than carry two parallel arrays,
`categories` holds the objects and the places that want slugs say
`p.categories.map(c => c.slug)`. This is the bulk of the 41-reference churn and
is mechanical.

---

## 4. Category CRUD

### 4.1 Where it lives

**A new `/categories/` page**, modelled on `/collections/` — which already is a
signed-in-only, client-rendered management page for a user-owned concept, with a
sidebar section listing its contents. Reusing that pattern means the new page
inherits the static-shell-plus-client-script convention, the sidebar cap and
"view all" behaviour, and the themed confirm dialog, rather than inventing a
management surface.

Not `/admin/`: that page is for the catalog specifically (publish/unpublish), and
categories are now everyone's, not the admin's. An admin manages categories on
the same page as everyone else — theirs simply happen to be the catalog rows.

The sidebar's existing Categories section gains a small "Manage" affordance for
signed-in users, alongside the existing list.

### 4.2 Create and edit

A modal in the same idiom as the New Prompt modal: name, description
(optional), colour. Slug is derived from the name at create time and not shown
as an editable field — it is internal for user categories (§5) and only
URL-visible for catalog ones.

Reordering: drag, persisted to `position`. Falls back to alphabetical if
positions collide.

### 4.3 Delete, and the "at least one category" rule

The rule already decided: **every prompt must have at least one category.** A
user may clear all categories while editing, but Save is blocked until at least
one is set.

- **Create** already enforces this — `newPrompt.js:270` rejects an empty
  selection with "Choose at least one category."
- **Edit** goes through the same submit handler and the same check, so it is
  enforced too. *This wants confirming in the browser during implementation
  rather than by reading alone* — the edit path pre-checks boxes from
  `prompt.categories` (`newPrompt.js:243`) and shares the validation, but "shares
  the code path" is not the same as "has been seen to reject".

Deletion interacts with the rule, and the policy is:

> **Deleting a category is allowed, except where it would leave a prompt with no
> categories at all.**

Not a blanket "block while in use". Deleting `research` from a prompt that is
also filed under `writing` is a safe, ordinary edit and should not require a
ceremony. Only the prompts where the doomed category is the *sole* category are a
problem.

Two layers:

1. **UI pre-flight.** The delete confirm dialog counts affected prompts before
   asking. Three cases:
   - Used by nothing → "Delete Research? Nothing is filed under it." Straight
     delete.
   - Used, but never as the only category → "Delete Research? It will be removed
     from 12 prompts, all of which have other categories." Straight delete.
   - Sole category on N prompts → the dialog requires a **replacement category**
     for those N before the button enables: "3 prompts have Research as their
     only category. File them under: [dropdown]." One extra click, and no prompt
     is silently left invalid.
2. **Database backstop.** A statement-level `after delete` trigger on
   `prompt_categories` that raises if any touched prompt now has zero rows:

   ```sql
   -- The ≥1-category rule can't be a CHECK (it spans two tables) and can't be a
   -- row-level trigger (a multi-row delete would fire mid-way through a valid
   -- reassignment). Statement-level, after the fact, over the transition table.
   create or replace function assert_prompts_have_categories() returns trigger
   language plpgsql as $$
   begin
     if exists (
       select 1 from removed r
       join prompts p on p.id = r.prompt_id
       where not exists (
         select 1 from prompt_categories pc where pc.prompt_id = p.id
       )
     ) then
       raise exception 'every prompt must have at least one category';
     end if;
     return null;
   end;
   $$;
   ```

   The reassignment in case 3 therefore has to insert the replacement rows
   **before** deleting the category, inside one transaction — which an RPC makes
   natural and a sequence of client calls does not. So deletion-with-reassignment
   is a `delete_category(p_category_id uuid, p_reassign_to uuid)` RPC, not three
   round trips from `db.js`.

Deleting the last remaining category is blocked by the same trigger as soon as
any prompt exists. If the user has no prompts at all, deleting everything is
permitted — there is nothing to invalidate, and `ensure_seeded()` won't restore
them (their grants persist, §7).

---

## 5. Decision 2 — category pages: static for the catalog only

**Decision: `/browse/<slug>/` continues to be statically generated, for catalog
categories only. User-created categories get no page of their own; signed-in
users reach any category — catalog or personal — through Home filtered by that
category.**

### Why

The two options were "render user categories client-side at `/browse/<slug>/`" or
"drop category pages for user categories and rely on sidebar + filter pills". The
second is chosen, with one adjustment that removes its downside.

A client-rendered `/browse/<slug>/` for user categories would need a catch-all
route, which this build doesn't have and which the static host would have to be
configured for — real infrastructure for a page that shows exactly what a
filtered Home already shows. `scripts/build.mjs:140` loops `data.categories` and
writes a directory per slug; there is no dynamic segment anywhere in the site.

The adjustment: **the sidebar's category links become tier-dependent.**

| Tier | Sidebar category link target |
| --- | --- |
| Anonymous | `/browse/<slug>/` — the static page, as today. SEO and no-JS preserved. |
| Signed in | `/?cat=<slug>` — Home, with that category's filter pill pre-activated. |

Uniform within each tier, so there is no case where two categories in the same
sidebar behave differently from each other. A signed-in user never lands on a
`/browse/` page from the sidebar, which also removes an existing oddity: today a
signed-in user on `/browse/writing/` sees a page whose *heading* comes from the
static catalog and whose *contents* were swapped out by `personalize.js`.

`/browse/<slug>/` keeps working for signed-in users who arrive by link or
bookmark — it is personalized exactly as it is today. If the slug names a
category they have deleted, the page renders with an empty result set and a line
explaining that they no longer have that category, rather than 404ing.

`CATEGORY_DESCRIPTIONS` moves to `categories.description` and the static build
reads it from there.

---

## 6. Colour

The largest piece of actual design work, because it converts 24 hand-tuned token
values into something derived.

### 6.1 What is stored

**One hex per category** (`categories.color`), the "solid" value — the badge
fill. That is the only stored colour. Everything else is derived.

### 6.2 What is derived, and how

| Derived value | Used by | Derivation |
| --- | --- | --- |
| Soft tint | Filter pill rest state | `color-mix(in oklab, var(--cat) 16%, var(--paper))` |
| Dark-mode soft tint | Filter pill rest state, dark | `color-mix(in oklab, var(--cat) 22%, var(--paper))` |
| Badge text colour | Badge, active filter pill | Computed from WCAG relative luminance (§6.3) |

**The dark figure was 28% in the design and is 22% as built.** Measured rather than
guessed, once the pills were on screen: the pill's *label* is neutral ink, not the
category colour, so unlike the badge it gets no help from `readableInk()` — the more
of the colour that goes into the tint, the closer the label gets to failing AA. At
28% a user picking pure white left the label at 3.83:1. See §9 for the rest of that
finding, including the light-mode half, which needed a different fix.

`color-mix` handles both the soft variant and the dark-mode variant **without a
second stored value or a JS colour library**, because it mixes against
`var(--paper)`, which is already theme-dependent. That single fact is what makes
the 24-token table collapse: light mode mixes toward near-white, dark mode toward
near-black, from the same declaration. The two different percentages exist
because a dark surface needs a stronger mix to read as tinted at all — this
matches how the existing hand-picked `--cat-*-soft` values already behave
(light ones are ~10% saturated washes, dark ones are visibly darker and denser).

Browser support (`color-mix` in oklab: Chrome 111+, Safari 16.2+, Firefox 113+)
is adequate, and the fallback — declaring the plain surface colour immediately
before the `color-mix` line — degrades to today's pre-§9k neutral pill rather
than to anything broken.

### 6.3 Badge text: computed, not assumed white

Badges use white text today because all six hues were hand-chosen to carry it. A
user picking a pale yellow breaks that. So text colour is computed:

```js
// WCAG 2.1 relative luminance, then contrast ratio against white. 4.5 is the
// AA threshold for normal text; the badge's 11px/600 type is not large enough
// to claim the 3:1 large-text allowance.
export function readableInk(hex) {
  const [r, g, b] = [0, 2, 4].map(i => {
    const c = parseInt(hex.slice(1 + i, 3 + i), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (1.05 / (L + 0.05)) >= 4.5 ? '#FFFFFF' : '#1A1613';
}
```

The dark ink `#1A1613` is the existing `--ink` light-mode value, so a pale badge
reads as the site's own ink rather than as pure black.

**The picker warns rather than blocks.** A colour that fails both white and dark
ink at 4.5:1 is essentially impossible (any colour passes one or the other), so
there is nothing to forbid; what the picker should do is show the resulting badge
live, which makes a poor choice self-evident without a rule.

### 6.4 How colour reaches the page

**Inline custom properties on the element**, not a class per hue:

```html
<span class="cat-badge" style="--cat:#A8552A;--cat-ink:#FFFFFF">Writing</span>
```

and the six-rules-per-consumer CSS blocks collapse to one each:

```css
.cat-badge   { background: var(--cat); color: var(--cat-ink); }
.filter-pill { background: var(--paper); background: color-mix(in oklab, var(--cat) 16%, var(--paper)); }
.filter-pill.is-active { background: var(--cat); color: var(--cat-ink); }
.stat-bar-fill { background: var(--cat); }
```

This removes 18 CSS rules and all 24 `--cat-*` / `--cat-*-soft` token values, and
— the useful part — **it makes the static and signed-in cases the same
mechanism.** The static build already writes these spans; it just writes the
catalog colour into the inline style. `personalize.js` re-renders the same spans
with the user's colours. There is no separate "inject a stylesheet of custom
properties for signed-in users" step, because the value travels with the element
that uses it.

One consequence to keep in mind: `renderCatBadges()` and friends must now be
passed category *objects*, not slugs (§3, "Reading it back"). That is the same
churn already accounted for.

`categoryHue()` is deleted. `CATEGORY_HUES` is deleted. The six hue names survive
only as the default palette offered in the picker and as the seed colours in
§8 — at which point the collision documented in §1 disappears, because the seed
assigns nine distinct colours rather than cycling six.

### 6.5 Sidebar icons (goal 3)

The folder glyph (`ICON.category`) is a 1.6px-stroke outline at 18px. Filling it
with a category colour gives a large flat shape that competes with the label;
stroking it in the colour gives a thin line that at 18px reads as a slightly
tinted grey for the darker hues and is nearly invisible for the lighter ones.
Neither survives nine of them stacked.

**Decision: a filled circle**, ~10px, in the category's colour, in the icon slot.
It is the one shape that reads unambiguously as "this colour" at that size, it
matches the `.cat-badge` fill exactly so the sidebar and the pills agree, and it
is the established idiom (a language dot). The folder glyph is retained for the
"Categories" section label itself, so the section still has an icon identity.

**To verify in the browser during implementation**, not asserted here: that a
10px circle plus the existing 8px gap doesn't shift the sidebar's label
baselines relative to the other nav items, which use 18px icons.

### 6.6 Consumers

All four, per the brief, plus one it doesn't list:

| Consumer | File | Change |
| --- | --- | --- |
| Category badges | `lib/render.mjs` `renderCatBadges` | Inline `--cat` / `--cat-ink` |
| Filter pills | `lib/render.mjs` `renderFilterToolbar`, `renderCategoryFilterBar` | Inline `--cat`; `color-mix` for rest state |
| Sidebar icons | `lib/render.mjs` `renderNav` | Coloured circle |
| Account bar chart | `public/scripts/accountStats.js` | Inline `--cat` on `.stat-bar-fill` |
| **Quick-view modal** | `public/scripts/quickview.js:127` | Calls `renderCatBadges(item.categories)` — inherits the object-shape change |

---

## 7. Decision 3 — seeding: extend `ensure_seeded()`, don't invent a second mechanism

**Decision: categories seed through the existing pull-based `ensure_seeded()`
RPC, with a `category_grants` table mirroring `catalog_grants`.**

This is the answer v5 already gave for prompts, applied unchanged. Publishing
needs no fan-out; a user picks up new admin categories on their next visit; a
partial failure self-heals; admins skip it because their library is the catalog.

```sql
create table category_grants (
  user_id             uuid not null references auth.users (id) on delete cascade,
  catalog_category_id uuid not null references categories (id) on delete cascade,
  user_category_id    uuid references categories (id) on delete set null,
  granted_at          timestamptz not null default now(),
  primary key (user_id, catalog_category_id)
);
```

`on delete set null` on `user_category_id` carries the same load as its
`catalog_grants` counterpart: **if the user deletes their copy, the grant row
survives so seeding never resurrects it**, while the pointer clears.

No `granted_version_id`. Versions exist so the merge screen can do three-way
field comparison (v5 §6.3); there is no merge screen for categories (§9), so
there is nothing to compare against.

### 7.1 Ordering inside `ensure_seeded()`

Categories must be seeded **before** prompts, because a copied prompt's
`prompt_categories` rows need the user's category ids to exist. So the function
grows a first phase:

1. **Seed categories.** For every `is_curated` category with no grant row for the
   caller, insert a copy (`is_curated = false`) and write the grant. Slug
   collision retry (`-2`, `-3`) exactly as the prompt loop already does, since
   `categories.slug` is unique per user and the user may have created their own
   `research` before the admin published one.
2. **Seed prompts** — as today, plus:
3. **Map each copied prompt's categories.** For each catalog `prompt_categories`
   row, insert the user's equivalent by looking up `category_grants`:

   ```sql
   insert into prompt_categories (prompt_id, category_id)
   select g_own.user_prompt_id, cg.user_category_id
     from prompt_categories pc
     join catalog_grants  g_own on g_own.catalog_prompt_id = pc.prompt_id
     join category_grants cg    on cg.catalog_category_id  = pc.category_id
    where g_own.user_id = v_user
      and cg.user_id    = v_user
      and cg.user_category_id is not null
      and g_own.user_prompt_id = any(v_new_prompt_ids)
   on conflict do nothing;
   ```

   Structurally the same remap the existing `depends_on` second pass does, and it
   belongs immediately next to it in the function.

### 7.2 The drift case, stated explicitly

The brief asks that whichever storage option is chosen must answer this. It does,
because the FK forces it to:

> The user deleted the `research` category. Their `category_grants` row survives
> with `user_category_id = null`, so it is never re-seeded. The admin then
> publishes a prompt filed under `research`. The user is granted the prompt. The
> join above finds `user_category_id is null` and inserts nothing. The copy would
> land with **zero** categories, violating §4.3.

**Policy: re-grant the category on demand.** If a prompt being seeded needs a
category whose grant has a null `user_category_id`, `ensure_seeded()` re-creates
the user's copy of that category and repoints the grant, before the mapping step.

The alternatives and why not:

- *File it under a fallback ("Uncategorised")* — requires a special
  undeletable system row, which is a new concept and a new set of edge cases
  (can you rename it? recolour it? does it seed?) for a case that is rare.
- *Skip the prompt entirely* — a user who deleted one category silently stops
  receiving catalog prompts, which is a much worse surprise than a category
  reappearing.
- *Let it land with zero categories* — abandons the rule this brief is trying to
  give teeth.

Re-granting is honest about what happened and is visible: the category shows up
in the sidebar again, at the same time as the prompt that needed it. Logged in §9
as worth revisiting if it ever feels intrusive; the natural refinement would be a
line in the (unbuilt) notification surface saying so.

---

## 8. Migration and seeding the catalog set

`0006_user_categories.sql`, plus `verify_0006.sql` of PASS/FAIL checks in the
established shape. Written to be pasted into the Supabase SQL editor — there is
no CLI and `.env.local` holds only the anon key.

All prompt data currently in the database is throwaway test content
(`supabase/reset_prompts.sql`), so no data-preservation logic is needed. The
migration still has to convert what is there, because the admin's own prompts are
the catalog the static site builds from and an empty site is not a useful thing
to verify against.

Order of operations:

1. Create `categories`, `prompt_categories`, `category_grants`, their indexes,
   RLS policies and the ≥1-category trigger.
2. **Seed the nine catalog categories** from `lib/schema.mjs`'s `CATEGORIES` and
   `CATEGORY_DESCRIPTIONS`, owned by the admin, `is_curated = true`, with nine
   **distinct** colours — the six existing `--cat-*` hex values plus three new
   ones chosen to sit between them, which is where §1's collision is actually
   fixed. `position` follows the current array order so the sidebar looks
   unchanged.
3. **Backfill `prompt_categories`** from every existing prompt's `categories`
   array, joining on slug. For a non-admin's row, join against *that user's*
   seeded categories.
4. **Backfill `category_grants`** for every non-admin user, so the newly created
   per-user categories are recorded as granted and `ensure_seeded()` doesn't
   duplicate them on the next page load. (There is exactly one live account, the
   admin's, so in practice this backfills nothing — but the migration should be
   correct against a project that does have users, since it is also the script a
   fresh environment runs.)
5. **Drop** `prompts_categories_valid` and `prompts.categories`.
6. Replace `ensure_seeded()` with the version in §7.
7. Update `0005`'s rebuild trigger: it currently watches `prompts.categories`
   (`0005_publish_webhook.sql:150`) to decide whether a catalog edit changed what
   the static build produces. That column is gone, so the trigger moves to
   `prompt_categories` and `categories` — **a category rename or recolour by the
   admin must trigger a rebuild**, since it changes every static page that
   renders a badge.

Step 7 is the one most likely to be forgotten and the one whose absence is
hardest to notice: everything would keep working except that anonymous visitors
would keep the old colours indefinitely.

`reset_prompts.sql` needs a matching option for categories.

---

## 8a. What measuring turned up

Two defects that reading the code could not have found, both introduced by this pass,
both in §6's colour work. Recorded because the numbers behind them aren't recoverable
from the CSS.

**The filter pill's label was the weak point, not the badge.** §6.3 dealt with badge
text by computing it from the fill, which is right and works. But the *pill* keeps a
neutral label over a soft tint, so nothing adapts to the user's colour. Measured
against the worst thing a person can pick:

| | Light (`--ink-soft`, as shipped before) | Dark (`--ink-soft`) |
| --- | --- | --- |
| Worst real seeded category | 4.22:1 ✗ | 5.04:1 |
| Pure black pick | 3.32:1 ✗ | — |
| Pure white pick | — | 3.83:1 ✗ at 28% |

The light-mode failure is the notable one: it hits an *actual* seeded category
(`ops-admin`, a dark slate), not just a hypothetical bad pick, and it was present the
moment the tint stopped being a hand-picked pastel. The fix is one line — hued pills
use full-strength `--ink` instead of `--ink-soft` — which moves the worst case to
8.3:1 light and 8.6:1 dark and lets the tint stay strong enough to actually see. §9k's
"text stays neutral ink" still holds; what changed is the shade.

**The sidebar dot was 2px too wide.** `ICON.*` declare `width="18" height="18"` on the
`<svg>`, so a dot box sized 18px looks obviously correct. Those icons lay out at 16px,
so every category label sat 2px right of the primary nav's. §6.5 flagged this exact
check as "to verify in the browser, not asserted here", and it was the one thing in
that section that turned out to be wrong.

Both numbers now carry their measurements in the CSS, since the next person to adjust
them will otherwise assume the headroom is spare.

**And one the verify script caught, which reading never would have.** `verify_0006.sql`
check 26 asserted that `anon` cannot read `category_grants`, on the strength of §3's
reasoning that the migration writes no `GRANT` for it. It failed on the first live run.
Supabase ships `alter default privileges in schema public grant all on tables to anon,
authenticated`, so a table created by a migration here **arrives already granted** —
"I never wrote a GRANT" is not the same as "there is no grant."

RLS was doing its job throughout (`anon` has no `auth.uid()`, so the owner predicate
matched nothing and every query returned zero rows), so this was a missing layer rather
than an exposure. But the same is true of `catalog_grants` and `catalog_versions` from
`0004`, and nobody had noticed, because `verify_0004.sql` never asked. `0006` now
revokes `anon` on all three; `authenticated` keeps `catalog_grants`, which `/account/`
reads through `loadMyGrants()`.

The transferable lesson is about the verify scripts rather than about grants: the check
that earned its place was the one asserting a property the design *claimed* was already
true. Checks that only confirm what the migration obviously just did would not have
found this.

**And the same script then taught the opposite half of the lesson.** Check 5 required
exactly nine catalog categories. It passed on migration day and failed the first time
the admin deleted one — reporting reality, but as a *fault*, when the product was
working exactly as designed. Categories are user-editable now and an admin's library
*is* the catalog, so that count is meant to drift.

So the rule has two sides, and this pass managed to break both: **assert what the
migration guarantees, and nothing the product is designed to change.** Check 5 now
asserts `>= 1` — an empty catalog genuinely is broken, because no prompt can be
saved — while check 6 carries the real invariant by comparing two numbers that move
together (distinct colours vs. total), which stays meaningful at any count.

---

## 9. Open items

**Moved to [OPEN_ITEMS.md](OPEN_ITEMS.md).** This section's entries — no merge for
categories, re-granting a deleted category, slug immutability, the sequence-builder's
stale slug list, the broken `seed_default_prompts.sql`, a per-user category limit, and
the category-vs-collection question — are in the single register.

Two are worth knowing about without opening it, because they read as bugs and are not:

- **Categories deliberately never merge.** Prompts do (§6 of v5); categories don't.
  Divergence from the admin's set is the intended outcome, not a conflict to resolve.
- **`ensure_seeded()` will re-create a category the user deleted** if a newly granted
  prompt needs it (§7.2). The alternative was letting the prompt land with no categories
  at all, which breaks the rule §4.3 exists to hold.

---

## 10. Sequencing

All four passes below are **built, applied and deployed**. Pass 1's migration ran
against the production project with `verify_0006.sql` passing; passes 2–4 are live.

**Pass 1 — schema.** `0006_user_categories.sql` + `verify_0006.sql`: the three
tables, RLS, the ≥1-category trigger, the `ensure_seeded()` rewrite, the catalog
seed with nine distinct colours, the backfill, dropping the CHECK and the column,
and the `0005` trigger update (§8). Verified by hand in the SQL editor.

**Pass 2 — the shape change.** `p.categories` becomes objects; `db.js` and
`lib/supabaseBuild.mjs` embed and normalise; `renderCatBadges` and the ~41
references follow. No new UI. The site should look identical at the end of this
pass — which is what makes it reviewable, since any visible difference is a bug.

**Pass 3 — colour.** `categoryHue()` and the 24 tokens out, inline
`--cat`/`--cat-ink` and `color-mix` in, `readableInk()`, sidebar circles.
Verified in the browser in both themes.

**Pass 4 — CRUD.** `/categories/`, the create/edit modal with the colour picker,
reorder, the delete flow and its `delete_category()` RPC, the sidebar "Manage"
affordance, and the `/why-sign-in/` benefit line (goal 4).

Passes 2 and 3 are separable and worth separating: the first is a large
mechanical diff with no visual output, the second is a small diff that changes
how everything looks. Reviewing them together means the mechanical churn hides
the colour regressions.

**Docs, in the same change** (per the repo's convention): BUILD_BRIEF.md gains a
**§9s** pass entry and its closing locked-items paragraph is extended;
`supabase/README.md`'s "Keeping the schema in sync" section is replaced (it
documents the model this brief removes), its Status section gains entries in the
Built bucket, and its Next steps item 4 is struck; this file's §9 becomes the
open-items home for categories, the way v5 §9 is for prompts.

---

## 11. Not this task

Unchanged and not touched by any of the above:

- **Transactional email / SMTP** — unconfigured, and still the only thing
  actually blocking public launch (v5 §9, `supabase/README.md` Next steps 1).
- **The notify-and-merge screen** (v5 §6) — specced, not built. §7's changes to
  `ensure_seeded()` sit alongside it without conflicting; when the merge screen
  is built, `categories` is one of the five fields it compares (v5 §6.3), and it
  will need to compare *category sets by slug* rather than by id, since the two
  users' ids differ. Worth writing down now while the reason is fresh.
