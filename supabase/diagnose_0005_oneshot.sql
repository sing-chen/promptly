-- One-shot diagnostic for 0005_publish_webhook.sql.
--
-- Everything in a single result set, because the Supabase SQL editor only
-- shows the last statement's output when you run a whole file.
--
-- Implemented as a function rather than a UNION because it inspects pg_net's
-- tables (net._http_response, net.http_request_queue), which don't exist if
-- the extension never installed - a plain query referencing them would fail
-- to plan rather than reporting the problem. Dynamic SQL degrades gracefully.
--
-- Read-only apart from creating the function itself. Drop it when done:
--   drop function diagnose_publish_webhook();

create or replace function diagnose_publish_webhook()
returns table (check_name text, status text, detail text)
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  v_url        text;
  v_queued     bigint;
  v_resp       record;
  v_has_net    boolean;
  v_qualifying bigint;
  v_last       record;
begin
  -- 1. hook URL
  select deploy_hook_url into v_url from deploy_settings where id;
  return query select
    '1. deploy hook URL'::text,
    case
      when v_url is null or v_url = '' then 'NOT SET'
      when v_url not like 'https://api.vercel.com/%' then 'SUSPICIOUS'
      else 'OK'
    end,
    coalesce(left(v_url, 50) || '…', 'set_deploy_hook_url() never took — re-run it');

  -- 2. pg_net present?
  v_has_net := to_regclass('net._http_response') is not null;
  return query select
    '2. pg_net installed'::text,
    case when v_has_net then 'OK' else 'MISSING' end,
    coalesce((select 'v' || extversion from pg_extension where extname = 'pg_net'),
             'extension not installed — the migration''s create extension line failed');

  -- 3. triggers attached and enabled
  return query
    select '3. trigger: ' || tgname,
           case when tgenabled = 'D' then 'DISABLED' else 'enabled' end,
           case when tgtype::int & 1 = 1 then 'row-level (unexpected)' else 'statement-level' end
    from pg_trigger
    where tgrelid = 'public.prompts'::regclass
      and tgname like 'prompts_static_rebuild%'
    order by tgname;

  -- 4. is there anything the trigger would even fire for?
  select count(*) into v_qualifying from prompts where is_curated and published;
  return query select
    '4. publishable catalog prompts'::text,
    case when v_qualifying > 0 then 'OK' else 'NONE' end,
    v_qualifying::text || ' row(s) are is_curated AND published';

  -- 5. the row most recently edited - did it qualify?
  select title, is_curated, published, updated into v_last
  from prompts order by updated desc limit 1;
  if found then
    return query select
      '5. last edited prompt'::text,
      case when v_last.is_curated and v_last.published then 'QUALIFIES' else 'DOES NOT QUALIFY' end,
      format('%s (curated=%s, published=%s, %s)',
             left(v_last.title, 40), v_last.is_curated, v_last.published,
             to_char(v_last.updated, 'YYYY-MM-DD HH24:MI:SS'));
  end if;

  -- 6/7. pg_net queue + recent responses
  if v_has_net then
    execute 'select count(*) from net.http_request_queue' into v_queued;
    return query select
      '6. pg_net queue depth'::text,
      case when v_queued = 0 then 'OK' else 'BACKED UP' end,
      v_queued::text || ' pending (non-zero with no responses below = worker not dispatching)';

    for v_resp in
      execute 'select id, status_code, left(coalesce(content, error_msg, ''(none)''), 120) as body, created
               from net._http_response order by id desc limit 5'
    loop
      return query select
        '7. pg_net response #' || v_resp.id::text,
        case when v_resp.status_code between 200 and 299 then 'OK ' || v_resp.status_code::text
             when v_resp.status_code is null then 'NO RESPONSE'
             else 'HTTP ' || v_resp.status_code::text end,
        to_char(v_resp.created, 'HH24:MI:SS') || ' — ' || v_resp.body;
    end loop;

    if not exists (select 1 from pg_class where oid = 'net._http_response'::regclass) then
      return query select '7. pg_net responses'::text, 'NONE'::text,
                          'nothing sent yet'::text;
    end if;
  end if;

  return;
end;
$$;

select * from diagnose_publish_webhook();
