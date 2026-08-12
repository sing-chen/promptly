-- Patch migration: brings an already-applied 0001_init_schema.sql (any
-- earlier revision of it) up to the current target schema — admin
-- draft/publish curation, fork-on-edit, prompt_overrides, and the
-- shared-visibility RLS model. Idempotent: every statement is safe to
-- re-run, so it doesn't matter exactly which prior revision you applied.
--
-- Only run this against a project that already ran an earlier version of
-- 0001_init_schema.sql. A brand-new project should just run the current
-- 0001_init_schema.sql on its own — it already contains everything below.

-- ── admins ───────────────────────────────────────────────────────────
create table if not exists admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table admins enable row level security;

drop policy if exists "admins_self_read" on admins;
create policy "admins_self_read" on admins
  for select
  using (user_id = auth.uid());

-- ── prompts: new columns ────────────────────────────────────────────
alter table prompts add column if not exists is_curated boolean not null default false;
alter table prompts add column if not exists published boolean not null default false;
alter table prompts add column if not exists source_prompt_id uuid references prompts (id) on delete set null;
alter table prompts add column if not exists edited_from_source boolean not null default false;
alter table prompts add column if not exists is_archived boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'prompts_published_requires_curated'
  ) then
    alter table prompts
      add constraint prompts_published_requires_curated check (not published or is_curated);
  end if;
end $$;

create index if not exists prompts_source_prompt_id_idx on prompts (source_prompt_id);
create index if not exists prompts_curated_published_idx on prompts (is_curated, published) where is_curated;

-- ── prompt_overrides (new table) ────────────────────────────────────
create table if not exists prompt_overrides (
  user_id           uuid not null references auth.users (id) on delete cascade,
  default_prompt_id uuid not null references prompts (id) on delete cascade,
  fork_prompt_id    uuid references prompts (id) on delete set null,
  is_archived       boolean not null default false,
  created_at        timestamptz not null default now(),
  primary key (user_id, default_prompt_id)
);

create unique index if not exists prompt_overrides_fork_prompt_id_key
  on prompt_overrides (fork_prompt_id) where fork_prompt_id is not null;

alter table prompt_overrides enable row level security;

drop policy if exists "prompt_overrides_owner_all" on prompt_overrides;
create policy "prompt_overrides_owner_all" on prompt_overrides
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── mark_edited_from_source trigger (new) ───────────────────────────
create or replace function mark_edited_from_source() returns trigger as $$
begin
  if new.source_prompt_id is not null and old.source_prompt_id is not null then
    if new.title is distinct from old.title
      or new.categories is distinct from old.categories
      or new.purpose is distinct from old.purpose
      or new.body is distinct from old.body
      or new.notes is distinct from old.notes
      or new.example_output is distinct from old.example_output
    then
      new.edited_from_source = true;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists prompts_mark_edited_from_source on prompts;
create trigger prompts_mark_edited_from_source
  before update on prompts
  for each row execute function mark_edited_from_source();

-- ── retire sync_curated_prompts() if a prior revision created it ───
-- (superseded by the shared-visibility model — defaults are read live via
-- prompts_select, not copied at sign-up/login.)
drop function if exists sync_curated_prompts();

-- ── RLS: replace prompts policies with the shared-visibility model ─
drop policy if exists "prompts_owner_all" on prompts;
drop policy if exists "prompts_select" on prompts;
drop policy if exists "prompts_insert" on prompts;
drop policy if exists "prompts_update" on prompts;
drop policy if exists "prompts_delete" on prompts;

create policy "prompts_select" on prompts
  for select
  using (
    user_id = auth.uid()
    or (is_curated and published)
  );

create policy "prompts_insert" on prompts
  for insert
  with check (
    user_id = auth.uid()
    and (not is_curated or exists (select 1 from admins a where a.user_id = auth.uid()))
  );

create policy "prompts_update" on prompts
  for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (not is_curated or exists (select 1 from admins a where a.user_id = auth.uid()))
  );

create policy "prompts_delete" on prompts
  for delete
  using (user_id = auth.uid());

-- ── RLS: collection_prompts / favorites — allow published defaults too
drop policy if exists "collection_prompts_owner_all" on collection_prompts;
create policy "collection_prompts_owner_all" on collection_prompts
  for all
  using (
    exists (select 1 from collections c where c.id = collection_id and c.user_id = auth.uid())
    and exists (
      select 1 from prompts p
      where p.id = prompt_id and (p.user_id = auth.uid() or (p.is_curated and p.published))
    )
  )
  with check (
    exists (select 1 from collections c where c.id = collection_id and c.user_id = auth.uid())
    and exists (
      select 1 from prompts p
      where p.id = prompt_id and (p.user_id = auth.uid() or (p.is_curated and p.published))
    )
  );

drop policy if exists "favorites_owner_all" on favorites;
create policy "favorites_owner_all" on favorites
  for all
  using (
    user_id = auth.uid()
    and exists (
      select 1 from prompts p
      where p.id = prompt_id and (p.user_id = auth.uid() or (p.is_curated and p.published))
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from prompts p
      where p.id = prompt_id and (p.user_id = auth.uid() or (p.is_curated and p.published))
    )
  );

-- ── anon read access ─────────────────────────────────────────────────
grant select on prompts to anon;
grant select, insert, update, delete on prompts to authenticated;
