import Fuse from '/scripts/fuse.min.mjs';
import { renderPromptTableRows } from '/scripts/lib/render.mjs';
import { initInteractive } from '/scripts/favorites.js';
import { initCategoryPillBar } from '/scripts/categoryPills.js';
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
const suggestionsEl = document.getElementById('search-suggestions');
const filtersEl = document.getElementById('search-filters');
const navInput = document.querySelector('.nav-search input[name="q"]');

if (resultsEl && filtersEl) {
  const index = await fetch('/search-index.json').then(r => r.json());

  const fuse = new Fuse(index.prompts, {
    keys: [
      { name: 'categories', weight: 0.3 },
      { name: 'tags', weight: 0.3 },
      { name: 'title', weight: 0.2 },
      { name: 'purpose', weight: 0.15 },
      { name: 'body', weight: 0.05 }
    ],
    threshold: 0.35,
    ignoreLocation: true,
    includeScore: true
  });

  // threshold: 1 = never filters out a tag, only ranks - guarantees a "3
  // nearest tags" suggestion even for a totally unrelated query, matching
  // the "never a dead end" requirement.
  const tagFuse = new Fuse(index.tags, { threshold: 1, includeScore: true });

  const categoryPills = initCategoryPillBar('search-category-filter', { onChange: runSearch });
  const quickView = initQuickView('search-results', { data: [], sequenceTotals: index.sequenceTotals, allPrompts: index.prompts });

  function checkedValues(group) {
    return Array.from(filtersEl.querySelectorAll(`[data-filter-group="${group}"] input:checked`)).map(i => i.value);
  }

  function expandQuery(q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const extra = new Set();
    for (const w of words) (SYNONYMS[w] || []).forEach(s => extra.add(s));
    return [q, ...extra].filter(Boolean);
  }

  function updateUrl(q, categories, models, tags) {
    const url = new URL(location.href);
    const set = (key, val) => { if (val) url.searchParams.set(key, val); else url.searchParams.delete(key); };
    set('q', q);
    set('category', categories[0] || '');
    set('model', models[0] || '');
    set('tag', tags[0] || '');
    history.replaceState(null, '', url);
  }

  function render(matches, q) {
    suggestionsEl.hidden = true;
    quickView.update(matches);
    if (matches.length === 0) {
      resultsEl.innerHTML = '';
      resultsWrapEl.hidden = true;
      categoryPills.setResultText('');
      if (q) {
        summaryEl.textContent = `No results for "${q}".`;
        const nearest = tagFuse.search(q).slice(0, 3).map(r => r.item);
        if (nearest.length) {
          suggestionsEl.hidden = false;
          suggestionsEl.innerHTML = 'Try: ' + nearest.map(t => `<a href="/tag/${t}/" class="chip">${t}</a>`).join(' ');
        }
      } else {
        summaryEl.textContent = 'Start typing above to search prompts.';
      }
      return;
    }
    summaryEl.textContent = `${matches.length} result${matches.length === 1 ? '' : 's'}`;
    resultsWrapEl.hidden = false;
    resultsEl.innerHTML = renderPromptTableRows(matches, { sequenceTotals: index.sequenceTotals });
    initInteractive(resultsEl);
    categoryPills.setResultText('');
  }

  function runSearch() {
    const q = (navInput?.value || '').trim();
    const categories = [...categoryPills.getActive()];
    const models = checkedValues('model');
    const complexities = checkedValues('complexity');
    const tags = checkedValues('tag');

    updateUrl(q, categories, models, tags);

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

    matches = matches.filter(p =>
      (categories.length === 0 || categories.some(c => p.categories.includes(c))) &&
      (models.length === 0 || models.some(m => p.models.includes(m))) &&
      (complexities.length === 0 || complexities.includes(p.complexity)) &&
      (tags.length === 0 || tags.some(t => p.tags.includes(t)))
    );

    render(matches, q);
  }

  // Prefill from the URL (shareable/deep-linkable search state).
  const params = new URLSearchParams(location.search);
  if (navInput) navInput.value = params.get('q') || '';
  const initialCategory = params.get('category');
  if (initialCategory) {
    document.querySelector(`#search-category-filter [data-cat="${CSS.escape(initialCategory)}"]`)?.click();
  }
  for (const key of ['model', 'tag']) {
    const val = params.get(key);
    if (!val) continue;
    const input = filtersEl.querySelector(`[data-filter-group="${key}"] input[value="${CSS.escape(val)}"]`);
    if (input) input.checked = true;
  }

  filtersEl.addEventListener('change', runSearch);
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
