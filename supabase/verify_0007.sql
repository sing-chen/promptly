-- Post-migration verification for 0007_category_limit.sql
-- READ-ONLY. Every row should read PASS, except check 7 which reads CHECK.
--
-- 'CHECK' (rather than FAIL) marks a row that is informational — a value that
-- depends on what data happens to be in the project, not on whether the
-- migration did its job. Same convention as verify_0004.sql and verify_0006.sql.
--
-- The rule this script has to respect (BUILD_BRIEF_v6.md §8a, broken twice
-- before): assert what the MIGRATION guarantees, never a number the product is
-- designed to change. That is unusually pointed here, because the obvious
-- check — "no user has more than 20 categories" — is precisely the assertion
-- that must NOT be made. 0007 deliberately lets seeding carry a user past the
-- ceiling (a user at 20 who is then granted a new catalog category), so a
-- script asserting <= 20 would eventually FAIL while the system behaved
-- exactly as designed. Check 7 reports that number as informational instead.
--
-- Checks 4 and 6 are the load-bearing pair, and are worth understanding rather
-- than just running. 0007 enforces the cap through RLS specifically because
-- ensure_seeded() bypasses RLS, and it bypasses RLS only because (a) it is
-- SECURITY DEFINER, (b) its owner owns `categories`, and (c) `categories` is
-- not FORCE ROW LEVEL SECURITY. If any of those three ever stops being true,
-- the cap silently becomes a cap on *seeding* — and the symptom would be users
-- quietly ceasing to receive catalog prompts, with nothing on screen to say
-- why. These checks exist to make that loud.

select * from (
  select 1 as ord,
         'categories_insert policy exists' as check_name,
         coalesce((select policyname from pg_policies
                   where schemaname = 'public' and tablename = 'categories'
                     and policyname = 'categories_insert'), 'MISSING') as actual,
         'categories_insert' as expected,
         case when exists (select 1 from pg_policies
                           where schemaname = 'public' and tablename = 'categories'
                             and policyname = 'categories_insert')
              then 'PASS' else 'FAIL' end as result

  -- The clause 0007 adds.
  union all
  select 2, 'insert policy carries the 20 limit',
         case when (select with_check from pg_policies
                    where schemaname = 'public' and tablename = 'categories'
                      and policyname = 'categories_insert') like '%< 20%'
              then 'present' else 'ABSENT' end,
         'present',
         case when (select with_check from pg_policies
                    where schemaname = 'public' and tablename = 'categories'
                      and policyname = 'categories_insert') like '%< 20%'
              then 'PASS' else 'FAIL' end

  -- Regression check, and the reason 0007 recreates the policy verbatim rather
  -- than patching it. Dropping and rewriting a policy is exactly where an
  -- existing security clause goes missing without anyone noticing: the new
  -- rule works, so the change looks successful. This asserts the OLD rule —
  -- only an admin may create a curated (catalog) category — survived.
  union all
  select 3, 'admin/is_curated guard survived the rewrite',
         case when (select with_check from pg_policies
                    where schemaname = 'public' and tablename = 'categories'
                      and policyname = 'categories_insert') like '%admins%'
              then 'present' else 'ABSENT' end,
         'present',
         case when (select with_check from pg_policies
                    where schemaname = 'public' and tablename = 'categories'
                      and policyname = 'categories_insert') like '%admins%'
              then 'PASS' else 'FAIL' end

  -- Load-bearing. FORCE would subject the table owner to RLS, which would
  -- apply the cap to ensure_seeded() and break seeding for any user at the
  -- ceiling. Nothing in this project sets it; the check is here because if
  -- someone ever does, this is the only place the consequence is written down.
  union all
  select 4, 'categories is NOT force-RLS',
         relforcerowsecurity::text,
         'false',
         case when relforcerowsecurity = false then 'PASS' else 'FAIL' end
  from pg_class
  where relname = 'categories' and relnamespace = 'public'::regnamespace

  union all
  select 5, 'ensure_seeded() is SECURITY DEFINER',
         prosecdef::text,
         'true',
         case when prosecdef then 'PASS' else 'FAIL' end
  from pg_proc
  where proname = 'ensure_seeded' and pronamespace = 'public'::regnamespace

  -- The other half of check 5. SECURITY DEFINER alone does not bypass RLS —
  -- it runs as the function's owner, and it is *table ownership* that carries
  -- the bypass. If ensure_seeded() were ever recreated by a different role
  -- than the one owning `categories`, seeding would start being capped.
  union all
  select 6, 'ensure_seeded() owner owns categories',
         case when (select proowner from pg_proc
                    where proname = 'ensure_seeded'
                      and pronamespace = 'public'::regnamespace)
                = (select relowner from pg_class
                   where relname = 'categories'
                     and relnamespace = 'public'::regnamespace)
              then 'same owner' else 'DIFFERENT OWNERS' end,
         'same owner',
         case when (select proowner from pg_proc
                    where proname = 'ensure_seeded'
                      and pronamespace = 'public'::regnamespace)
                = (select relowner from pg_class
                   where relname = 'categories'
                     and relnamespace = 'public'::regnamespace)
              then 'PASS' else 'FAIL' end

  -- Informational, and deliberately not an assertion. See the header: a user
  -- above 20 is a designed outcome of seeding, not a fault. Worth eyeballing
  -- anyway - a number far above 20 would mean the app-side pre-check in
  -- categories.js has stopped working, since seeding alone can only push
  -- someone past the ceiling by the size of the catalog.
  union all
  select 7, 'largest per-user category count',
         coalesce((select max(n)::text from (
           select count(*) as n from categories group by user_id
         ) t), '0'),
         '<= 20 typically; higher is possible via seeding, not an error',
         'CHECK'
) checks
order by ord;
