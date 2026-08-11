// Live pill toolbar controller (renderFilterToolbar in lib/render.mjs) - the
// §9b pill pattern extended from categories to other facets, replacing the
// old checkbox filter-rail (§9a). Multi-select, OR-within-group,
// AND-across-groups. State-only: it just tracks which pills are active and
// fires `onChange` - callers decide how to apply that to their result set
// (DOM rows here, a live Fuse index on the search page).
export function initFilterToolbar(toolbarId, { onChange } = {}) {
  const bar = document.getElementById(toolbarId);
  if (!bar) return { getActive: () => new Set(), getSort: () => 'newest', setResultText() {}, setCounts() {} };

  const active = {};
  const clearBtn = bar.querySelector('[data-role="clear-pills"]');
  const sortSelect = bar.querySelector('.filter-sort');
  const resultEl = document.getElementById(`${toolbarId}-result-count`);

  function activeSet(group) {
    return active[group] || (active[group] = new Set());
  }

  function updateClearVisibility() {
    const any = Object.values(active).some(s => s.size > 0);
    clearBtn?.classList.toggle('is-visible', any);
  }

  bar.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const set = activeSet(btn.dataset.group);
      const value = btn.dataset.value;
      if (set.has(value)) set.delete(value); else set.add(value);
      btn.classList.toggle('is-active', set.has(value));
      btn.setAttribute('aria-pressed', String(set.has(value)));
      updateClearVisibility();
      onChange?.();
    });
  });

  clearBtn?.addEventListener('click', () => {
    Object.values(active).forEach(s => s.clear());
    bar.querySelectorAll('.filter-pill').forEach(b => {
      b.classList.remove('is-active');
      b.setAttribute('aria-pressed', 'false');
    });
    updateClearVisibility();
    onChange?.();
  });

  sortSelect?.addEventListener('change', () => onChange?.());

  return {
    getActive: (group) => active[group] || new Set(),
    getSort: () => sortSelect?.value || 'newest',
    setResultText: (text) => { if (resultEl) resultEl.textContent = text; },
    // Overrides server-rendered (whole-catalog) counts with page-specific ones,
    // keyed "group:value" - e.g. Search shows how many *matching* prompts fall
    // in each category, not how many exist catalog-wide.
    setCounts: (countsByKey) => {
      bar.querySelectorAll('.filter-pill').forEach(btn => {
        const countEl = btn.querySelector('.count');
        if (!countEl) return;
        const key = `${btn.dataset.group}:${btn.dataset.value}`;
        if (key in countsByKey) countEl.textContent = countsByKey[key];
      });
    }
  };
}

// Static-page flavor for Category: filters the table's own DOM rows in-place
// using the data-chain attribute each row already carries (same attribute
// the §9b table renders for the quick-view modal), rather than routing
// through a live search index.
export function initTableFilterToolbar(toolbarId, gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  // A table's tbody can't take an arbitrary sibling via .after() (invalid as
  // a direct child of <table>) - lib/render.mjs pre-renders `${gridId}-empty`
  // for that case.
  let emptyMsg = document.getElementById(`${gridId}-empty`);
  if (!emptyMsg) {
    emptyMsg = grid.parentElement.querySelector('.filter-empty');
    if (!emptyMsg) {
      emptyMsg = document.createElement('p');
      emptyMsg.className = 'filter-empty';
      emptyMsg.style.color = 'var(--ink-faint)';
      emptyMsg.style.padding = '24px 0';
      emptyMsg.textContent = 'No prompts match these filters.';
      emptyMsg.hidden = true;
      grid.after(emptyMsg);
    }
  }

  const toolbar = initFilterToolbar(toolbarId, { onChange: apply });

  function apply() {
    const chainOnly = toolbar.getActive('chain').has('true');
    // Empty on pages with no category pill group (e.g. Category, which is
    // already server-scoped to one category) - matchesCategory is then
    // always true below, so this is a no-op there.
    const activeCats = toolbar.getActive('category');

    const cards = Array.from(grid.children);
    let visibleCount = 0;
    for (const card of cards) {
      const cardCats = (card.dataset.categories || '').split(',').filter(Boolean);
      const matchesChain = !chainOnly || card.dataset.chain === 'true';
      const matchesCategory = activeCats.size === 0 || cardCats.some(c => activeCats.has(c));
      const visible = matchesChain && matchesCategory;
      card.hidden = !visible;
      if (visible) visibleCount++;
    }

    const sortValue = toolbar.getSort();
    const sorted = cards.slice().sort((a, b) => {
      if (sortValue === 'az') return a.dataset.title.localeCompare(b.dataset.title);
      return new Date(b.dataset.updated || 0) - new Date(a.dataset.updated || 0);
    });
    sorted.forEach(card => grid.appendChild(card));

    toolbar.setResultText(cards.length ? `${visibleCount} of ${cards.length} shown` : '');
    emptyMsg.hidden = visibleCount !== 0;
  }

  apply();
}
