import { getRelatedPrompts } from './sequences.mjs';

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

const ICON = {
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polygon points="12 2 15.09 8.63 22 9.24 16.5 14.14 18.18 21 12 17.27 5.82 21 7.5 14.14 2 9.24 8.91 8.63 12 2"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
  example: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>',
  category: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>',
  moon: '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  sun: '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/></svg>'
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
      PROMPTLY
    </a>
    <div class="nav-links">
      ${link('/browse/', 'Browse', 'browse')}
      ${link('/sequences/', 'Sequences', 'sequences')}
    </div>
    <form class="search-field nav-search" action="/search/" role="search">
      <span aria-hidden="true" style="display:flex;color:var(--ink-faint);">${ICON.search}</span>
      <input type="search" name="q" placeholder="Search prompts…" aria-label="Search prompts">
    </form>
    <a href="/favorites/" id="nav-fav-count" class="nav-fav-count">☆ 0</a>
    <button type="button" id="theme-toggle" class="icon-btn theme-toggle" aria-pressed="false" aria-label="Switch to dark mode">
      ${ICON.moon}${ICON.sun}
    </button>
  </div>
</nav>`;
}

export function renderFooter() {
  return `
<footer class="site-footer">
  <div class="container">
    <a href="/about/">About</a> &middot; <a href="/contributing/">Adding a prompt</a>
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
  const tagChips = p.tags.slice(0, 3).map(t => renderChip(t)).join('');
  const exampleIcon = p.example_output ? `<span title="Has example output">${ICON.example}</span>` : '';
  const isChain = p.sequence ? 'true' : 'false';
  const models = (p.models || []).join(',');
  return `
<a href="/prompt/${p.slug}/" class="prompt-card surface" data-model="${esc(models)}" data-complexity="${esc(p.complexity || '')}" data-chain="${isChain}" data-title="${esc(p.title)}" data-updated="${esc(p.updated || p.added || '')}">
  <div class="card-top">
    <span class="card-title">${esc(p.title)}</span>
    <span class="card-actions">
      <button type="button" class="icon-btn fav" data-fav-slug="${esc(p.slug)}" aria-label="Favorite ${esc(p.title)}" aria-pressed="false">${ICON.star}</button>
      <button type="button" class="icon-btn" data-copy-target="prompt-copy-${esc(p.slug)}" aria-label="Copy ${esc(p.title)}">${ICON.copy}</button>
    </span>
  </div>
  <p class="card-purpose">${esc(p.purpose || '')}</p>
  <div class="card-chips">${renderChip(categoryLabel(p.category))}${tagChips}${seqChip}</div>
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

export function renderFilterRail(id) {
  return `
<aside class="filter-rail" id="${id}">
  <div class="filter-group" data-filter-group="model">
    <h3>Model</h3>
    <label class="filter-option"><input type="checkbox" value="claude"> Claude</label>
    <label class="filter-option"><input type="checkbox" value="gpt"> GPT</label>
    <label class="filter-option"><input type="checkbox" value="gemini"> Gemini</label>
    <label class="filter-option"><input type="checkbox" value="model-agnostic"> Model-agnostic</label>
  </div>
  <div class="filter-group" data-filter-group="complexity">
    <h3>Complexity</h3>
    <label class="filter-option"><input type="checkbox" value="simple"> Simple</label>
    <label class="filter-option"><input type="checkbox" value="multi-step"> Multi-step</label>
    <label class="filter-option"><input type="checkbox" value="agentic"> Agentic</label>
  </div>
  <div class="filter-group" data-filter-group="chain">
    <h3>Chain</h3>
    <label class="filter-option"><input type="radio" name="chain-${id}" value="" checked> All prompts</label>
    <label class="filter-option"><input type="radio" name="chain-${id}" value="true"> In a sequence only</label>
  </div>
  <div class="filter-group" data-filter-group="sort">
    <h3>Sort</h3>
    <select class="filter-sort">
      <option value="newest">Newest</option>
      <option value="az">A–Z</option>
    </select>
  </div>
</aside>`;
}

export function renderBreadcrumb(items) {
  const parts = items.map((it, i) =>
    i === items.length - 1 ? `<span>${esc(it.label)}</span>` : `<a href="${it.href}">${esc(it.label)}</a>`
  );
  return `<nav class="breadcrumb" aria-label="Breadcrumb">${parts.join(' / ')}</nav>`;
}

export function renderPromptDetail(prompt, data) {
  const total = data.sequenceTotals[prompt.sequence];
  const highlighted = esc(prompt.body).replace(/\{\{[^}]+\}\}/g, m => `<span class="var">${m}</span>`);

  let sequenceRail = '';
  if (prompt.sequence) {
    const seq = data.sequences.find(s => s.slug === prompt.sequence);
    const idx = seq.steps.findIndex(s => s.slug === prompt.slug);
    const prev = seq.steps[idx - 1];
    const next = seq.steps[idx + 1];
    sequenceRail = `
<div class="sequence-rail">
  ${prev ? `<a href="/prompt/${prev.slug}/">${ICON.chevronLeft} ${esc(prev.title)}</a>` : `<span>${ICON.chevronLeft} Start</span>`}
  <span class="current">You are here · step ${prompt.sequence_step} of ${total}</span>
  ${next ? `<a href="/prompt/${next.slug}/">${esc(next.title)} ${ICON.chevronRight}</a>` : `<span>End ${ICON.chevronRight}</span>`}
</div>`;
  }

  const exampleSection = prompt.example_output ? `
<section class="prompt-example">
  <h2>Example output</h2>
  <a href="${esc(prompt.example_output)}" target="_blank" rel="noopener">
    <img src="${esc(prompt.example_output)}" alt="Example output for ${esc(prompt.title)}" style="max-width:100%;border-radius:var(--radius);border:1px solid var(--line);">
  </a>
</section>` : '';

  const related = getRelatedPrompts(data.prompts, prompt, 4);
  const relatedSection = related.length ? `
<section class="related-prompts">
  <h2>Related prompts</h2>
  ${renderCardGrid(related, { sequenceTotals: data.sequenceTotals })}
</section>` : '';

  const modelBadges = (prompt.models || []).map(m => renderChip(m)).join('');

  const body = `
<div class="container">
  ${renderBreadcrumb([{ href: '/browse/', label: 'Browse' }, { href: `/browse/${prompt.category}/`, label: categoryLabel(prompt.category) }, { label: prompt.title }])}
  <header>
    <h1>${esc(prompt.title)}</h1>
    <p class="card-purpose">${esc(prompt.purpose || '')}</p>
    <div class="card-chips">${renderChip(categoryLabel(prompt.category))}${prompt.tags.map(t => renderChip(t)).join('')}</div>
    <button type="button" class="icon-btn fav" data-fav-slug="${esc(prompt.slug)}" aria-label="Favorite ${esc(prompt.title)}" aria-pressed="false">${ICON.star} Favorite</button>
  </header>
  ${sequenceRail}
  <div class="prompt-body-block well" id="prompt-copy-${esc(prompt.slug)}" data-raw-text="${esc(prompt.body)}">
    <button type="button" class="btn btn-primary copy-pinned" data-copy-target="prompt-copy-${esc(prompt.slug)}">${ICON.copy} Copy</button>
    <div>${highlighted}</div>
  </div>
  ${exampleSection}
  ${prompt.notes ? `<section><h2>When to use / when not to</h2><p>${esc(prompt.notes)}</p></section>` : ''}
  ${relatedSection}
  <aside class="prompt-sidebar" style="margin-top:24px;color:var(--ink-soft);font-size:13px;">
    ${modelBadges ? `<p>Compatible models: ${modelBadges}</p>` : ''}
    ${prompt.complexity ? `<p>Complexity: ${renderChip(prompt.complexity)}</p>` : ''}
    <p>Added ${esc(fmtDate(prompt.added))}${prompt.updated ? ` · Updated ${esc(fmtDate(prompt.updated))}` : ''}</p>
  </aside>
</div>`;

  return renderLayout({ title: prompt.title, description: prompt.purpose, bodyHtml: body });
}

export function renderHomePage(data) {
  const useCasesHtml = data.useCases.map(u => {
    const count = data.tags.find(t => t.slug === u.tag)?.count || 0;
    return `<a href="/tag/${u.tag}/" class="surface" style="display:block;padding:16px;text-align:center;"><div class="card-title">${esc(u.label)}</div><div class="card-footer" style="justify-content:center;">${count} prompt${count === 1 ? '' : 's'}</div></a>`;
  }).join('');

  const categoryTiles = data.categories.map(c => `
<a href="/browse/${c.slug}/" class="surface" style="display:block;padding:16px;text-align:center;">
  <div style="color:var(--ink-faint);display:flex;justify-content:center;margin-bottom:4px;">${ICON.category}</div>
  <div class="card-title">${esc(categoryLabel(c.slug))}</div>
  <div class="card-footer" style="justify-content:center;">${c.count} prompt${c.count === 1 ? '' : 's'}</div>
</a>`).join('');

  const featured = data.collections[0];
  const featuredSection = featured ? `
<section>
  <h2>${esc(featured.title)}</h2>
  <p class="card-purpose">${esc(featured.description)}</p>
  ${renderCardGrid(featured.prompts, { sequenceTotals: data.sequenceTotals })}
</section>` : '';

  const recent = [...data.prompts].sort((a, b) => new Date(b.updated || b.added || 0) - new Date(a.updated || a.added || 0)).slice(0, 4);

  const body = `
<div class="container">
  <p style="color:var(--ink-soft);margin:20px 0;">${data.prompts.length} prompts across ${data.categories.length} categories, organized into ${data.sequences.length} sequence${data.sequences.length === 1 ? '' : 's'}.</p>
  <section>
    <h2>Browse by category</h2>
    <div class="card-grid">${categoryTiles}</div>
  </section>
  <section>
    <h2>Browse by use case</h2>
    <div class="card-grid">${useCasesHtml}</div>
  </section>
  ${featuredSection}
  <section>
    <h2>Recently added</h2>
    ${renderCardGrid(recent, { sequenceTotals: data.sequenceTotals })}
  </section>
  <p style="color:var(--ink-faint);font-size:12px;"><a href="/contributing/">Adding a prompt is just a file and a rebuild.</a></p>
</div>`;

  return renderLayout({ title: 'Promptly', description: 'Personal AI prompt catalog.', active: 'home', bodyHtml: body });
}

export function renderBrowseHub(data) {
  const tiles = data.categories.map(c => `
<a href="/browse/${c.slug}/" class="surface" style="display:block;padding:16px;text-align:center;">
  <div style="color:var(--ink-faint);display:flex;justify-content:center;margin-bottom:4px;">${ICON.category}</div>
  <div class="card-title">${esc(categoryLabel(c.slug))}</div>
  <div class="card-footer" style="justify-content:center;">${c.count} prompt${c.count === 1 ? '' : 's'}</div>
</a>`).join('');
  const body = `
<div class="container">
  ${renderBreadcrumb([{ label: 'Browse' }])}
  <h1>Browse</h1>
  <div class="card-grid">${tiles}</div>
</div>`;
  return renderLayout({ title: 'Browse', description: 'Browse prompts by category.', active: 'browse', bodyHtml: body });
}

export function renderCategoryPage(category, prompts, data) {
  const filterId = `filter-${category}`;
  const body = `
<div class="container">
  ${renderBreadcrumb([{ href: '/browse/', label: 'Browse' }, { label: categoryLabel(category) }])}
  <h1>${esc(categoryLabel(category))}</h1>
  <div class="layout-with-rail">
    ${renderFilterRail(filterId)}
    ${renderCardGrid(prompts, { sequenceTotals: data.sequenceTotals, gridId: 'result-grid', emptyText: 'No prompts in this category yet.' })}
  </div>
</div>`;
  const script = `<script type="module">import { initFilters } from '/scripts/filters.js'; initFilters('${filterId}', 'result-grid');</script>`;
  return renderLayout({ title: categoryLabel(category), description: `Prompts in ${categoryLabel(category)}.`, active: 'browse', bodyHtml: body, extraScripts: script });
}

export function renderTagPage(tag, prompts, data) {
  const filterId = `filter-${tag}`;
  const body = `
<div class="container">
  ${renderBreadcrumb([{ href: '/browse/', label: 'Browse' }, { label: `#${tag}` }])}
  <h1>#${esc(tag)}</h1>
  <div class="layout-with-rail">
    ${renderFilterRail(filterId)}
    ${renderCardGrid(prompts, { sequenceTotals: data.sequenceTotals, gridId: 'result-grid' })}
  </div>
</div>`;
  const script = `<script type="module">import { initFilters } from '/scripts/filters.js'; initFilters('${filterId}', 'result-grid');</script>`;
  return renderLayout({ title: `#${tag}`, description: `Prompts tagged ${tag}.`, active: 'browse', bodyHtml: body, extraScripts: script });
}

export function renderCollectionPage(collection, data) {
  const body = `
<div class="container">
  ${renderBreadcrumb([{ href: '/browse/', label: 'Browse' }, { label: collection.title }])}
  <h1>${esc(collection.title)}</h1>
  <p class="card-purpose">${esc(collection.description)}</p>
  ${renderCardGrid(collection.prompts, { sequenceTotals: data.sequenceTotals })}
</div>`;
  return renderLayout({ title: collection.title, description: collection.description, active: 'browse', bodyHtml: body });
}

export function renderSequencesIndex(data) {
  const flows = data.sequences.map(s => `
<section>
  <h2>${esc(s.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))}</h2>
  <div class="seq-flow">
    ${s.steps.map((step, i) => `${i > 0 ? `<span class="seq-connector">${ICON.chevronRight}</span>` : ''}<a href="/prompt/${step.slug}/" class="seq-step-card surface"><div class="card-footer">Step ${step.sequence_step}</div><div class="card-title">${esc(step.title)}</div></a>`).join('')}
  </div>
  <a href="/sequence/${s.slug}/">View sequence</a>
</section>`).join('');
  const body = `<div class="container"><h1>Sequences</h1>${flows || '<p>No sequences yet.</p>'}</div>`;
  return renderLayout({ title: 'Sequences', description: 'Multi-step prompt chains.', active: 'sequences', bodyHtml: body });
}

export function renderSequencePage(sequence) {
  const name = sequence.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const flow = `
<div class="seq-flow">
  ${sequence.steps.map((step, i) => `${i > 0 ? `<span class="seq-connector">${ICON.chevronRight}</span>` : ''}<a href="/prompt/${step.slug}/" class="seq-step-card surface"><div class="card-footer">Step ${step.sequence_step} of ${sequence.steps.length}</div><div class="card-title">${esc(step.title)}</div><p class="card-purpose">${esc(step.purpose || '')}</p></a>`).join('')}
</div>`;
  const body = `
<div class="container">
  ${renderBreadcrumb([{ href: '/sequences/', label: 'Sequences' }, { label: name }])}
  <h1>${esc(name)}</h1>
  ${flow}
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
  <div id="favorites-empty" hidden style="color:var(--ink-faint);padding:24px 0;">Nothing starred yet. <a href="/browse/">Back to Browse</a></div>
  ${renderCardGrid(data.prompts, { sequenceTotals: data.sequenceTotals, gridId: 'favorites-grid' })}
</div>`;
  return renderLayout({ title: 'Favorites', description: 'Your starred prompts.', active: 'favorites', bodyHtml: body });
}

export function renderSearchFilterRail(data) {
  const models = ['claude', 'gpt', 'gemini', 'model-agnostic'];
  const checkboxGroup = (group, values, labelFn = v => v) => `
<div class="filter-group" data-filter-group="${group}">
  <h3>${group}</h3>
  ${values.map(v => `<label class="filter-option"><input type="checkbox" value="${esc(v)}"> ${esc(labelFn(v))}</label>`).join('')}
</div>`;
  return `
<aside class="filter-rail" id="search-filters">
  ${checkboxGroup('category', data.categories.map(c => c.slug), categoryLabel)}
  ${checkboxGroup('model', models)}
  ${checkboxGroup('complexity', ['simple', 'multi-step', 'agentic'])}
  ${checkboxGroup('tag', data.tags.map(t => t.slug))}
</aside>`;
}

export function renderSearchPage(data) {
  const body = `
<div class="container">
  ${renderBreadcrumb([{ label: 'Search' }])}
  <h1>Search</h1>
  <div class="layout-with-rail">
    ${renderSearchFilterRail(data)}
    <div>
      <p id="search-summary" style="color:var(--ink-faint);">Start typing above to search prompts.</p>
      <div id="search-results" class="card-grid" data-state="empty"></div>
      <div id="search-suggestions" hidden></div>
    </div>
  </div>
</div>`;
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

export function renderContributingPage() {
  const body = `
<div class="container">
  <h1>Adding a prompt</h1>
  <p>Add a Markdown file to <code>/prompts</code> with YAML frontmatter, then run <code>npm run validate</code> and <code>npm run build</code>. There is no submission form — this is a file-based, single-author workflow.</p>
  <pre class="well" style="padding:16px;font-family:var(--mono);font-size:13px;overflow-x:auto;">---
title: Your prompt title
category: writing
tags: [some-tag]
purpose: One sentence on what it's for.
---
Prompt body with {{variables}}.</pre>
</div>`;
  return renderLayout({ title: 'Adding a prompt', description: 'How to add a prompt to Promptly.', active: 'contributing', bodyHtml: body });
}
