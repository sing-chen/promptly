// The signed-in data layer. Under the owned-copies model (BUILD_BRIEF_v5.md)
// there is nothing to merge: signing up copies the whole published catalog
// into the caller's library, so All Prompts, Category and Search simply show
// the rows they own. Anonymous visitors never call this - they get the
// unmodified static build.
//
// This module used to compute a merged view of borrowed defaults plus own
// prompts, with an overrides table deciding which defaults were hidden. All
// of that is gone along with the borrowing model.
import { supabase } from './supabaseClient.js';
import { loadMyPrompts, loadMyCategories, loadCollections, ensureSeeded } from './db.js';

let cache = null; // { userId, ... } - reset whenever the session changes

export async function getPersonalization() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    cache = null;
    return null;
  }
  if (cache && cache.userId === session.user.id) return cache;

  // Seeding is pull-based (BUILD_BRIEF_v5.md §4), so this is also what picks
  // up catalog prompts published since the caller's last visit. Run in
  // parallel with the library read and only re-read when something was
  // actually granted - in the common case (nothing new) that keeps this to a
  // single round trip rather than two sequential ones, which matters because
  // this is a multi-page static site where every navigation pays the cost.
  const [granted, initial] = await Promise.all([
    ensureSeeded().catch(err => {
      // Never block the library on a seeding failure - the user still has
      // whatever they already hold, and the next load retries (it's
      // idempotent by design).
      console.warn('ensure_seeded failed; showing existing library', err);
      return 0;
    }),
    loadMyPrompts()
  ]);
  // Categories are read after seeding rather than alongside it: ensure_seeded()
  // now creates the caller's category rows too (BUILD_BRIEF_v6.md §7), so a
  // parallel read would race a brand-new account to an empty list and leave
  // the sidebar and the filter pills blank until the next navigation.
  // Collections ride along here rather than being fetched by whoever needs
  // them (§9ap). They are read on every personalized page now that the
  // sidebar's collection links filter Home, and this module is already the
  // one place that caches per-session reads - a second caller doing its own
  // fetch would mean two round trips and two things to invalidate.
  //
  // Unlike categories, this does not have to wait for seeding: ensure_seeded()
  // creates no collections (there is no catalog set of them - they are
  // user-generated only), so there is no empty-list race to lose.
  const [all, categories, collections] = await Promise.all([
    granted > 0 ? loadMyPrompts() : Promise.resolve(initial),
    loadMyCategories(),
    loadCollections()
  ]);

  const userId = session.user.id;
  const byId = new Map(all.map(p => [p.id, p]));
  const prompts = all.filter(p => !p.is_archived);
  const archived = all.filter(p => p.is_archived);

  // prompt id -> [collection slug, …]. Built once here because the filter
  // toolbar needs the inverse of what loadCollections() returns: it has
  // collections each holding prompt ids, and every row needs to know which
  // collections it belongs to.
  const collectionSlugsByPromptId = new Map();
  for (const c of collections) {
    for (const cp of c.collection_prompts || []) {
      const list = collectionSlugsByPromptId.get(cp.prompt_id) || [];
      list.push(c.slug);
      collectionSlugsByPromptId.set(cp.prompt_id, list);
    }
  }

  cache = {
    userId, byId, all, prompts, archived, categories,
    collections, collectionSlugsByPromptId,
    grantedThisLoad: granted
  };
  return cache;
}

// Which of the caller's collections hold this prompt, as [{slug, title}] in
// the user's own collection order (§9aq). Shared by the quick-view modal and
// the static prompt page, which need the same answer in the same shape and
// would otherwise each re-derive it from collection_prompts.
//
// Returns [] for anything unknown - no session, no collections, or a prompt id
// belonging to someone else's row - so callers can treat "nothing to show" and
// "nothing found" identically, which is what they both want to do.
export function collectionsForPrompt(pers, promptId) {
  if (!pers || !promptId) return [];
  const slugs = new Set(pers.collectionSlugsByPromptId?.get(promptId) || []);
  if (!slugs.size) return [];
  return (pers.collections || [])
    .filter(c => slugs.has(c.slug))
    .map(c => ({ slug: c.slug, title: c.title }));
}

// Called after any write that changes the library (edit, archive, delete,
// duplicate) - every page's own listener re-fetches via getPersonalization(),
// which will now hit Supabase again instead of the stale cache.
export function invalidatePersonalization() {
  cache = null;
}

document.addEventListener('personalization:changed', invalidatePersonalization);
