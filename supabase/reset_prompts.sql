-- Reset all prompt data (BUILD_BRIEF_v5.md)
--
-- Clears the decks so canonical prompts can be seeded into a clean database.
-- Intended for repeated use through pre-release development, whenever
-- accumulated test data stops being useful.
--
-- DESTRUCTIVE and irreversible. Every statement that removes data is
-- commented out — uncomment the section you want. Run the counts first.
--
-- Written for the post-0004 schema. Before 0004, also clear prompt_overrides
-- (it is dropped by that migration, so afterwards it no longer exists).

-- ── Pre-flight: what is actually there ──────────────────────────────
select
  (select count(*) from prompts)                                    as prompts_total,
  (select count(*) from prompts where is_curated and published)     as catalog_published,
  (select count(*) from prompts where is_curated and not published) as catalog_drafts,
  (select count(*) from prompts where not is_curated)               as personal,
  (select count(*) from catalog_versions)                           as versions,
  (select count(*) from catalog_grants)                             as grants,
  (select count(*) from favorites)                                  as favourites,
  (select count(*) from collections)                                as collections,
  (select count(*) from collection_prompts)                         as collection_entries;

-- ── Option A: wipe every prompt ─────────────────────────────────────
-- The usual case before seeding canonical content. TRUNCATE ... CASCADE
-- also clears every table holding a foreign key into prompts —
-- catalog_versions, catalog_grants, favorites, collection_prompts — which is
-- exactly what is wanted, since all of those describe prompts that are about
-- to stop existing.
--
-- `collections` survives (it has no FK to prompts), so collection *shells*
-- remain and simply become empty. Use option C to remove those too.
--
-- truncate table prompts cascade;

-- ── Option B: wipe only personal prompts, keep the catalog ──────────
-- For clearing user-side test data (copies, duplicates, personal prompts)
-- while leaving admin-authored catalog prompts in place. Cascades remove the
-- grants and favourites that pointed at them.
--
-- delete from prompts where not is_curated;

-- ── Option C: also remove collections ───────────────────────────────
-- Run after A or B if empty collection shells are not wanted.
--
-- delete from collections;

-- ── Option D: full reset including accounts ─────────────────────────
-- Deletes every non-admin account. Prompts, grants, favourites and
-- collections cascade away with the user (all reference auth.users with
-- ON DELETE CASCADE). Use when test *accounts* have accumulated too, not
-- just test prompts. Admin accounts are preserved.
--
-- delete from auth.users u
-- where not exists (select 1 from admins a where a.user_id = u.id);

-- ── Verify ──────────────────────────────────────────────────────────
-- Re-run the pre-flight query above. Then seed canonical prompts —
-- seed_default_prompts.sql is the existing template for that, though it
-- predates this model and should be reviewed before reuse.
--
-- Afterwards, rebuild and redeploy so the static site reflects the new
-- catalog: npm run build
