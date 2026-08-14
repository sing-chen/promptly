// Sidebar "Categories" list (#sidebar-categories-list, lib/render.mjs
// renderNav) - server-rendered from the admin's catalog set for anonymous
// visitors, replaced here with the caller's own once signed in
// (BUILD_BRIEF_v6.md §3). Direct counterpart to collectionsNav.js.
//
// Two differences from Collections, both deliberate:
//
// 1. The signed-out state is a real list, not an explainer callout. Guests do
//    have categories - the catalog's - they just can't change them, so the
//    static markup is already correct for them and is restored on sign-out.
//
// 2. Link targets change by tier (§5). Anonymous links point at the
//    statically generated /browse/<slug>/ page; signed-in links point at
//    Home filtered by that category (/?cat=<slug>), because a user-created
//    category has no static page and sending some categories to one
//    destination and some to another would be the odd behaviour.
import { supabase } from './supabaseClient.js';
import { loadMyCategories, loadMyPrompts } from './db.js';
import { esc, catColorVars, categoryName, SIDEBAR_LIST_CAP } from './lib/render.mjs';
import { promptHasCategory } from './lib/schema.mjs';

function renderLive(categories, counts) {
  if (categories.length === 0) {
    return '<p class="sidebar-empty-note">No categories yet.</p>';
  }
  const link = (c) => `
<a href="/?cat=${encodeURIComponent(c.slug)}" data-cat-slug="${esc(c.slug)}"><span class="nav-icon nav-cat-dot" aria-hidden="true" style="${catColorVars(c)}"></span><span class="nav-label">${esc(categoryName(c))}</span><span class="count">${counts.get(c.slug) || 0}</span></a>`;

  // Same cap-and-disclose shape renderNav uses for the static list, so the
  // sidebar can't grow its own scrollbar however many categories exist.
  const visible = categories.slice(0, SIDEBAR_LIST_CAP).map(link).join('');
  const hidden = categories.slice(SIDEBAR_LIST_CAP);
  if (!hidden.length) return visible;
  return `${visible}<details class="sidebar-more"><summary><span class="sidebar-more-more">Show ${hidden.length} more</span><span class="sidebar-more-less">Show less</span></summary>${hidden.map(link).join('')}</details>`;
}

async function refresh(list, session) {
  if (!session) {
    if (list.dataset.staticHtml !== undefined) list.innerHTML = list.dataset.staticHtml;
    return;
  }
  try {
    const [categories, prompts] = await Promise.all([loadMyCategories(), loadMyPrompts()]);
    const active = prompts.filter(p => !p.is_archived);
    const counts = new Map(categories.map(c =>
      [c.slug, active.filter(p => promptHasCategory(p, c.slug)).length]));
    list.innerHTML = renderLive(categories, counts);
  } catch {
    // Leave whatever was already there rather than blanking the nav on a
    // transient network error - same choice collectionsNav.js makes.
  }
}

function init() {
  const list = document.getElementById('sidebar-categories-list');
  if (!list || !supabase) return;
  // Stash the server-rendered catalog list so signing out can restore it
  // exactly, rather than being rebuilt from data the caller no longer has.
  list.dataset.staticHtml = list.innerHTML;

  supabase.auth.getSession().then(({ data: { session } }) => refresh(list, session));
  supabase.auth.onAuthStateChange((_e, session) => refresh(list, session));
  document.addEventListener('categories:changed', () => {
    supabase.auth.getSession().then(({ data: { session } }) => refresh(list, session));
  });
  document.addEventListener('personalization:changed', () => {
    supabase.auth.getSession().then(({ data: { session } }) => refresh(list, session));
  });

  // Navigates rather than opening an editor, which is the deliberate choice -
  // /categories/ is where add, rename, recolour and delete all live, and
  // duplicating any of that in a modal would mean two places to keep in step.
  // §9aj relabelled the control to match: it was a "+" captioned "New
  // category", which described a modal this has never opened.
  document.getElementById('manage-categories-btn')?.addEventListener('click', () => {
    location.href = '/categories/';
  });
}

init();
