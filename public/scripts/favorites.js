import { initCategoryPillBar } from './categoryPills.js';

const KEY = 'promptly:favorites';

export function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function isFavorite(slug) {
  return getFavorites().includes(slug);
}

export function toggleFavorite(slug) {
  const current = getFavorites();
  const idx = current.indexOf(slug);
  if (idx === -1) current.push(slug);
  else current.splice(idx, 1);
  localStorage.setItem(KEY, JSON.stringify(current));
  updateNavCount();
  document.dispatchEvent(new CustomEvent('favorites:changed', { detail: { favorites: current } }));
  return current.includes(slug);
}

export function exportFavorites() {
  const data = JSON.stringify(getFavorites(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'promptly-favorites.json';
  a.click();
  URL.revokeObjectURL(url);
}

function updateNavCount() {
  const el = document.getElementById('nav-fav-count-num');
  if (el) el.textContent = String(getFavorites().length);
}

function initStars(root) {
  root.querySelectorAll('[data-fav-slug]').forEach(btn => {
    if (btn.dataset.favBound) return;
    btn.dataset.favBound = 'true';
    const slug = btn.getAttribute('data-fav-slug');
    const active = isFavorite(slug);
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nowActive = toggleFavorite(slug);
      btn.classList.toggle('is-active', nowActive);
      btn.setAttribute('aria-pressed', String(nowActive));
    });
  });
}

function initCopyButtons(root) {
  root.querySelectorAll('[data-copy-target]').forEach(btn => {
    if (btn.dataset.copyBound) return;
    btn.dataset.copyBound = 'true';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetId = btn.getAttribute('data-copy-target');
      const el = document.getElementById(targetId);
      const text = el ? (el.dataset.rawText || el.textContent) : '';
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // clipboard unavailable, ignore
      }
      const original = btn.innerHTML;
      btn.classList.add('is-active');
      btn.textContent = 'Copied';
      setTimeout(() => {
        btn.innerHTML = original;
        btn.classList.remove('is-active');
      }, 2000);
    });
  });
}

// Re-runnable entry point: call again with a specific root (e.g. a freshly
// rendered search-results container) to wire up stars/copy buttons on DOM
// created after the initial DOMContentLoaded pass. Idempotent via the
// data-*-bound guards above, so it's safe to call on the whole document too.
export function initInteractive(root = document) {
  initStars(root);
  initCopyButtons(root);
}

function initFavoritesGrid() {
  const grid = document.getElementById('favorites-grid');
  if (!grid) return;
  const wrap = grid.closest('.table-wrap') || grid;
  const emptyEl = document.getElementById('favorites-grid-empty');
  const pills = initCategoryPillBar('favorites-category-filter', { onChange: apply });

  function apply() {
    const favs = getFavorites();
    const activeCats = pills.getActive();
    let count = 0;
    const catCounts = {};
    Array.from(grid.children).forEach(row => {
      const slug = row.querySelector('[data-fav-slug]')?.getAttribute('data-fav-slug');
      const rowCats = (row.dataset.categories || '').split(',').filter(Boolean);
      const isFav = favs.includes(slug);
      if (isFav) rowCats.forEach(c => { catCounts[c] = (catCounts[c] || 0) + 1; });
      const matchesCategory = activeCats.size === 0 || rowCats.some(c => activeCats.has(c));
      const visible = isFav && matchesCategory;
      row.hidden = !visible;
      if (visible) count++;
    });
    pills.setCounts(catCounts);
    wrap.hidden = count === 0;
    pills.setResultText(favs.length === 0 ? '' : `${count} of ${favs.length} favorite${favs.length === 1 ? '' : 's'} shown`);
    if (emptyEl) {
      emptyEl.textContent = favs.length === 0
        ? 'Nothing starred yet. Browse prompts and click the star to save one here.'
        : 'No favorites match the selected categories.';
      emptyEl.hidden = count !== 0;
    }
  }
  apply();
  document.addEventListener('favorites:changed', apply);
}

function initExportButton() {
  document.getElementById('export-favorites-btn')?.addEventListener('click', exportFavorites);
}

const THEME_KEY = 'promptly:theme';

function syncThemeToggleUI(btn) {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  btn.setAttribute('aria-pressed', String(isDark));
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  syncThemeToggleUI(btn);
  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch {
      // localStorage unavailable, ignore - theme just won't persist across reloads
    }
    syncThemeToggleUI(btn);
  });
}

function initNavToggle() {
  const shell = document.querySelector('.app-shell');
  const btn = document.getElementById('nav-menu-toggle');
  const backdrop = document.getElementById('sidebar-backdrop');
  const sidebar = document.getElementById('sidebar');
  if (!shell || !btn) return;

  function setOpen(open) {
    shell.classList.toggle('menu-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  btn.addEventListener('click', () => setOpen(!shell.classList.contains('menu-open')));
  backdrop?.addEventListener('click', () => setOpen(false));
  // Off-canvas drawer only exists below the sidebar's breakpoint - a link
  // click there should close it so the drawer doesn't stay open over the
  // page it just navigated away from (moot once navigation completes, but
  // matters if the click ever doesn't navigate, e.g. a same-page anchor).
  sidebar?.addEventListener('click', (e) => {
    if (e.target.closest('a') && window.matchMedia('(max-width: 900px)').matches) setOpen(false);
  });
  // Collapsing back to desktop width with the menu left open would otherwise
  // strand aria-expanded="true" on a toggle whose panel is force-hidden by
  // the media query kicking back in.
  window.matchMedia('(min-width: 901px)').addEventListener('change', (e) => {
    if (e.matches) setOpen(false);
  });
}

updateNavCount();
document.addEventListener('DOMContentLoaded', () => {
  initInteractive(document);
  initFavoritesGrid();
  initExportButton();
  initThemeToggle();
  initNavToggle();
});
