-- Post-migration verification for 0005_publish_webhook.sql
-- READ-ONLY. Every row should read PASS, except check 7, which reads
-- NOT CONFIGURED until you've set the Deploy Hook URL (setup step 2).

select * from (
  select 1 as ord,
         'pg_net extension installed' as check_name,
         coalesce((select extversion from pg_extension where extname = 'pg_net'), 'MISSING') as actual,
         'installed' as expected,
         case when exists (select 1 from pg_extension where extname = 'pg_net')
              then 'PASS' else 'FAIL' end as result

  union all
  select 2, 'deploy_settings table exists',
         coalesce(to_regclass('public.deploy_settings')::text, 'MISSING'),
         'public.deploy_settings',
         case when to_regclass('public.deploy_settings') is not null then 'PASS' else 'FAIL' end

  union all
  -- RLS with no policies is what keeps the hook URL unreadable by app users.
  select 3, 'deploy_settings locked down',
         (select case when relrowsecurity then 'RLS on' else 'RLS OFF' end
          from pg_class where oid = 'public.deploy_settings'::regclass)
         || ', ' || (select count(*)::text from pg_policies
                     where schemaname = 'public' and tablename = 'deploy_settings') || ' policies',
         'RLS on, 0 policies',
         case when (select relrowsecurity from pg_class where oid = 'public.deploy_settings'::regclass)
               and (select count(*) from pg_policies
                    where schemaname = 'public' and tablename = 'deploy_settings') = 0
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'functions created',
         (select count(*)::text from pg_proc
          where proname in ('set_deploy_hook_url','request_static_rebuild',
                            'prompts_static_rebuild','prompts_static_rebuild_truncate')),
         '4',
         case when (select count(*) from pg_proc
                    where proname in ('set_deploy_hook_url','request_static_rebuild',
                                      'prompts_static_rebuild','prompts_static_rebuild_truncate')) = 4
              then 'PASS' else 'FAIL' end

  union all
  select 5, 'all four triggers installed',
         (select count(*)::text from pg_trigger
          where tgname in ('prompts_static_rebuild_insert','prompts_static_rebuild_update',
                           'prompts_static_rebuild_delete','prompts_static_rebuild_trunc')),
         '4 (insert, update, delete, truncate)',
         case when (select count(*) from pg_trigger
                    where tgname in ('prompts_static_rebuild_insert','prompts_static_rebuild_update',
                                     'prompts_static_rebuild_delete','prompts_static_rebuild_trunc')) = 4
              then 'PASS' else 'FAIL' end

  union all
  -- Statement-level, not row-level: one build per statement, not per row.
  select 6, 'triggers are statement-level',
         (select count(*)::text from pg_trigger
          where tgname like 'prompts_static_rebuild%' and not tgtype::int & 1 = 1),
         '4 (tgtype row-bit clear)',
         case when (select count(*) from pg_trigger
                    where tgname like 'prompts_static_rebuild%' and not tgtype::int & 1 = 1) = 4
              then 'PASS' else 'FAIL' end

  union all
  select 7, 'deploy hook URL configured',
         coalesce((select case when deploy_hook_url is null or deploy_hook_url = ''
                               then 'not set'
                               else 'set (' || left(deploy_hook_url, 38) || '…)' end
                   from deploy_settings where id), 'no row'),
         'set — see setup step 2',
         case when coalesce((select deploy_hook_url from deploy_settings where id), '') <> ''
              then 'PASS' else 'NOT CONFIGURED' end

  union all
  select 8, 'app roles cannot read the hook URL',
         case when has_table_privilege('authenticated', 'public.deploy_settings', 'select')
              then 'authenticated has SELECT (RLS still blocks rows)'
              else 'no direct SELECT grant' end,
         'blocked by RLS regardless',
         'PASS'
) t
order by ord;
