import { CATEGORIES, CATEGORY_DESCRIPTIONS } from './schema.mjs';

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
  example: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>',
  category: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>',
  moon: '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  sun: '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/></svg>',
  menu: '<svg class="icon-menu-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
  close: '<svg class="icon-menu-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
};

// Runs before CSS paints (placed at the very top of <head>, not deferred)
// to avoid a flash of the wrong theme - same anti-flash approach as
// amplified thinker's nav.js, just scoped to a small inline script instead
// of needing the whole nav injected via JS.
const THEME_INIT_SCRIPT = `<script>(function(){try{var s=localStorage.getItem('promptly:theme');var t=(s==='light'||s==='dark')?s:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>`;

export function renderChip(text, { seq = false } = {}) {
  return `<span class="chip${seq ? ' chip-seq' : ''}">${esc(text)}</span>`;
}

export function renderNav(active) {
  const link = (href, label, key) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `
<nav class="nav" aria-label="Site navigation">
  <div class="container nav-inner">
    <a href="/" class="nav-logo" style="display:flex;align-items:center;gap:8px;">
      <img src="/images/promptly-logo.svg" alt="" width="26" height="26">
      Promptly
    </a>
    <a href="/favorites/" id="nav-fav-count" class="nav-fav-count" aria-label="Favorites">
      <span aria-hidden="true" style="display:flex;">${ICON.star}</span><span id="nav-fav-count-num">0</span>
    </a>
    <button type="button" id="theme-toggle" class="icon-btn theme-toggle" aria-pressed="false" aria-label="Switch to dark mode">
      ${ICON.moon}${ICON.sun}
    </button>
    <button type="button" id="nav-menu-toggle" class="icon-btn nav-toggle" aria-expanded="false" aria-controls="nav-links" aria-label="Open menu">
      ${ICON.menu}${ICON.close}
    </button>
    <form class="search-field nav-search" action="/search/" role="search">
      <span aria-hidden="true" style="display:flex;color:var(--ink-faint);">${ICON.search}</span>
      <input type="search" name="q" placeholder="Search prompts…" aria-label="Search prompts">
    </form>
    <div class="nav-links" id="nav-links">
      ${link('/sequences/', 'Sequences', 'sequences')}
    </div>
  </div>
</nav>`;
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

export function renderLayout({ title, description, active, bodyHtml, extraScripts = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${THEME_INIT_SCRIPT}
<title>${esc(title)} · Promptly</title>
<meta name="description" content="${esc(description || '')}">
<link rel="icon" href="/images/promptly-logo.svg" type="image/svg+xml">
<link rel="stylesheet" href="/styles/base.css">
</head>
<body>
${renderNav(active)}
<main>${bodyHtml}</main>
${renderFooter()}
<script type="module" src="/scripts/favorites.js"></script>
${extraScripts}
</body>
</html>
`;
}

export function renderPromptCard(p, ctx = {}) {
  const total = ctx.sequenceTotals?.[p.sequence];
  const seqChip = p.sequence && total ? renderChip(`Step ${p.sequence_step} of ${total}`, { seq: true }) : '';
  const catChips = renderCatBadges(p.categories);
  const exampleIcon = p.example_output ? `<span title="Has example output">${ICON.example}</span>` : '';
  const cats = p.categories.join(',');
  return `
<a href="/prompt/${p.slug}/" class="prompt-card surface" data-categories="${esc(cats)}">
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
    ${exampleIcon}
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

  const exampleSection = prompt.example_output ? `
<section class="prompt-example">
  <h2>Example output</h2>
  <a href="${esc(prompt.example_output)}" target="_blank" rel="noopener">
    <img src="${esc(prompt.example_output)}" alt="Example output for ${esc(prompt.title)}" style="max-width:100%;border-radius:var(--radius);border:1px solid var(--line);">
  </a>
</section>` : '';

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
  ${exampleSection}
</div>`;

  return renderLayout({ title: prompt.title, description: prompt.purpose, bodyHtml: body });
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
import { initTableFilterToolbar } from '/scripts/filters.js';
import { initQuickView } from '/scripts/quickview.js';
initTableFilterToolbar('home-filters', 'home-grid');
initQuickView('home-grid');
${newCalloutScript}
</script>`;
  return renderLayout({ title: 'Promptly', description: 'Personal AI prompt catalog.', active: 'home', bodyHtml: body, extraScripts: script });
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
<div class="prompt-table-block">
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
import { initQuickView } from '/scripts/quickview.js';
initQuickView('result-grid');
</script>`;
  return renderLayout({ title: categoryLabel(category), description: `Prompts in ${categoryLabel(category)}.`, active: 'browse', bodyHtml: body, extraScripts: script });
}

export function renderCollectionPage(collection, data) {
  const body = `
<div class="container">
  ${renderBreadcrumb([{ href: '/', label: 'Home' }, { label: collection.title }])}
  <h1>${esc(collection.title)}</h1>
  <p class="card-purpose">${esc(collection.description)}</p>
  ${renderCardGrid(collection.prompts, { sequenceTotals: data.sequenceTotals })}
</div>`;
  return renderLayout({ title: collection.title, description: collection.description, active: 'browse', bodyHtml: body });
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
  return renderLayout({ title: 'Sequences', description: 'Multi-step prompt chains.', active: 'sequences', bodyHtml: body });
}

export function renderSequencePage(sequence) {
  const name = sequence.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const body = `
<div class="container">
  ${renderBreadcrumb([{ href: '/sequences/', label: 'Sequences' }, { label: name }])}
  <h1>${esc(name)}</h1>
  <p class="card-purpose" style="margin-bottom:20px;">${sequence.steps.length} step${sequence.steps.length === 1 ? '' : 's'}</p>
  ${renderSequenceRail(sequence.steps)}
</div>`;
  return renderLayout({ title: name, description: `${name} sequence.`, active: 'sequences', bodyHtml: body });
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
  const script = `<script type="module">import { initQuickView } from '/scripts/quickview.js'; initQuickView('favorites-grid');</script>`;
  return renderLayout({ title: 'Favorites', description: 'Your starred prompts.', active: 'favorites', bodyHtml: body, extraScripts: script });
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
</div>
${renderQuickViewModal()}`;
  const script = `<script type="module" src="/scripts/search.js"></script>`;
  return renderLayout({ title: 'Search', description: 'Search the prompt library.', active: 'search', bodyHtml: body, extraScripts: script });
}

export function renderAboutPage() {
  const body = `
<div class="container">
  <h1>About</h1>
  <p>Promptly is a personal, static catalog of reusable AI prompts — browsable, searchable, with multi-step sequences and one-click favorites. No accounts, no backend.</p>
</div>`;
  return renderLayout({ title: 'About', description: 'About Promptly.', active: 'about', bodyHtml: body });
}
