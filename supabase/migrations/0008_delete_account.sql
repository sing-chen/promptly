-- ════════════════════════════════════════════════════════════════════
-- 0008_delete_account.sql — self-serve account deletion
-- ════════════════════════════════════════════════════════════════════
-- OPEN_ITEMS.md A7. One function, callable by any signed-in user, that
-- deletes their own account and everything hanging off it.
--
-- Before this, /privacy/ and /terms/ both said "ask us to close your account"
-- — an email to the contact address, actioned by hand in the SQL editor. That
-- is legally sufficient (UK GDPR gives a controller a month to act on an
-- erasure request; it does not require a button) and it is a poor product.
-- Someone who wants to leave should not have to write to anyone. This is a
-- product decision rather than a compliance one, which matters because it
-- means the bar is "does it work and is it safe", not "does it satisfy an
-- Article".
--
-- ── Why a function at all ────────────────────────────────────────────
--
-- auth.users is not reachable with the anon key, by design, and Supabase
-- exposes no client-side "delete my own account" call — deleting a user
-- normally requires the service_role key, which cannot ship in a browser.
--
-- The alternatives were a Vercel serverless function or a Supabase Edge
-- Function, both holding service_role. Both were rejected for the same
-- reason: they would introduce a secret strictly more powerful than anything
-- this project currently stores anywhere, and a server surface to a site that
-- has never had one, in order to perform a single fixed operation. A
-- SECURITY DEFINER function does the same job with no new secret, no new
-- deploy target, and the same shape as delete_category() from 0006 — a
-- pattern the app already calls through supabase.rpc().
--
-- ── Why this cannot be turned against another account ────────────────
--
-- There is no parameter. The function deletes `auth.uid()` and nothing else,
-- so there is no id for a caller to substitute and no filter for them to
-- widen. The blast radius is limited by the function's shape rather than by a
-- check that could be edited away later — the same reasoning 0007 used when
-- it put the seeding exemption in table ownership rather than in a flag.
--
-- ── Why the admin cannot delete themselves ───────────────────────────
--
-- This is the dangerous case, and it is not hypothetical: there is exactly
-- one admin and it is the operator's own account.
--
-- An admin's library *is* the catalog (v5 §4). Deleting the admin cascades
-- every is_curated prompt, which cascades catalog_versions and every other
-- user's catalog_grants, and then fires 0005's statement-level trigger — so
-- the site rebuilds and redeploys itself with an empty catalog, automatically,
-- with no undo. The whole product, removed by one confirmed dialog.
--
-- The UI also warns (auth.js shows an explanatory dialog rather than hiding
-- the button, so the reason is visible rather than mysterious), but a UI check
-- is a suggestion. This is the guarantee. Closing the last admin account is a
-- deliberate operator action that belongs in the SQL editor, where it takes
-- more than a click and cannot be reached from a phone.
--
-- If multiple admins ever exist (supabase/README.md "Not built"), revisit
-- this: "not the last admin" is a more useful rule than "no admin", but it
-- needs a definition of what happens to the catalog rows, which does not
-- exist yet. Refusing all admins is the correct conservative rule until then.
--
-- ── Why search_path is pinned ────────────────────────────────────────
--
-- A SECURITY DEFINER function with an unpinned search_path is the textbook
-- Postgres privilege-escalation shape: the caller sets search_path to a schema
-- they control, the function resolves `admins` to *their* table, and the admin
-- guard above evaluates against data the attacker wrote. Pinning it makes the
-- resolution independent of the caller.
--
-- ── What actually gets deleted ───────────────────────────────────────
--
-- One row, and then Postgres does the rest. Every user-scoped table in this
-- schema references auth.users with ON DELETE CASCADE — prompts, categories,
-- category_grants, catalog_grants, collections, favorites, admins — and the
-- join tables (prompt_categories, collection_prompts) cascade from their
-- parents. So there is no cleanup script here and no possibility of a
-- half-deleted account. verify_0008.sql check 6 asserts that property still
-- holds, because it is a precondition this function depends on and does not
-- itself create: a future migration adding a user-scoped table without
-- CASCADE would either break deletion with a foreign-key violation or leave
-- orphaned rows behind, and neither would be noticed until someone tried it.
--
-- Nobody else is affected. Under owned copies, a non-admin's rows are
-- genuinely theirs — no other user is holding a reference to any of them.
-- Their catalog_grants rows go too, which is correct: those exist only to
-- record what they have already received, and the account receiving it is
-- gone.
--
-- Signing up again with the same email produces a new user id and a fresh
-- ensure_seeded() run, so the user gets a clean copy of the catalog rather
-- than anything resurrected. That is the desired "start over" behaviour and it
-- falls out of the design rather than needing to be built.
--
-- ── Deleting straight out of auth.users ──────────────────────────────
--
-- Stated plainly because it is the one part of this migration that relies on
-- something Supabase has not contractually promised: auth is Supabase's own
-- schema, and the supported path is the admin API. The delete cascades
-- correctly to auth.identities, auth.sessions and auth.refresh_tokens (all
-- foreign-keyed to auth.users), and this is the conventional way to implement
-- self-serve deletion without a backend — but it is supported by convention,
-- not by contract. It must be proven on a throwaway non-admin signup before
-- it is trusted, and re-checked after any Supabase auth upgrade.

create or replace function delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'delete_my_account: no authenticated user';
  end if;

  -- See the header. This is the guarantee; the dialog in auth.js is only the
  -- explanation.
  if exists (select 1 from admins a where a.user_id = uid) then
    raise exception 'delete_my_account: admin accounts cannot be deleted from the app'
      using hint = 'An admin library is the catalog. Close an admin account from the SQL editor, deliberately.';
  end if;

  delete from auth.users where id = uid;
end;
$$;

-- anon would no-op anyway (auth.uid() is null, so the first branch raises),
-- but an unauthenticated role holding EXECUTE on a deletion function is not a
-- thing to leave lying around for someone to find later and reason about
-- afresh. Revoked explicitly, and asserted by verify_0008.sql check 4.
revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;

comment on function delete_my_account() is
  'Deletes the calling user (auth.uid()) and, by ON DELETE CASCADE, every row '
  'they own. No parameter, so it can only ever act on the caller. Refuses for '
  'admins, whose library is the catalog - see 0008_delete_account.sql.';
