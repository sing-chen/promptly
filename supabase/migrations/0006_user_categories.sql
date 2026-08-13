-- Promptly — user-owned categories (BUILD_BRIEF_v6.md)
--
-- Categories stop being a hardcoded array in lib/schema.mjs mirrored by a
-- CHECK constraint, and become rows a user owns — created, renamed,
-- recoloured, reordered and deleted by them, following exactly the
-- owned-copies model 0004 established for prompts: an admin maintains a
-- canonical set that feeds the anonymous static build and seeds new
-- accounts, and every signed-in user holds their own copies.
--
-- The three decisions this implements (BUILD_BRIEF_v6.md §3, §5, §7):
--   * storage    — a categories table + a prompt_categories join table keyed
--                  by id. prompts.categories (text[]) and its CHECK go.
--   * pages      — /browse/<slug>/ stays statically generated for CATALOG
--                  categories only. Nothing in this file; noted because the
--                  slug's role as a URL segment is why it is immutable.
--   * seeding    — extends ensure_seeded(), pull-based. No fan-out job.
--
-- Run once, in the Supabase SQL Editor, against the live project. Sections
-- 1-9 are additive/backfill and safe on their own; section 10 is the
-- destructive part and runs last, so a failure earlier leaves the old model
-- intact and the site still working.
--
-- Assumes 0001-0005 have already been applied.

-- ════════════════════════════════════════════════════════════════════
-- 0. Preconditions
-- ════════════════════════════════════════════════════════════════════
-- The catalog categories seeded in section 5 have to belong to somebody,
-- and that somebody is the admin — their library *is* the catalog (v5 §3.5).
-- Without an admin row there is no owner to give them to, and a migration
-- that silently seeded nothing would leave a site with no categories at all.
do $$
begin
  if not exists (select 1 from admins) then
    raise exception
      'No admin account exists. Run the insert in supabase/README.md step 6 '
      'first — section 5 of this migration needs an owner for the catalog '
      'categories.';
  end if;

  if (select count(*) from admins) > 1 then
    raise warning
      'More than one admin row found. Section 5 gives the catalog categories a '
      'single owner — the admin who already owns the most catalog prompts. The '
      'other admin(s) will not be able to edit them (RLS scopes updates to the '
      'owner). See BUILD_BRIEF_v5.md §9 (multiple admins), which flags exactly '
      'this for prompts already.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- 1. categories
-- ════════════════════════════════════════════════════════════════════
-- One row per category per user. is_curated marks the admin's canonical set
-- — the one the static build reads and ensure_seeded() copies from.
--
-- No `published` flag, unlike prompts. A catalog prompt needs a draft state
-- because publishing distributes *content* to every user; a category is a
-- label, there is no meaningful half-published one, and a second flag would
-- let the static build and the seeder disagree about which set is canonical.
-- Admin-owned + is_curated is the whole condition.
--
-- slug is immutable after creation, and that is a deliberate trade rather
-- than an oversight: it is the join key seeding matches on (section 8) and
-- the URL segment for catalog categories (/browse/<slug>/). Renaming changes
-- `name`. Same decision v5 §9 already took for prompt slugs — stable links
-- win — so it is a consistent rule rather than a new exception.
--
-- color is the *only* colour stored: the solid badge fill. The soft pill
-- tint and the dark-mode variant are derived in CSS via color-mix() against
-- --paper, and the badge's text colour is computed from WCAG luminance
-- (BUILD_BRIEF_v6.md §6). That is what collapses the 24 hand-tuned
-- --cat-*/--cat-*-soft token values in styles/tokens.css down to one column.
create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  slug        text not null,
  name        text not null,
  description text,
  color       text not null,
  position    int  not null default 0,
  is_curated  boolean not null default false,
  added       timestamptz not null default now(),
  updated     timestamptz not null default now(),
  unique (user_id, slug),
  -- Stored as '#RRGGBB' and nothing else. The renderer inlines this value
  -- straight into a style attribute, so anything the regex lets through is
  -- something a template has to escape; six hex digits can't carry a payload.
  constraint categories_color_hex check (color ~* '^#[0-9a-f]{6}$'),
  constraint categories_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint categories_name_present check (length(btrim(name)) > 0)
);

create index if not exists categories_user_idx on categories (user_id, position);
create index if not exists categories_curated_idx on categories (is_curated) where is_curated;

-- Reuses 0001's set_updated_at(), same as prompts_set_updated_at.
drop trigger if exists categories_set_updated_at on categories;
create trigger categories_set_updated_at
  before update on categories
  for each row execute function set_updated_at();

alter table categories enable row level security;

-- Read: your own, plus the catalog. The catalog has to stay readable for the
-- anonymous static build (which queries as `anon`) and for ensure_seeded()'s
-- source query, exactly as prompts_select keeps catalog prompts readable.
drop policy if exists "categories_select" on categories;
create policy "categories_select" on categories
  for select
  using (user_id = auth.uid() or is_curated);

-- Write: your own rows, and only an admin may set is_curated — the same
-- shape (and the same admins EXISTS check) as prompts_insert/prompts_update
-- in 0002. This is what makes "users can't contribute to the catalog" a
-- database rule rather than an app-code convention.
drop policy if exists "categories_insert" on categories;
create policy "categories_insert" on categories
  for insert
  with check (
    user_id = auth.uid()
    and (not is_curated or exists (select 1 from admins a where a.user_id = auth.uid()))
  );

drop policy if exists "categories_update" on categories;
create policy "categories_update" on categories
  for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (not is_curated or exists (select 1 from admins a where a.user_id = auth.uid()))
  );

drop policy if exists "categories_delete" on categories;
create policy "categories_delete" on categories
  for delete
  using (user_id = auth.uid());

grant select on categories to anon;
grant select, insert, update, delete on categories to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 2. prompt_categories — the join
-- ════════════════════════════════════════════════════════════════════
-- Replaces prompts.categories (text[]). The reason for a join table rather
-- than keeping the array with per-user-unique slugs is the seeded-prompt
-- drift case, spelled out in BUILD_BRIEF_v6.md §3:
--
--   A user deletes their `code` category. The admin later publishes a prompt
--   filed under `code`. Under text[], the copy arrives carrying the string
--   'code', matching nothing the user owns — and *nothing rejects it*. The
--   sidebar wouldn't list it, the filter toolbar would grow a pill for it,
--   and the prompt would satisfy "has a category" only in the sense that its
--   array is non-empty.
--
-- With a foreign key there is no row to point at, so the insert fails and
-- ensure_seeded() is forced to state a policy (section 8 does: it re-grants
-- the category on demand). The failure moves from silent to loud, at the one
-- place that can handle it.
--
-- ON DELETE CASCADE, deliberately not RESTRICT: deleting a category off a
-- prompt that has two others is a safe, ordinary edit and shouldn't require
-- ceremony. The narrower rule that actually matters — never leave a prompt
-- with zero categories — is section 3.
create table if not exists prompt_categories (
  prompt_id   uuid not null references prompts (id)    on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  primary key (prompt_id, category_id)
);

-- The PK covers prompt_id-first lookups (rendering a prompt's badges); this
-- covers the other direction (counting a category's prompts, and the
-- delete pre-flight in section 7).
create index if not exists prompt_categories_category_idx
  on prompt_categories (category_id);

alter table prompt_categories enable row level security;

-- Readable exactly where the prompt itself is readable, so the anonymous
-- build can embed categories through published catalog prompts.
drop policy if exists "prompt_categories_select" on prompt_categories;
create policy "prompt_categories_select" on prompt_categories
  for select
  using (exists (
    select 1 from prompts p
    where p.id = prompt_id
      and (p.user_id = auth.uid() or (p.is_curated and p.published))
  ));

-- Writable only on your own prompt, AND only pointing at your own category.
--
-- That second clause is load-bearing and easy to leave out: without it a
-- user could file their own prompt under someone else's category id. That is
-- both a data-integrity bug (their badge would render from a row they can't
-- read, so it would render as nothing) and a small information leak — a
-- successful insert would confirm that category id exists.
drop policy if exists "prompt_categories_write" on prompt_categories;
create policy "prompt_categories_write" on prompt_categories
  for all
  to authenticated
  using (exists (
    select 1 from prompts p where p.id = prompt_id and p.user_id = auth.uid()
  ))
  with check (
    exists (select 1 from prompts p    where p.id = prompt_id   and p.user_id = auth.uid())
    and exists (select 1 from categories c where c.id = category_id and c.user_id = auth.uid())
  );

grant select on prompt_categories to anon;
grant select, insert, update, delete on prompt_categories to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 3. "Every prompt has at least one category"
-- ════════════════════════════════════════════════════════════════════
-- The product rule (BUILD_BRIEF_v6.md §4.3). It can't be a CHECK — it spans
-- two tables — and it can't be a FOR EACH ROW trigger, because a legitimate
-- "swap this prompt's categories" is a multi-row delete that passes through
-- an intermediate state of zero. So: AFTER STATEMENT, over the transition
-- table, once the whole statement has landed.
--
-- Scope, stated plainly: this guards *removal* only. It cannot guard
-- creation, because a prompt row is always inserted before its join rows
-- exist — at INSERT time every prompt legitimately has zero categories for a
-- moment. Creation-time enforcement therefore stays where it already is, in
-- the app (public/scripts/newPrompt.js rejects an empty selection on both the
-- create and the edit path). A deferred constraint trigger could close that
-- gap, but only by requiring every prompt insert to share one transaction
-- with its category inserts, which PostgREST can't express from the client.
create or replace function assert_prompts_have_categories() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_orphan text;
begin
  select string_agg(p.title, ', ' order by p.title)
    into v_orphan
  from (select distinct prompt_id from oldtab) r
  join prompts p on p.id = r.prompt_id
  where not exists (
    select 1 from prompt_categories pc where pc.prompt_id = p.id
  );

  if v_orphan is not null then
    raise exception
      'Every prompt must have at least one category; this would leave none on: %',
      v_orphan
      using hint = 'Pick a replacement category first — see delete_category().';
  end if;

  return null; -- AFTER STATEMENT triggers ignore the return value
end;
$$;

drop trigger if exists prompt_categories_assert_nonempty on prompt_categories;
create trigger prompt_categories_assert_nonempty
  after delete on prompt_categories
  referencing old table as oldtab
  for each statement execute function assert_prompts_have_categories();

-- A prompt deleted outright takes its join rows with it via ON DELETE
-- CASCADE, which fires this trigger with rows whose prompt no longer exists.
-- The JOIN above drops those (no matching prompts row), so deleting a prompt
-- is unaffected — worth knowing, since the alternative spelling with a
-- LEFT JOIN would have blocked every prompt deletion.

-- ════════════════════════════════════════════════════════════════════
-- 4. category_grants — private bookkeeping
-- ════════════════════════════════════════════════════════════════════
-- The direct mirror of catalog_grants (0004 §2), and for the same reason:
-- it answers "has this user already received this catalog category, and
-- which of their rows is it".
--
-- user_category_id's `on delete set null` carries the identical load: if the
-- user deletes their copy, the grant row survives so seeding never
-- resurrects it, while the pointer clears.
--
-- No granted_version_id, unlike catalog_grants. Versions exist so the
-- notify-and-merge screen can do three-way field comparison (v5 §6.3); there
-- is no merge screen for categories and there is not going to be one —
-- divergence from the admin's set is the intended outcome here, not a
-- conflict to resolve (BUILD_BRIEF_v6.md §9).
create table if not exists category_grants (
  user_id             uuid not null references auth.users (id) on delete cascade,
  catalog_category_id uuid not null references categories (id) on delete cascade,
  user_category_id    uuid references categories (id) on delete set null,
  granted_at          timestamptz not null default now(),
  primary key (user_id, catalog_category_id)
);

create index if not exists category_grants_user_category_idx
  on category_grants (user_category_id);

alter table category_grants enable row level security;

drop policy if exists "category_grants_owner_all" on category_grants;
create policy "category_grants_owner_all" on category_grants
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Nothing client-side reads this table; only ensure_seeded() touches it, as
-- SECURITY DEFINER. So anon is revoked explicitly rather than merely not
-- granted.
--
-- The REVOKE is load-bearing and easy to think unnecessary. Supabase ships
-- `alter default privileges in schema public grant all on tables to anon,
-- authenticated`, so a table created here arrives WITH those grants already
-- attached - "I never wrote a GRANT" does not mean the grant is absent. RLS
-- still blocks every row (anon has no auth.uid(), so user_id = auth.uid() is
-- NULL and matches nothing), so this is defence in depth rather than a fix
-- for a leak - but the layer that should refuse the query before RLS is
-- consulted is worth having.
--
-- catalog_grants and catalog_versions (0004) have the same exposure for the
-- same reason and are cleaned up alongside, since 0004 predates knowing this.
-- `authenticated` keeps its grant on catalog_grants: db.js's loadMyGrants()
-- reads it for /account/, scoped to the caller's own rows by RLS.
revoke all on table category_grants   from anon;
revoke all on table catalog_grants    from anon;
revoke all on table catalog_versions  from anon;

-- ════════════════════════════════════════════════════════════════════
-- 5. Seed the catalog categories
-- ════════════════════════════════════════════════════════════════════
-- The nine values that were lib/schema.mjs's CATEGORIES array, with
-- CATEGORY_DESCRIPTIONS as descriptions, owned by the admin, is_curated.
-- `position` follows the old array order so the sidebar looks unchanged.
--
-- COLOURS — this is where the defect described in BUILD_BRIEF_v6.md §1 is
-- actually fixed. categoryHue() mapped nine categories onto six hues by
-- array index modulo six, so writing+education, code+creative and
-- marketing+ops-admin each shared a colour. Disguised today because the
-- collisions sit 6 apart in a list rendered in order; unmissable once nine
-- coloured dots are stacked in the sidebar.
--
-- The first six keep their existing --cat-* hex values, so nothing that is
-- currently on screen changes colour. The three that were collisions get new
-- hues chosen to sit in the gaps (teal between blue and moss, indigo between
-- plum and blue, slate distinct from all six). All nine clear 4.5:1 against
-- white text, so readableInk() picks white for every one of them and the
-- seeded set looks exactly like the hand-tuned palette it replaces.
--
-- Owner: the admin who already owns the catalog prompts, so the categories
-- and the prompts filed under them end up in the same library. `admins` holds
-- nothing but a user_id — no created_at to order by — so "whoever owns the
-- most curated prompts" is the only meaningful tiebreak available, with any
-- admin as the fallback for a fresh project that has no prompts yet.
insert into categories (user_id, slug, name, description, color, position, is_curated)
select
  coalesce(
    (select p.user_id
       from prompts p
       join admins a on a.user_id = p.user_id
      where p.is_curated
      group by p.user_id
      order by count(*) desc, p.user_id
      limit 1),
    (select user_id from admins order by user_id limit 1)
  ),
  v.slug, v.name, v.description, v.color, v.position, true
from (values
  ('writing',       'Writing',       'Drafting and editing prose — emails, docs, and other written output.',        '#A8552A', 1),
  ('code',          'Code',          'Reading, writing, and explaining code — debugging, review, and generation.',   '#8A6817', 2),
  ('marketing',     'Marketing',     'Copy and campaign material — ads, positioning, and audience-facing content.',  '#34647F', 3),
  ('research',      'Research',      'Finding, summarizing, and synthesizing information from sources.',             '#7A4780', 4),
  ('data-analysis', 'Data Analysis', 'Making sense of data — analysis, interpretation, and reporting.',              '#566627', 5),
  ('product',       'Product',       'Product and project work — briefs, specs, and planning.',                      '#8A3B4E', 6),
  ('education',     'Education',     'Teaching and learning — explanations, lesson material, and study aids.',       '#2F6F63', 7),
  ('creative',      'Creative',      'Open-ended creative work — brainstorming, ideation, and non-prose output.',    '#4F5AA8', 8),
  ('ops-admin',     'Ops Admin',     'Operational and administrative tasks — process, logistics, and busywork.',     '#4E5A66', 9)
) as v(slug, name, description, color, position)
where not exists (
  select 1 from categories c
  where c.is_curated and c.slug = v.slug
);

-- ════════════════════════════════════════════════════════════════════
-- 6. Backfill
-- ════════════════════════════════════════════════════════════════════
-- 6a. Give every existing non-admin account its own copy of the catalog set,
--     so their prompts have something to be filed under in 6c. In practice
--     this project has exactly one account and it is the admin's, so this
--     copies nothing — but the migration is also the script a fresh
--     environment runs, and there it must be correct.
--
--     No slug-collision retry needed here, unlike ensure_seeded(): the
--     categories table did not exist a moment ago, so nobody can already own
--     a conflicting slug.
insert into categories (user_id, slug, name, description, color, position, is_curated)
select u.id, c.slug, c.name, c.description, c.color, c.position, false
from auth.users u
cross join categories c
where c.is_curated
  and not exists (select 1 from admins a where a.user_id = u.id)
  and not exists (
    select 1 from categories own
    where own.user_id = u.id and own.slug = c.slug
  );

-- 6b. Record those as granted, so ensure_seeded() doesn't hand them out a
--     second time on the next page load.
insert into category_grants (user_id, catalog_category_id, user_category_id)
select own.user_id, cat.id, own.id
from categories own
join categories cat on cat.is_curated and cat.slug = own.slug
where not own.is_curated
on conflict (user_id, catalog_category_id) do nothing;

-- 6c. The actual data migration: prompts.categories (text[] of slugs) becomes
--     prompt_categories rows, resolved per owner — an admin's prompt joins to
--     the catalog categories it owns, a user's prompt to their own copies.
insert into prompt_categories (prompt_id, category_id)
select p.id, c.id
from prompts p
cross join lateral unnest(p.categories) as s(slug)
join categories c on c.user_id = p.user_id and c.slug = s.slug
on conflict (prompt_id, category_id) do nothing;

-- 6d. Report anything left with no categories.
--
--     The old CHECK constraint (`categories <@ array[...]`) validated that
--     every slug was *in* the vocabulary but not that there was one at all —
--     `'{}' <@ anything` is true — so the ≥1 rule has only ever been enforced
--     in newPrompt.js. Rows predating that check, or written directly in the
--     SQL editor, can legitimately have none.
--
--     Deliberately reported rather than auto-assigned: picking a category on
--     the user's behalf is a content decision, and all current data is
--     throwaway test content anyway (supabase/reset_prompts.sql). The app
--     blocks Save until a category is set, so the first edit fixes each one.
do $$
declare
  v_orphans integer;
begin
  select count(*) into v_orphans
  from prompts p
  where not exists (select 1 from prompt_categories pc where pc.prompt_id = p.id);

  if v_orphans > 0 then
    raise warning
      '% prompt(s) have no categories after backfill (they had an empty '
      'categories array). They render without badges until edited; the New/Edit '
      'Prompt modal will require a category on the next save.', v_orphans;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- 7. delete_category() — deletion with reassignment, atomically
-- ════════════════════════════════════════════════════════════════════
-- Deleting a category is allowed except where it would leave a prompt with
-- no categories at all (section 3). For the prompts where the doomed
-- category is the *only* one, a replacement has to be filed BEFORE the
-- delete lands, or the section 3 trigger rejects the statement.
--
-- That ordering is why this is an RPC and not three calls from db.js: the
-- insert and the delete have to be in one transaction, and PostgREST gives a
-- client one statement per request. A client-side sequence would also leave
-- the library in a half-reassigned state if the tab closed mid-way.
--
-- p_reassign_to null means "I expect nothing to need reassigning" — the
-- trigger enforces that expectation, so a UI that pre-flighted wrongly gets
-- an error rather than silently mangling the library.
--
-- Returns the number of prompts that were reassigned.
create or replace function delete_category(
  p_category_id uuid,
  p_reassign_to uuid default null
) returns integer
language plpgsql
security invoker          -- RLS applies; a user can only ever hit their own rows
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_moved    integer := 0;
begin
  if v_user is null then
    raise exception 'delete_category() requires an authenticated caller';
  end if;

  if not exists (
    select 1 from categories c where c.id = p_category_id and c.user_id = v_user
  ) then
    raise exception 'No such category, or it is not yours';
  end if;

  if p_reassign_to is not null then
    if p_reassign_to = p_category_id then
      raise exception 'Cannot reassign a category to itself';
    end if;

    if not exists (
      select 1 from categories c where c.id = p_reassign_to and c.user_id = v_user
    ) then
      raise exception 'The replacement category does not exist, or is not yours';
    end if;

    -- Only the prompts where this is the sole category. A prompt that has
    -- others survives the delete untouched, and silently adding the
    -- replacement to it would be recategorising work the user didn't ask to
    -- have recategorised.
    with sole as (
      select pc.prompt_id
      from prompt_categories pc
      where pc.category_id = p_category_id
        and not exists (
          select 1 from prompt_categories other
          where other.prompt_id = pc.prompt_id
            and other.category_id <> p_category_id
        )
    )
    insert into prompt_categories (prompt_id, category_id)
    select sole.prompt_id, p_reassign_to
    from sole
    on conflict (prompt_id, category_id) do nothing;

    get diagnostics v_moved = row_count;
  end if;

  -- Cascades to prompt_categories, which fires the section 3 trigger. If the
  -- caller got the pre-flight wrong, that raises here and the whole thing —
  -- including the reassignment above — rolls back.
  delete from categories where id = p_category_id and user_id = v_user;

  return v_moved;
end;
$$;

grant execute on function delete_category(uuid, uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 8. ensure_seeded() — now seeds categories too
-- ════════════════════════════════════════════════════════════════════
-- Unchanged in shape from 0004: pull-based, idempotent, self-healing,
-- no-ops for admins, called on authenticated page load. What is new is a
-- category phase that must run FIRST, because a copied prompt's
-- prompt_categories rows need the caller's category ids to exist.
--
-- Phases:
--   1. copy every un-granted catalog category
--   2. copy every un-granted published catalog prompt   (as before)
--   3. remap depends_on onto the caller's copies        (as before)
--   4. map the copied prompts' categories through category_grants
--
-- Phase 4 is structurally the same remap as phase 3 and sits next to it on
-- purpose — both answer "this copy points at a catalog row; make it point at
-- the user's equivalent."
create or replace function ensure_seeded() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_count   integer := 0;
  v_slug    text;
  v_suffix  integer;
  v_new_id  uuid;
  r         record;
begin
  if v_user is null then
    return 0;
  end if;

  -- Admins hold the catalog rows themselves; copying would give them two of
  -- everything, one of which would silently drift from what everyone else is
  -- served (v5 §4). Their library *is* the catalog.
  if exists (select 1 from admins a where a.user_id = v_user) then
    return 0;
  end if;

  -- ── Phase 1: categories ──────────────────────────────────────────
  -- Must precede prompts. Note this loop grants only categories with NO
  -- grant row; a category the user deleted has a grant with a null
  -- user_category_id and is deliberately skipped here, so deleting one
  -- sticks. The one exception is phase 4's re-grant — see there.
  for r in
    select c.id, c.slug, c.name, c.description, c.color, c.position
    from categories c
    where c.is_curated
      and not exists (
        select 1 from category_grants g
        where g.user_id = v_user and g.catalog_category_id = c.id
      )
    order by c.position, c.slug
  loop
    -- categories.slug is unique per user, so a later catalog addition can
    -- collide with something the user already created themselves. Same
    -- suffix-retry the prompt loop below uses.
    v_slug   := r.slug;
    v_suffix := 1;
    while exists (select 1 from categories x where x.user_id = v_user and x.slug = v_slug) loop
      v_suffix := v_suffix + 1;
      v_slug   := r.slug || '-' || v_suffix;
    end loop;

    insert into categories (
      user_id, slug, name, description, color, position, is_curated
    ) values (
      v_user, v_slug, r.name, r.description, r.color, r.position, false
    )
    returning id into v_new_id;

    insert into category_grants (user_id, catalog_category_id, user_category_id)
    values (v_user, r.id, v_new_id);
  end loop;

  -- ── Phase 2: prompts ─────────────────────────────────────────────
  for r in
    select
      p.id, p.slug, p.title, p.purpose, p.body, p.notes,
      p.sequence, p.sequence_step,
      (
        select cv.id from catalog_versions cv
        where cv.catalog_prompt_id = p.id
        order by cv.created_at desc
        limit 1
      ) as latest_version_id
    from prompts p
    where p.is_curated
      and p.published
      and not exists (
        select 1 from catalog_grants g
        where g.user_id = v_user and g.catalog_prompt_id = p.id
      )
    order by p.added
  loop
    v_slug   := r.slug;
    v_suffix := 1;
    while exists (select 1 from prompts x where x.user_id = v_user and x.slug = v_slug) loop
      v_suffix := v_suffix + 1;
      v_slug   := r.slug || '-' || v_suffix;
    end loop;

    insert into prompts (
      user_id, slug, title, purpose, body, notes,
      sequence, sequence_step, is_curated, published, is_archived
    ) values (
      v_user, v_slug, r.title, r.purpose, r.body, r.notes,
      r.sequence, r.sequence_step, false, false, false
    )
    returning id into v_new_id;

    insert into catalog_grants (
      user_id, catalog_prompt_id, user_prompt_id, granted_version_id
    ) values (
      v_user, r.id, v_new_id, r.latest_version_id
    );

    v_count := v_count + 1;
  end loop;

  -- ── Phase 3: depends_on remap (unchanged from 0004) ──────────────
  update prompts up
     set depends_on = g_dep.user_prompt_id
    from catalog_grants g_own
    join prompts cat on cat.id = g_own.catalog_prompt_id
    join catalog_grants g_dep
      on g_dep.user_id = v_user
     and g_dep.catalog_prompt_id = cat.depends_on
   where g_own.user_id = v_user
     and up.id = g_own.user_prompt_id
     and cat.depends_on is not null
     and up.depends_on is distinct from g_dep.user_prompt_id;

  -- ── Phase 4a: re-grant categories a newly copied prompt needs ────
  -- The drift case (BUILD_BRIEF_v6.md §7.2). A user who deleted `research`
  -- has a grant row with user_category_id = null, so phase 1 correctly left
  -- it alone. But if the admin then publishes a prompt filed under
  -- `research`, that copy has nothing to point at and would land with zero
  -- categories, breaking the rule section 3 exists to hold.
  --
  -- Policy: re-create the category. The alternatives are worse — a special
  -- undeletable "Uncategorised" row is a whole new concept with its own edge
  -- cases, skipping the prompt means a user who deleted one category
  -- silently stops receiving catalog prompts, and letting it land bare
  -- abandons the rule. Re-granting is at least visible: the category
  -- reappears in the sidebar at the same moment as the prompt that needed it.
  for r in
    select distinct cc.id, cc.slug, cc.name, cc.description, cc.color, cc.position
    from catalog_grants g_own
    join prompt_categories pc on pc.prompt_id = g_own.catalog_prompt_id
    join categories cc        on cc.id = pc.category_id
    join category_grants cg   on cg.user_id = v_user and cg.catalog_category_id = cc.id
    where g_own.user_id = v_user
      and g_own.user_prompt_id is not null
      and cg.user_category_id is null
    order by cc.position, cc.slug
  loop
    v_slug   := r.slug;
    v_suffix := 1;
    while exists (select 1 from categories x where x.user_id = v_user and x.slug = v_slug) loop
      v_suffix := v_suffix + 1;
      v_slug   := r.slug || '-' || v_suffix;
    end loop;

    insert into categories (
      user_id, slug, name, description, color, position, is_curated
    ) values (
      v_user, v_slug, r.name, r.description, r.color, r.position, false
    )
    returning id into v_new_id;

    update category_grants
       set user_category_id = v_new_id
     where user_id = v_user and catalog_category_id = r.id;
  end loop;

  -- ── Phase 4b: map copied prompts onto the caller's categories ────
  -- Set-based rather than per-prompt, and safe to run over every grant the
  -- caller holds rather than only this batch: ON CONFLICT DO NOTHING makes
  -- it idempotent, and running it wide is what makes the function
  -- self-healing after a partial failure — the same property the rest of
  -- ensure_seeded() has.
  --
  -- It deliberately does NOT re-add a category the user removed from their
  -- own copy: that would need a "was it ever there" record, which is exactly
  -- the three-way merge machinery categories don't have. Only rows whose
  -- prompt has no categories at all get repopulated, which is the one case
  -- that violates an invariant rather than expressing a preference.
  insert into prompt_categories (prompt_id, category_id)
  select g_own.user_prompt_id, cg.user_category_id
  from catalog_grants g_own
  join prompt_categories pc on pc.prompt_id = g_own.catalog_prompt_id
  join category_grants cg
    on cg.user_id = v_user
   and cg.catalog_category_id = pc.category_id
  where g_own.user_id = v_user
    and g_own.user_prompt_id is not null
    and cg.user_category_id is not null
    and not exists (
      select 1 from prompt_categories mine
      where mine.prompt_id = g_own.user_prompt_id
    )
  on conflict (prompt_id, category_id) do nothing;

  return v_count;
end;
$$;

grant execute on function ensure_seeded() to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 9. Versioning and static rebuilds now that categories live elsewhere
-- ════════════════════════════════════════════════════════════════════
-- Both 0004's version trigger and 0005's rebuild trigger watched
-- prompts.categories. That column is about to disappear, and a plpgsql
-- function body is resolved at run time, so leaving either of them alone
-- would turn every catalog write into an error the moment section 10 runs.
--
-- Worse, they'd be wrong rather than merely broken: a category change is now
-- an INSERT/DELETE on prompt_categories, which those triggers never see at
-- all. So each needs a companion trigger on the join table.

-- 9a. Current category slugs for a prompt, as the text[] snapshot
--     catalog_versions has always stored. Slugs, not ids, on purpose: a
--     version is compared against a *user's* copy during merge (v5 §6.3),
--     and the two hold different category ids for the same category. Slug is
--     the only key that means the same thing on both sides.
create or replace function prompt_category_slugs(p_prompt_id uuid)
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(c.slug order by c.position, c.slug), '{}'::text[])
  from prompt_categories pc
  join categories c on c.id = pc.category_id
  where pc.prompt_id = p_prompt_id;
$$;

-- 9b. One writer for catalog_versions, called from both triggers.
--
--     The dedupe guard is new and earns its place: a single logical edit in
--     the app is now up to three statements (UPDATE prompts, DELETE then
--     INSERT prompt_categories), each of which would otherwise write its own
--     version row. Comparing against the latest version collapses that back
--     to one row per actual content change, which is what v5 §6.2 assumes
--     when it says a version is "an exact record of the content each user
--     was handed".
create or replace function write_catalog_version_for(
  p_prompt_id  uuid,
  p_notifiable boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
-- `v_`-prefixed record variables, not `p`/`last`: plpgsql substitutes
-- variable names into the SQL it runs, so a variable sharing a name with a
-- table alias (`p`) or a keyword (`last`, as in NULLS LAST) is a silent
-- ambiguity waiting for someone to add an alias to a query below.
declare
  v_p    record;
  v_last record;
  v_cats text[];
begin
  select pr.id, pr.title, pr.purpose, pr.body, pr.notes, pr.is_curated, pr.published
    into v_p
  from prompts pr where pr.id = p_prompt_id;

  if not found or not v_p.is_curated or not v_p.published then
    return;
  end if;

  v_cats := prompt_category_slugs(p_prompt_id);

  select cv.title, cv.purpose, cv.body, cv.notes, cv.categories
    into v_last
  from catalog_versions cv
  where cv.catalog_prompt_id = p_prompt_id
  order by cv.created_at desc
  limit 1;

  if found
     and v_last.title      is not distinct from v_p.title
     and v_last.purpose    is not distinct from v_p.purpose
     and v_last.body       is not distinct from v_p.body
     and v_last.notes      is not distinct from v_p.notes
     and v_last.categories is not distinct from v_cats
  then
    return; -- nothing actually changed
  end if;

  insert into catalog_versions (
    catalog_prompt_id, title, categories, purpose, body, notes, notifiable
  ) values (
    p_prompt_id, v_p.title, v_cats, v_p.purpose, v_p.body, v_p.notes, p_notifiable
  );
end;
$$;

-- 9c. The prompts-row version trigger, minus its categories comparison.
create or replace function write_catalog_version() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed    boolean;
  v_notifiable boolean;
begin
  if not new.is_curated or not new.published then
    return new;
  end if;

  -- First publish (or an insert that arrives already published).
  if tg_op = 'INSERT' or not old.published then
    perform write_catalog_version_for(new.id, true);
    return new;
  end if;

  v_changed :=
       new.title   is distinct from old.title
    or new.purpose is distinct from old.purpose
    or new.body    is distinct from old.body
    or new.notes   is distinct from old.notes;

  if not v_changed then
    return new;
  end if;

  -- Significant fields only (v5 §6.2). notes alone rides along with the next
  -- significant change rather than notifying on its own — as do categories,
  -- now handled by 9d.
  v_notifiable :=
       new.title   is distinct from old.title
    or new.purpose is distinct from old.purpose
    or new.body    is distinct from old.body;

  perform write_catalog_version_for(new.id, v_notifiable);
  return new;
end;
$$;

-- 9d. Category changes on a published catalog prompt.
--
--     notifiable => false, unconditionally: v5 §6.2 classifies categories as
--     a minor field, so a recategorisation rides along with the next
--     significant edit rather than notifying on its own. A version row is
--     still written, which is the point of that section — a user seeded
--     between two edits must have a grant pointing at exactly what they were
--     handed, or the merge later misreads the difference as *their* edit.
--
--     Statement-level: swapping a prompt's categories is a multi-row change,
--     and a row-level trigger would write a version per category.
create or replace function prompt_categories_write_version() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then
    for r in select distinct prompt_id from oldtab loop
      perform write_catalog_version_for(r.prompt_id, false);
    end loop;
  else
    for r in select distinct prompt_id from newtab loop
      perform write_catalog_version_for(r.prompt_id, false);
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists prompt_categories_write_version_ins on prompt_categories;
create trigger prompt_categories_write_version_ins
  after insert on prompt_categories
  referencing new table as newtab
  for each statement execute function prompt_categories_write_version();

drop trigger if exists prompt_categories_write_version_del on prompt_categories;
create trigger prompt_categories_write_version_del
  after delete on prompt_categories
  referencing old table as oldtab
  for each statement execute function prompt_categories_write_version();

-- 9e. 0005's rebuild trigger, minus its categories comparison.
create or replace function prompts_static_rebuild()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected integer := 0;
begin
  if tg_op = 'INSERT' then
    select count(*) into v_affected
    from newtab n
    where n.is_curated and n.published;

  elsif tg_op = 'DELETE' then
    select count(*) into v_affected
    from oldtab o
    where o.is_curated and o.published;

  elsif tg_op = 'UPDATE' then
    select count(*) into v_affected
    from newtab n
    join oldtab o on o.id = n.id
    where
      (n.is_curated and n.published) is distinct from (o.is_curated and o.published)
      or (
        n.is_curated and n.published and (
             n.title         is distinct from o.title
          or n.slug          is distinct from o.slug
          or n.purpose       is distinct from o.purpose
          or n.body          is distinct from o.body
          or n.notes         is distinct from o.notes
          or n.sequence      is distinct from o.sequence
          or n.sequence_step is distinct from o.sequence_step
        )
      );
  end if;

  if v_affected > 0 then
    perform request_static_rebuild(format('%s on prompts (%s row(s))', tg_op, v_affected));
  end if;

  return null;
end;
$$;

-- 9f. Rebuild when a published catalog prompt's categories change.
create or replace function prompt_categories_static_rebuild()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected integer := 0;
begin
  if tg_op = 'DELETE' then
    select count(*) into v_affected
    from oldtab o join prompts p on p.id = o.prompt_id
    where p.is_curated and p.published;
  else
    select count(*) into v_affected
    from newtab n join prompts p on p.id = n.prompt_id
    where p.is_curated and p.published;
  end if;

  if v_affected > 0 then
    perform request_static_rebuild(
      format('%s on prompt_categories (%s row(s))', tg_op, v_affected));
  end if;

  return null;
end;
$$;

drop trigger if exists prompt_categories_static_rebuild_ins on prompt_categories;
create trigger prompt_categories_static_rebuild_ins
  after insert on prompt_categories
  referencing new table as newtab
  for each statement execute function prompt_categories_static_rebuild();

drop trigger if exists prompt_categories_static_rebuild_del on prompt_categories;
create trigger prompt_categories_static_rebuild_del
  after delete on prompt_categories
  referencing old table as oldtab
  for each statement execute function prompt_categories_static_rebuild();

-- 9g. Rebuild when a CATALOG category itself changes.
--
--     The one in this section most likely to be forgotten, and the one whose
--     absence is hardest to spot: without it, everything keeps working
--     except that an admin recolouring or renaming a category never reaches
--     anonymous visitors — indefinitely, and with no error anywhere. Colour
--     is inlined into every badge on every static page (BUILD_BRIEF_v6.md
--     §6.4), so a recolour changes essentially the whole site.
create or replace function categories_static_rebuild()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected integer := 0;
begin
  if tg_op = 'INSERT' then
    select count(*) into v_affected from newtab n where n.is_curated;

  elsif tg_op = 'DELETE' then
    select count(*) into v_affected from oldtab o where o.is_curated;

  elsif tg_op = 'UPDATE' then
    select count(*) into v_affected
    from newtab n join oldtab o on o.id = n.id
    where n.is_curated is distinct from o.is_curated
       or (n.is_curated and (
              n.slug        is distinct from o.slug
           or n.name        is distinct from o.name
           or n.description is distinct from o.description
           or n.color       is distinct from o.color
           or n.position    is distinct from o.position
          ));
  end if;

  if v_affected > 0 then
    perform request_static_rebuild(format('%s on categories (%s row(s))', tg_op, v_affected));
  end if;

  return null;
end;
$$;

drop trigger if exists categories_static_rebuild_ins on categories;
create trigger categories_static_rebuild_ins
  after insert on categories
  referencing new table as newtab
  for each statement execute function categories_static_rebuild();

drop trigger if exists categories_static_rebuild_upd on categories;
create trigger categories_static_rebuild_upd
  after update on categories
  referencing old table as oldtab new table as newtab
  for each statement execute function categories_static_rebuild();

drop trigger if exists categories_static_rebuild_del on categories;
create trigger categories_static_rebuild_del
  after delete on categories
  referencing old table as oldtab
  for each statement execute function categories_static_rebuild();

-- ════════════════════════════════════════════════════════════════════
-- 10. Drop the hardcoded vocabulary  (destructive — runs last)
-- ════════════════════════════════════════════════════════════════════
-- The CHECK constraint listed all nine slugs literally. A CHECK cannot
-- validate against a dynamic, per-user list, so integrity moves to
-- prompt_categories' foreign keys — which are strictly stronger: the old
-- constraint could only confirm a slug was spelled correctly, not that the
-- category it named existed for that user.
alter table prompts drop constraint if exists prompts_categories_valid;
alter table prompts drop column if exists categories;

-- catalog_versions.categories is NOT dropped. It is a snapshot of what a
-- user was handed, written by write_catalog_version_for() from the join
-- table, and the merge screen (v5 §6) still needs it.
