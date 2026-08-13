// The merged-catalog data layer: signed in, there is no separate "your
// prompts" list - All Prompts, Category, and Search all show one set,
// exactly the way BUILD_BRIEF_v4.md §2 frames the account tier ("a personal
// layer on top", not a second app). This module computes that merged set:
// every published default the caller hasn't forked/archived, plus the
// caller's own prompts (self-authored or forked). Anonymous visitors never
// call this - they get the unmodified static build.
import { supabase } from './supabaseClient.js';
import { loadPrompts, loadOverrides, forkPrompt } from './db.js';

let cache = null; // { userId, ... } - reset whenever the session changes

export async function getPersonalization() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    cache = null;
    return null;
  }
  if (cache && cache.userId === session.user.id) return cache;

  const [all, overrides] = await Promise.all([loadPrompts(), loadOverrides()]);
  const userId = session.user.id;
  const byId = new Map(all.map(p => [p.id, p]));
  // Archiving a default happens either as a side effect of editing it
  // (forkPrompt() upserts prompt_overrides with is_archived=true - see
  // supabase/README.md "Admin curation...") or directly, via the Archive
  // icon on any default's row/card (personalizedActions() in
  // lib/render.mjs, db.js's archiveDefault()) - reversible from /archived/
  // (public/scripts/archived.js), which only lists the fork_prompt_id=null
  // case so a forked-and-archived default isn't offered twice (its fork
  // already carries "View original" back to it). Either way, the check
  // here is just on is_archived, since both cases hide the default the
  // same way in the merged list.
  const archivedDefaultIds = new Set(overrides.filter(o => o.is_archived).map(o => o.default_prompt_id));
  const ownPrompts = all.filter(p => p.user_id === userId && !p.is_curated);
  const defaults = all.filter(p => p.is_curated && p.published && !archivedDefaultIds.has(p.id));
  const merged = [...defaults, ...ownPrompts]
    .sort((a, b) => new Date(b.updated || b.added || 0) - new Date(a.updated || a.added || 0));

  cache = { userId, byId, overrides, ownPrompts, defaults, merged };
  return cache;
}

export function isOwnPrompt(personalization, prompt) {
  return Boolean(personalization) && prompt.user_id === personalization.userId && !prompt.is_curated;
}

// Called after any write that changes the merged set (fork, edit, delete) -
// every page's own listener re-fetches via getPersonalization(), which will
// now hit Supabase again instead of the stale cache.
export function invalidatePersonalization() {
  cache = null;
}

document.addEventListener('personalization:changed', invalidatePersonalization);

// The Edit affordance is available on every row of the merged catalog, not
// just the caller's own prompts - clicking it on a default prompt is what
// forks it (supabase/README.md "Admin curation..."). This resolves whatever
// was clicked down to an owned prompt the edit modal can actually open:
// - already own it → itself, no write
// - already forked it once (e.g. reached via "View original" on that fork) →
//   the existing fork, so a second click never creates a duplicate/orphaned
//   fork the way calling forkPrompt() unconditionally would
// - genuinely new → forkPrompt() creates it, archiving the default
// Callers should call this from the Edit button's own click handler (so they
// can disable the button and show/clear an error around the awaited fork)
// and then dispatch 'prompt:edit-request' with the *returned* prompt -
// newPrompt.js's listener never needs to know forking happened at all.
export async function resolveOwnPromptForEdit(personalization, prompt) {
  if (prompt.user_id === personalization.userId && !prompt.is_curated) return prompt;

  const existingOverride = personalization.overrides.find(o => o.default_prompt_id === prompt.id && o.fork_prompt_id);
  const existingFork = existingOverride && personalization.byId.get(existingOverride.fork_prompt_id);
  if (existingFork) return existingFork;

  const fork = await forkPrompt(prompt);
  invalidatePersonalization();
  document.dispatchEvent(new CustomEvent('personalization:changed'));
  return fork;
}
