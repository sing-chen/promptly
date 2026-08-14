-- 0009_collection_position.sql
--
-- Adds `position` to collections, so /collections/ can offer the same
-- drag-to-reorder that /categories/ has had since 0006. This is the only
-- schema change §9an needs; everything else in that pass is client-side.
--
-- Deliberately the same shape as categories.position (0006):
--   int not null default 0, with the list index written by the client
-- rather than a fractional/linked-list ordering. The lists are short (a
-- personal library, capped at 20 categories and realistically fewer
-- collections), reordering is a rare interactive act, and db.js's
-- reorderCollections() rewrites every row's position in one pass - so the
-- cleverer schemes buy nothing here and cost a reader's time.
--
-- Idempotent: `if not exists` on both statements, so re-running against a
-- project that already has it is a no-op rather than an error.

alter table collections
  add column if not exists position int not null default 0;

-- Existing rows all land on 0 from the default, which would leave them in
-- whatever order Postgres felt like returning. Seed them by title so the
-- first render after this migration matches what the page showed before it
-- (loadCollections() had no order clause, but the UI sorted by title) -
-- an upgrade should not visibly shuffle anything.
--
-- Scoped per user via the window, so positions are 1..n within each account
-- rather than globally unique. Only touches rows still at the default, so
-- re-running after someone has reordered will not undo their arrangement.
with ordered as (
  select id, row_number() over (partition by user_id order by title) as rn
  from collections
)
update collections c
set position = o.rn
from ordered o
where c.id = o.id
  and c.position = 0;

-- Matches categories_user_idx: the query that matters is "this user's
-- collections, in order", and that is the index for it.
create index if not exists collections_user_position_idx
  on collections (user_id, position);
