-- Pre-migration audit for 0004_owned_copies.sql (BUILD_BRIEF_v5.md §8 step 2)
--
-- READ-ONLY. Run this in the Supabase SQL Editor *before* 0004, and act on
-- what it shows. Everything it inspects (source_prompt_id, edited_from_source,
-- prompt_overrides) is dropped by 0004, so this cannot be run afterwards.
--
-- Nothing here changes data. Deleting leftover test artefacts is a judgement
-- call — query 6 gives you the statement, commented out, once you have looked
-- at query 2.

-- ── 1. Accounts ─────────────────────────────────────────────────────
-- Expected: exactly one, and it is an admin. If any non-admin accounts
-- exist, re-read BUILD_BRIEF_v5.md §8 before running 0004 — they will be
-- seeded lazily by ensure_seeded() rather than by the migration.
select
  u.id,
  u.email,
  (a.user_id is not null) as is_admin,
  u.created_at
from auth.users u
left join admins a on a.user_id = u.id
order by u.created_at;

-- ── 2. Existing forks ───────────────────────────────────────────────
-- These become ordinary personal prompts under the new model, sitting in
-- your library alongside the catalog. Most are expected to be test artefacts
-- from the fork-on-edit model. Decide per row: keep, or delete.
select
  f.id,
  f.title              as fork_title,
  f.slug               as fork_slug,
  f.edited_from_source as diverged_from_original,
  src.title            as original_title,
  (src.id is null)     as original_missing,
  f.added,
  f.updated
from prompts f
left join prompts src on src.id = f.source_prompt_id
where f.source_prompt_id is not null
order by f.updated desc;

-- ── 3. Override rows ────────────────────────────────────────────────
-- fork_prompt_id set  = default archived because it was edited (forked).
-- fork_prompt_id null = default archived deliberately, without editing.
-- Both are discarded by 0004. That is intended for an admin-only project,
-- since admins skip seeding and hold the catalog rows directly.
select
  o.default_prompt_id,
  d.title as default_title,
  o.fork_prompt_id,
  o.is_archived,
  o.created_at
from prompt_overrides o
left join prompts d on d.id = o.default_prompt_id
order by o.created_at;

-- ── 4. Catalog state ────────────────────────────────────────────────
-- Each published row gets a first catalog_versions snapshot in 0004 §5.
-- Drafts get none until they are published.
select
  count(*) filter (where is_curated and published)       as published_catalog,
  count(*) filter (where is_curated and not published)   as draft_catalog,
  count(*) filter (where not is_curated)                 as personal_prompts,
  count(*)                                               as total
from prompts;

-- ── 5. References that would dangle ─────────────────────────────────
-- Favourites and collection entries pointing at a fork you may delete in
-- query 6. The FKs are ON DELETE CASCADE, so these vanish silently with the
-- prompt — this is your chance to notice before that happens.
select 'favorite' as ref_kind, f.title as fork_title, null::text as collection_title
from favorites fav
join prompts f on f.id = fav.prompt_id
where f.source_prompt_id is not null
union all
select 'collection', f.title, c.title
from collection_prompts cp
join prompts f on f.id = cp.prompt_id
join collections c on c.id = cp.collection_id
where f.source_prompt_id is not null;

-- ── 6. Cleanup (review query 2 first, then uncomment) ───────────────
-- Deletes every fork. Only run this if query 2 shows nothing worth keeping.
-- To keep some, delete by id instead.
--
-- delete from prompts where source_prompt_id is not null;
--
-- delete from prompts where id in ('<paste ids from query 2>');
