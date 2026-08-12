// Global table/grid view preference for prompt lists (sidebar footer's
// #sidebar-view-toggle) - persisted like the theme toggle. Two different
// mechanisms depending on how a page's list already works:
//
// - Home/Category/Favorites (server-rendered via renderPromptTable, a
//   .prompt-table-block with a stable set of <tr> rows that existing
//   per-page scripts show/hide via `hidden` for filtering): this module
//   builds a card grid once from the same embedded quick-view JSON already
//   shipped for the table, and keeps it in sync with the table via a
//   MutationObserver watching row `hidden` changes - whatever hid a row
//   (a category pill, the favorites filter, whatever), the card view
//   mirrors it, with no changes needed to those pages' own filter code.
// - Search (public/scripts/search.js) rebuilds its rows from scratch on
//   every keystroke instead of hiding/showing fixed ones, so mirroring
//   doesn't apply - it listens for this module's 'promptly:viewmode' event
//   and redraws itself in the current mode directly.
import { renderPromptCard } from './lib/render.mjs';
import { initInteractive } from './favorites.js';

const KEY = 'promptly:viewMode';

function readMode() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'grid' ? 'grid' : 'table';
  } catch {
    return 'table';
  }
}

function readEmbedded(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  try { return JSON.parse(el.textContent); } catch { return null; }
}

// Each quick-view item that belongs to a sequence already carries its own
// resolved `seq.total` (toQuickViewItem in lib/render.mjs) - derive a
// {sequenceSlug: total} map from that instead of a separate fetch, since
// renderPromptCard's sequence chip needs it keyed by slug, not per-item.
function deriveSequenceTotals(items) {
  const totals = {};
  for (const it of items) {
    if (it.seq) totals[it.sequence] = it.seq.total;
  }
  return totals;
}

function setupStaticBlock(block) {
  const gridId = block.dataset.gridId;
  const tableWrap = block.querySelector('.table-wrap');
  const tbody = document.getElementById(gridId);
  const items = readEmbedded(`${gridId}-data`);
  if (!tableWrap || !tbody || !items) return null;

  let cardGrid = null;

  function ensureCardGrid() {
    if (cardGrid) return cardGrid;
    cardGrid = document.createElement('div');
    cardGrid.className = 'card-grid';
    cardGrid.id = `${gridId}-cards`;
    cardGrid.hidden = true;
    const sequenceTotals = deriveSequenceTotals(items);
    cardGrid.innerHTML = items.map(p => renderPromptCard(p, { sequenceTotals })).join('');
    tableWrap.after(cardGrid);
    initInteractive(cardGrid);
    mirrorHiddenState();

    // Whatever the page's own filter script hides/shows on the table rows
    // (a category pill, the favorites filter) gets mirrored onto the
    // matching card - this is the only coupling to those scripts, and it's
    // one-directional and read-only, so it can't break their own logic.
    new MutationObserver(mirrorHiddenState)
      .observe(tbody, { attributes: true, attributeFilter: ['hidden'], subtree: true });

    return cardGrid;
  }

  function mirrorHiddenState() {
    if (!cardGrid) return;
    tbody.querySelectorAll('tr[data-slug]').forEach(tr => {
      const card = cardGrid.querySelector(`[data-slug="${CSS.escape(tr.dataset.slug)}"]`);
      if (card) card.hidden = tr.hidden;
    });
  }

  return {
    show(mode) {
      if (mode === 'grid') {
        ensureCardGrid();
        mirrorHiddenState();
        tableWrap.hidden = true;
        cardGrid.hidden = false;
      } else {
        tableWrap.hidden = false;
        if (cardGrid) cardGrid.hidden = true;
      }
    }
  };
}

function init() {
  const toggle = document.getElementById('sidebar-view-toggle');
  if (!toggle) return;
  const buttons = [...toggle.querySelectorAll('.view-toggle-btn')];

  const staticBlocks = [...document.querySelectorAll('.prompt-table-block[data-grid-id]')]
    .map(setupStaticBlock)
    .filter(Boolean);

  function applyMode(mode) {
    buttons.forEach(b => {
      const active = b.dataset.view === mode;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    staticBlocks.forEach(block => block.show(mode));
    document.dispatchEvent(new CustomEvent('promptly:viewmode', { detail: { mode } }));
  }

  function setMode(mode) {
    try { localStorage.setItem(KEY, mode); } catch {
      // localStorage unavailable, ignore - preference just won't persist
    }
    applyMode(mode);
  }

  buttons.forEach(b => b.addEventListener('click', () => setMode(b.dataset.view)));

  applyMode(readMode());
}

document.addEventListener('DOMContentLoaded', init);
