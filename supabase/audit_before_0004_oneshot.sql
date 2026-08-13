-- One-shot version of audit_before_0004.sql — everything in a single result
-- set, because the Supabase SQL Editor shows only the last statement's rows
-- when you run a whole file.
--
-- READ-ONLY. Run before 0004_owned_copies.sql. Everything it inspects
-- (source_prompt_id, edited_from_source, prompt_overrides) is dropped by that
-- migration, so it cannot be run afterwards.

select 'account'            as section,
       u.email              as detail_1,
       case when a.user_id is not null then 'ADMIN' else 'regular user' end as detail_2,
       u.created_at::text   as detail_3
from auth.users u
left join admins a on a.user_id = u.id

union all
-- Forks from the old model. Likely test artefacts; candidates for deletion.
select 'fork',
       f.title,
       'from: ' || coalesce(src.title, '(original missing)'),
       case when f.edited_from_source then 'diverged' else 'unmodified' end
from prompts f
left join prompts src on src.id = f.source_prompt_id
where f.source_prompt_id is not null

union all
-- Genuinely personal prompts (never forked). These simply stay in your
-- library under the new model — nothing to decide.
select 'personal (not a fork)',
       p.title,
       p.slug,
       p.updated::text
from prompts p
where not p.is_curated
  and p.source_prompt_id is null

union all
-- Override rows. All discarded by 0004; expected, since admins skip seeding.
select 'override',
       coalesce(d.title, '(prompt missing)'),
       case when o.fork_prompt_id is not null then 'archived by forking' else 'archived directly' end,
       o.created_at::text
from prompt_overrides o
left join prompts d on d.id = o.default_prompt_id

union all
-- Favourites/collections pointing at a fork. These cascade away if the fork
-- is deleted — worth seeing before that happens.
select 'ref: favourite -> fork',
       f.title,
       '',
       ''
from favorites fav
join prompts f on f.id = fav.prompt_id
where f.source_prompt_id is not null

union all
select 'ref: collection -> fork',
       f.title,
       'in: ' || c.title,
       ''
from collection_prompts cp
join prompts f on f.id = cp.prompt_id
join collections c on c.id = cp.collection_id
where f.source_prompt_id is not null

order by 1, 2;
