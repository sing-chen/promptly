-- Promptly — owned copies (BUILD_BRIEF_v5.md)
--
-- Replaces the fork-on-edit / merged-catalog model with owned copies:
-- signing up copies the whole published catalog into your library, and from
-- then on every prompt you can see is genuinely yours. The catalog itself
-- survives unchanged — it still feeds the anonymous static build — but
-- authenticated users hold copies of it rather than references to it.
--
-- Run once, in the Supabase SQL Editor, against the live project. Sections
-- 1-4 are additive and safe on their own; section 5 backfills; section 6 is
-- the destructive part and runs last, so a failure earlier leaves the old
-- model intact.
--
-- Assumes 0001 (+ 0002, 0003 patches) have already been applied.

-- ════════════════════════════════════════════════════════════════════
-- 0. Safety check
-- ════════════════════════════════════════════════════════════════════
-- BUILD_BRIEF_v5.md §8 is written for a project whose only account is the
-- admin's own. If that stops being true, the per-user steps in §8 (create
-- copies, write grants, remap favourites/collections onto those copies)
-- become necessary and this migration is NOT sufficient on its own.
do $$
declare
  v_others integer;
begin
  select count(*) into v_others
  from auth.users u
  where not exists (select 1 from admins a where a.user_id = u.id);

  if v_others > 0 then
    raise warning
      'Found % non-admin account(s). This migration seeds nobody retroactively; '
      'they will be seeded lazily by ensure_seeded() on their next visit, which '
      'is correct — but re-read BUILD_BRIEF_v5.md §8 before relying on that.',
      v_others;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- 1. catalog_versions — history of catalog prompts
-- ════════════════════════════════════════════════════════════════════
-- One row per content change to a *published* catalog prompt. Scales with
-- the catalog (a few hundred rows, ever), not with users — which is what
-- makes three-way merge affordable (BUILD_BRIEF_v5.md §6.3). Snapshotting
-- the original alongside every user's copy would have doubled storage.
--
-- notifiable: whether this change is significant enough to tell users
-- about (title/purpose/body = yes; notes/categories alone = no, §6.2).
-- It gates the *notification* only. A version row is written for every
-- change regardless, so catalog_grants.granted_version_id is always an
-- exact record of the content a user was handed — see §6.2 for the
-- false-conflict bug that appears if minor edits go unversioned.
create table if not exists catalog_versions (
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

create index if not exists catalog_versions_prompt_idx
  on catalog_versions (catalog_prompt_id, created_at desc);

alter table catalog_versions enable row level security;

-- Readable by anyone who can see the parent prompt (mirrors prompts_select):
-- the owning admin always, plus every user for a published catalog prompt —
-- the latter is what lets a user's merge screen read the version they were
-- granted and compare it against the catalog's current content.
drop policy if exists "catalog_versions_select" on catalog_versions;
create policy "catalog_versions_select" on catalog_versions
  for select
  using (
    exists (
      select 1 from prompts p
      where p.id = catalog_prompt_id
        and (p.user_id = auth.uid() or (p.is_curated and p.published))
    )
  );

-- The owning admin may correct `notifiable` after the fact — this is the
-- manual override (§6.2): push a notes-only fix deliberately, or release a
-- body typo-fix quietly. Rows are written by the trigger in section 3, not
-- by clients, so there is no INSERT policy here on purpose.
drop policy if exists "catalog_versions_admin_update" on catalog_versions;
create policy "catalog_versions_admin_update" on catalog_versions
  for update
  using (
    exists (select 1 from prompts p where p.id = catalog_prompt_id and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from prompts p where p.id = catalog_prompt_id and p.user_id = auth.uid())
  );

-- ════════════════════════════════════════════════════════════════════
-- 2. catalog_grants — private bookkeeping
-- ════════════════════════════════════════════════════════════════════
-- Never read by the UI for display (BUILD_BRIEF_v5.md §3.4). It answers
-- three questions: has this user already received this catalog prompt,
-- which of their rows is it, and which version were they handed.
--
-- user_prompt_id's `on delete set null` is load-bearing: if the user
-- deletes their copy, the grant row survives so seeding never resurrects
-- it, while the pointer clears so update-pushes correctly skip it.
create table if not exists catalog_grants (
  user_id            uuid not null references auth.users (id) on delete cascade,
  catalog_prompt_id  uuid not null references prompts (id) on delete cascade,
  user_prompt_id     uuid references prompts (id) on delete set null,
  granted_version_id uuid references catalog_versions (id),
  granted_at         timestamptz not null default now(),
  primary key (user_id, catalog_prompt_id)
);

create index if not exists catalog_grants_user_prompt_idx
  on catalog_grants (user_prompt_id);

alter table catalog_grants enable row level security;

drop policy if exists "catalog_grants_owner_all" on catalog_grants;
create policy "catalog_grants_owner_all" on catalog_grants
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════
-- 3. Version-writing trigger
-- ════════════════════════════════════════════════════════════════════
-- Writes a catalog_versions row on first publish and on every subsequent
-- content change while published. Draft edits produce nothing — iteration
-- before release is free and notifies nobody (§6.4).
--
-- SECURITY DEFINER because catalog_versions has no INSERT policy: rows come
-- from this trigger, never from a client.
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
    insert into catalog_versions (
      catalog_prompt_id, title, categories, purpose, body, notes, notifiable
    ) values (
      new.id, new.title, new.categories, new.purpose, new.body, new.notes, true
    );
    return new;
  end if;

  v_changed :=
       new.title      is distinct from old.title
    or new.purpose    is distinct from old.purpose
    or new.body       is distinct from old.body
    or new.notes      is distinct from old.notes
    or new.categories is distinct from old.categories;

  if not v_changed then
    return new;
  end if;

  -- Significant fields only (§6.2). notes/categories alone ride along with
  -- the next significant change rather than notifying on their own.
  v_notifiable :=
       new.title   is distinct from old.title
    or new.purpose is distinct from old.purpose
    or new.body    is distinct from old.body;

  insert into catalog_versions (
    catalog_prompt_id, title, categories, purpose, body, notes, notifiable
  ) values (
    new.id, new.title, new.categories, new.purpose, new.body, new.notes, v_notifiable
  );

  return new;
end;
$$;

drop trigger if exists prompts_write_catalog_version on prompts;
create trigger prompts_write_catalog_version
  after insert or update on prompts
  for each row execute function write_catalog_version();

-- ════════════════════════════════════════════════════════════════════
-- 4. ensure_seeded() — pull-based distribution
-- ════════════════════════════════════════════════════════════════════
-- Copies every published catalog prompt the caller has no grant for, and
-- records the grant against that prompt's current latest version.
--
-- One function covers both cases (BUILD_BRIEF_v5.md §4): at signup no
-- grants exist so the whole catalog is copied, and a newly published
-- catalog prompt is picked up by each user on their next visit. That means
-- no publish-time fan-out job and no batch writes across all users —
-- publishing stays a single row update. It is also self-healing: a partial
-- failure is repaired on the next call.
--
-- Returns the number of prompts newly granted.
create or replace function ensure_seeded() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_count  integer := 0;
  v_slug   text;
  v_suffix integer;
  v_new_id uuid;
  r        record;
begin
  if v_user is null then
    return 0;
  end if;

  -- Admins hold the catalog rows themselves; copying would give them two of
  -- everything, one of which would silently drift from what everyone else is
  -- served (§4). Their library *is* the catalog.
  if exists (select 1 from admins a where a.user_id = v_user) then
    return 0;
  end if;

  for r in
    select
      p.id, p.slug, p.title, p.categories, p.purpose, p.body, p.notes,
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
    -- prompts.slug is unique per user. At signup there is nothing to collide
    -- with, but a later publish can collide with a personal prompt the user
    -- already wrote — same retry shape createWithUniqueSlug() uses client-side.
    v_slug   := r.slug;
    v_suffix := 1;
    while exists (select 1 from prompts x where x.user_id = v_user and x.slug = v_slug) loop
      v_suffix := v_suffix + 1;
      v_slug   := r.slug || '-' || v_suffix;
    end loop;

    insert into prompts (
      user_id, slug, title, categories, purpose, body, notes,
      sequence, sequence_step, is_curated, published, is_archived
    ) values (
      v_user, v_slug, r.title, r.categories, r.purpose, r.body, r.notes,
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

  -- Second pass: depends_on is a FK between prompt rows, so a copy must
  -- point at *this user's* copy of the dependency, not the catalog's. Only
  -- resolvable once every copy in this batch exists.
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

  return v_count;
end;
$$;

grant execute on function ensure_seeded() to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 5. Backfill
-- ════════════════════════════════════════════════════════════════════
-- Every already-published catalog prompt needs a first version, otherwise
-- grants written from here on would have a null granted_version_id and the
-- merge in Pass 2 would have no base to compare against.
insert into catalog_versions (
  catalog_prompt_id, title, categories, purpose, body, notes, notifiable, created_at
)
select p.id, p.title, p.categories, p.purpose, p.body, p.notes, true, p.updated
from prompts p
where p.is_curated
  and p.published
  and not exists (
    select 1 from catalog_versions cv where cv.catalog_prompt_id = p.id
  );

-- Existing forks become ordinary personal prompts. Deliberately does NOT
-- delete anything — BUILD_BRIEF_v5.md §8 step 2 calls for an audit of these
-- (most are expected to be test artefacts from the old model), and that is a
-- judgement call to make against real data, not something to bury in a
-- migration. The columns are dropped in section 6 regardless; this just makes
-- the intent explicit for anything that is kept.
update prompts
   set source_prompt_id   = null,
       edited_from_source = false
 where source_prompt_id is not null;

-- ════════════════════════════════════════════════════════════════════
-- 6. Drop the fork machinery  (destructive — runs last)
-- ════════════════════════════════════════════════════════════════════
drop trigger if exists prompts_mark_edited_from_source on prompts;
drop function if exists mark_edited_from_source();

drop table if exists prompt_overrides;

drop index if exists prompts_source_prompt_id_idx;
alter table prompts drop column if exists source_prompt_id;
alter table prompts drop column if exists edited_from_source;

-- prompts.is_archived stays. It has existed since 0001 but was never used by
-- app code (all archiving went through prompt_overrides); it now becomes the
-- real mechanism for archiving your own prompt (BUILD_BRIEF_v5.md §3.2).
