-- ════════════════════════════════════════════════════════════════════
-- 0007_category_limit.sql — a per-user ceiling on categories
-- ════════════════════════════════════════════════════════════════════
-- OPEN_ITEMS.md B3. Twenty categories per user, enforced on the interactive
-- insert path only.
--
-- What this is for, stated plainly because it changes what the rule should
-- be: this is a *sanity ceiling*, not a security control and not a quota.
-- Nothing breaks at 21 categories the way it breaks at, say, zero. What
-- degrades is the UI — the sidebar's category list and the filter toolbar's
-- pill row are laid out for something on the order of a dozen entries, and
-- there is no design for what either looks like at 200. The cap exists so
-- neither can be driven into a state nobody has drawn.
--
-- That framing decides the two questions that follow.
--
-- ── Why an RLS clause rather than a trigger ──────────────────────────
--
-- A BEFORE INSERT trigger would be the obvious tool, and it is the wrong one
-- here, because of what it would do to ensure_seeded().
--
-- Seeding MUST NOT be capped. Two paths would break if it were:
--
--   * phase 1 handing a newly published catalog category to a user who is
--     already at the ceiling, and
--   * phase 4's re-grant of a category the user had deleted (v6 §7.2, and
--     OPEN_ITEMS.md F4).
--
-- Both run inside the same transaction that seeds that user's *prompts*. A
-- trigger raising there would not merely refuse one category — it would abort
-- ensure_seeded() wholesale, on every page load, silently, so the user would
-- simply stop receiving catalog prompts with nothing on screen to say why.
-- That is a far worse failure than an unbounded sidebar.
--
-- An RLS policy avoids the problem structurally rather than by remembering to
-- add an exemption. ensure_seeded() is SECURITY DEFINER and its owner owns
-- `categories`, and a table's owner bypasses row-level security unless the
-- table is set FORCE ROW LEVEL SECURITY (it is not, and verify_0007.sql check
-- 4 asserts it stays that way — that is the single load-bearing assumption in
-- this migration). So seeding is exempt for a reason rooted in how Postgres
-- works, and no future edit to ensure_seeded() can accidentally lose the
-- exemption.
--
-- The consequence, and it is intended: a user CAN end up above 20 — they
-- create 20, then the admin publishes a new catalog category and seeding
-- hands them a 21st. The cap governs what you can *create*, not what you can
-- *hold*. Given the choice between "seeding is reliable" and "20 is never
-- exceeded", reliability wins; the ceiling is protecting a layout, not an
-- invariant.
--
-- ── Why the admin is capped too ──────────────────────────────────────
--
-- No exemption for admins, and that is the part that makes the cap mean
-- anything at all for everyone else. An admin's library *is* the catalog
-- (v5 §4), so capping the admin caps the catalog at 20 — which is what
-- guarantees a freshly seeded account starts at or under the ceiling. Exempt
-- the admin and a 60-category catalog would put every new user at 60 on their
-- first load, through the seeding path that deliberately cannot refuse.
--
-- ── The one gap, stated rather than papered over ─────────────────────
--
-- RLS WITH CHECK subqueries run against the command's snapshot, so rows
-- inserted by the *same* statement are not visible to the count. A single
-- bulk insert straight at PostgREST could therefore land more than 20 at
-- once. The app never does this (createCategory inserts one row), and closing
-- it would mean the statement-level trigger this migration just argued
-- against. For a ceiling whose worst case is an ugly sidebar on your own
-- account, that trade is the right way round.
--
-- ── Where the number lives ───────────────────────────────────────────
--
-- 20 appears twice: here, and as MAX_CATEGORIES_PER_USER in lib/schema.mjs,
-- which is what /categories/ uses to disable the button and explain itself
-- before the database ever refuses. Changing the limit means editing both —
-- there is no way to have one source of truth across Postgres and the
-- browser, so the honest thing is to say so in both places. They disagree
-- safely in one direction only: if the constant is raised without a
-- migration, the app offers a create that the database then refuses, and the
-- user sees a raw RLS error.

-- Recreated wholesale rather than patched: this is 0006's categories_insert
-- with one conjunct added. Keeping the original clauses verbatim (including
-- the admin/is_curated check) matters — dropping and rewriting a policy is
-- exactly where a security clause goes missing unnoticed.
drop policy if exists "categories_insert" on categories;
create policy "categories_insert" on categories
  for insert
  with check (
    user_id = auth.uid()
    and (not is_curated or exists (select 1 from admins a where a.user_id = auth.uid()))
    and (
      select count(*) from categories c2 where c2.user_id = auth.uid()
    ) < 20
  );

comment on policy "categories_insert" on categories is
  'Own rows only; is_curated requires admin; and at most 20 categories per '
  'user on this path. The limit is deliberately NOT applied to ensure_seeded(), '
  'which bypasses RLS as table owner - see 0007_category_limit.sql. Mirrored by '
  'MAX_CATEGORIES_PER_USER in lib/schema.mjs.';
