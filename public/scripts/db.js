// Account-tier data layer - thin wrapper around supabase-js, shaped like
// lib/content.mjs's loadPrompts()/buildData() (BUILD_BRIEF_v4.md §6) but
// backed by live queries instead of file reads. Every function here relies
// on RLS (supabase/migrations/0001_init_schema.sql) to scope rows to the
// caller - nothing in this file filters by user_id itself except where
// writing a new row requires it (RLS WITH CHECK still needs the value
// supplied on INSERT; there's no column default for it).
//
// Owned-copies model (BUILD_BRIEF_v5.md). Signing up copies the whole
// published catalog into your library, so every prompt a signed-in user can
// see is genuinely theirs - there is no borrowing, no forking, and no
// per-user override table. The catalog still exists as admin-owned rows
// (is_curated=true), because the anonymous static build is generated from
// it, but authenticated users hold copies rather than references.
//
// Two distinct reads follow from that, and mixing them up is the easy
// mistake here:
// - loadMyPrompts() - the caller's library. What every signed-in view
//   renders. Own rows only.
// - loadPrompts() - everything RLS lets the caller see, which still
//   includes published catalog rows they don't own. Only wanted for
//   catalog-level work (admin screens, and the Pass 2 merge UI).
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

// The caller's library - every row they own, newest-updated first. This is
// what Home/Category/Search render for a signed-in user.
//
// No is_curated filter, and that is deliberate rather than an oversight
// (BUILD_BRIEF_v5.md §3.5): a regular user can never own a curated row (RLS
// forbids setting is_curated=true), so for them this is exactly their
// copies plus anything they wrote. An admin owns the catalog rows and holds
// no copies, so for them this *is* the catalog - which is the intended
// model, not a leak. Ownership alone is the correct predicate for both.
//
// Archived rows come back too; filtering them is a view concern (the main
// list hides them, /archived/ shows only them).
export async function loadMyPrompts() {
  const user_id = await requireUserId();
  return unwrap(await supabase.from('prompts')
    .select('*').eq('user_id', user_id).order('updated', { ascending: false }));
}

// Everything RLS lets the caller see: their own rows plus every published
// catalog prompt. Not what a signed-in view should render - use
// loadMyPrompts() for that. Kept for catalog-level work (admin screens, and
// the Pass 2 merge UI, which needs the catalog's current content to compare
// a copy against).
export async function loadPrompts() {
  assertConfigured();
  return unwrap(await supabase.from('prompts').select('*').order('updated', { ascending: false }));
}

// Published catalog rows only - the admin-authored set that feeds the
// static build and gets copied into libraries by ensure_seeded().
export async function loadCatalog() {
  assertConfigured();
  return unwrap(await supabase.from('prompts')
    .select('*').eq('is_curated', true).eq('published', true)
    .order('updated', { ascending: false }));
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

// ── seeding ──────────────────────────────────────────────────────────

// Grants the caller a copy of every published catalog prompt they haven't
// already been given, returning how many were newly added.
//
// Idempotent and cheap to call on every authenticated load: it covers both
// signup (no grants exist, so the whole catalog arrives) and later publishes
// (each user picks a new catalog prompt up on their next visit). That's why
// there is no publish-time fan-out job anywhere in this codebase -
// distribution is pull-based, so publishing stays a single row update
// (BUILD_BRIEF_v5.md §4).
//
// No-ops for admins, who own the catalog rows themselves.
export async function ensureSeeded() {
  assertConfigured();
  const { data, error } = await supabase.rpc('ensure_seeded');
  if (error) throw error;
  return data ?? 0;
}

// ── archive / delete / duplicate (all operate on rows you own) ───────

// Archive hides a prompt from the main list while keeping it, and is
// reversible from /archived/. Delete (above) is permanent. Under the
// owned-copies model both verbs apply to every prompt in the library -
// the old split, where only unowned defaults could be archived and only
// owned rows deleted, is gone with the borrowing model that caused it.
export async function archivePrompt(id) {
  return updatePrompt(id, { is_archived: true });
}

export async function unarchivePrompt(id) {
  return updatePrompt(id, { is_archived: false });
}

// Independent copy of a prompt the caller owns, always personal
// (is_curated=false) regardless of what it was copied from. Two uses
// (BUILD_BRIEF_v5.md §5.3): any user keeping subtle variants of a prompt,
// and an admin who wants a personal version of a catalog prompt - editing
// the catalog row itself would be a broadcast to everyone holding it.
export async function duplicatePrompt(prompt, overrides = {}) {
  const user_id = await requireUserId();
  return insertWithUniqueSlug({
    user_id,
    slug: prompt.slug,
    title: `${prompt.title} (copy)`,
    categories: prompt.categories,
    purpose: prompt.purpose,
    body: prompt.body,
    notes: prompt.notes,
    sequence: prompt.sequence,
    sequence_step: prompt.sequence_step,
    is_curated: false,
    published: false,
    is_archived: false,
    ...overrides
  });
}

// slug is unique per user, so any insert carrying a slug the caller already
// owns 23505s. Retry with an incrementing numeric suffix rather than
// surfacing a raw constraint violation - same approach as newPrompt.js's
// createWithUniqueSlug and the seeding function's server-side loop.
async function insertWithUniqueSlug(fields) {
  const base = fields.slug;
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      return unwrap(await supabase.from('prompts')
        .insert({ ...fields, slug: attempt === 1 ? base : `${base}-${attempt}` })
        .select().single());
    } catch (err) {
      if (err?.code !== '23505' || attempt === 20) throw err;
    }
  }
}

// ── promoting a personal prompt into the catalog (admin only) ───────

// Lands the prompt as a catalog *draft* (is_curated=true, published=false),
// never straight to published. That keeps the reversible step and the
// irreversible one apart: promoting is undoable and visible only to the
// admin, while publishing distributes copies that cannot be recalled
// (BUILD_BRIEF_v5.md §5.3). Call publishPrompt() separately.
//
// RLS already permits this - prompts_update's WITH CHECK allows is_curated
// on a row you own if you're in `admins` - so no new policy was needed.
export async function promoteToCatalog(id) {
  return updatePrompt(id, { is_curated: true });
}

// Reverse of the above. Must unpublish first: the
// prompts_published_requires_curated constraint forbids published without
// is_curated. Users already holding copies keep them - the copies are
// independent rows - and seeding won't re-grant, since their grant rows
// persist.
export async function demoteFromCatalog(id) {
  await updatePrompt(id, { published: false });
  return updatePrompt(id, { is_curated: false });
}

// ── catalog versions ─────────────────────────────────────────────────

// Version rows are written by the prompts_write_catalog_version trigger, not
// by clients - there is no INSERT policy on catalog_versions. The one thing
// a client may change is `notifiable` on the most recent version, which is
// the manual override (BUILD_BRIEF_v5.md §6.2): push a notes-only fix
// deliberately, or release a body typo-fix quietly.
//
// Nothing consumes versions until the Pass 2 merge UI ships, but the flag
// has to be recorded correctly from now on, or the history is wrong by the
// time anything reads it.
export async function setLatestVersionNotifiable(catalogPromptId, notifiable) {
  assertConfigured();
  const latest = unwrap(await supabase.from('catalog_versions')
    .select('id').eq('catalog_prompt_id', catalogPromptId)
    .order('created_at', { ascending: false }).limit(1));
  if (!latest.length) return null;
  return unwrap(await supabase.from('catalog_versions')
    .update({ notifiable }).eq('id', latest[0].id).select().single());
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
