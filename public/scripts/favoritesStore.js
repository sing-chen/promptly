// Where favourites live, for both tiers.
//
// Signed out: localStorage, keyed by **slug**. An anonymous visitor only ever
// sees catalog prompts, and slug is the only identifier they have that
// survives a rebuild.
//
// Signed in: the `favorites` table, keyed by **prompt id**. Under owned
// copies (BUILD_BRIEF_v5.md) a user's copy of a catalog prompt is a different
// row with a different id - and possibly a different slug, if it hit the
// dedupe suffix - so slug is no longer a safe key. Prompt id also lets a
// purely personal prompt be favourited, which the slug-and-static-list
// approach could never represent.
//
// The two key spaces are therefore deliberately different, which is why every
// star button carries both `data-fav-slug` and `data-fav-id` and callers ask
// this module which one applies.
import { supabase } from './supabaseClient.js';
import { loadFavorites, addFavorite, removeFavorite, loadMyPrompts } from './db.js';

const KEY = 'promptly:favorites';
const MERGED_KEY = 'promptly:favorites:merged';

let mode = 'local';        // 'local' | 'db'
let favSet = new Set();
let ready = null;
let currentUserId = null;

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function writeLocal(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode */ }
}

// Carries anonymous favourites over on first sign-in. Without it, signing in
// silently empties your favourites, which reads as data loss even though
// nothing was lost. Matches on slug, since that's all the local list has.
//
// The localStorage copy is deliberately NOT cleared: signing out should
// return you to the favourites you had as an anonymous visitor rather than
// an empty page.
async function mergeLocalFavorites(userId) {
  const flag = `${MERGED_KEY}:${userId}`;
  let alreadyMerged = false;
  try { alreadyMerged = localStorage.getItem(flag) === '1'; } catch { /* ignore */ }
  if (alreadyMerged) return;

  const localSlugs = readLocal();
  if (localSlugs.length) {
    try {
      const mine = await loadMyPrompts();
      const bySlug = new Map(mine.map(p => [p.slug, p.id]));
      const ids = localSlugs.map(s => bySlug.get(s)).filter(Boolean);
      await Promise.all(ids.map(id => addFavorite(id).catch(() => null)));
    } catch {
      // A failed merge shouldn't block sign-in or lose the local list - the
      // flag isn't set, so the next load tries again.
      return;
    }
  }
  try { localStorage.setItem(flag, '1'); } catch { /* ignore */ }
}

// Resolves once per session change. Every read below is synchronous against
// the resolved set, so rendering never awaits.
export function ensureFavorites() {
  if (ready) return ready;
  ready = (async () => {
    const session = supabase ? (await supabase.auth.getSession()).data.session : null;
    if (session) {
      mode = 'db';
      currentUserId = session.user.id;
      await mergeLocalFavorites(currentUserId);
      try {
        favSet = new Set((await loadFavorites()).map(r => r.prompt_id));
      } catch {
        favSet = new Set(); // network trouble - show none rather than wrong ones
      }
    } else {
      mode = 'local';
      currentUserId = null;
      favSet = new Set(readLocal());
    }
  })();
  return ready;
}

export function resetFavorites() {
  ready = null;
  favSet = new Set();
}

export function favoritesMode() {
  return mode;
}

// Which of a button's two identifiers applies right now.
export function favKeyFrom({ id, slug }) {
  return mode === 'db' ? (id || null) : (slug || null);
}

export function isFavoriteKey(key) {
  return key != null && favSet.has(key);
}

export function favoriteCount() {
  return favSet.size;
}

export async function toggleFavoriteKey(key) {
  if (key == null) return false;
  const active = favSet.has(key);

  if (mode === 'db') {
    // Optimistic: flip locally so the star responds immediately, roll back
    // if the write fails. A star that lags a round trip feels broken.
    if (active) favSet.delete(key); else favSet.add(key);
    try {
      if (active) await removeFavorite(key); else await addFavorite(key);
    } catch (err) {
      if (active) favSet.add(key); else favSet.delete(key);
      throw err;
    }
  } else {
    if (active) favSet.delete(key); else favSet.add(key);
    writeLocal([...favSet]);
  }

  document.dispatchEvent(new CustomEvent('favorites:changed'));
  return favSet.has(key);
}
