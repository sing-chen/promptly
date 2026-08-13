// Sidebar "Collections" list (#sidebar-collections-list, lib/render.mjs
// renderNav) - server-rendered as a plain explainer callout for
// anonymous/signed-out use (collections have no curated/admin set - see
// supabase/README.md). Signed in, this module replaces that with the
// caller's own live Supabase collections instead. Signed out, it restores
// the original static callout markup.
import { supabase } from './supabaseClient.js';
import { loadCollections } from './db.js';
import { esc, SIDEBAR_LIST_CAP } from './lib/render.mjs';

// Caps the visible list the same way renderNav caps Categories in
// lib/render.mjs (SIDEBAR_LIST_CAP) - the sidebar must never grow its own
// scrollbar. Unlike Categories, Collections already has a real destination
// page (/collections/) to send the overflow to, so this uses a "View all"
// link instead of an in-place <details> disclosure.
function renderLive(collections) {
  if (collections.length === 0) {
    return '<p class="sidebar-empty-note">No collections yet.</p>';
  }
  const sorted = collections.slice().sort((a, b) => a.title.localeCompare(b.title));
  const items = sorted.slice(0, SIDEBAR_LIST_CAP).map(c => `<a href="/collections/">${esc(c.title)}</a>`).join('');
  const more = sorted.length > SIDEBAR_LIST_CAP
    ? `<a href="/collections/" class="sidebar-view-all">View all ${sorted.length} →</a>`
    : '';
  return items + more;
}

async function refresh(list, session) {
  if (!session) {
    if (list.dataset.staticHtml !== undefined) list.innerHTML = list.dataset.staticHtml;
    return;
  }
  try {
    list.innerHTML = renderLive(await loadCollections());
  } catch {
    // Leave whatever was already there rather than blanking the nav on a
    // transient network error.
  }
}

function init() {
  const list = document.getElementById('sidebar-collections-list');
  if (!list || !supabase) return;
  list.dataset.staticHtml = list.innerHTML;

  const refreshNow = () => supabase.auth.getSession().then(({ data: { session } }) => refresh(list, session));

  refreshNow();
  supabase.auth.onAuthStateChange(refreshNow);
  // Dispatched by newCollection.js on create and collections.js on
  // delete/add/remove - keeps this list in sync without a poll.
  document.addEventListener('collections:changed', refreshNow);
}

document.addEventListener('DOMContentLoaded', init);
