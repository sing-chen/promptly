-- Diagnose why 0005_publish_webhook.sql isn't triggering deployments.
-- Run these ONE AT A TIME - the Supabase SQL editor only shows the last
-- statement's result. Step 3 is the decisive one; start there if impatient.

-- ── 1. Is the hook URL actually stored? ─────────────────────────────
select
  case
    when deploy_hook_url is null or deploy_hook_url = '' then 'NOT SET — set_deploy_hook_url() did not take'
    when deploy_hook_url not like 'https://api.vercel.com/%' then 'SET but does not look like a Vercel deploy hook: ' || left(deploy_hook_url, 40)
    else 'OK — ' || left(deploy_hook_url, 45) || '…'
  end as hook_url_status,
  updated_at
from deploy_settings;


-- ── 2. Did you edit a prompt the trigger cares about? ───────────────
-- The trigger only fires for rows that are BOTH is_curated AND published -
-- the same predicate scripts/build.mjs selects on, because those are the only
-- prompts the static site contains. Editing a personal prompt, or a catalog
-- DRAFT, correctly does nothing.
--
-- Look at the most recently updated row: if `qualifies` is false, the trigger
-- was right not to fire and there is no bug.
select
  title,
  is_curated,
  published,
  (is_curated and published) as qualifies_for_rebuild,
  updated
from prompts
order by updated desc
limit 10;


-- ── 3. Does the plumbing work at all? (decisive) ────────────────────
-- Bypasses the trigger entirely and fires the hook directly. If a deployment
-- appears in Vercel after this, the webhook stack is fine and the problem is
-- step 2 (you edited something that doesn't qualify). If nothing appears,
-- the problem is pg_net or the URL - continue to step 4.
select request_static_rebuild('manual test from diagnose_0005.sql');


-- ── 4. What did pg_net actually send, and what came back? ───────────
-- Run ~5 seconds after step 3; pg_net dispatches asynchronously via a
-- background worker, so the row is not written synchronously.
-- status_code 201 = Vercel accepted the build request.
select
  id,
  status_code,
  left(coalesce(content, error_msg, '(none)'), 200) as response,
  created
from net._http_response
order by id desc
limit 5;


-- ── 5. Anything stuck in the queue? ─────────────────────────────────
-- Rows sitting here with nothing in _http_response means pg_net's background
-- worker isn't dispatching - the extension is installed but not running.
-- Fixable by toggling pg_net off/on under Database → Extensions.
select count(*) as queued_requests from net.http_request_queue;


-- ── 6. Is the trigger actually attached? ────────────────────────────
select
  tgname as trigger_name,
  case when tgenabled = 'D' then 'DISABLED' else 'enabled' end as state,
  case when tgtype::int & 1 = 1 then 'row-level' else 'statement-level' end as level
from pg_trigger
where tgrelid = 'public.prompts'::regclass
  and tgname like 'prompts_static_rebuild%'
order by tgname;


-- ── 7. Did the trigger fire but the POST fail silently? ─────────────
-- request_static_rebuild() deliberately never raises - a deploy hook is a
-- side effect and must not roll back the prompt write that triggered it - so
-- failures surface as WARNINGs in the Postgres log, not as errors in the app.
-- Check Supabase → Logs → Postgres for "request_static_rebuild(...) failed".
-- This query just confirms the function exists and is SECURITY DEFINER.
select
  proname,
  prosecdef as security_definer,
  pg_get_function_identity_arguments(oid) as args
from pg_proc
where proname in ('request_static_rebuild', 'prompts_static_rebuild', 'set_deploy_hook_url')
order by proname;
