-- Promptly — auto-rebuild the static site when the catalog changes
--
-- Anonymous visitors are served pre-built pages (see supabase/README.md,
-- "Static build vs. live reads"), so any change to a *published catalog*
-- prompt leaves them looking at stale content until someone redeploys by
-- hand. This posts to a Vercel Deploy Hook whenever that happens.
--
-- Deliberately NOT limited to "publish". Anonymous pages go stale on every
-- change that alters what the build would produce:
--   * a catalog prompt is published        (appears)
--   * a catalog prompt is unpublished      (disappears)
--   * a published catalog prompt is edited (content changes)
--   * a published catalog prompt is deleted
-- Firing only on publish would mean a typo fix silently never reaching
-- anonymous visitors, which is the exact failure this is meant to remove.
--
-- Signed-in users are unaffected either way - they read live via
-- ensure_seeded(), which needs no rebuild.
--
-- SETUP (both steps required; without step 2 this is inert):
--   1. Run this migration.
--   2. Vercel → Project Settings → Git → Deploy Hooks → create one for
--      `main`, copy the URL, then run:
--        select set_deploy_hook_url('https://api.vercel.com/v1/integrations/deploy/...');
--
-- To disable without dropping anything: select set_deploy_hook_url(null);

-- ════════════════════════════════════════════════════════════════════
-- 1. pg_net — Postgres-side HTTP (async, queued)
-- ════════════════════════════════════════════════════════════════════
create extension if not exists pg_net with schema extensions;

-- ════════════════════════════════════════════════════════════════════
-- 2. Where the Deploy Hook URL lives
-- ════════════════════════════════════════════════════════════════════
-- Singleton table (the `id` check pins it to one row) rather than hardcoding
-- the URL in the function body, so rotating it is an UPDATE rather than a
-- migration.
--
-- The URL is a capability: anyone holding it can trigger production builds.
-- RLS is enabled with NO policies, so `anon` and `authenticated` cannot read
-- it at all; only the service role and the SQL editor can. The functions
-- below are SECURITY DEFINER, so they read it as the owner.
create table if not exists deploy_settings (
  id               boolean primary key default true check (id),
  deploy_hook_url  text,
  updated_at       timestamptz not null default now()
);

alter table deploy_settings enable row level security;

insert into deploy_settings (id, deploy_hook_url)
values (true, null)
on conflict (id) do nothing;

create or replace function set_deploy_hook_url(p_url text)
returns text
language sql
security definer
set search_path = public
as $$
  insert into deploy_settings (id, deploy_hook_url, updated_at)
  values (true, p_url, now())
  on conflict (id) do update
    set deploy_hook_url = excluded.deploy_hook_url,
        updated_at      = now()
  returning coalesce(deploy_hook_url, '(cleared — auto-rebuild is now off)');
$$;

-- ════════════════════════════════════════════════════════════════════
-- 3. Fire the hook
-- ════════════════════════════════════════════════════════════════════
-- Safe to call directly to force a rebuild:  select request_static_rebuild('manual');
--
-- Never raises. A deploy hook is a nice-to-have side effect; a network
-- failure, an unset URL, or a pg_net problem must not roll back the write
-- that triggered it.
create or replace function request_static_rebuild(p_reason text default 'catalog change')
returns void
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  v_url text;
begin
  select deploy_hook_url into v_url from deploy_settings where id;

  if v_url is null or v_url = '' then
    return; -- not configured; stays inert rather than erroring
  end if;

  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object('reason', p_reason, 'at', now()),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
exception when others then
  raise warning 'request_static_rebuild(%) failed: %', p_reason, sqlerrm;
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- 4. Detect catalog changes
-- ════════════════════════════════════════════════════════════════════
-- STATEMENT-level with transition tables, not FOR EACH ROW. A row-level
-- trigger would fire one HTTP request per affected row - so clearing the
-- catalog (reset_prompts.sql) or a bulk edit would queue a build per row.
-- This fires at most once per statement.
--
-- `is_curated and published` is the exact condition scripts/build.mjs uses
-- to select prompts, so this asks precisely "would a rebuild produce
-- different output?" A user editing their own copy never matches, which is
-- why no debounce is needed: only admin catalog writes can trigger a build,
-- and those are rare.
create or replace function prompts_static_rebuild()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected integer := 0;
begin
  if tg_op = 'INSERT' then
    select count(*) into v_affected
    from newtab n
    where n.is_curated and n.published;

  elsif tg_op = 'DELETE' then
    select count(*) into v_affected
    from oldtab o
    where o.is_curated and o.published;

  elsif tg_op = 'UPDATE' then
    select count(*) into v_affected
    from newtab n
    join oldtab o on o.id = n.id
    where
      -- appeared in, or vanished from, the published catalog
      (n.is_curated and n.published) is distinct from (o.is_curated and o.published)
      -- or stayed in it while content the build renders changed
      or (
        n.is_curated and n.published and (
             n.title         is distinct from o.title
          or n.slug          is distinct from o.slug
          or n.purpose       is distinct from o.purpose
          or n.body          is distinct from o.body
          or n.notes         is distinct from o.notes
          or n.categories    is distinct from o.categories
          or n.sequence      is distinct from o.sequence
          or n.sequence_step is distinct from o.sequence_step
        )
      );
  end if;

  if v_affected > 0 then
    perform request_static_rebuild(format('%s on prompts (%s row(s))', tg_op, v_affected));
  end if;

  return null; -- AFTER STATEMENT triggers ignore the return value
end;
$$;

drop trigger if exists prompts_static_rebuild_insert on prompts;
create trigger prompts_static_rebuild_insert
  after insert on prompts
  referencing new table as newtab
  for each statement execute function prompts_static_rebuild();

drop trigger if exists prompts_static_rebuild_update on prompts;
create trigger prompts_static_rebuild_update
  after update on prompts
  referencing old table as oldtab new table as newtab
  for each statement execute function prompts_static_rebuild();

drop trigger if exists prompts_static_rebuild_delete on prompts;
create trigger prompts_static_rebuild_delete
  after delete on prompts
  referencing old table as oldtab
  for each statement execute function prompts_static_rebuild();

-- TRUNCATE bypasses the triggers above entirely (it fires neither row nor
-- transition-table triggers), and reset_prompts.sql's option A uses it - so
-- without this, wiping the catalog would leave the live site serving prompts
-- that no longer exist.
create or replace function prompts_static_rebuild_truncate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform request_static_rebuild('TRUNCATE on prompts');
  return null;
end;
$$;

drop trigger if exists prompts_static_rebuild_trunc on prompts;
create trigger prompts_static_rebuild_trunc
  after truncate on prompts
  for each statement execute function prompts_static_rebuild_truncate();

-- ════════════════════════════════════════════════════════════════════
-- 5. Grants
-- ════════════════════════════════════════════════════════════════════
-- Neither function is callable by app users. The triggers invoke
-- request_static_rebuild() internally as the definer, and configuring the
-- URL is an operator task done from the SQL editor.
revoke all on function set_deploy_hook_url(text)   from anon, authenticated;
revoke all on function request_static_rebuild(text) from anon, authenticated;
