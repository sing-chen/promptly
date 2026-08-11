// Shared controller for the §9b live category filter bar (renderCategoryFilterBar
// in lib/render.mjs). Multi-select, OR-within-category - used on Category/Tag
// (via filters.js), Search, and Favorites pages.
export function initCategoryPillBar(barId, { onChange } = {}) {
  const bar = document.getElementById(barId);
  if (!bar) return { getActive: () => new Set() };

  const active = new Set();
  const clearBtn = bar.querySelector('[data-role="clear-pills"]');
  const resultEl = document.getElementById(`${barId}-result-count`);

  function updateClearVisibility() {
    if (clearBtn) clearBtn.classList.toggle('is-visible', active.size > 0);
  }

  bar.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      if (active.has(cat)) active.delete(cat); else active.add(cat);
      btn.classList.toggle('is-active', active.has(cat));
      btn.setAttribute('aria-pressed', String(active.has(cat)));
      updateClearVisibility();
      onChange?.(active);
    });
  });

  clearBtn?.addEventListener('click', () => {
    active.clear();
    bar.querySelectorAll('.filter-pill').forEach(b => {
      b.classList.remove('is-active');
      b.setAttribute('aria-pressed', 'false');
    });
    updateClearVisibility();
    onChange?.(active);
  });

  return {
    getActive: () => active,
    setResultText: (text) => { if (resultEl) resultEl.textContent = text; },
    // Overrides the server-rendered (whole-catalog) counts with page-specific
    // ones - e.g. the Favorites page shows how many *favorited* prompts are
    // in each category, not how many exist catalog-wide.
    setCounts: (countsBySlug) => {
      bar.querySelectorAll('.filter-pill').forEach(btn => {
        const countEl = btn.querySelector('.count');
        if (countEl) countEl.textContent = countsBySlug[btn.dataset.cat] ?? 0;
      });
    }
  };
}
