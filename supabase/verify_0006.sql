-- Post-migration verification for 0006_user_categories.sql
-- READ-ONLY. Every row should read PASS.
--
-- 'CHECK' (rather than FAIL) marks a row that is informational — a value that
-- depends on what data happens to be in the project, not on whether the
-- migration did its job. Same convention as verify_0004.sql's grants check.
--
-- A note for whoever edits this next, learned the hard way twice (see
-- BUILD_BRIEF_v6.md §8a): assert what the MIGRATION guarantees, never a number
-- the product is designed to change. Check 5 originally required exactly 9
-- catalog categories and duly "failed" the first time the admin deleted one —
-- reporting reality, but as a fault, when nothing was wrong. Categories are
-- user-editable now and the admin's library *is* the catalog, so that count
-- drifts by design. It now asserts `>= 1`, which is the thing that actually
-- matters (an empty catalog can't file a prompt), and check 6 carries the real
-- invariant by comparing two numbers that move together.

select * from (
  select 1 as ord,
         'categories table exists' as check_name,
         coalesce(to_regclass('public.categories')::text, 'MISSING') as actual,
         'categories' as expected,
         case when to_regclass('public.categories') is not null
              then 'PASS' else 'FAIL' end as result

  union all
  select 2, 'prompt_categories table exists',
         coalesce(to_regclass('public.prompt_categories')::text, 'MISSING'),
         'prompt_categories',
         case when to_regclass('public.prompt_categories') is not null
              then 'PASS' else 'FAIL' end

  union all
  select 3, 'category_grants table exists',
         coalesce(to_regclass('public.category_grants')::text, 'MISSING'),
         'category_grants',
         case when to_regclass('public.category_grants') is not null
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'RLS enabled on all three',
         count(*)::text,
         '3',
         case when count(*) = 3 then 'PASS' else 'FAIL' end
  from pg_class
  where relname in ('categories', 'prompt_categories', 'category_grants')
    and relnamespace = 'public'::regnamespace
    and relrowsecurity

  -- Deliberately `>= 1`, not `= 9`.
  --
  -- This asserted an exact count of 9 and failed the first time the admin
  -- deleted a category - correctly reporting reality, but reporting it as a
  -- FAILURE when nothing was wrong. Categories are user-editable now, and the
  -- admin's library *is* the catalog, so the count drifts by design the moment
  -- the feature is used. A verify script must assert what the migration
  -- guarantees, not a number the product is meant to change.
  --
  -- What still matters is that the catalog isn't *empty*: with no categories
  -- at all, no prompt can be saved (the >= 1 rule) and the static build emits
  -- no badges, pills or category pages.
  union all
  select 5, 'catalog categories present',
         count(*)::text,
         '>= 1 (9 at seed; drifts as you add/delete - not an error)',
         case when count(*) >= 1 then 'PASS' else 'FAIL' end
  from categories where is_curated


  -- The defect in BUILD_BRIEF_v6.md §1: categoryHue() mapped 9 categories
  -- onto 6 hues by index, so writing+education, code+creative and
  -- marketing+ops-admin each shared a colour. This is the check that it is
  -- actually gone rather than merely intended to be - and unlike a fixed
  -- count, it stays meaningful however many categories the admin ends up
  -- with, because it compares two numbers that both move together.
  --
  -- Also validates the hex format, which the column's CHECK constraint
  -- enforces on write but which is worth confirming holds across the set:
  -- the renderer inlines these values straight into a style attribute.
  union all
  select 6, 'catalog colours distinct and valid',
         count(distinct color)::text || ' distinct, '
           || count(*) filter (where color !~* '^#[0-9a-f]{6}$')::text || ' malformed',
         'one colour per category, none malformed',
         case when count(distinct color) = count(*)
               and count(*) filter (where color !~* '^#[0-9a-f]{6}$') = 0
              then 'PASS' else 'FAIL' end
  from categories where is_curated

  union all
  select 7, 'catalog categories owned by one admin',
         count(distinct user_id)::text,
         '1',
         case when count(distinct user_id) = 1 then 'PASS' else 'FAIL' end
  from categories where is_curated

  union all
  select 8, 'catalog owner is an admin',
         case when exists (
           select 1 from categories c
           where c.is_curated
             and not exists (select 1 from admins a where a.user_id = c.user_id)
         ) then 'no' else 'yes' end,
         'yes',
         case when exists (
           select 1 from categories c
           where c.is_curated
             and not exists (select 1 from admins a where a.user_id = c.user_id)
         ) then 'FAIL' else 'PASS' end

  union all
  select 9, 'prompts.categories dropped',
         coalesce((select 'present' from information_schema.columns
                   where table_schema='public' and table_name='prompts'
                     and column_name='categories'), 'dropped'),
         'dropped',
         case when not exists (select 1 from information_schema.columns
                               where table_schema='public' and table_name='prompts'
                                 and column_name='categories')
              then 'PASS' else 'FAIL' end

  union all
  select 10, 'prompts_categories_valid CHECK dropped',
         coalesce((select conname from pg_constraint
                   where conname='prompts_categories_valid'), 'dropped'),
         'dropped',
         case when not exists (select 1 from pg_constraint
                               where conname='prompts_categories_valid')
              then 'PASS' else 'FAIL' end

  union all
  select 11, 'catalog_versions.categories retained',
         coalesce((select 'present' from information_schema.columns
                   where table_schema='public' and table_name='catalog_versions'
                     and column_name='categories'), 'MISSING'),
         'present (merge still needs the snapshot)',
         case when exists (select 1 from information_schema.columns
                           where table_schema='public' and table_name='catalog_versions'
                             and column_name='categories')
              then 'PASS' else 'FAIL' end

  -- Every prompt that had categories should have kept them. A non-zero count
  -- here is expected if any row had an empty array before the migration (the
  -- old CHECK permitted that — see 6d's warning), which is why this reads
  -- CHECK rather than FAIL.
  union all
  select 12, 'prompts with no categories',
         count(*)::text,
         '0 (any others had an empty array before migrating)',
         case when count(*) = 0 then 'PASS' else 'CHECK' end
  from prompts p
  where not exists (select 1 from prompt_categories pc where pc.prompt_id = p.id)

  union all
  select 13, 'prompt_categories rows backfilled',
         count(*)::text,
         '>= number of prompts',
         case when count(*) >= (select count(*) from prompts) then 'PASS' else 'CHECK' end
  from prompt_categories

  -- Nobody should be able to file a prompt under someone else's category.
  -- The RLS WITH CHECK forbids it going forward; this confirms the backfill
  -- didn't create any by joining on slug across the wrong owner.
  union all
  select 14, 'no cross-owner category assignments',
         count(*)::text,
         '0',
         case when count(*) = 0 then 'PASS' else 'FAIL' end
  from prompt_categories pc
  join prompts p    on p.id = pc.prompt_id
  join categories c on c.id = pc.category_id
  where c.user_id <> p.user_id

  union all
  select 15, 'every non-admin has a grant per catalog category',
         count(*)::text,
         '0 missing',
         case when count(*) = 0 then 'PASS' else 'FAIL' end
  from auth.users u
  cross join categories c
  where c.is_curated
    and not exists (select 1 from admins a where a.user_id = u.id)
    and not exists (
      select 1 from category_grants g
      where g.user_id = u.id and g.catalog_category_id = c.id
    )

  union all
  select 16, 'at-least-one-category trigger installed',
         coalesce((select tgname from pg_trigger
                   where tgname='prompt_categories_assert_nonempty'), 'MISSING'),
         'prompt_categories_assert_nonempty',
         case when exists (select 1 from pg_trigger
                           where tgname='prompt_categories_assert_nonempty')
              then 'PASS' else 'FAIL' end

  union all
  select 17, 'category version triggers installed',
         count(*)::text,
         '2 (insert + delete on prompt_categories)',
         case when count(*) = 2 then 'PASS' else 'FAIL' end
  from pg_trigger
  where tgname in ('prompt_categories_write_version_ins',
                   'prompt_categories_write_version_del')

  union all
  select 18, 'rebuild triggers on categories installed',
         count(*)::text,
         '3 (insert/update/delete)',
         case when count(*) = 3 then 'PASS' else 'FAIL' end
  from pg_trigger
  where tgname in ('categories_static_rebuild_ins',
                   'categories_static_rebuild_upd',
                   'categories_static_rebuild_del')

  union all
  select 19, 'rebuild triggers on prompt_categories installed',
         count(*)::text,
         '2 (insert + delete)',
         case when count(*) = 2 then 'PASS' else 'FAIL' end
  from pg_trigger
  where tgname in ('prompt_categories_static_rebuild_ins',
                   'prompt_categories_static_rebuild_del')

  -- plpgsql resolves column references at run time, so a function still
  -- naming the dropped column keeps working until the moment someone writes
  -- to the catalog — and then fails there instead of here.
  union all
  select 20, 'prompts_static_rebuild() no longer reads prompts.categories',
         case when (select pg_get_functiondef(oid) from pg_proc
                    where proname='prompts_static_rebuild') like '%.categories%'
              then 'still references it' else 'clean' end,
         'clean',
         case when (select pg_get_functiondef(oid) from pg_proc
                    where proname='prompts_static_rebuild') like '%.categories%'
              then 'FAIL' else 'PASS' end

  union all
  select 21, 'write_catalog_version() no longer reads prompts.categories',
         case when (select pg_get_functiondef(oid) from pg_proc
                    where proname='write_catalog_version') like '%new.categories%'
              then 'still references it' else 'clean' end,
         'clean',
         case when (select pg_get_functiondef(oid) from pg_proc
                    where proname='write_catalog_version') like '%new.categories%'
              then 'FAIL' else 'PASS' end

  union all
  select 22, 'helper functions exist',
         count(*)::text,
         '3 (prompt_category_slugs, write_catalog_version_for, delete_category)',
         case when count(*) = 3 then 'PASS' else 'FAIL' end
  from pg_proc
  where proname in ('prompt_category_slugs', 'write_catalog_version_for', 'delete_category')

  union all
  select 23, 'delete_category() callable by authenticated',
         case when has_function_privilege('authenticated',
                'public.delete_category(uuid,uuid)', 'execute')
              then 'yes' else 'no' end,
         'yes',
         case when has_function_privilege('authenticated',
                'public.delete_category(uuid,uuid)', 'execute')
              then 'PASS' else 'FAIL' end

  union all
  select 24, 'ensure_seeded() still callable by authenticated',
         case when has_function_privilege('authenticated', 'public.ensure_seeded()', 'execute')
              then 'yes' else 'no' end,
         'yes',
         case when has_function_privilege('authenticated', 'public.ensure_seeded()', 'execute')
              then 'PASS' else 'FAIL' end

  -- The anonymous static build reads categories as `anon`. Without this
  -- grant the build silently produces a site with no categories at all.
  union all
  select 25, 'anon can read categories + prompt_categories',
         count(*)::text,
         '2',
         case when count(*) = 2 then 'PASS' else 'FAIL' end
  from (
    select 1 where has_table_privilege('anon', 'public.categories', 'select')
    union all
    select 1 where has_table_privilege('anon', 'public.prompt_categories', 'select')
  ) g

  -- Table-level GRANT, not RLS. These three are private bookkeeping that no
  -- client reads, so anon should be refused before RLS is even consulted.
  --
  -- This one failed on the first real run, and the reason is worth keeping:
  -- Supabase's default privileges grant on every new table in `public` to
  -- anon and authenticated, so a table arrives already granted even though
  -- the migration never wrote a GRANT. 0006 now revokes explicitly. RLS was
  -- blocking every row throughout, so this was defence in depth rather than
  -- an exposure - but it is exactly the kind of thing that reads as safe and
  -- isn't.
  union all
  select 26, 'anon cannot read the bookkeeping tables',
         count(*)::text,
         '0 of 3 readable by anon',
         case when count(*) = 0 then 'PASS' else 'FAIL' end
  from (
    select 1 where has_table_privilege('anon', 'public.category_grants', 'select')
    union all
    select 1 where has_table_privilege('anon', 'public.catalog_grants', 'select')
    union all
    select 1 where has_table_privilege('anon', 'public.catalog_versions', 'select')
  ) g

  -- The counterpart: /account/ reads catalog_grants, so revoking too widely
  -- would break it silently (RLS returning nothing looks identical to an
  -- empty library).
  union all
  select 27, 'authenticated retains catalog_grants read',
         case when has_table_privilege('authenticated', 'public.catalog_grants', 'select')
              then 'yes' else 'no' end,
         'yes (db.js loadMyGrants, for /account/)',
         case when has_table_privilege('authenticated', 'public.catalog_grants', 'select')
              then 'PASS' else 'FAIL' end
) t
order by ord;
