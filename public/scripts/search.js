import Fuse from '/scripts/fuse.min.mjs';
import { renderPromptTableRows, renderPromptCard } from '/scripts/lib/render.mjs';
import { initInteractive } from '/scripts/favorites.js';
import { initFilterToolbar } from '/scripts/filters.js';
import { initQuickView } from '/scripts/quickview.js';
import { wireOwnerActions } from '/scripts/personalize.js';
import { getPersonalization } from '/scripts/personalizeData.js';

// Read directly rather than waiting on viewToggle.js's 'promptly:viewmode'
// event for the *initial* render - script tag order isn't guaranteed to put
// this module's DOMContentLoaded listener after viewToggle.js's, so relying
// on the event alone could miss the first dispatch. The event is still used
// below for live toggle clicks after both scripts are loaded.
function readViewMode() {
  try {
    return localStorage.getItem('promptly:viewMode') === 'grid' ? 'grid' : 'table';
  } catch {
    return 'table';
  }
}

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
const cardsEl = document.getElementById('search-results-cards');
const summaryEl = document.getElementById('search-summary');
const filtersEl = document.getElementById('search-filters');
const navInput = document.querySelector('.main-header-search input[name="q"]');

if (resultsEl && filtersEl) {
  const index = await fetch('/search-index.json').then(r => r.json());
  let viewMode = readViewMode();
  let lastMatches = [];
  let lastQuery = '';
  // Signed out (or before personalization resolves), this stays index.prompts
  // (the static default catalog) - once signed in it becomes the merged
  // catalog (personalizeData.js), same "no separate personal list" model as
  // Home/Category (personalize.js).
  let personalization = null;
  let searchablePrompts = index.prompts;

  const fuse = new Fuse(searchablePrompts, {
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

  // Cards open the same quick-view modal a table row does, instead of
  // navigating away - bound once on the container (event delegation), since
  // render() replaces cardsEl's innerHTML on every keystroke.
  cardsEl?.addEventListener('click', (e) => {
    const card = e.target.closest('[data-slug]');
    if (!card) return;
    e.preventDefault();
    quickView.open(card.dataset.slug);
  });

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
    lastMatches = matches;
    lastQuery = q;
    quickView.update(matches, personalization);
    if (matches.length === 0) {
      resultsEl.innerHTML = '';
      if (cardsEl) cardsEl.innerHTML = '';
      resultsWrapEl.hidden = true;
      if (cardsEl) cardsEl.hidden = true;
      summaryEl.textContent = q ? `No results for "${q}".` : 'Start typing above to search prompts.';
      return;
    }
    summaryEl.textContent = `${matches.length} result${matches.length === 1 ? '' : 's'}`;
    const ctx = { sequenceTotals: index.sequenceTotals, personalized: Boolean(personalization), currentUserId: personalization?.userId };
    if (viewMode === 'grid' && cardsEl) {
      resultsWrapEl.hidden = true;
      cardsEl.hidden = false;
      cardsEl.innerHTML = matches.map(p => renderPromptCard(p, ctx)).join('');
      initInteractive(cardsEl);
      if (personalization) wireOwnerActions(cardsEl, matches, personalization);
    } else {
      resultsWrapEl.hidden = false;
      if (cardsEl) cardsEl.hidden = true;
      resultsEl.innerHTML = renderPromptTableRows(matches, ctx);
      initInteractive(resultsEl);
      if (personalization) wireOwnerActions(resultsEl, matches, personalization);
    }
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
      matches = searchablePrompts;
    }

    matches = matches.filter(p => categories.length === 0 || categories.some(c => p.categories.includes(c)));

    render(matches, q);
  }

  async function loadPersonalization() {
    personalization = await getPersonalization();
    if (!personalization) return;
    searchablePrompts = personalization.prompts;
    fuse.setCollection(searchablePrompts);
    runSearch();
  }
  document.addEventListener('personalization:changed', loadPersonalization);

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

  document.addEventListener('promptly:viewmode', (e) => {
    viewMode = e.detail.mode;
    render(lastMatches, lastQuery);
  });

  runSearch();
  loadPersonalization();
}
