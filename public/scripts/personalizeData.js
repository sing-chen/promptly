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
import { loadMyPrompts, ensureSeeded } from './db.js';

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
  const all = granted > 0 ? await loadMyPrompts() : initial;

  const userId = session.user.id;
  const byId = new Map(all.map(p => [p.id, p]));
  const prompts = all.filter(p => !p.is_archived);
  const archived = all.filter(p => p.is_archived);

  cache = { userId, byId, all, prompts, archived, grantedThisLoad: granted };
  return cache;
}

// Called after any write that changes the library (edit, archive, delete,
// duplicate) - every page's own listener re-fetches via getPersonalization(),
// which will now hit Supabase again instead of the stale cache.
export function invalidatePersonalization() {
  cache = null;
}

document.addEventListener('personalization:changed', invalidatePersonalization);
