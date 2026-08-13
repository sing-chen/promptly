-- Reset all prompt data (BUILD_BRIEF_v5.md)
--
-- Clears the decks so canonical prompts can be seeded into a clean database.
-- Intended for repeated use through pre-release development, whenever
-- accumulated test data stops being useful.
--
-- DESTRUCTIVE and irreversible. Every statement that removes data is
-- commented out — uncomment the section you want. Run the counts first.
--
-- Written for the post-0006 schema. Before 0004, also clear prompt_overrides
-- (it is dropped by that migration, so afterwards it no longer exists).
--
-- ORDER MATTERS since 0006. Prompts must go before categories, never the
-- other way round: 0006 §3's trigger refuses any delete that would leave a
-- prompt with no categories, so clearing categories while prompts still
-- reference them raises "Every prompt must have at least one category".
-- Option A sidesteps this entirely — TRUNCATE fires no row or transition
-- triggers — but options B and E have to run in that order.

-- ── Pre-flight: what is actually there ──────────────────────────────
select
  (select count(*) from prompts)                                    as prompts_total,
  (select count(*) from prompts where is_curated and published)     as catalog_published,
  (select count(*) from prompts where is_curated and not published) as catalog_drafts,
  (select count(*) from prompts where not is_curated)               as personal,
  (select count(*) from catalog_versions)                           as versions,
  (select count(*) from catalog_grants)                             as grants,
  (select count(*) from categories where is_curated)                as catalog_categories,
  (select count(*) from categories where not is_curated)            as user_categories,
  (select count(*) from category_grants)                            as category_grants,
  (select count(*) from prompt_categories)                          as category_assignments,
  (select count(*) from favorites)                                  as favourites,
  (select count(*) from collections)                                as collections,
  (select count(*) from collection_prompts)                         as collection_entries;

-- ── Option A: wipe every prompt ─────────────────────────────────────
-- The usual case before seeding canonical content. TRUNCATE ... CASCADE
-- also clears every table holding a foreign key into prompts —
-- catalog_versions, catalog_grants, favorites, collection_prompts and (since
-- 0006) prompt_categories — which is exactly what is wanted, since all of
-- those describe prompts that are about to stop existing.
--
-- `collections` survives (it has no FK to prompts), so collection *shells*
-- remain and simply become empty. Use option C to remove those too.
--
-- `categories` also survives — it references auth.users, not prompts — so
-- the category vocabulary is kept and only the assignments are cleared. That
-- is usually what you want before reseeding prompts; use option E if the
-- categories themselves are the test data.
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

-- ── Option E: reset user-side categories, keep the catalog set ──────
-- For re-testing 0006's seeding: clears every non-admin's category copies
-- and their grants, so ensure_seeded() hands the catalog set out again on
-- the next authenticated page load.
--
-- MUST run after option A, B or D. Deleting a category cascades to
-- prompt_categories, which trips the "at least one category" trigger if any
-- of that user's prompts are still around. If it raises, prompts are still
-- present — clear those first.
--
-- category_grants goes first: its user_category_id is ON DELETE SET NULL, so
-- deleting the categories alone would leave grant rows behind and seeding
-- would correctly decline to re-grant anything (that is the "I deleted this
-- deliberately" signal, 0006 §4).
--
-- delete from category_grants;
-- delete from categories where not is_curated;

-- ── Option F: reset the catalog categories too ──────────────────────
-- Only for rebuilding the vocabulary from scratch. Re-run section 5 of
-- 0006_user_categories.sql afterwards, or the site has no categories at all
-- and no new prompt can be saved.
--
-- delete from categories where is_curated;

-- ── Verify ──────────────────────────────────────────────────────────
-- Re-run the pre-flight query above. Then seed canonical prompts —
-- seed_default_prompts.sql is the existing template for that, though it
-- predates this model and should be reviewed before reuse.
--
-- Afterwards, rebuild and redeploy so the static site reflects the new
-- catalog: npm run build
