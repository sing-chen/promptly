import Fuse from '/scripts/fuse.min.mjs';
import { renderPromptTableRows } from '/scripts/lib/render.mjs';
import { initInteractive } from '/scripts/favorites.js';
import { initFilterToolbar } from '/scripts/filters.js';
import { initQuickView } from '/scripts/quickview.js';

const SYNONYMS = {
  email: ['outreach'],
  outreach: ['email'],
  draft: ['drafting'],
  drafting: ['draft'],
  summarize: ['summary', 'summarization'],
  debug: ['bug', 'error']
};

const resultsEl = document.getElementById('search-results');
const resultsWrapEl = document.getElementById('search-results-wrap');
const summaryEl = document.getElementById('search-summary');
const filtersEl = document.getElementById('search-filters');
const navInput = document.querySelector('.sidebar-search input[name="q"]');

if (resultsEl && filtersEl) {
  const index = await fetch('/search-index.json').then(r => r.json());

  const fuse = new Fuse(index.prompts, {
    keys: [
      { name: 'categories', weight: 0.3 },
      { name: 'title', weight: 0.3 },
      { name: 'purpose', weight: 0.25 },
      { name: 'body', weight: 0.15 }
    ],
    threshold: 0.35,
    ignoreLocation: true,
    includeScore: true
  });

  const toolbar = initFilterToolbar('search-filters', { onChange: runSearch });
  const quickView = initQuickView('search-results', { data: [], sequenceTotals: index.sequenceTotals, allPrompts: index.prompts });

  function expandQuery(q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const extra = new Set();
    for (const w of words) (SYNONYMS[w] || []).forEach(s => extra.add(s));
    return [q, ...extra].filter(Boolean);
  }

  function updateUrl(q, categories) {
    const url = new URL(location.href);
    const set = (key, val) => { if (val) url.searchParams.set(key, val); else url.searchParams.delete(key); };
    set('q', q);
    set('category', categories[0] || '');
    history.replaceState(null, '', url);
  }

  function render(matches, q) {
    quickView.update(matches);
    if (matches.length === 0) {
      resultsEl.innerHTML = '';
      resultsWrapEl.hidden = true;
      summaryEl.textContent = q ? `No results for "${q}".` : 'Start typing above to search prompts.';
      return;
    }
    summaryEl.textContent = `${matches.length} result${matches.length === 1 ? '' : 's'}`;
    resultsWrapEl.hidden = false;
    resultsEl.innerHTML = renderPromptTableRows(matches, { sequenceTotals: index.sequenceTotals });
    initInteractive(resultsEl);
  }

  function runSearch() {
    const q = (navInput?.value || '').trim();
    const categories = [...toolbar.getActive('category')];

    updateUrl(q, categories);

    let matches;
    if (q) {
      const best = new Map();
      for (const query of expandQuery(q)) {
        for (const r of fuse.search(query)) {
          const existing = best.get(r.item.slug);
          if (!existing || existing.score > r.score) best.set(r.item.slug, r);
        }
      }
      matches = Array.from(best.values()).sort((a, b) => a.score - b.score).map(r => r.item);
    } else {
      matches = index.prompts;
    }

    matches = matches.filter(p => categories.length === 0 || categories.some(c => p.categories.includes(c)));

    render(matches, q);
  }

  // Prefill from the URL (shareable/deep-linkable search state) - clicking
  // the matching pill both sets toolbar state and (via onChange) re-runs the
  // search, so no separate apply step is needed here.
  const params = new URLSearchParams(location.search);
  if (navInput) navInput.value = params.get('q') || '';
  const initialCategory = params.get('category');
  if (initialCategory) {
    filtersEl.querySelector(`[data-group="category"][data-value="${CSS.escape(initialCategory)}"]`)?.click();
  }

  if (navInput) {
    navInput.addEventListener('input', () => {
      clearTimeout(navInput.__debounce);
      navInput.__debounce = setTimeout(runSearch, 150);
    });
    // Already on /search/ - keep Enter from doing a full-page reload of the
    // same URL; live filtering already runs on every keystroke.
    navInput.closest('form')?.addEventListener('submit', e => e.preventDefault());
  }

  runSearch();
}
