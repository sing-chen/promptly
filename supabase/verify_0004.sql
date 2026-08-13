-- Post-migration verification for 0004_owned_copies.sql
-- READ-ONLY. Every row should read PASS.

select * from (
  select 1 as ord,
         'catalog_versions backfilled' as check_name,
         count(*)::text as actual,
         'one per published catalog prompt' as expected,
         case when count(*) = (select count(*) from prompts where is_curated and published)
              then 'PASS' else 'FAIL' end as result
  from catalog_versions

  union all
  select 2, 'versions all notifiable',
         count(*) filter (where not notifiable)::text,
         '0 (backfill marks first versions notifiable)',
         case when count(*) filter (where not notifiable) = 0 then 'PASS' else 'FAIL' end
  from catalog_versions

  union all
  select 3, 'catalog_grants empty',
         count(*)::text,
         '0 (admin skips seeding, no other accounts)',
         case when count(*) = 0 then 'PASS' else 'CHECK' end
  from catalog_grants

  union all
  select 4, 'prompt_overrides dropped',
         coalesce(to_regclass('public.prompt_overrides')::text, 'dropped'),
         'dropped',
         case when to_regclass('public.prompt_overrides') is null then 'PASS' else 'FAIL' end

  union all
  select 5, 'prompts.source_prompt_id dropped',
         coalesce((select 'present' from information_schema.columns
                   where table_schema='public' and table_name='prompts'
                     and column_name='source_prompt_id'), 'dropped'),
         'dropped',
         case when not exists (select 1 from information_schema.columns
                               where table_schema='public' and table_name='prompts'
                                 and column_name='source_prompt_id')
              then 'PASS' else 'FAIL' end

  union all
  select 6, 'prompts.edited_from_source dropped',
         coalesce((select 'present' from information_schema.columns
                   where table_schema='public' and table_name='prompts'
                     and column_name='edited_from_source'), 'dropped'),
         'dropped',
         case when not exists (select 1 from information_schema.columns
                               where table_schema='public' and table_name='prompts'
                                 and column_name='edited_from_source')
              then 'PASS' else 'FAIL' end

  union all
  select 7, 'prompts.is_archived retained',
         coalesce((select 'present' from information_schema.columns
                   where table_schema='public' and table_name='prompts'
                     and column_name='is_archived'), 'MISSING'),
         'present (now the real archive mechanism)',
         case when exists (select 1 from information_schema.columns
                           where table_schema='public' and table_name='prompts'
                             and column_name='is_archived')
              then 'PASS' else 'FAIL' end

  union all
  select 8, 'version trigger installed',
         coalesce((select tgname from pg_trigger
                   where tgname = 'prompts_write_catalog_version'), 'MISSING'),
         'prompts_write_catalog_version',
         case when exists (select 1 from pg_trigger where tgname='prompts_write_catalog_version')
              then 'PASS' else 'FAIL' end

  union all
  select 9, 'old fork trigger removed',
         coalesce((select tgname from pg_trigger
                   where tgname = 'prompts_mark_edited_from_source'), 'dropped'),
         'dropped',
         case when not exists (select 1 from pg_trigger where tgname='prompts_mark_edited_from_source')
              then 'PASS' else 'FAIL' end

  union all
  select 10, 'ensure_seeded() exists',
         coalesce((select proname from pg_proc where proname='ensure_seeded'), 'MISSING'),
         'ensure_seeded',
         case when exists (select 1 from pg_proc where proname='ensure_seeded')
              then 'PASS' else 'FAIL' end

  union all
  select 11, 'ensure_seeded() callable by authenticated',
         case when has_function_privilege('authenticated', 'public.ensure_seeded()', 'execute')
              then 'yes' else 'no' end,
         'yes',
         case when has_function_privilege('authenticated', 'public.ensure_seeded()', 'execute')
              then 'PASS' else 'FAIL' end
) t
order by ord;
