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
//
// Categories are user-owned too as of BUILD_BRIEF_v6.md: a `categories` table
// the caller owns rows in, joined to prompts through `prompt_categories`.
// prompts.categories (text[]) is gone. Every read here embeds the join and
// normalises it back to a `categories` array on the prompt - but of category
// *objects* now ({id, slug, name, color, position}), not slug strings, since
// every consumer that renders a badge needs the colour alongside the slug.
import { supabase } from './supabaseClient.js';

// One embed spelling, used by every prompt read, so they can't drift apart.
// PostgREST resolves the many-to-many through prompt_categories' two foreign
// keys; the join table's own RLS applies to the embed, so this can never
// surface a category the caller isn't allowed to see.
const PROMPT_SELECT = '*, prompt_categories(category:categories(id,slug,name,color,position))';

// Flattens the embed into the shape the renderers expect. Sorted by the
// owner's own `position` so a prompt's badges appear in the order they chose
// in the sidebar, rather than in whatever order PostgREST returned the join.
function normalizePrompt(row) {
  if (!row) return row;
  const { prompt_categories, ...rest } = row;
  return {
    ...rest,
    categories: (prompt_categories || [])
      .map(pc => pc.category)
      .filter(Boolean)
      .sort((a, b) => a.position - b.position || a.slug.localeCompare(b.slug))
  };
}

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
    .select(PROMPT_SELECT).eq('user_id', user_id).order('updated', { ascending: false }))
    .map(normalizePrompt);
}

// Everything RLS lets the caller see: their own rows plus every published
// catalog prompt. Not what a signed-in view should render - use
// loadMyPrompts() for that. Kept for catalog-level work (admin screens, and
// the Pass 2 merge UI, which needs the catalog's current content to compare
// a copy against).
export async function loadPrompts() {
  assertConfigured();
  return unwrap(await supabase.from('prompts')
    .select(PROMPT_SELECT).order('updated', { ascending: false }))
    .map(normalizePrompt);
}

// Published catalog rows only - the admin-authored set that feeds the
// static build and gets copied into libraries by ensure_seeded().
export async function loadCatalog() {
  assertConfigured();
  return unwrap(await supabase.from('prompts')
    .select(PROMPT_SELECT).eq('is_curated', true).eq('published', true)
    .order('updated', { ascending: false }))
    .map(normalizePrompt);
}

export async function getPrompt(id) {
  assertConfigured();
  return normalizePrompt(unwrap(
    await supabase.from('prompts').select(PROMPT_SELECT).eq('id', id).single()));
}

// Regular prompt creation - always is_curated=false regardless of what's
// passed in `fields`, so this can't be used to sneak in a curated row (only
// createCuratedPrompt, gated by the admin RLS check, can).
export async function createPrompt(fields) {
  const user_id = await requireUserId();
  const { categories, ...cols } = fields;
  const row = unwrap(await supabase.from('prompts')
    .insert({ ...cols, user_id, is_curated: false, published: false })
    .select().single());
  return applyCategories(row, categories);
}

export async function updatePrompt(id, fields) {
  assertConfigured();
  const { categories, ...cols } = fields;
  // A prompt update with nothing but categories in it is a real case (the
  // edit modal submits every field, but a caller like archivePrompt() passes
  // only its own flag) - so skip the UPDATE entirely rather than sending an
  // empty patch, which PostgREST rejects.
  const row = Object.keys(cols).length
    ? unwrap(await supabase.from('prompts').update(cols).eq('id', id).select().single())
    : await getPrompt(id);
  return applyCategories(row, categories);
}

// ── a prompt's categories ────────────────────────────────────────────

// Reconciles prompt_categories against the desired set of category ids.
//
// INSERT BEFORE DELETE, and that order is not cosmetic: 0006's
// prompt_categories_assert_nonempty trigger rejects any statement that would
// leave a prompt with zero categories. Clearing the old set first and then
// adding the new one - the obvious spelling - trips it every time a prompt's
// categories are swapped wholesale, which is exactly what the edit modal does.
//
// `undefined` means "don't touch them" (the caller wasn't editing categories);
// an empty array is rejected outright rather than sent to the database, so the
// failure names the product rule instead of surfacing a trigger exception.
async function applyCategories(row, categoryIds) {
  if (categoryIds === undefined) return row;

  const wanted = [...new Set(categoryIds.filter(Boolean))];
  if (!wanted.length) throw new Error('A prompt must have at least one category.');

  const existing = unwrap(await supabase.from('prompt_categories')
    .select('category_id').eq('prompt_id', row.id)).map(r => r.category_id);

  const toAdd = wanted.filter(id => !existing.includes(id));
  const toRemove = existing.filter(id => !wanted.includes(id));

  if (toAdd.length) {
    const { error } = await supabase.from('prompt_categories')
      .upsert(toAdd.map(category_id => ({ prompt_id: row.id, category_id })));
    if (error) throw error;
  }
  if (toRemove.length) {
    const { error } = await supabase.from('prompt_categories')
      .delete().eq('prompt_id', row.id).in('category_id', toRemove);
    if (error) throw error;
  }

  return getPrompt(row.id);
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
  const { categories, ...cols } = fields;
  const row = unwrap(await supabase.from('prompts')
    .insert({ ...cols, user_id, is_curated: true, published: false })
    .select().single());
  return applyCategories(row, categories);
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

// The caller's own grant rows (RLS scopes this to them). Normally private
// bookkeeping the UI never touches - the one legitimate read is the account
// page, which uses it to tell prompts the user wrote apart from prompts the
// catalog gave them, and to spot which received ones they've since edited.
export async function loadMyGrants() {
  const user_id = await requireUserId();
  return unwrap(await supabase.from('catalog_grants')
    .select('catalog_prompt_id, user_prompt_id, granted_at').eq('user_id', user_id));
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
  // prompt.categories is objects now; the copy needs their ids. Safe to reuse
  // them directly rather than remap: a duplicate is always the same owner's,
  // so it points at the same category rows.
  return insertWithUniqueSlug({
    user_id,
    slug: prompt.slug,
    title: `${prompt.title} (copy)`,
    categories: (prompt.categories || []).map(c => c.id),
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
  const { categories, ...cols } = fields;
  const base = cols.slug;
  let row;
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      row = unwrap(await supabase.from('prompts')
        .insert({ ...cols, slug: attempt === 1 ? base : `${base}-${attempt}` })
        .select().single());
      break;
    } catch (err) {
      if (err?.code !== '23505' || attempt === 20) throw err;
    }
  }
  // Outside the retry loop on purpose: applyCategories() writes to a table
  // with its own unique constraint, and a 23505 from *there* must not be
  // mistaken for a slug collision and answered by inserting a second prompt.
  return applyCategories(row, categories);
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

// ── categories (BUILD_BRIEF_v6.md) ───────────────────────────────────

// The caller's own categories, in their chosen order. Same ownership-only
// predicate as loadMyPrompts(), and for the same reason: a regular user can
// never own a curated row, and an admin owns the catalog set rather than
// copies of it, so "rows I own" is correct for both.
export async function loadMyCategories() {
  const user_id = await requireUserId();
  return unwrap(await supabase.from('categories')
    .select('*').eq('user_id', user_id).order('position').order('slug'));
}

// The admin's canonical set. Read by nothing in the signed-in UI - the static
// build is the real consumer (lib/supabaseBuild.mjs) - but exposed here for
// symmetry with loadCatalog() and for an admin comparing the two.
export async function loadCatalogCategories() {
  assertConfigured();
  return unwrap(await supabase.from('categories')
    .select('*').eq('is_curated', true).order('position').order('slug'));
}

// Slug is generated here, once, and never regenerated on rename: it is the
// key ensure_seeded() matches catalog categories on and the URL segment for
// /browse/<slug>/, so a rename that changed it would break both. Renaming
// changes `name` alone - the same trade v5 §9 already took for prompt slugs.
export function slugifyCategory(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export async function createCategory({ name, description, color, position }) {
  const user_id = await requireUserId();
  const base = slugifyCategory(name) || 'category';
  // unique(user_id, slug) - same suffix retry as prompts. More likely here
  // than there, since "Writing" and "writing " slugify identically.
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      return unwrap(await supabase.from('categories').insert({
        user_id,
        slug: attempt === 1 ? base : `${base}-${attempt}`,
        name: String(name).trim(),
        description: description || null,
        color,
        position: position ?? 0,
        is_curated: false
      }).select().single());
    } catch (err) {
      if (err?.code !== '23505' || attempt === 20) throw err;
    }
  }
}

// Deliberately cannot change `slug` or `is_curated`: the first is immutable
// by design (above), and the second is a promote/demote decision that has no
// UI and would silently republish a personal category to the whole catalog.
export async function updateCategory(id, { name, description, color, position }) {
  assertConfigured();
  const patch = {};
  if (name !== undefined) patch.name = String(name).trim();
  if (description !== undefined) patch.description = description || null;
  if (color !== undefined) patch.color = color;
  if (position !== undefined) patch.position = position;
  return unwrap(await supabase.from('categories')
    .update(patch).eq('id', id).select().single());
}

// Which prompts would be left with nothing if this category went - the
// pre-flight the delete dialog needs (BUILD_BRIEF_v6.md §4.3). Returns every
// prompt using the category, flagged with whether this is its only one, so
// the dialog can say "12 prompts, 3 of which have no other category".
export async function categoryUsage(categoryId) {
  const user_id = await requireUserId();
  const rows = unwrap(await supabase.from('prompt_categories')
    .select('prompt_id, prompt:prompts(id,title,is_archived,user_id)')
    .eq('category_id', categoryId));

  const mine = rows.filter(r => r.prompt && r.prompt.user_id === user_id);
  if (!mine.length) return { total: 0, sole: [] };

  // One follow-up query rather than N: how many categories each of those
  // prompts has in total.
  const counts = unwrap(await supabase.from('prompt_categories')
    .select('prompt_id, category_id').in('prompt_id', mine.map(r => r.prompt_id)));
  const byPrompt = new Map();
  for (const c of counts) byPrompt.set(c.prompt_id, (byPrompt.get(c.prompt_id) || 0) + 1);

  return {
    total: mine.length,
    sole: mine.filter(r => byPrompt.get(r.prompt_id) === 1).map(r => r.prompt)
  };
}

// Deletion goes through an RPC, not a plain delete, because the reassignment
// and the delete have to share a transaction: 0006's trigger rejects the
// delete the moment it would strand a prompt, so the replacement must already
// be filed. PostgREST gives a client one statement per request, so this can't
// be done from here without leaving a half-reassigned library behind if the
// tab closes mid-way. Returns how many prompts were reassigned.
export async function deleteCategory(id, reassignToId = null) {
  assertConfigured();
  const { data, error } = await supabase.rpc('delete_category', {
    p_category_id: id,
    p_reassign_to: reassignToId
  });
  if (error) throw error;
  return data ?? 0;
}

// Drag-to-reorder. N updates rather than one upsert, deliberately: PostgREST
// spells upsert as INSERT ... ON CONFLICT, so a partial row carrying only
// {id, position} fails the NOT NULL checks on slug/name/color before conflict
// resolution ever runs. Sending only `position` also means a concurrent
// rename in another tab isn't clobbered.
//
// Bounded by the number of categories a person has, and only fires on drop.
export async function reorderCategories(idsInOrder) {
  assertConfigured();
  await Promise.all(idsInOrder.map((id, i) =>
    supabase.from('categories').update({ position: i + 1 }).eq('id', id)
      .then(({ error }) => { if (error) throw error; })));
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

// ── account deletion ─────────────────────────────────────────────────

// Deletes the caller's own account and, by ON DELETE CASCADE, every row they
// own (0008_delete_account.sql). There is no id to pass: the function acts on
// auth.uid() and nothing else, so this wrapper takes no argument by design
// rather than by omission - see the migration header.
//
// Two things the caller must handle, neither of which belongs in here:
//
// 1. The session outlives the row. The browser goes on holding a valid JWT
//    until it expires, for a user that no longer exists. RLS returns nothing
//    so there is no exposure, but the UI would sit there looking signed in
//    and quietly broken. accountDelete.js signs out locally and reloads.
// 2. It refuses for admins, whose library is the catalog. That arrives here
//    as a Postgres exception, not as a friendly message, so the caller is
//    responsible for saying something readable - and for not offering the
//    action in the first place, which is why isAdmin() is checked before the
//    dialog opens.
export async function deleteMyAccount() {
  assertConfigured();
  const { error } = await supabase.rpc('delete_my_account');
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
