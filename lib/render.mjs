import {
  promptHasCategory, categorySlugs, readableInk, FALLBACK_CATEGORY_COLOR
} from './schema.mjs';

// Cache-busting for /scripts and /styles references this module emits into
// HTML (script src, link href, and the inline-script import specifiers
// below). Set once per build via setAssetVersion() before any page is
// rendered - deliberately NOT applied as a blind find-and-replace over full
// rendered HTML, since that HTML also embeds untrusted prompt content
// (renderPromptTable's JSON payload) where a matching-looking substring
// could get corrupted. av() only touches strings we author ourselves.
let ASSET_VERSION = '';
export function setAssetVersion(v) { ASSET_VERSION = v; }
function av(path) { return ASSET_VERSION ? `${path}?v=${ASSET_VERSION}` : path; }

// How many items a sidebar section list (Categories, Collections) shows
// before collapsing the rest behind a disclosure/"view all" - see renderNav.
// The sidebar must never grow its own scrollbar, so every section list has
// to cap itself instead of relying on overflow.
export const SIDEBAR_LIST_CAP = 6;

// Category colour is data now, not a CSS class (BUILD_BRIEF_v6.md §6).
//
// categoryHue() used to map a slug onto one of six `cat-*` classes by its
// index in the hardcoded CATEGORIES array, modulo six - so with nine
// categories, three pairs silently shared a colour (writing+education,
// code+creative, marketing+ops-admin). That is gone along with the array.
//
// What replaces it is a pair of inline custom properties on the element
// itself:
//     <span class="cat-badge" style="--cat:#A8552A;--cat-ink:#FFFFFF">
// which collapses six CSS rules per consumer down to one, and - the part
// that actually matters - makes the anonymous and signed-in cases the same
// mechanism. The static build writes the catalog colour into the span;
// personalize.js rewrites the same span with the user's. There is no separate
// "inject a stylesheet of custom properties when signed in" step, because the
// value travels with the element that uses it.
//
// Returns a style attribute *value*, not a whole attribute, so callers can
// merge it with their own.
export function catColorVars(category) {
  const color = (typeof category === 'string' ? null : category?.color) || FALLBACK_CATEGORY_COLOR;
  return `--cat:${color};--cat-ink:${readableInk(color)}`;
}

// A category's display label. Falls back to title-casing the slug for the
// string form, which is all the markdown lint tool and any legacy caller has.
export function categoryName(category) {
  if (!category) return '';
  if (typeof category === 'string') return categoryLabel(category);
  return category.name || categoryLabel(category.slug || '');
}

export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function categoryLabel(slug) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Solid-fill badge(s) for a prompt's categories (§9b) - a prompt can belong to
// more than one, so no "primary" is picked; every category renders, in order.
// `max` caps how many render before folding the rest into a neutral "+N" -
// used in the table's tight category column, omitted on the detail page.
export function renderCatBadges(categories, { max } = {}) {
  const cats = categories || [];
  const shown = max ? cats.slice(0, max) : cats;
  const overflow = max && cats.length > max ? cats.length - max : 0;
  let html = shown.map(c =>
    `<span class="cat-badge" style="${catColorVars(c)}">${esc(categoryName(c))}</span>`).join('');
  if (overflow) html += `<span class="cat-badge cat-overflow">+${overflow}</span>`;
  return html;
}

// Resolves a chained prompt's position in its sequence (label, step/total,
// prev/next neighbors) - shared by the detail page and the §9b quick-view
// modal so both render identical sequence-stepper content.
export function resolveSeqInfo(prompt, data) {
  if (!prompt.sequence) return null;
  const seq = data.sequences.find(s => s.slug === prompt.sequence);
  if (!seq) return null;
  const idx = seq.steps.findIndex(s => s.slug === prompt.slug);
  const prev = seq.steps[idx - 1];
  const next = seq.steps[idx + 1];
  return {
    label: categoryLabel(prompt.sequence),
    step: prompt.sequence_step,
    total: seq.steps.length,
    prev: prev ? { slug: prev.slug, title: prev.title } : null,
    next: next ? { slug: next.slug, title: next.title } : null
  };
}

const ICON = {
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polygon points="12 2 15.09 8.63 22 9.24 16.5 14.14 18.18 21 12 17.27 5.82 21 7.5 14.14 2 9.24 8.91 8.63 12 2"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
  // Deliberately NOT the overlapping-squares `copy` glyph above: that one
  // copies prompt text to the clipboard, this one creates a new prompt row.
  // Two actions sitting next to each other in the same toolbar, so they must
  // not share an icon.
  duplicate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="9" y1="12" x2="15" y2="12"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>',
  chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16.5"/><circle cx="12" cy="7.7" r="0.6" fill="currentColor" stroke="none"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>',
  category: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>',
  moon: '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  sun: '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/></svg>',
  menu: '<svg class="icon-menu-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
  close: '<svg class="icon-menu-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  stack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polygon points="12 3 21 8 12 13 3 8 12 3"/><polyline points="3 12 12 17 21 12"/><polyline points="3 16 12 21 21 16"/></svg>',
  flow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="5" cy="6" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="19" cy="18" r="2.2"/><line x1="6.8" y1="7.6" x2="10.2" y2="10.4"/><line x1="13.8" y1="13.6" x2="17.2" y2="16.4"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 3l7 3.2v5.3c0 4.4-3 8.2-7 9.5-4-1.3-7-5.1-7-9.5V6.2L12 3z"/><polyline points="9.2 12.2 11.2 14.2 15 10"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  panelCollapse: '<svg class="icon-panel-collapse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><rect x="3" y="4" width="18" height="16" rx="3"/><line x1="10" y1="4" x2="10" y2="20"/><polyline points="7.5 9 5.5 12 7.5 15"/></svg>',
  panelExpand: '<svg class="icon-panel-expand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><rect x="3" y="4" width="18" height="16" rx="3"/><line x1="10" y1="4" x2="10" y2="20"/><polyline points="6 9 8 12 6 15"/></svg>',
  gridView: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
  listView: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>',
  archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><rect x="3" y="4" width="18" height="4.5" rx="1.2"/><path d="M4.5 8.5v9a2 2 0 002 2h11a2 2 0 002-2v-9"/><line x1="10" y1="13" x2="14" y2="13"/></svg>',
  unarchive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><rect x="3" y="4" width="18" height="4.5" rx="1.2"/><path d="M4.5 8.5v9a2 2 0 002 2h11a2 2 0 002-2v-9"/><line x1="12" y1="11.5" x2="12" y2="16.5"/><polyline points="9.8 13.3 12 11 14.2 13.3"/></svg>'
};

// Runs before CSS paints (placed at the very top of <head>, not deferred)
// to avoid a flash of the wrong theme - same anti-flash approach as
// amplified thinker's nav.js, just scoped to a small inline script instead
// of needing the whole nav injected via JS.
const THEME_INIT_SCRIPT = `<script>(function(){try{var s=localStorage.getItem('promptly:theme');var t=(s==='light'||s==='dark')?s:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>`;

// Same anti-flash approach as THEME_INIT_SCRIPT, for the desktop sidebar
// collapse preference (public/scripts/sidebarCollapse.js) - sets the
// attribute on <html> (always present this early) rather than a class on
// .app-shell, which doesn't exist yet when this runs.
const SIDEBAR_INIT_SCRIPT = `<script>(function(){try{if(localStorage.getItem('promptly:sidebarCollapsed')==='true')document.documentElement.setAttribute('data-sidebar-collapsed','true');}catch(e){}})();</script>`;

// Same anti-flash approach again, for the drag-resized sidebar width
// (public/scripts/sidebarResize.js) - sets the --sidebar-width custom
// property (styles/base.css's .sidebar reads it) on <html> so a returning
// visitor's wider sidebar doesn't flash at the 240px default for one frame.
// SIDEBAR_MIN/SIDEBAR_MAX are duplicated (not imported) into
// sidebarResize.js - keep the two in sync if either changes.
const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 480;
const SIDEBAR_WIDTH_INIT_SCRIPT = `<script>(function(){try{var w=parseInt(localStorage.getItem('promptly:sidebarWidth'),10);if(w&&w>=${SIDEBAR_MIN}&&w<=${SIDEBAR_MAX})document.documentElement.style.setProperty('--sidebar-width',w+'px');}catch(e){}})();</script>`;

export function renderChip(text, { seq = false } = {}) {
  return `<span class="chip${seq ? ' chip-seq' : ''}">${esc(text)}</span>`;
}

// Left sidebar (replaces the old top nav bar, whole-site rebuild). `active`
// is a plain key ('home', 'favorites', 'sequences', 'account', ...) or a
// namespaced key ('category:writing', 'collection:starter-kit') so a
// specific dynamic-list item can be highlighted without every caller having
// to know the full list of possible keys.
export function renderNav(active, data) {
  const [activeKey, activeSlug] = (active || '').split(':');
  const link = (href, label, key, { icon = '', extra = '' } = {}) =>
    `<a href="${href}"${activeKey === key ? ' aria-current="page"' : ''}>${icon ? `<span class="nav-icon" aria-hidden="true">${icon}</span>` : ''}<span class="nav-label">${label}</span>${extra}</a>`;

  // Collections have no admin/curated concept (supabase/README.md "Admin
  // curation..."; db.js's createCollection() has no admin check) - there is
  // no build-time collections list at all. This callout is the permanent
  // signed-out state of #sidebar-collections-list; collectionsNav.js swaps
  // it for the caller's own live Supabase collections once signed in, and
  // restores exactly this markup on sign-out.
  const collectionsSignedOutCallout = `
<div class="sidebar-callout">
  <p>Collections group your prompts for a project or workflow.</p>
  <a href="/why-sign-in/">Sign in to create one →</a>
</div>`;

  // Categories render in full at build time (the catalog set, small in
  // practice, so this cap rarely fires for an anonymous visitor - but a
  // signed-in user can now create as many as they like, and categoriesNav.js
  // reuses the same cap when it swaps this list for theirs), but the sidebar
  // must never grow its own scrollbar just
  // because a list section got long (see .sidebar-section-list in
  // base.css). Past SIDEBAR_LIST_CAP, the rest collapse into a native
  // <details> disclosure instead - no JS, no extra page needed, and no
  // scroll container - matching the same cap+reveal pattern collectionsNav.js
  // uses for the Collections list below (which needs JS since it's
  // populated live from Supabase, not at build time).
  // The icon slot carries a filled dot in the category's own colour rather
  // than the folder glyph every category shared (BUILD_BRIEF_v6.md §6.5).
  // Stacking nine of these is exactly where the old six-hues-for-nine
  // collision became visible, and it is also where a stroked or filled folder
  // stops working: at 18px a 1.6px outline in a mid-tone hue reads as tinted
  // grey, and a solid folder is a large flat shape that fights the label. A
  // dot is the one form that reads unambiguously as "this colour" at that
  // size, and it matches the badge fill exactly, so the sidebar and the pills
  // agree at a glance.
  //
  // Link target is tier-dependent (§5): anonymous visitors get the statically
  // generated /browse/<slug>/ page, so SEO and no-JS browsing are untouched.
  // categoriesNav.js rewrites these to /?cat=<slug> once signed in, because a
  // user-created category has no static page and sending some categories to
  // one destination and some to another would be the odd behaviour, not this.
  const catLink = c => `
<a href="/browse/${c.slug}/" data-cat-slug="${esc(c.slug)}"${activeKey === 'category' && activeSlug === c.slug ? ' aria-current="page"' : ''}><span class="nav-icon nav-cat-dot" aria-hidden="true" style="${catColorVars(c)}"></span><span class="nav-label">${esc(categoryName(c))}</span><span class="count">${c.count}</span></a>`;
  const allCategories = (data?.categories || []).filter(c => c.count > 0);
  const visibleCategories = allCategories.slice(0, SIDEBAR_LIST_CAP).map(catLink).join('');
  const hiddenCategories = allCategories.slice(SIDEBAR_LIST_CAP);
  const categories = hiddenCategories.length
    ? `${visibleCategories}<details class="sidebar-more"><summary><span class="sidebar-more-more">Show ${hiddenCategories.length} more</span><span class="sidebar-more-less">Show less</span></summary>${hiddenCategories.map(catLink).join('')}</details>`
    : visibleCategories;

  return `
<aside class="sidebar" id="sidebar" aria-label="Site navigation">
  <div class="sidebar-brand-row">
    <a href="/" class="sidebar-brand">
      <img src="/images/promptly-logo.svg" alt="" width="26" height="26">
      Promptly
    </a>
    <button type="button" id="sidebar-collapse-btn" class="icon-btn" aria-label="Collapse sidebar" data-tip="Collapse sidebar">${ICON.panelCollapse}</button>
  </div>
  <button type="button" id="new-prompt-btn" class="btn btn-primary sidebar-new-btn" hidden>+ New Prompt</button>
  <nav class="sidebar-primary-links">
    ${link('/', 'All Prompts', 'home', { icon: ICON.stack })}
    ${link('/favorites/', 'Favorites', 'favorites', { icon: ICON.star, extra: '<span id="nav-fav-count-num" class="sidebar-badge">0</span>' })}
    <div class="sidebar-nav-item-row">
      ${link('/sequences/', 'Sequences', 'sequences', { icon: ICON.flow })}
      ${fieldInfo('sequences-info-hint', 'Chained, multi-step prompts meant to be used in order — each step’s output feeds the next.', { btnClass: 'sidebar-info-btn', hintClass: 'sidebar-info-hint' })}
    </div>
    <a href="/archived/" id="nav-archived-link"${activeKey === 'archived' ? ' aria-current="page"' : ''} hidden><span class="nav-icon" aria-hidden="true">${ICON.archive}</span><span class="nav-label">Archived Prompts</span></a>
    <a href="/admin/" id="nav-admin-link"${activeKey === 'admin' ? ' aria-current="page"' : ''} hidden><span class="nav-icon" aria-hidden="true">${ICON.shield}</span><span class="nav-label">Admin</span></a>
  </nav>
  <div class="sidebar-divider"></div>
  <div class="sidebar-section">
    <div class="sidebar-section-label-row">
      <span class="sidebar-section-label-group">
        <a href="/collections/" class="sidebar-section-label"${activeKey === 'collections' ? ' aria-current="page"' : ''}>Collections</a>
        ${fieldInfo('collections-info-hint', 'A named group of prompts you put together for a project or workflow, so you can pull them all up at once.', { btnClass: 'sidebar-info-btn', hintClass: 'sidebar-info-hint', btnId: 'collections-info-btn', btnHidden: true })}
      </span>
      <button type="button" id="new-collection-btn" class="icon-btn sidebar-section-add" hidden aria-label="New collection" data-tip="New collection">${ICON.plus}</button>
    </div>
    <div class="sidebar-section-list" id="sidebar-collections-list">${collectionsSignedOutCallout}</div>
  </div>
  <div class="sidebar-divider"></div>
  <div class="sidebar-section">
    <div class="sidebar-section-label-row">
      <span class="sidebar-section-label-group">
        <a href="/categories/" class="sidebar-section-label" id="nav-categories-label"${activeKey === 'categories' ? ' aria-current="page"' : ''}>Categories</a>
      </span>
      <button type="button" id="new-category-btn" class="icon-btn sidebar-section-add" hidden aria-label="New category" data-tip="New category">${ICON.plus}</button>
    </div>
    <div class="sidebar-section-list" id="sidebar-categories-list">${categories}</div>
  </div>
  <div class="sidebar-footer-row">
    <a href="/account/" id="nav-account-link"${activeKey === 'account' ? ' aria-current="page"' : ''}>Sign in</a>
    <button type="button" id="nav-signout-btn" class="sidebar-signout" hidden>Sign out</button>
  </div>
  <div class="sidebar-resize-handle" id="sidebar-resize-handle" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" tabindex="0" title="Drag to resize"></div>
</aside>`;
}

// Top-of-content header, rendered inside <main> for every page (via
// renderLayout) above whatever the page itself renders - holds the
// re-expand affordance for a collapsed sidebar (#sidebar-expand-btn, hidden
// unless collapsed - the sidebar's own #sidebar-collapse-btn in its brand
// row is the other half of this pair, and disappears along with the rest of
// the sidebar when collapsed, same as the reference site's
// toggle-sidebar-btn/collapsed-sidebar-btn pair) and the global controls
// that used to live in the sidebar (search, table/grid view toggle, theme).
// `pageTitle`/`pageSubtitle` are optional - pages with their own prominent
// heading (Prompt Detail, Account, Admin) omit them and just get the
// controls, rather than showing a duplicate title.
function renderMainHeader({ pageTitle, pageSubtitle } = {}) {
  return `
<header class="main-header">
  <div class="main-header-left">
    <button type="button" id="sidebar-expand-btn" class="icon-btn" aria-label="Expand sidebar" data-tip="Expand sidebar" hidden>${ICON.panelExpand}</button>
    ${pageTitle ? `
    <div class="main-header-titles">
      <h1>${esc(pageTitle)}</h1>
      ${pageSubtitle ? `<p class="main-header-subtitle">${esc(pageSubtitle)}</p>` : ''}
    </div>` : ''}
  </div>
  <div class="main-header-right">
    <form class="search-field main-header-search" action="/search/" role="search">
      <span aria-hidden="true" style="display:flex;color:var(--ink-faint);">${ICON.search}</span>
      <input type="search" name="q" placeholder="Search prompts…" aria-label="Search prompts">
    </form>
    <div class="sidebar-view-toggle" id="sidebar-view-toggle" role="group" aria-label="Prompt list view">
      <button type="button" class="view-toggle-btn is-active" data-view="table" aria-pressed="true" aria-label="List view" data-tip="List view">${ICON.listView}</button>
      <button type="button" class="view-toggle-btn" data-view="grid" aria-pressed="false" aria-label="Grid view" data-tip="Grid view">${ICON.gridView}</button>
    </div>
    <button type="button" id="theme-toggle" class="icon-btn theme-toggle" aria-pressed="false" aria-label="Switch to dark mode">
      ${ICON.moon}${ICON.sun}
    </button>
  </div>
</header>`;
}

export function renderFooter() {
  return `
<footer class="site-footer">
  <div class="container footer-inner">
    <a href="/" class="footer-logo" style="display:flex;align-items:center;gap:6px;">
      <img src="/images/promptly-logo.svg" alt="" width="16" height="16">
      Promptly
    </a>
    <!-- Pipe separators are real elements rather than CSS ::after, so the
         "space either side" is genuine whitespace in the markup that collapses
         to one space - a ::after pipe would live inside the <a>, joining the
         link's clickable area and its accessible name ("About |"). They carry
         aria-hidden because a screen reader announcing "vertical bar" between
         every link is noise: the separation is already conveyed by the links
         being separate elements. -->
    <div class="footer-links">
      <a href="/about/">About</a>
      <span class="footer-sep" aria-hidden="true">|</span>
      <a href="/why-sign-in/">Why sign in?</a>
      <span class="footer-sep" aria-hidden="true">|</span>
      <a href="/privacy/">Privacy &amp; Cookies</a>
      <span class="footer-sep" aria-hidden="true">|</span>
      <a href="/terms/">Terms</a>
    </div>
  </div>
</footer>`;
}

// Small "(i)" affordance next to a field label - hover/focus reveals a
// plain-language explanation via CSS only (no JS needed to show/hide),
// wired up as a proper tooltip relationship (aria-describedby + role="tooltip")
// rather than a bare native `title` attribute, which screen readers and
// keyboard users can't reliably reach.
function fieldInfo(id, hintText, { btnClass = '', hintClass = '', btnId = '', btnHidden = false } = {}) {
  return `<button type="button" class="field-info${btnClass ? ' ' + btnClass : ''}"${btnId ? ` id="${btnId}"` : ''}${btnHidden ? ' hidden' : ''} aria-describedby="${id}">${ICON.info}<span class="sr-only">More info</span></button><span class="field-hint${hintClass ? ' ' + hintClass : ''}" id="${id}" role="tooltip">${esc(hintText)}</span>`;
}

// New Prompt modal (site-wide - #new-prompt-btn lives in the sidebar on every
// page via renderNav) - open to any signed-in user, with an admin-only "make
// this a default prompt" checkbox toggled client-side by newPrompt.js's
// isAdmin() check. Regular submits call db.js's createPrompt(); the checked
// admin path calls createCuratedPrompt() instead (see supabase/README.md
// "Admin curation, publishing, and per-user forks"). Categories render as a
// checkbox-backed dropdown (np-cat-dropdown, behavior in newPrompt.js).
//
// The checkboxes are EMPTY in the static markup and filled in by newPrompt.js
// from the caller's own categories (BUILD_BRIEF_v6.md §3). They used to be
// server-rendered from lib/schema.mjs's CATEGORIES array, which no longer
// exists - and couldn't be server-rendered now even if it did, since this one
// modal is baked into every static page and the vocabulary differs per user.
// The checkbox `value` is a category id, not a slug, for the same reason.
export function renderNewPromptModal() {
  return `
<div class="backdrop" id="np-backdrop">
  <div class="np-modal" id="np-modal" role="dialog" aria-modal="true" aria-labelledby="np-title">
    <div class="qv-chrome">
      <div class="qv-chrome-left"><h2 id="np-title" class="np-modal-title">New Prompt</h2></div>
      <div class="qv-chrome-right">
        <button type="button" class="qv-close-btn" id="np-close" aria-label="Close" title="Close (Esc)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
    <div class="np-page">
      <form id="np-form" class="account-form np-form">
        <label>Title
          <input type="text" name="title" required maxlength="120">
        </label>
        <label>
          <span class="np-label-row">Purpose ${fieldInfo('np-purpose-hint', 'A one-line summary shown on prompt cards and search results - what this prompt is for, at a glance.')}</span>
          <input type="text" name="purpose" maxlength="200" placeholder="One line describing what this prompt is for">
        </label>
        <div class="np-field">
          <span class="np-field-label">Categories</span>
          <div class="np-dropdown" id="np-cat-dropdown">
            <button type="button" class="np-dropdown-trigger" id="np-cat-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="np-cat-panel">
              <span id="np-cat-trigger-text">Select categories…</span>
              ${ICON.chevronDown}
            </button>
            <div class="np-dropdown-panel" id="np-cat-panel" hidden></div>
          </div>
        </div>
        <label>
          <span class="np-label-row">Prompt body ${fieldInfo('np-body-hint', 'The actual prompt text. Wrap any fill-in-the-blank part in double braces, e.g. {{topic}}, so it can be filled in later.')}</span>
          <textarea name="body" required rows="6" placeholder="Use {{variable}} for fill-in-the-blank fields"></textarea>
        </label>
        <label>
          <span class="np-label-row">Notes ${fieldInfo('np-notes-hint', 'Usage guidance for yourself or others - when to use this prompt, caveats, tips. Shown alongside the prompt, not part of what gets copied.')}</span>
          <textarea name="notes" rows="3"></textarea>
        </label>
        <label class="np-admin-check" id="np-admin-row" hidden>
          <input type="checkbox" name="is_curated" id="np-admin-checkbox">
          <span>
            Publish to everyone
            <span class="np-admin-hint" id="np-admin-hint"></span>
          </span>
        </label>
        <label class="np-admin-check" id="np-notify-row" hidden>
          <input type="checkbox" name="notify" id="np-notify-checkbox">
          <span>
            Notify users of this change
            <span class="np-admin-hint" id="np-notify-hint"></span>
          </span>
        </label>
        <button type="submit" class="btn btn-primary" id="np-submit-btn">Create prompt</button>
        <p id="np-message" hidden></p>
      </form>
      <div id="np-success" hidden>
        <p id="np-success-message"></p>
        <div class="np-success-actions">
          <button type="button" class="btn btn-secondary" id="np-create-another">Create another</button>
          <button type="button" class="btn btn-primary" id="np-done">Done</button>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

// New Collection modal - site-wide like the New Prompt modal, opens from the
// sidebar's #new-collection-btn (Collections section header, hidden until
// signed in - collections are per-user with no admin/curated concept, per
// db.js's createCollection()). Just title + description; slug is generated
// from the title at submit time by public/scripts/newCollection.js, same
// dedupe-on-collision approach as the New Prompt modal's slug handling. A
// created collection is managed at /collections/ (public/scripts/collections.js)
// and shows up live in the sidebar's own Collections list once signed in
// (public/scripts/collectionsNav.js), which replaces the signed-out
// explainer callout (renderNav) for the duration of the session.
export function renderNewCollectionModal() {
  return `
<div class="backdrop" id="nc-backdrop">
  <div class="np-modal" id="nc-modal" role="dialog" aria-modal="true" aria-labelledby="nc-title">
    <div class="qv-chrome">
      <div class="qv-chrome-left"><h2 id="nc-title" class="np-modal-title">New Collection</h2></div>
      <div class="qv-chrome-right">
        <button type="button" class="qv-close-btn" id="nc-close" aria-label="Close" title="Close (Esc)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
    <div class="np-page">
      <form id="nc-form" class="account-form np-form">
        <label>Title
          <input type="text" name="title" required maxlength="120">
        </label>
        <label>Description
          <textarea name="description" rows="3" placeholder="What this collection is for"></textarea>
        </label>
        <button type="submit" class="btn btn-primary" id="nc-submit-btn">Create collection</button>
        <p id="nc-message" hidden></p>
      </form>
      <div id="nc-success" hidden>
        <p id="nc-success-message">Collection created.</p>
        <div class="np-success-actions">
          <button type="button" class="btn btn-secondary" id="nc-create-another">Create another</button>
          <button type="button" class="btn btn-primary" id="nc-done">Done</button>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

// Generic confirm dialog - one shell per page (like the quick-view modal),
// driven entirely by public/scripts/confirmDialog.js's confirmDialog()
// helper rather than a bespoke modal per destructive action. Used first for
// prompt Delete (a real, unrecoverable DB row removal - see db.js's
// deletePrompt(), unlike Archive, which is reversible), in place of the
// plain browser confirm() the codebase used before - keeps the "are you
// sure" moment visually consistent with the rest of the site instead of an
// OS-styled dialog that doesn't carry the danger styling through.
export function renderConfirmDialog() {
  return `
<div class="backdrop" id="confirm-backdrop">
  <div class="np-modal confirm-modal" id="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
    <div class="np-page">
      <h2 id="confirm-title"></h2>
      <p id="confirm-message"></p>
      <div class="np-success-actions">
        <button type="button" class="btn btn-secondary" id="confirm-cancel">Cancel</button>
        <button type="button" class="btn btn-danger" id="confirm-ok"></button>
      </div>
    </div>
  </div>
</div>`;
}

export function renderLayout({ title, description, active, bodyHtml, extraScripts = '', data, pageTitle, pageSubtitle }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${THEME_INIT_SCRIPT}
${SIDEBAR_INIT_SCRIPT}
${SIDEBAR_WIDTH_INIT_SCRIPT}
<title>${esc(title)} · Promptly</title>
<meta name="description" content="${esc(description || '')}">
<link rel="icon" href="/images/promptly-logo.svg" type="image/svg+xml">
<link rel="stylesheet" href="${av('/styles/base.css')}">
</head>
<body>
<div class="app-shell">
  <div class="mobile-topbar">
    <button type="button" id="nav-menu-toggle" class="icon-btn nav-toggle" aria-expanded="false" aria-controls="sidebar" aria-label="Open menu">
      ${ICON.menu}${ICON.close}
    </button>
    <a href="/" class="mobile-topbar-logo">
      <img src="/images/promptly-logo.svg" alt="" width="22" height="22">
      Promptly
    </a>
  </div>
  <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
  ${renderNav(active, data)}
  <main>
    ${renderMainHeader({ pageTitle, pageSubtitle })}
    ${bodyHtml}
  </main>
  ${renderNewPromptModal()}
  ${renderNewCollectionModal()}
  ${renderConfirmDialog()}
</div>
${renderFooter()}
<script type="module" src="${av('/scripts/favorites.js')}"></script>
<script type="module" src="${av('/scripts/auth.js')}"></script>
<script type="module" src="${av('/scripts/newPrompt.js')}"></script>
<script type="module" src="${av('/scripts/newCollection.js')}"></script>
<script type="module" src="${av('/scripts/collectionsNav.js')}"></script>
<script type="module" src="${av('/scripts/categoriesNav.js')}"></script>
<script type="module" src="${av('/scripts/sidebarCollapse.js')}"></script>
<script type="module" src="${av('/scripts/sidebarResize.js')}"></script>
<script type="module" src="${av('/scripts/viewToggle.js')}"></script>
${extraScripts}
</body>
</html>
`;
}

// `ctx.personalized` marks a signed-in list. Under the owned-copies model
// (BUILD_BRIEF_v5.md) every row in such a list belongs to the caller, so
// every row gets the same four actions - there is no longer a class of
// prompt you can archive but not delete, or edit but not own.
//
// That asymmetry was the visible symptom of the old borrowing model:
// Archive existed only because you couldn't delete a row you didn't own.
// Both verbs now apply to everything (§1).
// A signed-in library is all owned rows, but for an admin it holds two kinds
// at once: catalog prompts (is_curated - what everyone else gets copies of)
// and personal prompts. Without a marker those are indistinguishable in the
// list, and editing the wrong one has very different consequences - a catalog
// edit is a broadcast (BUILD_BRIEF_v5.md §6.4). Regular users never see this,
// since they can't own a curated row.
function libraryBadge(p, ctx) {
  if (!ctx.personalized || !p.is_curated) return '';
  return p.published
    ? '<span class="chip chip-catalog" title="Published to everyone">Catalog</span>'
    : '<span class="chip chip-draft" title="Catalog draft — only you can see this">Draft</span>';
}

function personalizedActions(p, ctx) {
  if (!ctx.personalized) return '';
  const btn = (attr, label, title, icon) =>
    `<button type="button" class="icon-btn" data-${attr}="${esc(p.id)}" aria-label="${label} ${esc(p.title)}" data-tip="${title}">${icon}</button>`;
  return `
      ${btn('edit-id', 'Edit', 'Edit', ICON.edit)}${btn('duplicate-id', 'Duplicate', 'Duplicate — make an independent copy you can vary', ICON.duplicate)}${btn('archive-id', 'Archive', 'Archive — hides this prompt from your library, reversible', ICON.archive)}${btn('delete-id', 'Delete', 'Delete — permanently removes this prompt', ICON.trash)}`;
}

export function renderPromptCard(p, ctx = {}) {
  const total = ctx.sequenceTotals?.[p.sequence];
  const seqChip = p.sequence && total ? renderChip(`Step ${p.sequence_step} of ${total}`, { seq: true }) : '';
  const catChips = renderCatBadges(p.categories);
  // Slugs only - filters.js reads this attribute to decide what a pill
  // matches, and it has no use for the colour that rides along in the object.
  const cats = categorySlugs(p).join(',');
  return `
<a href="/prompt/${p.slug}/" class="prompt-card surface" data-slug="${esc(p.slug)}" data-categories="${esc(cats)}">
  <div class="card-top">
    ${ctx.personalized ? `<input type="checkbox" class="bulk-select card-select" data-select-id="${esc(p.id)}" aria-label="Select ${esc(p.title)}">` : ''}
    <span class="card-title">${esc(p.title)}${libraryBadge(p, ctx)}</span>
  </div>
  <div class="card-chips">${catChips}${seqChip}</div>
  <p class="card-purpose">${esc(p.purpose || '')}</p>
  <div class="card-actions">
    <button type="button" class="icon-btn fav" data-fav-slug="${esc(p.slug)}" data-fav-id="${esc(p.id || '')}" aria-label="Favorite ${esc(p.title)}" aria-pressed="false" data-tip="Add to Favorites">${ICON.star}</button>
    <button type="button" class="icon-btn" data-copy-target="prompt-copy-${esc(p.slug)}" aria-label="Copy ${esc(p.title)}" data-tip="Copy Prompt">${ICON.copy}</button>${personalizedActions(p, ctx)}
  </div>
  <div class="card-footer">
    <span>Updated ${esc(fmtDate(p.updated || p.added))}</span>
  </div>
  <span id="prompt-copy-${esc(p.slug)}" hidden data-raw-text="${esc(p.body)}"></span>
</a>`;
}

export function renderCardGrid(prompts, ctx = {}) {
  if (prompts.length === 0) {
    return `<p class="card-grid-empty" style="color:var(--ink-faint);padding:24px 0;">${esc(ctx.emptyText || 'Nothing here yet.')}</p>`;
  }
  return `<div class="card-grid"${ctx.gridId ? ` id="${ctx.gridId}"` : ''}>${prompts.map(p => renderPromptCard(p, ctx)).join('')}</div>`;
}

// Live pill toolbar (§9a filter-rail -> §9b pill pattern swap, rest-state
// hue background added in §9k). `groups` is
// [{ key, label, options: [{value,label,count?,color?}] }] - `color` is the
// category's own stored hex; it renders a soft tint of that colour at rest
// (derived in CSS via color-mix, §6.2) and a solid fill with computed ink
// when active, matching the category badges. Groups without it render as a
// plain neutral pill using `--accent` for the active fill. A single-option
// group acts as a plain toggle, not a radio - clicking it on and off is
// enough since there's nothing else in the group to exclude.
//
// `color` replaced `hue` (a categoryHue() class name) in BUILD_BRIEF_v6.md §6.
export function renderFilterToolbar(groups, { id } = {}) {
  const rows = groups.filter(g => g.options.length > 0).map(g => `
<div class="filter-pill-group" data-label="${esc(g.label)}">
  ${g.options.map(o => `
  <button type="button" class="filter-pill${o.color ? ' is-hued' : ''}"${o.color ? ` style="${catColorVars(o)}"` : ''} data-group="${esc(g.key)}" data-value="${esc(o.value)}" aria-pressed="false">
    ${esc(o.label)}${o.count != null ? ` <span class="count">${o.count}</span>` : ''}
  </button>`).join('')}
</div>`).join('');
  return `
<div class="filter-toolbar" id="${id}">
  ${rows}
  <button type="button" class="filter-clear" data-role="clear-pills">Clear filters ✕</button>
</div>`;
}

export function renderBreadcrumb(items) {
  const parts = items.map((it, i) =>
    i === items.length - 1 ? `<span>${esc(it.label)}</span>` : `<a href="${it.href}">${esc(it.label)}</a>`
  );
  return `<nav class="breadcrumb" aria-label="Breadcrumb">${parts.join(' &gt; ')}</nav>`;
}

export function renderPromptDetail(prompt, data) {
  const highlighted = esc(prompt.body).replace(/\{\{[^}]+\}\}/g, m => `<span class="var">${m}</span>`);

  const info = resolveSeqInfo(prompt, data);
  const seqBlock = info ? `
<div class="pd-notes-divider"></div>
<div class="pd-seq-row">
  <span class="chip chip-seq pd-seq-current">${esc(info.label)} · Step ${info.step} of ${info.total}</span>
  <div class="pd-seq-nav">
    ${info.prev ? `<a href="/prompt/${info.prev.slug}/">${ICON.chevronLeft} Back</a>` : `<span style="color:var(--ink-faint);">${ICON.chevronLeft} Start</span>`}
    ${info.next ? `<a class="next" href="/prompt/${info.next.slug}/">Next ${ICON.chevronRight}</a>` : `<span style="color:var(--ink-faint);">End ${ICON.chevronRight}</span>`}
  </div>
</div>` : '';

  const notesSection = prompt.notes ? `
<div class="pd-box surface pd-notes-box">
  <div class="pd-box-label">Notes</div>
  <p>${esc(prompt.notes)}</p>
  ${seqBlock}
  <div class="pd-notes-divider"></div>
  <div class="pd-meta-row">
    <span class="kv"><span>Created</span><span>${esc(fmtDate(prompt.added))}</span></span>
    ${prompt.updated ? `<span class="kv"><span>Modified</span><span>${esc(fmtDate(prompt.updated))}</span></span>` : ''}
  </div>
</div>` : `
<div class="pd-box surface pd-notes-box">
  ${seqBlock}
  <div class="pd-meta-row">
    <span class="kv"><span>Created</span><span>${esc(fmtDate(prompt.added))}</span></span>
    ${prompt.updated ? `<span class="kv"><span>Modified</span><span>${esc(fmtDate(prompt.updated))}</span></span>` : ''}
  </div>
</div>`;

  const body = `
<div class="container pd-page">
  ${renderBreadcrumb([{ href: '/', label: 'Home' }, { href: `/browse/${categorySlugs(prompt)[0]}/`, label: categoryName(prompt.categories[0]) }, { label: prompt.title }])}
  <header class="pd-header">
    <div class="pd-title-row">
      <h1>${esc(prompt.title)}</h1>
      <span class="cat-badges">${renderCatBadges(prompt.categories)}</span>
    </div>
    <p class="card-purpose">${esc(prompt.purpose || '')}</p>
  </header>
  <div class="pd-bento">
    <div class="pd-box surface pd-prompt-box" id="prompt-copy-${esc(prompt.slug)}" data-raw-text="${esc(prompt.body)}">
      <div class="pd-box-label">
        <span>Prompt</span>
        <div class="pd-actions">
          <button type="button" class="pd-action-btn fav" data-fav-slug="${esc(prompt.slug)}" data-fav-id="${esc(prompt.id || '')}" aria-label="Favorite ${esc(prompt.title)}" aria-pressed="false">
            ${ICON.star}<span class="fav-label-off">Favorite</span><span class="fav-label-on">Favorited</span>
          </button>
          <button type="button" class="pd-action-btn square" data-copy-target="prompt-copy-${esc(prompt.slug)}" aria-label="Copy prompt">${ICON.copy}</button>
        </div>
      </div>
      <div class="pd-body-text">${highlighted}</div>
    </div>
    ${notesSection}
  </div>
</div>`;

  return renderLayout({ title: prompt.title, description: prompt.purpose, bodyHtml: body, data });
}

// Prompts counted as "new" for Home's callout (§9k) - based on `added`
// (falling back to `updated` only if `added` is missing), not `updated`,
// so editing an existing prompt doesn't make it read as newly created.
// Future-dated values (a typo) are excluded rather than showing as
// perpetually new. Exported so personalize.js can recompute this against the
// signed-in caller's own library, where a newly seeded copy carries a fresh
// `added` timestamp - which is what makes a catalog prompt published since
// their last visit show up as new without any special handling.
export const NEW_WINDOW_DAYS = 14;
export function findNewPrompts(prompts) {
  const now = Date.now();
  return prompts.filter(p => {
    if (p.is_curated === false) return false;
    const raw = p.added || p.updated;
    if (!raw) return false;
    const days = (now - new Date(raw).getTime()) / 86400000;
    return days >= 0 && days <= NEW_WINDOW_DAYS;
  });
}

// Home (§9g) - the all-prompts table + live category pills, replacing the
// old curated tile-grid/featured-rail/recently-added layout and folding in
// what the Browse hub used to do (that route is gone; category pages still
// exist individually at /browse/[category]/). Minimal hero (just the
// framing stat) instead of a fuller marketing-style header - this is a
// personal tool, not a public landing page. No visible "Promptly" title
// here since the nav already carries it and nothing sits above this to
// need the orientation; an sr-only h1 keeps the page's heading landmark for
// accessibility without showing redundant text.
export function renderHomePage(data) {
  const categoryGroup = {
    key: 'category', label: 'Category Filter(s)',
    options: data.categories.filter(c => c.count > 0).map(c => ({ value: c.slug, label: categoryName(c), count: c.count, color: c.color }))
  };
  const newPrompts = findNewPrompts(data.prompts);
  // §9k: only rendered at all when there's something new to announce - no
  // "0 new" or empty-state version of this banner. `data-new-slugs` (not a
  // closure variable) is what lets personalize.js update which prompts
  // "Show them" points at after a signed-in merge, without needing to touch
  // this click listener at all.
  const newCallout = newPrompts.length ? `
<div class="new-callout" id="new-callout" data-new-slugs="${esc(JSON.stringify(newPrompts.map(p => p.slug)))}">
  <span class="dot" aria-hidden="true"></span>
  <span id="new-callout-text"><strong>${newPrompts.length} new prompt${newPrompts.length === 1 ? '' : 's'}</strong> added in the last ${NEW_WINDOW_DAYS} days</span>
  <a href="#" id="new-callout-link">Show them ↓</a>
</div>` : '';
  const body = `
<div class="container">
  ${newCallout}
  <hr class="home-hero-divider">
  ${renderFilterToolbar([categoryGroup], { id: 'home-filters' })}
  ${renderPromptTable(data.prompts, { sequenceTotals: data.sequenceTotals, gridId: 'home-grid', emptyText: 'No prompts yet.', data })}
</div>`;
  // Highlights whichever of table row / grid card is currently visible for
  // each slug (view-toggle.js keeps both in the DOM, one hidden) rather than
  // assuming table view - a plain `#home-grid tr[...]` query missed grid
  // view entirely.
  const newCalloutScript = newPrompts.length ? `
document.getElementById('new-callout-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  const container = document.getElementById('new-callout');
  const newSlugs = JSON.parse(container?.dataset.newSlugs || '[]');
  const targets = newSlugs
    .map(s => [...document.querySelectorAll('#home-grid [data-slug="' + s + '"], #home-grid-cards [data-slug="' + s + '"]')].find(el => el.offsetParent !== null))
    .filter(Boolean);
  if (!targets.length) return;
  targets[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  targets.forEach(el => {
    el.classList.add('is-new-highlight');
    setTimeout(() => el.classList.remove('is-new-highlight'), 1400);
  });
});` : '';
  const script = `<script type="module">
import { initTableFilterToolbar } from '${av('/scripts/filters.js')}';
import { initQuickView } from '${av('/scripts/quickview.js')}';
import { registerQuickView } from '${av('/scripts/quickViewRegistry.js')}';
import { initPersonalizedTable } from '${av('/scripts/personalize.js')}';
initTableFilterToolbar('home-filters', 'home-grid');
registerQuickView('home-grid', initQuickView('home-grid'));
initPersonalizedTable({ gridId: 'home-grid', toolbarId: 'home-filters', sequenceTotals: ${JSON.stringify(data.sequenceTotals)} });
${newCalloutScript}
</script>`;
  // Deliberately generic and static. This used to be a count line ("N prompts
  // across M categories, organized into S sequences") built from the
  // build-time catalog, which under the owned-copies model was wrong the
  // moment a signed-in user's library differed from it - and personalize.js
  // recomputes the table and the filter pills but never this, so it sat there
  // stating a number that didn't match the rows underneath it. A sentence
  // with no numbers in it can't go stale.
  const subtitle = 'Every prompt available to you, in one place.';
  return renderLayout({ title: 'Promptly', description: 'Personal AI prompt catalog.', active: 'home', bodyHtml: body, extraScripts: script, data, pageTitle: 'All Prompts', pageSubtitle: subtitle });
}

// Live, multi-select, OR-within-category filter pills (§9b).
// `categoriesWithCounts` is [{slug, name, color, count}] - counts are static
// totals over the prompts passed to the table on this page, not recomputed as
// other pills toggle.
export function renderCategoryFilterBar(categoriesWithCounts, { id = 'category-filter-bar' } = {}) {
  const pills = categoriesWithCounts.filter(c => c.count > 0).map(c => `
<button type="button" class="filter-pill is-hued" style="${catColorVars(c)}" data-cat="${esc(c.slug)}" aria-pressed="false">
  ${esc(categoryName(c))} <span class="count">${c.count}</span>
</button>`).join('');
  return `
<div class="filter-bar" id="${id}">
  ${pills}
  <button type="button" class="filter-clear" data-role="clear-pills">Clear filters ✕</button>
</div>`;
}

// JSON payload safe to embed inside a <script type="application/json"> tag -
// escapes "<" so a literal "</script" in prompt body/notes text can't break
// out of the tag early.
function jsonScriptSafe(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

// Dense table replacement for the card grid on browse-heavy pages (§9b,
// §9g) - Category, Search, Favorites, Home. Sequences stays card-based
// (chain-flow rail, not a browsed list). Each row carries data-categories
// so the pill filter toolbar (filters.js) can read it directly. Full
// prompt data (body, notes, sequence info) is embedded as a JSON script
// tag for the quick-view modal (quickview.js) to read - a static site has
// no API to fetch it from on click. Row order is whatever buildData()
// (lib/content.mjs) already sorted prompts into (newest-updated-first) -
// no client-side sort control exists.
export function renderPromptTableRows(prompts, ctx = {}) {
  return prompts.map(p => {
    const total = ctx.sequenceTotals?.[p.sequence];
    const seqTag = p.sequence && total ? `<span class="chip chip-seq seq-tag">Step ${p.sequence_step} of ${total}</span>` : '';
    const cats = categorySlugs(p).join(',');
    return `
<tr data-slug="${esc(p.slug)}" data-categories="${esc(cats)}" tabindex="0" role="button" aria-label="Open ${esc(p.title)}">
  <td class="select-cell">${ctx.personalized ? `<input type="checkbox" class="bulk-select" data-select-id="${esc(p.id)}" aria-label="Select ${esc(p.title)}">` : ''}</td>
  <td class="col-category"><span class="cat-cell">${renderCatBadges(p.categories, { max: 2 })}</span></td>
  <td class="title-cell">${esc(p.title)}${seqTag}${libraryBadge(p, ctx)}<span class="purpose-line">${esc(p.purpose || '')}</span></td>
  <td class="col-updated">${esc(fmtDate(p.updated || p.added))}</td>
  <td>
    <span class="row-actions">
      <button type="button" class="icon-btn fav" data-fav-slug="${esc(p.slug)}" data-fav-id="${esc(p.id || '')}" aria-label="Favorite ${esc(p.title)}" aria-pressed="false" data-tip="Add to Favorites">${ICON.star}</button>
      <button type="button" class="icon-btn" data-copy-target="prompt-copy-${esc(p.slug)}" aria-label="Copy ${esc(p.title)}" data-tip="Copy Prompt">${ICON.copy}</button>${personalizedActions(p, ctx)}
    </span>
    <span id="prompt-copy-${esc(p.slug)}" hidden data-raw-text="${esc(p.body)}"></span>
  </td>
</tr>`;
  }).join('');
}

// Per-prompt payload the quick-view modal needs (quickview.js reads this
// shape both from the embedded JSON script tag below and, on the search
// page, from live Fuse match objects - keep the two in sync).
export function toQuickViewItem(p, ctx = {}) {
  return {
    id: p.id, slug: p.slug, title: p.title, purpose: p.purpose || '', categories: p.categories,
    body: p.body, notes: p.notes || '', added: p.added || '', updated: p.updated || '',
    sequence: p.sequence || '', sequence_step: p.sequence_step,
    // Undefined for every build-time (static-page) item, which always has a
    // real /prompt/[slug]/ page - only a personalized (signed-in) item passes
    // these explicitly, since a user's own copy (is_curated=false) has no
    // static page for quickview.js's "Open full page" link to point at.
    is_curated: p.is_curated, published: p.published,
    seq: ctx.data ? resolveSeqInfo(p, ctx.data) : null
  };
}

export function renderPromptTable(prompts, ctx = {}) {
  const gridId = ctx.gridId || 'prompt-table';
  const rows = renderPromptTableRows(prompts, ctx);
  const quickViewData = prompts.map(p => toQuickViewItem(p, ctx));

  return `
<div class="prompt-table-block" data-grid-id="${esc(gridId)}">
  <div class="bulk-bar" id="${gridId}-bulkbar" hidden>
    <span class="bulk-count" id="${gridId}-bulkcount"></span>
    <button type="button" class="btn btn-secondary" data-bulk="archive">Archive</button>
    <button type="button" class="btn btn-secondary btn-danger-outline" data-bulk="delete">Delete</button>
    <button type="button" class="btn btn-ghost" data-bulk="clear">Clear selection</button>
  </div>
  <div class="table-wrap">
    <table class="browse-table comfortable">
      <thead>
        <tr><th class="col-select"><input type="checkbox" class="bulk-select-all" aria-label="Select all prompts"></th><th class="col-category">Category</th><th>Title</th><th class="col-updated">Updated</th><th class="col-actions"></th></tr>
      </thead>
      <tbody id="${gridId}">${rows}</tbody>
    </table>
  </div>
  <p class="table-empty" id="${gridId}-empty" style="color:var(--ink-faint);padding:24px 0;"${prompts.length ? ' hidden' : ''}>${esc(ctx.emptyText || 'Nothing here yet.')}</p>
  <script type="application/json" id="${gridId}-data">${jsonScriptSafe(quickViewData)}</script>
</div>
${ctx.withModal !== false ? renderQuickViewModal() : ''}`;
}

// Static dialog shell - one per page (only one table renders per page in
// current scope), populated entirely client-side by quickview.js.
export function renderQuickViewModal() {
  return `
<div class="backdrop" id="qv-backdrop">
  <div class="qv-modal" id="qv-modal" role="dialog" aria-modal="true" aria-labelledby="qv-title">
    <div class="qv-chrome">
      <div class="qv-chrome-left">
        <button type="button" class="qv-nav-btn" id="qv-prev" aria-label="Previous prompt" title="Previous (↑)">${ICON.chevronLeft}</button>
        <button type="button" class="qv-nav-btn" id="qv-next" aria-label="Next prompt" title="Next (↓)">${ICON.chevronRight}</button>
        <span class="qv-position" id="qv-position"></span>
      </div>
      <div class="qv-chrome-right">
        <a href="#" class="qv-open-full" id="qv-open-full">Open full page ↗</a>
        <button type="button" class="qv-close-btn" id="qv-close" aria-label="Close" title="Close (Esc)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
    <div class="container pd-page">
      <header class="pd-header">
        <div class="pd-title-row">
          <h1 id="qv-title"></h1>
          <span class="cat-badges" id="qv-cat-badges"></span>
        </div>
        <p class="card-purpose" id="qv-purpose"></p>
      </header>
      <div class="pd-bento">
        <div class="pd-box surface pd-prompt-box">
          <div class="pd-box-label">
            <span>Prompt</span>
            <div class="pd-actions">
              <button type="button" class="pd-action-btn fav" id="qv-fav" aria-label="Favorite" aria-pressed="false" data-tip="Add to Favorites">
                ${ICON.star}<span class="fav-label-off">Favorite</span><span class="fav-label-on">Favorited</span>
              </button>
              <button type="button" class="pd-action-btn square" id="qv-copy" aria-label="Copy prompt" data-tip="Copy Prompt">${ICON.copy}</button>
              <button type="button" class="pd-action-btn square" id="qv-edit" aria-label="Edit" data-tip="Edit" hidden>${ICON.edit}</button>
              <button type="button" class="pd-action-btn square" id="qv-duplicate" aria-label="Duplicate" data-tip="Duplicate — make an independent copy you can vary" hidden>${ICON.duplicate}</button>
              <button type="button" class="pd-action-btn square" id="qv-archive" aria-label="Archive" data-tip="Archive — hides this prompt from your library, reversible" hidden>${ICON.archive}</button>
              <button type="button" class="pd-action-btn square" id="qv-delete" aria-label="Delete" data-tip="Delete — permanently removes this prompt" hidden>${ICON.trash}</button>
            </div>
          </div>
          <div class="pd-body-text" id="qv-body-text"></div>
        </div>
        <div class="pd-box surface pd-notes-box">
          <div class="pd-box-label">Notes</div>
          <p id="qv-notes"></p>
          <div id="qv-seq-block" hidden>
            <div class="pd-notes-divider"></div>
            <div class="pd-seq-row">
              <span class="chip chip-seq pd-seq-current" id="qv-seq-current"></span>
              <div class="pd-seq-nav" id="qv-seq-nav"></div>
            </div>
          </div>
          <div class="pd-notes-divider"></div>
          <div class="pd-meta-row">
            <span class="kv"><span>Created</span><span id="qv-added"></span></span>
            <span class="kv" id="qv-modified-row"><span>Modified</span><span id="qv-modified"></span></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

// Statically generated for catalog categories only (BUILD_BRIEF_v6.md §5). A
// signed-in visitor still gets their own library rendered into it by
// personalize.js, and if they've deleted this category the filter matches
// nothing and the table shows its empty state - which is the honest answer,
// and better than a 404 on a URL that was valid when they bookmarked it.
//
// The heading, description and colour come from the category row now, not
// from a CATEGORY_DESCRIPTIONS map in lib/schema.mjs.
export function renderCategoryPage(category, prompts, data) {
  const cat = (data.categories || []).find(c => c.slug === category) || { slug: category };
  const description = cat.description || '';
  const label = categoryName(cat);
  const body = `
<div class="container">
  ${renderBreadcrumb([{ href: '/', label: 'Home' }, { label }])}
  ${renderPromptTable(prompts, { sequenceTotals: data.sequenceTotals, gridId: 'result-grid', emptyText: 'No prompts in this category yet.', data })}
</div>`;
  const script = `<script type="module">
import { initQuickView } from '${av('/scripts/quickview.js')}';
import { registerQuickView } from '${av('/scripts/quickViewRegistry.js')}';
import { initPersonalizedTable } from '${av('/scripts/personalize.js')}';
import { promptHasCategory } from '${av('/scripts/lib/schema.mjs')}';
registerQuickView('result-grid', initQuickView('result-grid'));
initPersonalizedTable({ gridId: 'result-grid', filterFn: p => promptHasCategory(p, ${JSON.stringify(category)}), sequenceTotals: ${JSON.stringify(data.sequenceTotals)} });
</script>`;
  return renderLayout({ title: label, description: `Prompts in ${label}.`, active: `category:${category}`, bodyHtml: body, extraScripts: script, data, pageTitle: label, pageSubtitle: description });
}

// Vertical connected rail (§9e) - replaces the old horizontal box-and-chevron
// strip. `compact` (used on /sequences' per-sequence preview) drops purpose,
// category badges, and the handoff note, showing just the numbered dot,
// title, and connecting line - the same idiom at a smaller information
// density rather than a separate component.
// `gridId`, when given, makes each step's card a quick-view trigger (like
// the browse table's rows) instead of a plain link to /prompt/[slug]/ -
// carries its own data-slug + embedded quick-view JSON so quickview.js can
// bind to it independently of whichever other rail is on the same page.
function renderSequenceRail(steps, { compact = false, gridId, data } = {}) {
  const last = steps.length - 1;
  const items = steps.map((step, i) => {
    const purpose = !compact && step.purpose ? `<p class="card-purpose">${esc(step.purpose)}</p>` : '';
    const catBadges = !compact ? `<span class="cat-badges">${renderCatBadges(step.categories)}</span>` : '';
    const handoff = !compact && i !== last && step.handoff ? `<p class="seq-rail-handoff">↳ hands off: ${esc(step.handoff)}</p>` : '';
    return `
<div class="seq-rail-item">
  <div class="seq-rail-marker">
    <span class="seq-rail-dot">${step.sequence_step ?? i + 1}</span>
    ${i !== last ? '<span class="seq-rail-line"></span>' : ''}
  </div>
  <div class="seq-rail-body">
    <a href="/prompt/${step.slug}/" class="surface seq-rail-card"${gridId ? ` data-slug="${esc(step.slug)}"` : ''}>
      <div class="seq-rail-top">
        <span class="card-title">${esc(step.title)}</span>
        ${catBadges}
      </div>
      ${purpose}
    </a>
    ${handoff}
  </div>
</div>`;
  }).join('');
  const railData = gridId ? `<script type="application/json" id="${gridId}-data">${jsonScriptSafe(steps.map(s => toQuickViewItem(s, { data })))}</script>` : '';
  return `<div class="seq-rail"${gridId ? ` id="${gridId}"` : ''}>${items}</div>${railData}`;
}

export function renderSequencesIndex(data) {
  const flows = data.sequences.map(s => `
<section>
  <h2>${esc(s.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))}</h2>
  ${renderSequenceRail(s.steps, { compact: true, gridId: `seq-rail-${s.slug}`, data })}
  <a href="/sequence/${s.slug}/">View sequence</a>
</section>`).join('');
  const body = `<div class="container">${flows || '<p>No sequences yet.</p>'}</div>${data.sequences.length ? renderQuickViewModal() : ''}`;
  const script = data.sequences.length ? `<script type="module">
import { initQuickView } from '${av('/scripts/quickview.js')}';
${data.sequences.map(s => `initQuickView(${JSON.stringify(`seq-rail-${s.slug}`)});`).join('\n')}
</script>` : '';
  return renderLayout({ title: 'Sequences', description: 'Multi-step prompt chains.', active: 'sequences', bodyHtml: body, extraScripts: script, data, pageTitle: 'Sequences' });
}

export function renderSequencePage(sequence, data) {
  const name = sequence.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const gridId = `seq-rail-${sequence.slug}`;
  const body = `
<div class="container">
  ${renderBreadcrumb([{ href: '/sequences/', label: 'Sequences' }, { label: name }])}
  ${renderSequenceRail(sequence.steps, { gridId, data })}
</div>
${renderQuickViewModal()}`;
  const script = `<script type="module">
import { initQuickView } from '${av('/scripts/quickview.js')}';
initQuickView(${JSON.stringify(gridId)});
</script>`;
  return renderLayout({ title: name, description: `${name} sequence.`, active: 'sequences', bodyHtml: body, extraScripts: script, data, pageTitle: name, pageSubtitle: `${sequence.steps.length} step${sequence.steps.length === 1 ? '' : 's'}` });
}

export function renderFavoritesPage(data) {
  const body = `
<div class="container">
  <div class="card-top" style="align-items:center;margin-bottom:8px;justify-content:flex-end;">
    <button type="button" class="btn btn-secondary" id="export-favorites-btn">Export favorites</button>
  </div>
  ${renderCategoryFilterBar(data.categories, { id: 'favorites-category-filter' })}
  ${renderPromptTable(data.prompts, { sequenceTotals: data.sequenceTotals, gridId: 'favorites-grid', emptyText: 'Nothing starred yet.', data })}
</div>`;
  const script = `<script type="module">
import { initQuickView } from '${av('/scripts/quickview.js')}';
import { registerQuickView } from '${av('/scripts/quickViewRegistry.js')}';
import { initPersonalizedTable } from '${av('/scripts/personalize.js')}';
import { ensureFavorites, isFavoriteKey } from '${av('/scripts/favoritesStore.js')}';
registerQuickView('favorites-grid', initQuickView('favorites-grid'));
// Wait for the store: the filter below is only meaningful once we know
// whether the key space is slugs (anonymous) or prompt ids (signed in).
ensureFavorites().then(() => {
  initPersonalizedTable({
    gridId: 'favorites-grid',
    sequenceTotals: ${JSON.stringify(data.sequenceTotals)},
    filterFn: p => isFavoriteKey(p.id)
  });
});
</script>`;
  return renderLayout({ title: 'Favorites', description: 'Your starred prompts.', active: 'favorites', bodyHtml: body, extraScripts: script, data, pageTitle: 'Favorites' });
}

export function renderSearchPage(data) {
  const categoryGroup = {
    key: 'category', label: 'Category Filter(s)',
    options: data.categories.filter(c => c.count > 0).map(c => ({ value: c.slug, label: categoryName(c), count: c.count, color: c.color }))
  };

  const body = `
<div class="container">
  ${renderFilterToolbar([categoryGroup], { id: 'search-filters' })}
  <p id="search-summary" style="color:var(--ink-faint);">Start typing above to search prompts.</p>
  <div class="table-wrap" id="search-results-wrap" hidden>
    <table class="browse-table comfortable">
      <thead>
        <tr><th class="col-select"><input type="checkbox" class="bulk-select-all" aria-label="Select all prompts"></th><th class="col-category">Category</th><th>Title</th><th class="col-updated">Updated</th><th class="col-actions"></th></tr>
      </thead>
      <tbody id="search-results"></tbody>
    </table>
  </div>
  <div class="card-grid" id="search-results-cards" hidden></div>
</div>
${renderQuickViewModal()}`;
  const script = `<script type="module" src="${av('/scripts/search.js')}"></script>`;
  return renderLayout({ title: 'Search', description: 'Search the prompt library.', active: 'search', bodyHtml: body, extraScripts: script, data, pageTitle: 'Search' });
}

export function renderAboutPage(data) {
  const body = `
<div class="container">
  <p>Promptly is a personal, static catalog of reusable AI prompts — browsable, searchable, with multi-step sequences and one-click favorites. No accounts, no backend.</p>
</div>`;
  return renderLayout({ title: 'About', description: 'About Promptly.', active: 'about', bodyHtml: body, data, pageTitle: 'About' });
}

// ── Legal pages (OPEN_ITEMS.md A3) ──────────────────────────────────
//
// Drafted for the UK: UK GDPR + Data Protection Act 2018, with the ICO as the
// supervisory authority, and **Scots law** as the governing law. Note those
// are two different scopes and it is easy to get wrong: data protection is
// UK-wide, so the ICO is the regulator for Scotland as much as anywhere else
// and none of the privacy notice changes — but contract law is devolved, so
// the Terms' governing-law and liability clauses are Scottish. That
// choice drives more of the text than it looks - the lawful-basis framing in
// section 4 of the privacy notice, the international-transfer wording, and the
// consumer-rights carve-out in the liability clause are all UK-specific and
// would need rewriting, not just renaming, for another jurisdiction.
//
// These are researched drafts, not legal advice, and they describe this system
// accurately as of the pass that added them - which is the part that actually
// matters and the part a generic template gets wrong. Specifically: there are
// no analytics, no advertising, no tracking cookies and no third-party scripts
// beyond the esm.sh CDN; the only browser storage is four functional
// `promptly:*` keys plus the Supabase auth token; and the processors are
// Supabase and Vercel. If any of that changes, these pages are wrong and have
// to change with it.
//
// One deliberate structural choice: the identifying details live in this one
// object rather than being repeated across two documents, because a privacy
// notice that names the controller inconsistently is worse than one that names
// them once. scripts/build.mjs warns while any placeholder is still in place -
// a policy published with "[YOUR NAME]" in it is worse than no policy, so the
// build says so on every run rather than letting it ship quietly.
// No postal address, deliberately, and it is not an omission to be "fixed"
// later. UK GDPR Article 13 requires the controller's identity and *contact
// details*; the ICO treats an email address as satisfying that, and there is
// no separate obligation on a sole trader to publish a home address. The
// wording considered and rejected was "available on request by email", which
// reads as a courtesy but is a standing commitment to hand over a home address
// to anyone who asks for it. This is a personal safety decision, so if a
// postal address is ever needed, the answer is a business or service address -
// never the home one.
export const LEGAL_DETAILS = {
  entity: 'Sing Chen',
  email: 'singfenchen@gmail.com',
  updated: '14 August 2026'
};

export function legalPlaceholdersRemaining() {
  return Object.entries(LEGAL_DETAILS)
    .filter(([, v]) => v.startsWith('['))
    .map(([k]) => k);
}

// Section list for the contents block and the headings, kept in one array so
// the two can't drift - a numbered contents list that disagrees with the
// headings below it is worse than no contents list. The BBC's policy
// (reviewed as the reference for this rewrite) does three things worth
// stealing, and all three are here: questions phrased in the reader's voice
// rather than noun labels ("What information do you collect about me?" beats
// "Data collection"), a numbered contents list at the top so the document is
// navigable rather than merely complete, and cookies covered inside the
// privacy policy rather than shipped as a separate document - their page is
// literally titled "Privacy and Cookies Policy". At BBC scale a separate
// cookies hub earns its place; at this scale it would be one sentence on a
// page of its own, so it is section 5 here and the footer link says
// "Privacy & Cookies" so that someone hunting for a cookie policy finds it.
const PRIVACY_SECTIONS = [
  ['whats-in', "What's in this policy?"],
  ['who', 'Who is responsible for my information?'],
  ['what', 'What information do you collect about me?'],
  ['why', 'Why do you use it, and what is your legal basis?'],
  ['cookies', 'Does Promptly use cookies?'],
  ['device', 'What is stored on my device?'],
  ['who-else', 'Who else sees my information?'],
  ['transfers', 'Does my information leave the UK?'],
  ['retention', 'How long do you keep it?'],
  ['rights', 'What are my rights?'],
  ['security', 'How do you keep it safe?'],
  ['children', 'What about children?'],
  ['changes', 'How will I find out about changes?'],
  ['contact', 'How do I contact you?']
];

export function renderPrivacyPage(data) {
  const d = LEGAL_DETAILS;
  const n = Object.fromEntries(PRIVACY_SECTIONS.map(([id], i) => [id, i + 1]));
  const h = id => `<h2 id="${id}">${n[id]}. ${esc(PRIVACY_SECTIONS[n[id] - 1][1])}</h2>`;
  // No number in the link text: this is an <ol>, so the browser already
  // renders one. Writing "1." in here as well produced "1. 1. What's in this
  // policy?" - and the in-browser check that the contents matched the headings
  // passed throughout, because both sides carried the same duplicated prefix.
  // It was verifying consistency, which was never in doubt, rather than what
  // the reader actually sees. The headings keep their explicit numbers, since
  // an <h2> has no list to number it.
  const contents = PRIVACY_SECTIONS
    .map(([id, label]) => `<li><a href="#${id}">${esc(label)}</a></li>`)
    .join('');

  const body = `
<div class="container legal-page">
  <p class="legal-updated">Last updated: ${esc(d.updated)}</p>

  <nav class="legal-contents" aria-label="Contents">
    <h2 class="legal-contents-title">Contents</h2>
    <ol>${contents}</ol>
  </nav>

  ${h('whats-in')}
  <p>This policy tells you what personal information Promptly collects, why, who
  else can see it, and what you can do about it. It is written for the UK, under
  the UK GDPR and the Data Protection Act 2018.</p>
  <p>The short version: if you are just browsing, we collect nothing about you
  beyond the ordinary server logs any website produces. If you create an
  account, we hold your first name, your email address and whatever you write in
  your own prompts — and nothing else. There is no analytics, no advertising, no
  tracking, and no cookies at all.</p>

  ${h('who')}
  <p>The data controller — the person responsible for your information — is
  ${esc(d.entity)}, an individual rather than a company. Promptly is run as a
  personal project, not from business premises, so the way to reach us is by
  email: <a href="mailto:${esc(d.email)}">${esc(d.email)}</a>. That is a
  monitored address and it is the right one for any question, request or
  complaint about your information, including the rights in section 10. There
  is no Data Protection Officer; the service is small enough that one is not
  required.</p>

  ${h('what')}
  <p><strong>Your account details.</strong> Your first name and your email
  address, which you give us when you sign up, and a password that is stored
  only as a cryptographic hash — we never hold, and could not recover, the
  password itself. Your first name is used to greet you on your account page,
  and nowhere else.</p>
  <p><strong>What you write.</strong> The prompts, categories, collections and
  favourites in your library. A prompt is a free-text field, so whatever you
  type into one is stored as you typed it — please avoid putting sensitive
  personal information, about yourself or anyone else, into prompt bodies.</p>
  <p><strong>Technical information.</strong> Our hosting and database providers
  keep the standard server logs any website produces: IP address, browser
  user-agent, timestamps, and which pages were requested. These exist for
  security and diagnostics. We do not use analytics, we do not advertise, and we
  do not build a profile of you.</p>

  ${h('why')}
  <table class="legal-table">
    <thead><tr><th>What for</th><th>Our legal basis (UK GDPR Article 6)</th></tr></thead>
    <tbody>
      <tr><td>Creating your account and signing you in</td>
          <td>Performance of a contract — Article 6(1)(b)</td></tr>
      <tr><td>Storing and showing you the prompts and categories in your library</td>
          <td>Performance of a contract — Article 6(1)(b)</td></tr>
      <tr><td>Greeting you by name on your account page</td>
          <td>Performance of a contract — Article 6(1)(b)</td></tr>
      <tr><td>Sending service email you have asked for (confirming your address, resetting your password)</td>
          <td>Performance of a contract — Article 6(1)(b)</td></tr>
      <tr><td>Keeping the service secure, available and free of abuse</td>
          <td>Legitimate interests — Article 6(1)(f): running a service that stays
          up and is not misused. We have weighed this against your rights and
          consider it proportionate, since it involves only technical logs.</td></tr>
    </tbody>
  </table>
  <p>We do not rely on consent for any of this, so there is no consent for you to
  withdraw. Nothing here involves automated decision-making or profiling that
  produces legal or similarly significant effects.</p>

  ${h('cookies')}
  <p><strong>No. Promptly sets no cookies of any kind</strong> — not advertising
  cookies, not analytics cookies, not even a "strictly necessary" one. There is
  nothing here for you to accept or reject, which is why you have not been shown
  a cookie banner.</p>
  <p>That is unusual enough to be worth explaining rather than just asserting.
  Most sites need cookies to remember who is signed in; Promptly keeps that
  information in your browser's local storage instead (see the next section).
  Local storage is not a cookie, but the law treats the two the same — the
  Privacy and Electronic Communications Regulations govern storing
  <em>any</em> information on your device, whatever the mechanism. So the
  question that actually matters is not "is it a cookie?" but "what is stored,
  and is it necessary?" That is answered next.</p>

  ${h('device')}
  <p>Three things, all of them stored by your own browser and none of them
  readable by anyone else:</p>
  <ul>
    <li><strong>Your preferences.</strong> Four values — your theme, sidebar
    width, whether the sidebar is collapsed, and your view mode. Each is written
    only at the moment you change that setting, and each exists solely to give
    you back the choice you just made.</li>
    <li><strong>Your favourites, if you are not signed in.</strong> Stored
    locally so they survive a page reload. Signed in, they live in your account
    instead.</li>
    <li><strong>A sign-in token, once you sign in.</strong> This is what keeps
    you signed in between visits.</li>
  </ul>
  <p>None of it is shared with anyone, none of it follows you to other websites,
  and clearing your browser storage removes all of it. Nothing here is used to
  track you, and there is no third-party storage of any kind.</p>

  ${h('who-else')}
  <p>We do not sell your information and we do not share it for marketing. Three
  companies are involved in running the service:</p>
  <ul>
    <li><strong>Supabase</strong> — the database, sign-in, and service email.</li>
    <li><strong>Vercel</strong> — hosting and delivering the website.</li>
    <li><strong>esm.sh</strong> — a public code library service. It receives no
    account information, but as with any file your browser requests from
    anywhere, it will see your IP address.</li>
  </ul>
  <p>The first two act under a data processing agreement and may not use your
  information for their own purposes. We may also disclose information where the
  law requires it.</p>

  ${h('transfers')}
  <p>It may. Our providers operate internationally, so your information may be
  processed outside the UK, including in the United States. Where that happens
  the transfer is covered by the UK International Data Transfer Addendum to the
  EU Standard Contractual Clauses, or another safeguard permitted under Article
  46 of the UK GDPR, as set out in each provider's own agreement.</p>

  ${h('retention')}
  <p>Your account details and your library are kept for as long as your account
  exists. Delete a prompt or a category and it goes immediately. Ask us to close
  your account and everything associated with it is removed, apart from anything
  we are legally required to keep. Server logs follow our providers' standard
  retention, measured in days to months rather than years.</p>

  ${h('rights')}
  <p>Under the UK GDPR you have the right to see the information we hold about
  you; to have it corrected if it is wrong; to have it deleted; to restrict or
  object to how we use it; and to receive it in a portable, machine-readable
  format.</p>
  <p>Most of this you can do yourself, without asking: your library is yours to
  edit and delete at any time. For anything else, email
  <a href="mailto:${esc(d.email)}">${esc(d.email)}</a> and we will respond within
  one month.</p>
  <p>If you are unhappy with how we have handled your information you can
  complain to the Information Commissioner's Office at
  <a href="https://ico.org.uk/make-a-complaint/" rel="noopener">ico.org.uk</a> or
  on 0303 123 1113. We would rather you came to us first, so we have a chance to
  put it right.</p>

  ${h('security')}
  <p>Everything travels over HTTPS. Your library is protected by access rules
  enforced by the database itself rather than only by the website, so one
  account cannot read another's prompts even if the application were at fault.
  No service is perfectly secure and we do not claim otherwise — if you think
  your account has been compromised, tell us straight away.</p>

  ${h('children')}
  <p>Promptly is not intended for children under 13, and we do not knowingly
  collect their information.</p>

  ${h('changes')}
  <p>If this policy changes we update the date at the top. Where a change
  affects how we use information you have already given us, we will tell you by
  email rather than relying on you noticing.</p>

  ${h('contact')}
  <p>Any question about this policy, or about your information:
  <a href="mailto:${esc(d.email)}">${esc(d.email)}</a>.</p>
</div>`;
  return renderLayout({
    title: 'Privacy & Cookies',
    description: 'What information Promptly collects, why, and what you can do about it.',
    active: 'privacy', bodyHtml: body, data, pageTitle: 'Privacy & Cookies'
  });
}

export function renderTermsPage(data) {
  const d = LEGAL_DETAILS;
  const body = `
<div class="container legal-page">
  <p class="legal-updated">Last updated: ${esc(d.updated)}</p>

  <p>These terms are the agreement between you and ${esc(d.entity)} ("we", "us")
  for the use of Promptly. Using the site means accepting them. If you do not
  accept them, please do not use the service.</p>

  <h2>1. What Promptly is</h2>
  <p>Promptly is a catalog of reusable AI prompts. Anyone can browse and search
  it without an account. Creating an account adds a personal library you
  control. The service is provided free of charge.</p>

  <h2>2. Your account</h2>
  <p>You are responsible for keeping your password secure and for what happens
  under your account. Tell us promptly if you think someone else has access to
  it. You must be at least 13 years old to create an account, and the details
  you give us must be accurate.</p>

  <h2>3. Your content stays yours</h2>
  <p>You keep all rights in the prompts, categories and collections you create.
  You grant us only the narrow permission needed to run the service — to store,
  back up and display your content back to you. We do not publish your content
  to other users, and we do not use it to train AI models.</p>

  <h2>4. How the shared catalog works</h2>
  <p>This is the part worth reading twice, because it is unusual.</p>
  <p>When you sign in, the published prompts in the shared catalog are
  <strong>copied</strong> into your library. Those copies are genuinely yours:
  you can edit, archive or delete any of them, and doing so affects nobody
  else. We do not modify prompts that are already in your library. Deleting your
  copy of a catalog prompt deletes only your copy.</p>
  <p>Your categories work the same way. If we later rename or recolour a
  category in the catalog, your version keeps the name and colour you gave it.</p>
  <p>Prompts in the shared catalog are provided for you to use and adapt freely.
  Prompts you write yourself are never added to the shared catalog — there is
  currently no route by which that can happen.</p>

  <h2>5. Acceptable use</h2>
  <p>Do not use Promptly to store or create content that is unlawful, that
  infringes someone else's rights, or that is designed to harass or harm others.
  Do not attempt to access other users' data, disrupt the service, or work
  around its technical limits. We may suspend or remove an account that does
  these things.</p>

  <h2>6. Availability</h2>
  <p>We aim to keep Promptly running but do not promise it will be available
  uninterrupted or error-free. We may change, suspend or discontinue any part of
  it. Keep your own copies of anything you would be sorry to lose — an export is
  available from the Favorites page, and your prompts can be copied out at any
  time.</p>
  <p>The prompts in the catalog are provided as-is. They are starting points for
  working with AI tools, and we make no promise about the quality, accuracy or
  suitability of anything an AI model produces from them. Check the output.</p>

  <h2>7. Ending it</h2>
  <p>You can stop using Promptly and ask us to delete your account at any time,
  by emailing <a href="mailto:${esc(d.email)}">${esc(d.email)}</a>. We may close
  an account that breaches these terms, and will tell you why unless we are
  legally prevented from doing so.</p>

  <h2>8. Our liability</h2>
  <p>Nothing in these terms limits our liability for death or personal injury
  caused by negligence, for fraud, or for anything else that cannot be limited
  under Scots law. If you are a consumer, you have statutory rights — including
  under the Consumer Rights Act 2015, which applies across the UK — that these
  terms do not affect, and nothing here is intended to exclude them.</p>
  <p>Subject to that: because Promptly is provided free of charge, we are not
  liable for any indirect or consequential loss, or for loss of data, profit or
  business arising from your use of it.</p>

  <h2>9. Changes to these terms</h2>
  <p>We may update these terms. The date at the top shows when they last
  changed, and we will give notice of material changes by email to account
  holders. Continuing to use the service after a change means accepting the
  updated terms.</p>

  <h2>10. Governing law</h2>
  <p>These terms are governed by Scots law, and the Scottish courts have
  jurisdiction. If you are a consumer living elsewhere in the UK, this does not
  take away your right to bring proceedings in the courts of the part of the UK
  where you live.</p>

  <h2>11. Contact</h2>
  <p>Questions about these terms: <a href="mailto:${esc(d.email)}">${esc(d.email)}</a>.</p>
</div>`;
  return renderLayout({
    title: 'Terms of Service',
    description: 'The terms for using Promptly.',
    active: 'terms', bodyHtml: body, data, pageTitle: 'Terms of Service'
  });
}

// Linked from the sidebar's signed-out Collections callout (renderNav) and
// the footer - a plain comparison of what's available without an account
// vs. with one, since collections (and the rest of the account tier) have
// no anonymous equivalent and that's otherwise easy to wonder about.
export function renderWhySignInPage(data) {
  const body = `
<div class="container why-sign-in-page">
  <p>Browsing the catalog, favoriting prompts, and following sequences never require an account. Signing in adds a personal layer on top of that.</p>
  <div class="why-compare">
    <div class="surface why-compare-col">
      <h2>Not signed in</h2>
      <ul>
        <li>Browse and search every published prompt</li>
        <li>Favorite prompts (saved in this browser only)</li>
        <li>Follow multi-step sequences</li>
      </ul>
    </div>
    <div class="surface why-compare-col">
      <h2>Signed in</h2>
      <ul>
        <li>Everything above, synced across devices</li>
        <li>Full control over your own prompts - write, edit, archive, and delete them</li>
        <li>Make a default prompt your own by editing it, or archive one you'd rather not see</li>
        <li>Your own categories - rename them, pick their colours, add the ones you actually use</li>
        <li>Group prompts into your own collections</li>
      </ul>
    </div>
  </div>
  <p><a href="/account/" class="btn btn-primary">Sign in / sign up</a></p>
</div>`;
  return renderLayout({
    title: 'Why sign in?',
    description: 'What signing in to Promptly adds over browsing anonymously.',
    active: 'why-sign-in',
    bodyHtml: body,
    data,
    pageTitle: 'Why sign in?'
  });
}

// Static shell only - #account-root's real content (sign-in/up form, or
// signed-in state) is filled in client-side by auth.js once it knows
// whether there's a session, the same "isomorphic render, static shell"
// pattern every other per-user page in this file uses (renderAdminPage,
// renderCollectionsPage, ...). No pageTitle here - auth.js's own
// renderSignedIn()/renderSignedOut() render their own "Account" heading into
// #account-root, so the generic header would just duplicate it.
export function renderAccountPage(data) {
  const body = `
<div class="container account-page">
  <div id="account-root">
    <p style="color:var(--ink-faint);">Loading…</p>
  </div>
</div>`;
  return renderLayout({
    title: 'Account',
    description: 'Sign in to Promptly to create, edit, and sync your own prompts.',
    active: 'account',
    bodyHtml: body,
    data
  });
}

// Static shell only - #admin-root's real content is filled in client-side by
// admin.js, same "isomorphic render, static shell" pattern as
// renderAccountPage above. Lists the signed-in admin's own curated prompts
// (is_curated=true, owned by them - drafts and already-published alike) with
// a publish/unpublish control per row, via db.js's publishPrompt()/
// unpublishPrompt(). Reachable at /admin/, linked from the sidebar's
// #nav-admin-link (hidden by default, toggled by auth.js's isAdmin() check -
// same gate as the New Prompt modal's admin checkbox).
export function renderAdminPage(data) {
  const body = `
<div class="container account-page admin-page">
  <div id="admin-root">
    <p style="color:var(--ink-faint);">Loading…</p>
  </div>
</div>`;
  const script = `<script type="module" src="${av('/scripts/admin.js')}"></script>`;
  return renderLayout({
    title: 'Admin',
    description: 'Manage default prompts.',
    active: 'admin',
    bodyHtml: body,
    extraScripts: script,
    data
  });
}

// Static shell only - #collections-root's real content is filled in
// client-side by public/scripts/collections.js, same "isomorphic render,
// static shell" pattern as renderAccountPage/renderAdminPage above
// (BUILD_BRIEF_v4.md §6). Collections are per-user live data with no static
// equivalent (there used to be a /library/ page bundling this with "your
// prompts" and "archived defaults" - both are gone: Home/Category/Search
// *are* your library under the owned-copies model, and /archived/ covers
// archiving - see BUILD_BRIEF_v5.md). Reachable
// at /collections/, linked from the sidebar's Collections section label,
// which works for both signed-in and signed-out visitors (the page itself
// is the sign-in gate).
// Static shell only - #categories-root is filled in by categories.js, the
// same "isomorphic render, static shell" pattern as /collections/ and
// /admin/. Deliberately NOT part of /admin/: categories belong to every user
// now (BUILD_BRIEF_v6.md §4.1), and an admin manages theirs on this same page
// - theirs simply happen to be the catalog rows.
//
// Signed out this shows an explainer rather than a sign-in wall, matching how
// the sidebar's Collections section already behaves for guests: they do have
// categories (the catalog's), they just can't change them.
export function renderCategoriesPage(data) {
  const body = `
<div class="container account-page categories-page">
  <div id="categories-root">
    <p style="color:var(--ink-faint);">Loading…</p>
  </div>
</div>`;
  const script = `<script type="module" src="${av('/scripts/categories.js')}"></script>`;
  return renderLayout({
    title: 'Categories',
    description: 'Your prompt categories.',
    active: 'categories',
    bodyHtml: body,
    extraScripts: script,
    data,
    pageTitle: 'Categories',
    pageSubtitle: 'Rename, recolour and reorder the categories your prompts are filed under.'
  });
}

export function renderCollectionsPage(data) {
  const body = `
<div class="container account-page collections-page">
  <div id="collections-root">
    <p style="color:var(--ink-faint);">Loading…</p>
  </div>
</div>`;
  const script = `<script type="module" src="${av('/scripts/collections.js')}"></script>`;
  return renderLayout({
    title: 'Collections',
    description: 'Your prompt collections.',
    active: 'collections',
    bodyHtml: body,
    extraScripts: script,
    data
  });
}

// Static shell only - #archived-root's real content is filled in
// client-side by public/scripts/archived.js, same pattern as
// renderAdminPage/renderCollectionsPage above. Lists the caller's own
// archived prompts (prompts.is_archived, db.js's archivePrompt()) - simply
// their library filtered to archived, since under the owned-copies model
// every prompt they can see is theirs and archiving applies uniformly.
// Reachable at /archived/, linked from the sidebar below Sequences (hidden
// until signed in - auth.js's setNavAccountState).
export function renderArchivedPage(data) {
  const body = `
<div class="container account-page archived-page">
  <div id="archived-root">
    <p style="color:var(--ink-faint);">Loading…</p>
  </div>
</div>`;
  const script = `<script type="module" src="${av('/scripts/archived.js')}"></script>`;
  return renderLayout({
    title: 'Archived Prompts',
    description: 'Prompts you’ve archived from your library.',
    active: 'archived',
    bodyHtml: body,
    extraScripts: script,
    data
  });
}
