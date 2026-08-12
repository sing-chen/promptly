// Account-tier data layer - thin wrapper around supabase-js, shaped like
// lib/content.mjs's loadPrompts()/buildData() (BUILD_BRIEF_v4.md §6) but
// backed by live queries instead of file reads. Every function here relies
// on RLS (supabase/migrations/0001_init_schema.sql) to scope rows to the
// caller - nothing in this file filters by user_id itself except where
// writing a new row requires it (RLS WITH CHECK still needs the value
// supplied on INSERT; there's no column default for it).
//
// A plain `select('*')` on prompts returns both the caller's own rows
// (owned, any visibility) and every published default (is_curated=true,
// published=true) - that mix is intentional, see supabase/README.md's
// "Admin curation, publishing, and per-user forks" section. Callers that
// need to tell them apart check `user_id` against the current session.
import { supabase } from './supabaseClient.js';

class DbUnavailableError extends Error {
  constructor() {
    super('Supabase is not configured for this build (missing SUPABASE_URL/SUPABASE_ANON_KEY).');
  }
}

function assertConfigured() {
  if (!supabase) throw new DbUnavailableError();
}

async function requireUserId() {
  assertConfigured();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Not signed in.');
  return data.user.id;
}

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// ── prompts ─────────────────────────────────────────────────────────

// Every prompt visible to the caller: their own (including forks and, if
// admin, their curated drafts) plus every published default - see the
// module comment above for why those are mixed in one array.
export async function loadPrompts() {
  assertConfigured();
  return unwrap(await supabase.from('prompts').select('*').order('updated', { ascending: false }));
}

export async function getPrompt(id) {
  assertConfigured();
  return unwrap(await supabase.from('prompts').select('*').eq('id', id).single());
}

// Regular prompt creation - always is_curated=false regardless of what's
// passed in `fields`, so this can't be used to sneak in a curated row (only
// createCuratedPrompt, gated by the admin RLS check, can).
export async function createPrompt(fields) {
  const user_id = await requireUserId();
  return unwrap(await supabase.from('prompts')
    .insert({ ...fields, user_id, is_curated: false, published: false })
    .select().single());
}

export async function updatePrompt(id, fields) {
  assertConfigured();
  return unwrap(await supabase.from('prompts').update(fields).eq('id', id).select().single());
}

// Removes it from the caller's own profile only - a fork's admin original,
// and every other user's copy, is untouched (supabase/README.md).
export async function deletePrompt(id) {
  assertConfigured();
  const { error } = await supabase.from('prompts').delete().eq('id', id);
  if (error) throw error;
}

// ── admin curation (requires the caller to be listed in `admins`; RLS
// rejects the insert/update otherwise, this just gives it a clear name) ──

export async function createCuratedPrompt(fields) {
  const user_id = await requireUserId();
  return unwrap(await supabase.from('prompts')
    .insert({ ...fields, user_id, is_curated: true, published: false })
    .select().single());
}

export async function publishPrompt(id) {
  return updatePrompt(id, { published: true });
}

export async function unpublishPrompt(id) {
  return updatePrompt(id, { published: false });
}

// ── forking a default prompt (supabase/README.md "Admin curation,
// publishing, and per-user forks") ──────────────────────────────────

// Copies `defaultPrompt` (a row with is_curated=true, published=true) into
// a new row owned by the caller, then upserts the prompt_overrides row that
// marks the default as archived/superseded in the caller's own view. This
// is what "editing a default" means in the app - there's no direct UPDATE
// path for a row you don't own (RLS forbids it).
//
// The fork starts with the default's own slug (unlike createPrompt(), which
// always generates one from the title) - that's what lets a fork's
// /prompt/[slug]/-shaped identity line up with the default it came from. But
// slug is only unique per-user, so if the caller already happens to own a
// different prompt with that exact slug (a real, if uncommon, collision -
// e.g. they independently titled something the same as a default they're
// now forking), the insert 23505s. Retry with an incrementing numeric
// suffix, same dedupe-on-collision approach as newPrompt.js's
// createWithUniqueSlug, rather than surfacing the raw constraint error.
export async function forkPrompt(defaultPrompt) {
  const user_id = await requireUserId();
  const base = defaultPrompt.slug;
  let fork;
  for (let attempt = 1; attempt <= 20; attempt++) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`;
    try {
      fork = unwrap(await supabase.from('prompts')
        .insert({
          user_id,
          slug,
          title: defaultPrompt.title,
          categories: defaultPrompt.categories,
          purpose: defaultPrompt.purpose,
          body: defaultPrompt.body,
          notes: defaultPrompt.notes,
          sequence: defaultPrompt.sequence,
          sequence_step: defaultPrompt.sequence_step,
          source_prompt_id: defaultPrompt.id,
          is_curated: false,
          published: false
        })
        .select().single());
      break;
    } catch (err) {
      if (err?.code !== '23505' || attempt === 20) throw err;
    }
  }

  await supabase.from('prompt_overrides').upsert({
    user_id,
    default_prompt_id: defaultPrompt.id,
    fork_prompt_id: fork.id,
    is_archived: true
  });

  return fork;
}

// Archives a default without forking it (no prompt_overrides row at all
// means "shown normally"). Safe to call whether or not a row already
// exists for this (user_id, default_prompt_id) pair.
export async function archiveDefault(defaultPromptId) {
  const user_id = await requireUserId();
  return unwrap(await supabase.from('prompt_overrides')
    .upsert({ user_id, default_prompt_id: defaultPromptId, is_archived: true })
    .select().single());
}

export async function unarchiveDefault(defaultPromptId) {
  const user_id = await requireUserId();
  return unwrap(await supabase.from('prompt_overrides')
    .upsert({ user_id, default_prompt_id: defaultPromptId, is_archived: false })
    .select().single());
}

// Every default the caller has archived and/or forked - join this against
// loadPrompts()'s is_curated/published rows client-side to know which
// defaults to hide or badge as superseded; not worth a server-side join for
// this table's size.
export async function loadOverrides() {
  assertConfigured();
  return unwrap(await supabase.from('prompt_overrides').select('*'));
}

// ── favorites ────────────────────────────────────────────────────────

export async function loadFavorites() {
  assertConfigured();
  return unwrap(await supabase.from('favorites').select('prompt_id'));
}

export async function addFavorite(promptId) {
  const user_id = await requireUserId();
  const { error } = await supabase.from('favorites').upsert({ user_id, prompt_id: promptId });
  if (error) throw error;
}

export async function removeFavorite(promptId) {
  const user_id = await requireUserId();
  const { error } = await supabase.from('favorites')
    .delete().eq('user_id', user_id).eq('prompt_id', promptId);
  if (error) throw error;
}

// ── collections ──────────────────────────────────────────────────────

export async function loadCollections() {
  assertConfigured();
  // Nested select pulls each collection's linked prompts in one round trip
  // rather than N+1 queries - collection_prompts' own RLS still applies to
  // the join, so this can't leak prompts the caller can't otherwise see.
  return unwrap(await supabase.from('collections').select('*, collection_prompts(prompt_id)'));
}

export async function createCollection(fields) {
  const user_id = await requireUserId();
  return unwrap(await supabase.from('collections').insert({ ...fields, user_id }).select().single());
}

export async function updateCollection(id, fields) {
  assertConfigured();
  return unwrap(await supabase.from('collections').update(fields).eq('id', id).select().single());
}

export async function deleteCollection(id) {
  assertConfigured();
  const { error } = await supabase.from('collections').delete().eq('id', id);
  if (error) throw error;
}

export async function addPromptToCollection(collectionId, promptId) {
  assertConfigured();
  const { error } = await supabase.from('collection_prompts')
    .upsert({ collection_id: collectionId, prompt_id: promptId });
  if (error) throw error;
}

export async function removePromptFromCollection(collectionId, promptId) {
  assertConfigured();
  const { error } = await supabase.from('collection_prompts')
    .delete().eq('collection_id', collectionId).eq('prompt_id', promptId);
  if (error) throw error;
}

// ── admin status ─────────────────────────────────────────────────────

// Whether the signed-in user can author curated prompts - drives whether
// the app shows admin-only UI (create-prompt form, publish toggle). Reads
// the caller's own row via admins_self_read; returns false when signed out
// or on any error, so this is always safe to call speculatively.
export async function isAdmin() {
  if (!supabase) return false;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return false;
  const { data } = await supabase.from('admins').select('user_id').eq('user_id', userData.user.id).maybeSingle();
  return Boolean(data);
}
