import { CATEGORIES, CATEGORY_DESCRIPTIONS } from './schema.mjs';

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

// Fixed hex values (not theme tokens) so a category's badge color stays put
// across light/dark instead of flipping shade - same idea as a language-color dot.
const CATEGORY_HUES = ['cat-clay', 'cat-ochre', 'cat-blue', 'cat-plum', 'cat-moss', 'cat-rose'];

export function categoryHue(slug) {
  const idx = CATEGORIES.indexOf(slug);
  return CATEGORY_HUES[(idx < 0 ? 0 : idx) % CATEGORY_HUES.length];
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
  let html = shown.map(c => `<span class="cat-badge ${categoryHue(c)}">${esc(categoryLabel(c))}</span>`).join('');
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
  listView: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>'
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

  const collections = (data?.collections || []).map(c =>
    `<a href="/collections/${c.slug}/"${activeKey === 'collection' && activeSlug === c.slug ? ' aria-current="page"' : ''}>${esc(c.title)}</a>`
  ).join('');

  const categories = (data?.categories || []).filter(c => c.count > 0).map(c => `
<a href="/browse/${c.slug}/"${activeKey === 'category' && activeSlug === c.slug ? ' aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${ICON.category}</span><span class="nav-label">${esc(categoryLabel(c.slug))}</span><span class="count">${c.count}</span></a>`).join('');

  return `
<aside class="sidebar" id="sidebar" aria-label="Site navigation">
  <div class="sidebar-brand-row">
    <a href="/" class="sidebar-brand">
      <img src="/images/promptly-logo.svg" alt="" width="26" height="26">
      Promptly
    </a>
    <button type="button" id="sidebar-collapse-toggle" class="icon-btn" aria-pressed="false" aria-label="Collapse sidebar" title="Collapse sidebar">
      ${ICON.panelCollapse}${ICON.panelExpand}
    </button>
  </div>
  <button type="button" id="new-prompt-btn" class="btn btn-primary sidebar-new-btn" hidden>+ New Prompt</button>
  <form class="search-field sidebar-search" action="/search/" role="search">
    <span aria-hidden="true" style="display:flex;color:var(--ink-faint);">${ICON.search}</span>
    <input type="search" name="q" placeholder="Search prompts…" aria-label="Search prompts">
  </form>
  <nav class="sidebar-primary-links">
    ${link('/', 'All Prompts', 'home', { icon: ICON.stack })}
    ${link('/favorites/', 'Favorites', 'favorites', { icon: ICON.star, extra: '<span id="nav-fav-count-num" class="sidebar-badge">0</span>' })}
    ${link('/sequences/', 'Sequences', 'sequences', { icon: ICON.flow })}
    <a href="/admin/" id="nav-admin-link"${activeKey === 'admin' ? ' aria-current="page"' : ''} hidden><span class="nav-icon" aria-hidden="true">${ICON.shield}</span><span class="nav-label">Admin</span></a>
  </nav>
  <div class="sidebar-divider"></div>
  <div class="sidebar-section">
    <div class="sidebar-section-label-row">
      <div class="sidebar-section-label">Collections</div>
      <button type="button" id="new-collection-btn" class="icon-btn sidebar-section-add" hidden aria-label="New collection" title="New collection">${ICON.plus}</button>
    </div>
    <div class="sidebar-section-list">${collections}</div>
  </div>
  <div class="sidebar-divider"></div>
  <div class="sidebar-section">
    <div class="sidebar-section-label">Categories</div>
    <div class="sidebar-section-list">${categories}</div>
  </div>
  <div class="sidebar-view-toggle" id="sidebar-view-toggle" role="group" aria-label="Prompt list view">
    <button type="button" class="view-toggle-btn is-active" data-view="table" aria-pressed="true" aria-label="List view" title="List view">${ICON.listView}</button>
    <button type="button" class="view-toggle-btn" data-view="grid" aria-pressed="false" aria-label="Grid view" title="Grid view">${ICON.gridView}</button>
  </div>
  <div class="sidebar-footer-row">
    <a href="/account/" id="nav-account-link"${activeKey === 'account' ? ' aria-current="page"' : ''}>Sign in</a>
    <button type="button" id="theme-toggle" class="icon-btn theme-toggle" aria-pressed="false" aria-label="Switch to dark mode">
      ${ICON.moon}${ICON.sun}
    </button>
  </div>
</aside>`;
}

export function renderFooter() {
  return `
<footer class="site-footer">
  <div class="container footer-inner">
    <a href="/" class="footer-logo" style="display:flex;align-items:center;gap:6px;">
      <img src="/images/promptly-logo.svg" alt="" width="16" height="16">
      Promptly
    </a>
    <div class="footer-links">
      <a href="/about/">About</a>
    </div>
  </div>
</footer>`;
}

// Small "(i)" affordance next to a field label - hover/focus reveals a
// plain-language explanation via CSS only (no JS needed to show/hide),
// wired up as a proper tooltip relationship (aria-describedby + role="tooltip")
// rather than a bare native `title` attribute, which screen readers and
// keyboard users can't reliably reach.
function fieldInfo(id, hintText) {
  return `<button type="button" class="field-info" aria-describedby="${id}">${ICON.info}<span class="sr-only">More info</span></button><span class="field-hint" id="${id}" role="tooltip">${esc(hintText)}</span>`;
}

// New Prompt modal (site-wide - #new-prompt-btn lives in the sidebar on every
// page via renderNav) - open to any signed-in user, with an admin-only "make
// this a default prompt" checkbox toggled client-side by newPrompt.js's
// isAdmin() check. Regular submits call db.js's createPrompt(); the checked
// admin path calls createCuratedPrompt() instead (see supabase/README.md
// "Admin curation, publishing, and per-user forks"). Categories render as a
// checkbox-backed dropdown (np-cat-dropdown, behavior in newPrompt.js) rather
// than a flat checkbox grid - CATEGORIES itself stays the hardcoded
// lib/schema.mjs vocabulary (see supabase/README.md "Keeping the schema in
// sync" for how to add/remove one).
export function renderNewPromptModal() {
  const catChecks = CATEGORIES.map(c => `
            <label class="np-cat-check">
              <input type="checkbox" name="categories" value="${c}">
              ${esc(categoryLabel(c))}
            </label>`).join('');
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
            <div class="np-dropdown-panel" id="np-cat-panel" hidden>${catChecks}
            </div>
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
          Make this a default prompt
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
// dedupe-on-collision approach as the New Prompt modal's slug handling.
// Note: a created collection won't show up in the sidebar's own Collections
// list yet - that list is server-rendered from lib/collections.mjs's
// hardcoded set at build time, not read live from Supabase (BUILD_BRIEF_v4.md
// §7's /library/ work is what's expected to close that gap).
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

export function renderLayout({ title, description, active, bodyHtml, extraScripts = '', data }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${THEME_INIT_SCRIPT}
${SIDEBAR_INIT_SCRIPT}
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
  <main>${bodyHtml}</main>
  ${renderNewPromptModal()}
  ${renderNewCollectionModal()}
</div>
${renderFooter()}
<script type="module" src="${av('/scripts/favorites.js')}"></script>
<script type="module" src="${av('/scripts/auth.js')}"></script>
<script type="module" src="${av('/scripts/newPrompt.js')}"></script>
<script type="module" src="${av('/scripts/newCollection.js')}"></script>
<script type="module" src="${av('/scripts/sidebarCollapse.js')}"></script>
<script type="module" src="${av('/scripts/viewToggle.js')}"></script>
${extraScripts}
</body>
</html>
`;
}

export function renderPromptCard(p, ctx = {}) {
  const total = ctx.sequenceTotals?.[p.sequence];
  const seqChip = p.sequence && total ? renderChip(`Step ${p.sequence_step} of ${total}`, { seq: true }) : '';
  const catChips = renderCatBadges(p.categories);
  const cats = p.categories.join(',');
  return `
<a href="/prompt/${p.slug}/" class="prompt-card surface" data-slug="${esc(p.slug)}" data-categories="${esc(cats)}">
  <div class="card-top">
    <span class="card-title">${esc(p.title)}</span>
    <span class="card-actions">
      <button type="button" class="icon-btn fav" data-fav-slug="${esc(p.slug)}" aria-label="Favorite ${esc(p.title)}" aria-pressed="false">${ICON.star}</button>
      <button type="button" class="icon-btn" data-copy-target="prompt-copy-${esc(p.slug)}" aria-label="Copy ${esc(p.title)}">${ICON.copy}</button>
    </span>
  </div>
  <p class="card-purpose">${esc(p.purpose || '')}</p>
  <div class="card-chips">${catChips}${seqChip}</div>
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
// [{ key, label, options: [{value,label,count?,hue?}] }] - `hue` (a
// `categoryHue()` class) renders a soft hue-tinted background at rest and a
// solid hue fill + white text when active, matching the category badges;
// groups without it render as a plain neutral pill using `--accent` for the
// active fill. A single-option group acts as a plain toggle, not a radio -
// clicking it on and off is enough since there's nothing else in the group
// to exclude.
export function renderFilterToolbar(groups, { id, resultCount = false } = {}) {
  const rows = groups.filter(g => g.options.length > 0).map(g => `
<div class="filter-pill-group" data-label="${esc(g.label)}">
  ${g.options.map(o => `
  <button type="button" class="filter-pill${o.hue ? ' ' + o.hue : ''}" data-group="${esc(g.key)}" data-value="${esc(o.value)}" aria-pressed="false">
    ${esc(o.label)}${o.count != null ? ` <span class="count">${o.count}</span>` : ''}
  </button>`).join('')}
</div>`).join('');
  return `
<div class="filter-toolbar" id="${id}">
  ${rows}
  <button type="button" class="filter-clear" data-role="clear-pills">Clear filters ✕</button>
</div>
${resultCount ? `<p class="filter-result-count" id="${id}-result-count" aria-live="polite"></p>` : ''}`;
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
  ${renderBreadcrumb([{ href: '/', label: 'Home' }, { href: `/browse/${prompt.categories[0]}/`, label: categoryLabel(prompt.categories[0]) }, { label: prompt.title }])}
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
          <button type="button" class="pd-action-btn fav" data-fav-slug="${esc(prompt.slug)}" aria-label="Favorite ${esc(prompt.title)}" aria-pressed="false">
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
// perpetually new.
const NEW_WINDOW_DAYS = 14;
function findNewPrompts(prompts) {
  const now = Date.now();
  return prompts.filter(p => {
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
    key: 'category', label: 'Category',
    options: data.categories.filter(c => c.count > 0).map(c => ({ value: c.slug, label: categoryLabel(c.slug), count: c.count, hue: categoryHue(c.slug) }))
  };
  const newPrompts = findNewPrompts(data.prompts);
  // §9k: only rendered at all when there's something new to announce - no
  // "0 new" or empty-state version of this banner.
  const newCallout = newPrompts.length ? `
<div class="new-callout">
  <span class="dot" aria-hidden="true"></span>
  <span><strong>${newPrompts.length} new prompt${newPrompts.length === 1 ? '' : 's'}</strong> added in the last ${NEW_WINDOW_DAYS} days</span>
  <a href="#" id="new-callout-link">Show them ↓</a>
</div>` : '';
  const body = `
<div class="container">
  <h1 class="sr-only">Promptly</h1>
  <p class="card-purpose">${data.prompts.length} prompts across ${data.categories.length} categories, organized into ${data.sequences.length} sequence${data.sequences.length === 1 ? '' : 's'}.</p>
  ${newCallout}
  <hr class="home-hero-divider">
  ${renderFilterToolbar([categoryGroup], { id: 'home-filters', resultCount: true })}
  ${renderPromptTable(data.prompts, { sequenceTotals: data.sequenceTotals, gridId: 'home-grid', emptyText: 'No prompts yet.', data })}
</div>`;
  const newCalloutScript = newPrompts.length ? `
const newSlugs = ${JSON.stringify(newPrompts.map(p => p.slug))};
document.getElementById('new-callout-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  const rows = newSlugs.map(s => document.querySelector('#home-grid tr[data-slug="' + s + '"]')).filter(Boolean);
  if (!rows.length) return;
  rows[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  rows.forEach(r => {
    r.classList.add('is-new-highlight');
    setTimeout(() => r.classList.remove('is-new-highlight'), 1400);
  });
});` : '';
  const script = `<script type="module">
import { initTableFilterToolbar } from '${av('/scripts/filters.js')}';
import { initQuickView } from '${av('/scripts/quickview.js')}';
initTableFilterToolbar('home-filters', 'home-grid');
initQuickView('home-grid');
${newCalloutScript}
</script>`;
  return renderLayout({ title: 'Promptly', description: 'Personal AI prompt catalog.', active: 'home', bodyHtml: body, extraScripts: script, data });
}

// Live, multi-select, OR-within-category filter pills (§9b). `categoriesWithCounts`
// is [{slug, count}] - counts are static totals over the prompts passed to the
// table on this page, not recomputed as other pills toggle.
export function renderCategoryFilterBar(categoriesWithCounts, { id = 'category-filter-bar' } = {}) {
  const pills = categoriesWithCounts.filter(c => c.count > 0).map(c => `
<button type="button" class="filter-pill ${categoryHue(c.slug)}" data-cat="${esc(c.slug)}" aria-pressed="false">
  ${esc(categoryLabel(c.slug))} <span class="count">${c.count}</span>
</button>`).join('');
  return `
<div class="filter-bar" id="${id}">
  ${pills}
  <button type="button" class="filter-clear" data-role="clear-pills">Clear filters ✕</button>
</div>
<p class="filter-result-count" id="${id}-result-count" aria-live="polite"></p>`;
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
    const cats = p.categories.join(',');
    return `
<tr data-slug="${esc(p.slug)}" data-categories="${esc(cats)}" tabindex="0" role="button" aria-label="Open ${esc(p.title)}">
  <td><span class="cat-cell">${renderCatBadges(p.categories, { max: 2 })}</span></td>
  <td class="title-cell">${esc(p.title)}${seqTag}<span class="purpose-line">${esc(p.purpose || '')}</span></td>
  <td class="col-updated">${esc(fmtDate(p.updated || p.added))}</td>
  <td>
    <span class="row-actions">
      <button type="button" class="icon-btn fav" data-fav-slug="${esc(p.slug)}" aria-label="Favorite ${esc(p.title)}" aria-pressed="false">${ICON.star}</button>
      <button type="button" class="icon-btn" data-copy-target="prompt-copy-${esc(p.slug)}" aria-label="Copy ${esc(p.title)}">${ICON.copy}</button>
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
    slug: p.slug, title: p.title, purpose: p.purpose || '', categories: p.categories,
    body: p.body, notes: p.notes || '', added: p.added || '', updated: p.updated || '',
    sequence: p.sequence || '', sequence_step: p.sequence_step,
    seq: ctx.data ? resolveSeqInfo(p, ctx.data) : null
  };
}

export function renderPromptTable(prompts, ctx = {}) {
  const gridId = ctx.gridId || 'prompt-table';
  const rows = renderPromptTableRows(prompts, ctx);
  const quickViewData = prompts.map(p => toQuickViewItem(p, ctx));

  return `
<div class="prompt-table-block" data-grid-id="${esc(gridId)}">
  <div class="table-wrap">
    <table class="browse-table comfortable">
      <thead>
        <tr><th style="width:180px;">Category</th><th>Title</th><th class="col-updated">Updated</th><th style="width:64px;"></th></tr>
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
              <button type="button" class="pd-action-btn fav" id="qv-fav" aria-label="Favorite" aria-pressed="false">
                ${ICON.star}<span class="fav-label-off">Favorite</span><span class="fav-label-on">Favorited</span>
              </button>
              <button type="button" class="pd-action-btn square" id="qv-copy" aria-label="Copy prompt">${ICON.copy}</button>
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

export function renderCategoryPage(category, prompts, data) {
  const description = CATEGORY_DESCRIPTIONS[category];
  const body = `
<div class="container">
  ${renderBreadcrumb([{ href: '/', label: 'Home' }, { label: categoryLabel(category) }])}
  <h1>${esc(categoryLabel(category))}</h1>
  ${description ? `<p class="card-purpose category-description">${esc(description)}</p>` : ''}
  ${renderPromptTable(prompts, { sequenceTotals: data.sequenceTotals, gridId: 'result-grid', emptyText: 'No prompts in this category yet.', data })}
</div>`;
  const script = `<script type="module">
import { initQuickView } from '${av('/scripts/quickview.js')}';
initQuickView('result-grid');
</script>`;
  return renderLayout({ title: categoryLabel(category), description: `Prompts in ${categoryLabel(category)}.`, active: `category:${category}`, bodyHtml: body, extraScripts: script, data });
}

export function renderCollectionPage(collection, data) {
  const body = `
<div class="container">
  ${renderBreadcrumb([{ href: '/', label: 'Home' }, { label: collection.title }])}
  <h1>${esc(collection.title)}</h1>
  <p class="card-purpose">${esc(collection.description)}</p>
  ${renderCardGrid(collection.prompts, { sequenceTotals: data.sequenceTotals })}
</div>`;
  return renderLayout({ title: collection.title, description: collection.description, active: `collection:${collection.slug}`, bodyHtml: body, data });
}

// Vertical connected rail (§9e) - replaces the old horizontal box-and-chevron
// strip. `compact` (used on /sequences' per-sequence preview) drops purpose,
// category badges, and the handoff note, showing just the numbered dot,
// title, and connecting line - the same idiom at a smaller information
// density rather than a separate component.
function renderSequenceRail(steps, { compact = false } = {}) {
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
    <a href="/prompt/${step.slug}/" class="surface seq-rail-card">
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
  return `<div class="seq-rail">${items}</div>`;
}

export function renderSequencesIndex(data) {
  const flows = data.sequences.map(s => `
<section>
  <h2>${esc(s.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))}</h2>
  ${renderSequenceRail(s.steps, { compact: true })}
  <a href="/sequence/${s.slug}/">View sequence</a>
</section>`).join('');
  const body = `<div class="container"><h1>Sequences</h1>${flows || '<p>No sequences yet.</p>'}</div>`;
  return renderLayout({ title: 'Sequences', description: 'Multi-step prompt chains.', active: 'sequences', bodyHtml: body, data });
}

export function renderSequencePage(sequence, data) {
  const name = sequence.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const body = `
<div class="container">
  ${renderBreadcrumb([{ href: '/sequences/', label: 'Sequences' }, { label: name }])}
  <h1>${esc(name)}</h1>
  <p class="card-purpose" style="margin-bottom:20px;">${sequence.steps.length} step${sequence.steps.length === 1 ? '' : 's'}</p>
  ${renderSequenceRail(sequence.steps)}
</div>`;
  return renderLayout({ title: name, description: `${name} sequence.`, active: 'sequences', bodyHtml: body, data });
}

export function renderFavoritesPage(data) {
  const body = `
<div class="container">
  <div class="card-top" style="align-items:center;margin-bottom:8px;">
    <h1>Favorites</h1>
    <button type="button" class="btn btn-secondary" id="export-favorites-btn">Export favorites</button>
  </div>
  ${renderCategoryFilterBar(data.categories, { id: 'favorites-category-filter' })}
  ${renderPromptTable(data.prompts, { sequenceTotals: data.sequenceTotals, gridId: 'favorites-grid', emptyText: 'Nothing starred yet.', data })}
</div>`;
  const script = `<script type="module">import { initQuickView } from '${av('/scripts/quickview.js')}'; initQuickView('favorites-grid');</script>`;
  return renderLayout({ title: 'Favorites', description: 'Your starred prompts.', active: 'favorites', bodyHtml: body, extraScripts: script, data });
}

export function renderSearchPage(data) {
  const categoryGroup = {
    key: 'category', label: 'Category',
    options: data.categories.filter(c => c.count > 0).map(c => ({ value: c.slug, label: categoryLabel(c.slug), count: c.count, hue: categoryHue(c.slug) }))
  };

  const body = `
<div class="container">
  ${renderBreadcrumb([{ label: 'Search' }])}
  <h1>Search</h1>
  ${renderFilterToolbar([categoryGroup], { id: 'search-filters' })}
  <p id="search-summary" style="color:var(--ink-faint);">Start typing above to search prompts.</p>
  <div class="table-wrap" id="search-results-wrap" hidden>
    <table class="browse-table comfortable">
      <thead>
        <tr><th style="width:180px;">Category</th><th>Title</th><th class="col-updated">Updated</th><th style="width:64px;"></th></tr>
      </thead>
      <tbody id="search-results"></tbody>
    </table>
  </div>
  <div class="card-grid" id="search-results-cards" hidden></div>
</div>
${renderQuickViewModal()}`;
  const script = `<script type="module" src="${av('/scripts/search.js')}"></script>`;
  return renderLayout({ title: 'Search', description: 'Search the prompt library.', active: 'search', bodyHtml: body, extraScripts: script, data });
}

export function renderAboutPage(data) {
  const body = `
<div class="container">
  <h1>About</h1>
  <p>Promptly is a personal, static catalog of reusable AI prompts — browsable, searchable, with multi-step sequences and one-click favorites. No accounts, no backend.</p>
</div>`;
  return renderLayout({ title: 'About', description: 'About Promptly.', active: 'about', bodyHtml: body, data });
}

// Static shell only - #account-root's real content (sign-in/up form, or
// signed-in state) is filled in client-side by auth.js once it knows
// whether there's a session, the same "isomorphic render, static shell"
// pattern BUILD_BRIEF_v4.md §6 lays out for /library/.
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
