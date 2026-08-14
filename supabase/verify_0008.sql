-- Post-migration verification for 0008_delete_account.sql
-- READ-ONLY. Every row should read PASS, except check 8 which reads CHECK.
--
-- 'CHECK' (rather than FAIL) marks a row that is informational — a value that
-- depends on what data happens to be in the project, not on whether the
-- migration did its job. Same convention as verify_0004/0006/0007.
--
-- The rule this script has to respect (BUILD_BRIEF_v6.md §8a, broken twice
-- before): assert what the MIGRATION guarantees, never a number the product is
-- designed to change. Here that rules out the tempting one — "no orphaned rows
-- exist" — which would be asserting the absence of something the product never
-- creates, and would read PASS on a completely broken function simply because
-- nobody had run it yet. What 0008 actually guarantees is the *shape* of the
-- function and the cascade preconditions it relies on, so that is what is
-- asserted.
--
-- Check 7 is the one worth understanding rather than just running, and it is
-- the only check here that will ever catch a regression introduced by someone
-- else's work. 0008 deletes exactly one row and trusts ON DELETE CASCADE for
-- everything else. That trust is only warranted while every user-scoped table
-- actually carries the cascade. A future migration adding a table with a
-- user_id and no cascade rule would either make deletion fail outright with a
-- foreign-key violation, or leave rows behind belonging to a user who no
-- longer exists — and nothing in the app would surface either until someone
-- tried to close their account. The check enumerates the constraints from the
-- catalog rather than naming tables, so it covers tables that do not exist yet.
--
-- Note what this script CANNOT tell you: whether deleting from auth.users
-- actually works end to end. Checks 5 and 6 get as close as SQL can — the
-- owner holds DELETE, and RLS is not silently discarding it — but auth is
-- Supabase's own schema and the supported path is the admin API, so the only
-- honest confirmation is to run it, on a throwaway non-admin signup, never on
-- the admin account.
--
-- Checks 5 and 6 are this script's own cautionary tale, and both FAILed on a
-- correct migration before being fixed. Check 5 enumerated the ways the owner
-- might be permitted (superuser, table owner) and missed the one that applied
-- (a grant). Check 6 asserted that auth.users has no RLS — it does — when the
-- question that matters is not whether RLS is enabled but whether it applies
-- to this caller. Both wrong checks failed CLOSED, which is the expensive
-- direction: a red row sends you to read the migration, not the test. When a
-- privilege can be interrogated directly, interrogate it; reconstruct the
-- conditions only where the list is closed by definition, as check 6's now is.

select * from (
  select 1 as ord,
         'delete_my_account() exists' as check_name,
         coalesce((select proname from pg_proc
                   where proname = 'delete_my_account'
                     and pronamespace = 'public'::regnamespace), 'MISSING') as actual,
         'delete_my_account' as expected,
         case when exists (select 1 from pg_proc
                           where proname = 'delete_my_account'
                             and pronamespace = 'public'::regnamespace)
              then 'PASS' else 'FAIL' end as result

  -- Without this it cannot touch auth.users at all, and every call fails with
  -- a permission error rather than doing anything dangerous. Still asserted,
  -- because the failure mode is a feature that silently never works.
  union all
  select 2, 'delete_my_account() is SECURITY DEFINER',
         prosecdef::text,
         'true',
         case when prosecdef then 'PASS' else 'FAIL' end
  from pg_proc
  where proname = 'delete_my_account' and pronamespace = 'public'::regnamespace

  -- The privilege-escalation guard. An unpinned search_path on a SECURITY
  -- DEFINER function lets the caller decide which `admins` table the admin
  -- check reads — turning the one thing standing between a click and the
  -- deletion of the entire catalog into something the caller controls.
  union all
  select 3, 'search_path is pinned',
         coalesce(array_to_string(proconfig, ', '), 'NOT SET'),
         'search_path=public, auth',
         case when coalesce(array_to_string(proconfig, ', '), '') like '%search_path%'
              then 'PASS' else 'FAIL' end
  from pg_proc
  where proname = 'delete_my_account' and pronamespace = 'public'::regnamespace

  -- authenticated may call it; anon may not. anon would raise on the null
  -- auth.uid() branch anyway, so this is defence in depth rather than the
  -- only thing stopping an anonymous deletion — but a public EXECUTE grant on
  -- a function with this name is the kind of thing that gets misread later.
  union all
  select 4, 'EXECUTE granted to authenticated, not anon',
         case
           when has_function_privilege('anon', p.oid, 'EXECUTE') then 'ANON HAS EXECUTE'
           when has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'authenticated only'
           else 'AUTHENTICATED CANNOT EXECUTE'
         end,
         'authenticated only',
         case when has_function_privilege('authenticated', p.oid, 'EXECUTE')
               and not has_function_privilege('anon', p.oid, 'EXECUTE')
              then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.proname = 'delete_my_account' and p.pronamespace = 'public'::regnamespace

  -- SECURITY DEFINER runs as the owner, so the owner is what decides whether
  -- the delete against auth.users is permitted.
  --
  -- This check asked the wrong question on its first run and is worth keeping
  -- the story of, because the wrong version looked more rigorous than the
  -- right one. It tested "is the owner a superuser, or does it own
  -- auth.users" - two ways of being allowed - and reported FAIL for `postgres`
  -- on a live Supabase project. Neither is true there: Supabase revokes
  -- superuser from `postgres` (`supabase_admin` holds it) and auth.users is
  -- owned by `supabase_auth_admin`. But `postgres` is *granted* DELETE on it,
  -- which is the third way of being allowed and the one that actually applies.
  --
  -- has_table_privilege answers the real question directly, rather than
  -- enumerating the routes by which the answer might be yes. Prefer that shape
  -- wherever it exists - a check built from a list of sufficient conditions is
  -- only as good as the list.
  union all
  select 5, 'function owner has DELETE on auth.users',
         (select rolname from pg_roles r
          where r.oid = (select proowner from pg_proc
                         where proname = 'delete_my_account'
                           and pronamespace = 'public'::regnamespace))
         || ': ' ||
         case when has_table_privilege(
                     (select proowner from pg_proc
                      where proname = 'delete_my_account'
                        and pronamespace = 'public'::regnamespace)::regrole::text,
                     'auth.users', 'DELETE')
              then 'has DELETE' else 'NO DELETE' end,
         'has DELETE',
         case when has_table_privilege(
                     (select proowner from pg_proc
                      where proname = 'delete_my_account'
                        and pronamespace = 'public'::regnamespace)::regrole::text,
                     'auth.users', 'DELETE')
              then 'PASS' else 'FAIL' end

  -- The other half of check 5, and a genuinely different failure mode: a role
  -- can hold DELETE and still remove zero rows if row-level security applies
  -- and no policy admits it. That is the worst outcome available to this
  -- feature - the delete succeeds, the dialog reports the account closed, and
  -- the account still exists.
  --
  -- This check ALSO got it wrong first time, in the same way check 5 did, and
  -- the two together are the argument for the rule rather than an anecdote.
  -- It asserted that auth.users has no RLS enabled. It does have RLS enabled
  -- (Supabase turns it on), and that alone proves nothing, because RLS
  -- enabled is not the same as RLS applying to this caller.
  --
  -- Postgres exempts three cases, and unlike check 5's situation this list is
  -- genuinely closed - it is the definition, from the RLS documentation, not
  -- an attempt to guess the ways permission might have been acquired:
  --   * superuser,
  --   * a role with the BYPASSRLS attribute, or
  --   * the table's owner, unless the table is FORCE ROW LEVEL SECURITY.
  -- So the question is not "is RLS on" but "does the function's owner escape
  -- it", and the answer is printed in `actual` rather than assumed here.
  --
  -- row_security_active() is reported alongside as a direct second opinion:
  -- it answers "would RLS apply to me, right now, on this table". It is about
  -- current_user rather than the function's owner, so it is only equivalent
  -- when the two match - which they do when this is run in the Supabase SQL
  -- editor as postgres, the same role that owns the function.
  union all
  select 6, 'function owner escapes RLS on auth.users',
         (select rolname || ': ' ||
                 case when rolsuper then 'superuser'
                      when rolbypassrls then 'bypassrls'
                      when r.oid = (select relowner from pg_class
                                    where relname = 'users'
                                      and relnamespace = 'auth'::regnamespace)
                        then 'table owner'
                      else 'NO EXEMPTION' end
          from pg_roles r
          where r.oid = (select proowner from pg_proc
                         where proname = 'delete_my_account'
                           and pronamespace = 'public'::regnamespace))
         || ' (rls enabled: ' ||
         (select relrowsecurity::text from pg_class
          where relname = 'users' and relnamespace = 'auth'::regnamespace)
         || ', forced: ' ||
         (select relforcerowsecurity::text from pg_class
          where relname = 'users' and relnamespace = 'auth'::regnamespace)
         || ', active for current_user: ' ||
         row_security_active('auth.users')::text || ')',
         'superuser, bypassrls, or table owner',
         case when (select rolsuper or rolbypassrls
                      or (r.oid = (select relowner from pg_class
                                   where relname = 'users'
                                     and relnamespace = 'auth'::regnamespace)
                          and not (select relforcerowsecurity from pg_class
                                   where relname = 'users'
                                     and relnamespace = 'auth'::regnamespace))
                    from pg_roles r
                    where r.oid = (select proowner from pg_proc
                                   where proname = 'delete_my_account'
                                     and pronamespace = 'public'::regnamespace))
              then 'PASS' else 'FAIL' end

  -- The precondition the whole design rests on. Every foreign key from a
  -- public table to auth.users must be ON DELETE CASCADE ('c' in confdeltype).
  -- Enumerated from the catalog, so a table added by a future migration is
  -- covered without anyone remembering to update this list.
  union all
  select 7, 'every FK to auth.users is ON DELETE CASCADE',
         coalesce((
           select string_agg(conrelid::regclass::text || '.' || conname, ', ')
           from pg_constraint
           where contype = 'f'
             and confrelid = 'auth.users'::regclass
             and connamespace = 'public'::regnamespace
             and confdeltype <> 'c'
         ), 'all cascade'),
         'all cascade',
         case when not exists (
           select 1 from pg_constraint
           where contype = 'f'
             and confrelid = 'auth.users'::regclass
             and connamespace = 'public'::regnamespace
             and confdeltype <> 'c'
         ) then 'PASS' else 'FAIL' end

  -- Informational. How many accounts the function will refuse, and therefore
  -- how many can only be closed from the SQL editor. Expected to be 1 while
  -- this project has a single admin; a 0 here would mean the admins table is
  -- empty, which breaks catalog authoring long before it affects deletion.
  union all
  select 8, 'admin accounts (deletion refuses these)',
         (select count(*)::text from admins),
         '1 while there is a single admin',
         'CHECK'
) checks
order by ord;
