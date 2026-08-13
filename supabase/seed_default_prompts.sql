-- ⚠ BROKEN AS WRITTEN SINCE 0006_user_categories.sql. Every INSERT below
-- targets `prompts.categories`, a text[] column that migration drops
-- (BUILD_BRIEF_v6.md §3) - so this script now fails immediately with
-- `column "categories" of relation "prompts" does not exist`.
--
-- Deliberately not rewritten. It was already marked "review before reusing"
-- in supabase/README.md - it predates the owned-copies model, and its 5
-- prompts are test content due to be replaced by canonical ones anyway. If
-- it is ever revived, the fix is mechanical: drop `categories` from each
-- column list, capture the inserted ids, and add a follow-up
--   insert into prompt_categories (prompt_id, category_id)
--   select p.id, c.id from prompts p
--   cross join lateral unnest(array['writing','marketing']) as s(slug)
--   join categories c on c.user_id = p.user_id and c.slug = s.slug
--   where p.slug = '...';
-- per prompt. Note the ≥1-category rule: a prompt inserted here has no
-- categories until that second statement runs.
--
-- One-time content migration, not a schema migration - recreates the 5
-- prompts that used to live in prompts/*.md as published default prompts in
-- Supabase, owned by you (an admin). Needed because scripts/build.mjs now
-- reads default prompts from Supabase instead of prompts/*.md
-- (supabase/README.md "There is no markdown catalog") - without this, those
-- 5 prompts (and the "Client Onboarding Kit" collection and
-- "client-onboarding" sequence that reference two of them by slug) simply
-- vanish from the live site the next time it builds.
--
-- Run this in the Supabase SQL Editor, once, after replacing
-- 'you@example.com' below with your actual admin account email (same
-- pattern as the admins seed step in supabase/README.md).
--
-- Not idempotent - re-running it will hit the unique(user_id, slug)
-- constraint and fail on the second run (which is the point: it stops you
-- from accidentally duplicating everything). If you need to re-run it after
-- a partial failure, delete whichever of these 5 slugs it already inserted
-- first (`delete from prompts where user_id = (select id from auth.users
-- where email = 'you@example.com') and slug in ('ad-copy-variants', ...)`).
--
-- Known, accepted content loss: the markdown-only `handoff` field
-- (draft-the-brief had "the drafted brief") has no equivalent column in
-- this schema (see lib/content.mjs's loadPrompts() comment) and is not
-- carried over - the sequence rail's handoff line just won't show for this
-- pair once migrated. Flag if you want it addressed properly (e.g. adding
-- the column) rather than silently dropped going forward.

with admin_user as (
  select id as user_id from auth.users where email = 'you@example.com'
),

-- draft-the-brief inserted first (and its id captured) so
-- post-meeting-follow-up's depends_on can reference it directly -
-- Supabase's depends_on is a UUID FK to prompts.id, not a slug string like
-- the old markdown frontmatter's was.
draft_the_brief as (
  insert into prompts (
    user_id, slug, title, categories, purpose, body, notes,
    sequence, sequence_step, is_curated, published, added, updated
  )
  select
    user_id,
    'draft-the-brief',
    'Draft the brief',
    array['product'],
    'Turn a rough project idea into a structured one-page brief.',
    $body$You are helping draft a one-page project brief from a rough idea.

Rough idea: {{rough_idea}}
Client or team: {{client_name}}
Known constraints: {{constraints}}

Produce a one-page brief with sections: Objective, Scope, Out of scope, Success criteria, Open questions. Keep it under 400 words. Flag anything that's an assumption rather than a stated fact.$body$,
    $notes$Use this at kickoff, before any client call has happened. Not meant for briefs that already have stakeholder input — use a revision prompt for that instead.$notes$,
    'client-onboarding', 1, true, true, '2026-06-01', '2026-07-15'
  from admin_user
  returning id, user_id
)

insert into prompts (
  user_id, slug, title, categories, purpose, body, notes,
  sequence, sequence_step, depends_on, is_curated, published, added, updated
)
select user_id, 'post-meeting-follow-up', 'Post-meeting follow-up', array['writing', 'product'],
  'Turn raw meeting notes into a clean follow-up email.',
  $body$You are writing a follow-up email after a client meeting.

Meeting notes: {{meeting_notes}}
Recipient: {{recipient_name}}
Tone: {{tone}}

Write a follow-up email that: summarizes what was agreed, lists next steps with owners, and asks any open questions. Keep it under 200 words. Sign off with {{sender_name}}.$body$,
  $notes$Best used within a few hours of the meeting, while notes are still fresh. Not a substitute for a formal recap doc on large deals.$notes$,
  'client-onboarding', 2, id, true, true, '2026-06-01', '2026-07-15'
from draft_the_brief;

insert into prompts (
  user_id, slug, title, categories, purpose, body, notes, is_curated, published, added, updated
)
select id, 'ad-copy-variants', 'Ad copy variants', array['marketing'],
  'Generate multiple short ad copy variants for A/B testing from one product description.',
  $body$You are writing short-form ad copy variants for A/B testing.

Product/offer: {{product_description}}
Platform: {{platform}}
Target audience: {{audience}}

Generate 5 distinct headline + body variants (headline under 40 characters, body under 90 characters). Vary the angle across variants: benefit-led, urgency, social proof, curiosity, direct offer.$body$,
  $notes$Good for quick variant generation, not a substitute for a full campaign brief.$notes$,
  true, true, '2026-03-20', '2026-06-01'
from auth.users where email = 'you@example.com';

insert into prompts (
  user_id, slug, title, categories, purpose, body, notes, is_curated, published, added, updated
)
select id, 'explain-a-stack-trace', 'Explain a stack trace', array['code'],
  'Get a plain-language explanation of an error and likely fix, from a raw stack trace.',
  $body$You are debugging an error from a stack trace.

Stack trace:
{{stack_trace}}

Relevant code context (if any): {{code_context}}

Explain in plain language what's going wrong, point to the most likely root cause, and suggest a fix. If the trace is ambiguous, say what additional info would resolve it.$body$,
  $notes$Works best with the full trace pasted in, not just the last line. For flaky/intermittent bugs, use a dedicated debugging-agent prompt instead.$notes$,
  true, true, '2026-05-10', '2026-05-10'
from auth.users where email = 'you@example.com';

insert into prompts (
  user_id, slug, title, categories, purpose, body, notes, is_curated, published, added, updated
)
select id, 'summarize-research-paper', 'Summarize a research paper', array['research'],
  'Condense an academic paper into a skimmable summary with key findings and limitations.',
  $body$You are summarizing an academic paper for someone who won't read the full text.

Paper text or abstract + key sections: {{paper_text}}

Summarize in this structure: One-sentence takeaway, Key findings (bulleted), Methodology (2-3 sentences), Limitations, Why it matters. Avoid jargon where possible; define any term you must use.$body$,
  $notes$Works well for papers under ~30 pages pasted directly. For very long papers, chunk by section first.$notes$,
  true, true, '2026-04-02', '2026-04-02'
from auth.users where email = 'you@example.com';
