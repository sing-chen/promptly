-- Promptly account tier — schema + RLS
-- Extends BUILD_BRIEF_v4.md §4 with an admin-curated default-prompt catalog
-- (single source of truth for all users, anonymous or not — see
-- supabase/README.md). Run once against a fresh Supabase project (SQL
-- Editor, or `supabase db push` once the project is linked).

-- ── admins ───────────────────────────────────────────────────────────
-- Deliberately minimal: membership, not roles/permissions. Seed your own
-- row manually after your first sign-up (SQL Editor, service-role context
-- bypasses RLS):
--   insert into admins (user_id) values ('<your auth.users.id>');
create table admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table admins enable row level security;

-- Lets a policy elsewhere check "is the calling user an admin?" via EXISTS
-- against their own row — does not expose the rest of the admin list.
create policy "admins_self_read" on admins
  for select
  using (user_id = auth.uid());

-- ── prompts ─────────────────────────────────────────────────────────
-- This table holds both admin-authored default ("site-level") prompts and
-- every user's own prompts, including their edited forks of defaults.
-- There is no separate markdown catalog — this table is the single source
-- of default-prompt content for every tier, anonymous included (see
-- supabase/README.md for how the static build and the auth `anon` role
-- both read it).
--
-- - is_curated / published: only a user listed in `admins` may set
--   is_curated=true (enforced in prompts_insert/prompts_update). A row with
--   is_curated=true, published=false is a default prompt being tested —
--   visible only to its admin owner, same as any other private row (this
--   is what lets the admin test in the production UI before release).
--   published=true makes it visible to everyone (prompts_select below) —
--   readable, favoritable, addable to collections — but still editable and
--   deletable only by the admin who owns it.
-- - source_prompt_id: set on a user's fork of a default prompt, pointing
--   at the admin's row it was forked from. NULL for self-authored prompts
--   and for admin's own default rows. Always a live reference — the admin
--   may keep iterating the original after someone forks it, and a fork's
--   "view original" reads source_prompt_id's current content, not a
--   snapshot.
-- - edited_from_source: auto-set true by the mark_edited_from_source
--   trigger the moment a fork's content diverges from what it started as —
--   a simple "edited from the original" badge, not a diff.
-- - is_archived: a plain per-row toggle for the owner's own list view.
--   Distinct from prompt_overrides.is_archived below, which tracks a
--   user's relationship to a *default* prompt they don't own.
create table prompts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  slug               text not null,
  title              text not null,
  categories         text[] not null default '{}',
  purpose            text,
  body               text not null,
  notes              text,
  sequence           text,
  sequence_step      int,
  depends_on         uuid references prompts (id) on delete set null,
  example_output     text,
  is_curated         boolean not null default false,
  published          boolean not null default false,
  source_prompt_id   uuid references prompts (id) on delete set null,
  edited_from_source boolean not null default false,
  is_archived        boolean not null default false,
  added              timestamptz not null default now(),
  updated            timestamptz not null default now(),
  unique (user_id, slug),
  -- lib/schema.mjs CATEGORIES vocabulary — kept in sync manually; a category
  -- added there must be added here too (see supabase/README.md).
  constraint prompts_categories_valid check (
    categories <@ array[
      'writing', 'code', 'marketing', 'research', 'data-analysis',
      'product', 'education', 'creative', 'ops-admin'
    ]::text[]
  ),
  constraint prompts_published_requires_curated check (not published or is_curated)
);

create index prompts_user_id_idx on prompts (user_id);
create index prompts_depends_on_idx on prompts (depends_on);
create index prompts_source_prompt_id_idx on prompts (source_prompt_id);
create index prompts_curated_published_idx on prompts (is_curated, published) where is_curated;

-- ── prompt_overrides ─────────────────────────────────────────────────
-- Tracks a signed-in user's own relationship to a specific *default*
-- (is_curated) prompt they don't own — explicit per-user state, separate
-- from the prompts table, so it works whether or not they've forked it:
-- - Archiving a default without editing it: insert/update a row with
--   is_archived=true, fork_prompt_id=null.
-- - Forking (editing) a default: the app creates the fork in `prompts`
--   (user_id=them, source_prompt_id=the default's id), then upserts this
--   row with fork_prompt_id set to the new fork and is_archived=true —
--   "once they edit them, the original is archived [in their view]," but
--   still reachable via fork_prompt_id -> source_prompt_id.
-- No row here at all = default shown normally, unarchived, unforked.
create table prompt_overrides (
  user_id           uuid not null references auth.users (id) on delete cascade,
  default_prompt_id uuid not null references prompts (id) on delete cascade,
  fork_prompt_id    uuid references prompts (id) on delete set null,
  is_archived       boolean not null default false,
  created_at        timestamptz not null default now(),
  primary key (user_id, default_prompt_id)
  -- default_prompt_id is expected to reference an is_curated row; not
  -- enforced by a DB constraint (would need a trigger for a cross-row
  -- check) since a malformed row here only ever affects its own owner's
  -- view, not anyone else's data or access.
);

create unique index prompt_overrides_fork_prompt_id_key
  on prompt_overrides (fork_prompt_id) where fork_prompt_id is not null;

-- ── collections ─────────────────────────────────────────────────────
create table collections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  slug        text not null,
  title       text not null,
  description text,
  unique (user_id, slug)
);

create index collections_user_id_idx on collections (user_id);

-- ── collection_prompts (join table, no user_id of its own) ─────────
create table collection_prompts (
  collection_id uuid not null references collections (id) on delete cascade,
  prompt_id     uuid not null references prompts (id) on delete cascade,
  primary key (collection_id, prompt_id)
);

-- ── favorites ────────────────────────────────────────────────────────
create table favorites (
  user_id   uuid not null references auth.users (id) on delete cascade,
  prompt_id uuid not null references prompts (id) on delete cascade,
  primary key (user_id, prompt_id)
);

create index favorites_prompt_id_idx on favorites (prompt_id);

-- ── updated_at maintenance ───────────────────────────────────────────
create function set_updated_at() returns trigger as $$
begin
  new.updated = now();
  return new;
end;
$$ language plpgsql;

create trigger prompts_set_updated_at
  before update on prompts
  for each row execute function set_updated_at();

-- Marks a fork as diverged from its default the moment any content field
-- changes. Only applies to rows that already have (and keep) a
-- source_prompt_id — self-authored prompts and admin's own default rows
-- are untouched by this.
create function mark_edited_from_source() returns trigger as $$
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

create trigger prompts_mark_edited_from_source
  before update on prompts
  for each row execute function mark_edited_from_source();

-- ── RLS ──────────────────────────────────────────────────────────────
-- This is the entire authorization layer (BUILD_BRIEF_v4.md §4) — there is
-- no custom API server in front of Postgres, so every table must have it.

alter table prompts enable row level security;
alter table prompt_overrides enable row level security;
alter table collections enable row level security;
alter table collection_prompts enable row level security;
alter table favorites enable row level security;

-- Visible to: the owner (always, published or not — this is what makes
-- admin draft-testing work), or anyone if it's a published default.
create policy "prompts_select" on prompts
  for select
  using (
    user_id = auth.uid()
    or (is_curated and published)
  );

-- Only admins may set is_curated=true; forks and self-authored prompts
-- must stay is_curated=false regardless of who owns them.
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

create policy "prompt_overrides_owner_all" on prompt_overrides
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "collections_owner_all" on collections
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- collection_prompts has no user_id column: ownership is enforced by
-- requiring the collection to be the caller's own, and the prompt being
-- linked to be either the caller's own (including their forks) or a
-- published default — never someone else's private draft or prompt.
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

-- favorites: same visibility rule as prompts_select — you can favorite
-- your own prompts (including forks) or any published default, but never
-- someone else's private draft.
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

-- ── anonymous read access ────────────────────────────────────────────
-- The static build script (scripts/build.mjs) and, if ever needed, any
-- client-side code queries Supabase as the `anon` role before a user signs
-- in. GRANT is the table-level operation switch; prompts_select above still
-- filters it down to published defaults only — anon can never see a draft
-- or anyone's private prompt regardless of this grant.
grant select on prompts to anon;
grant select, insert, update, delete on prompts to authenticated;
