// Sidebar "Collections" list (#sidebar-collections-list, lib/render.mjs
// renderNav) - server-rendered as a plain explainer callout for
// anonymous/signed-out use (collections have no curated/admin set - see
// supabase/README.md). Signed in, this module replaces that with the
// caller's own live Supabase collections instead. Signed out, it restores
// the original static callout markup.
import { supabase } from './supabaseClient.js';
import { loadCollections } from './db.js';
import { esc, SIDEBAR_LIST_CAP, ICON } from './lib/render.mjs';

// Caps the visible list the same way renderNav caps Categories in
// lib/render.mjs (SIDEBAR_LIST_CAP) - the sidebar must never grow its own
// scrollbar. Unlike Categories, Collections already has a real destination
// page (/collections/) to send the overflow to, so this uses a "View all"
// link instead of an in-place <details> disclosure.
function renderLive(collections) {
  if (collections.length === 0) {
    return '<p class="sidebar-empty-note">No collections yet.</p>';
  }
  // No sort here, deliberately (§9ao). This used to re-sort alphabetically by
  // title, which silently discarded the order loadCollections() returns and
  // made drag-to-reorder on /collections/ look broken: the arrangement saved,
  // the sidebar ignored it. loadCollections() orders by `position` (0009) with
  // title as the tie-break, exactly as loadMyCategories() does - so the right
  // thing to do here is what categoriesNav.js already does, which is nothing.
  const items = collections.slice(0, SIDEBAR_LIST_CAP).map(c => `
<a href="/collections/"><span class="nav-icon" aria-hidden="true">${ICON.collection}</span><span class="nav-label">${esc(c.title)}</span></a>`).join('');
  const more = collections.length > SIDEBAR_LIST_CAP
    ? `<a href="/collections/" class="sidebar-view-all">View all ${collections.length} →</a>`
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
  // Dispatched by collections.js on create/delete/add/remove - keeps this
  // list in sync without a poll. (newCollection.js used to fire it too, until
  // §9am removed the sidebar's create modal.)
  document.addEventListener('collections:changed', refreshNow);

  // Mirrors categoriesNav.js's handler exactly, which is the point of §9am:
  // both sections now have a gear that navigates to the page where all of
  // that section's management lives, rather than one navigating and one
  // opening a modal that looked identical.
  document.getElementById('manage-collections-btn')?.addEventListener('click', () => {
    location.href = '/collections/';
  });
}

document.addEventListener('DOMContentLoaded', init);
