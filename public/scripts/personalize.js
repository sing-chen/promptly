// Rebuilds a static .prompt-table-block in place with the signed-in caller's
// library (personalizeData.js) - used by Home and Category's inline scripts.
// Search does the equivalent directly against its live Fuse index
// (search.js), since it already rebuilds from scratch on every keystroke,
// rather than reusing this module. Signed out, this is a no-op - the static
// build is left exactly as rendered.
import { promptHasCategory } from './lib/schema.mjs';
import {
  renderPromptTableRows, renderPromptCard, renderFilterToolbar,
  categoryName, findNewPrompts, NEW_WINDOW_DAYS
} from './lib/render.mjs';
import { initInteractive } from './favorites.js';
import { getQuickView } from './quickViewRegistry.js';
import { initTableFilterToolbar } from './filters.js';
import { deletePrompt, archivePrompt, duplicatePrompt } from './db.js';
import { getPersonalization } from './personalizeData.js';
import { confirmDialog } from './confirmDialog.js';

// Exported for search.js to reuse directly - it rebuilds its own results
// from scratch on every keystroke rather than going through rebuildBlock()
// below, but wants the exact same Edit/Duplicate/Archive/Delete wiring on
// what it renders. Rebinding, not the block's own 'personalization:changed'
// listener, is what picks up a write here - each handler below dispatches
// that event itself once its write completes.
export function wireOwnerActions(container, items, personalization) {
  // Every row in a signed-in view is a row the caller owns
  // (BUILD_BRIEF_v5.md §3.5), so Edit just opens the modal. This used to
  // resolve the clicked row down to an owned one first, forking a borrowed
  // default on the way - there is nothing left to resolve.
  container.querySelectorAll('[data-edit-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const prompt = items.find(p => p.id === btn.dataset.editId);
      if (!prompt) return;
      document.dispatchEvent(new CustomEvent('prompt:edit-request', { detail: prompt }));
    });
  });

  container.querySelectorAll('[data-duplicate-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const prompt = items.find(p => p.id === btn.dataset.duplicateId);
      if (!prompt) return;
      btn.disabled = true;
      try {
        const copy = await duplicatePrompt(prompt);
        document.dispatchEvent(new CustomEvent('personalization:changed', {
          detail: { duplicatedId: copy?.id, sourceId: prompt.id }
        }));
      } catch (err) {
        alert(err.message || 'Something went wrong.');
        btn.disabled = false;
      }
    });
  });

  // Archive is reversible from /archived/, so no confirmation - unlike
  // Delete below. Both now apply to every row, since every row is owned.
  container.querySelectorAll('[data-archive-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const prompt = items.find(p => p.id === btn.dataset.archiveId);
      if (!prompt) return;
      btn.disabled = true;
      try {
        await archivePrompt(prompt.id);
        document.dispatchEvent(new CustomEvent('personalization:changed'));
      } catch (err) {
        alert(err.message || 'Something went wrong.');
        btn.disabled = false;
      }
    });
  });

  container.querySelectorAll('[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const prompt = items.find(p => p.id === btn.dataset.deleteId);
      if (!prompt) return;
      const ok = await confirmDialog({
        title: 'Delete this prompt?',
        message: `"${prompt.title}" will be permanently deleted from the database. This can't be undone.`,
        confirmLabel: 'Delete'
      });
      if (!ok) return;
      btn.disabled = true;
      try {
        await deletePrompt(prompt.id);
        document.dispatchEvent(new CustomEvent('personalization:changed'));
      } catch (err) {
        alert(err.message || 'Something went wrong.');
        btn.disabled = false;
      }
    });
  });
}

async function rebuildBlock({ gridId, toolbarId, filterFn, sequenceTotals }) {
  const tbody = document.getElementById(gridId);
  if (!tbody) return;

  const personalization = await getPersonalization();
  if (!personalization) return; // signed out - static build stays as rendered

  const ctx = { sequenceTotals, personalized: true, currentUserId: personalization.userId };

  // Keeps the last painted list around so a card grid built later - by
  // switching to grid view after personalization has already resolved - can
  // be redrawn with owner actions rather than staying stuck on the
  // action-less markup viewToggle.js produces.
  let lastList = null;
  // Set by a duplicate, consumed by the next paint. A copy would otherwise
  // land at the top of the list (it sorts newest-updated-first) and be easy
  // to miss - showing it next to what it was copied from is the point.
  let pendingDuplicate = null;

  function paintCards(cardGrid, pers, list) {
    if (!cardGrid) return;
    cardGrid.innerHTML = list.map(p => renderPromptCard(p, ctx)).join('');
    initInteractive(cardGrid);
    wireOwnerActions(cardGrid, list, pers);
    wireSelection(cardGrid);
  }

  // ── bulk selection ────────────────────────────────────────────────
  // Selection lives here rather than in the DOM's checked state alone, so it
  // survives the table being re-rendered (a filter, an edit) and stays in
  // sync between the table and the card grid, which are two separate sets of
  // checkboxes for the same prompts.
  const selected = new Set();

  function selectableIds(list) {
    return list.filter(p => !rowHidden(p)).map(p => p.id);
  }

  function rowHidden(p) {
    const row = tbody.querySelector(`tr[data-slug="${CSS.escape(p.slug)}"]`);
    return row ? row.hidden : false;
  }

  // Scoped to this block (plus its card grid, which viewToggle.js inserts as
  // a sibling of .table-wrap, so it's inside the block too). A document-wide
  // query would cross-wire two tables on the same page.
  function ownBlock() {
    return tbody.closest('.prompt-table-block');
  }

  function syncSelectionUI() {
    const block = ownBlock();
    if (!block) return;
    block.querySelectorAll('[data-select-id]').forEach(cb => {
      cb.checked = selected.has(cb.dataset.selectId);
    });

    const bar = document.getElementById(`${gridId}-bulkbar`);
    const count = document.getElementById(`${gridId}-bulkcount`);
    if (bar) bar.hidden = selected.size === 0;
    if (count) count.textContent = `${selected.size} selected`;

    const all = block.querySelector('.bulk-select-all');
    if (all && lastList) {
      const ids = selectableIds(lastList);
      all.checked = ids.length > 0 && ids.every(id => selected.has(id));
      all.indeterminate = !all.checked && ids.some(id => selected.has(id));
    }
  }

  function wireSelection(container) {
    container.querySelectorAll('[data-select-id]').forEach(cb => {
      cb.addEventListener('click', e => e.stopPropagation()); // don't open the row/card
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(cb.dataset.selectId);
        else selected.delete(cb.dataset.selectId);
        syncSelectionUI();
      });
    });
  }

  document.addEventListener('promptly:cards-built', (e) => {
    if (e.detail?.gridId !== gridId || !lastList) return;
    paintCards(e.detail.cardGrid, personalization, lastList);
  });

  // Bulk bar and select-all live outside the tbody, so they're wired once
  // rather than on every repaint.
  function wireBulkBar() {
    const block = tbody.closest('.prompt-table-block');
    if (!block) return;
    block.classList.add('is-personalized'); // reveals the select column (base.css)

    block.querySelector('.bulk-select-all')?.addEventListener('change', (e) => {
      const ids = selectableIds(lastList || []);
      if (e.target.checked) ids.forEach(id => selected.add(id));
      else ids.forEach(id => selected.delete(id));
      syncSelectionUI();
    });

    block.querySelectorAll('[data-bulk]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.bulk;
        if (action === 'clear') {
          selected.clear();
          syncSelectionUI();
          return;
        }
        const ids = [...selected];
        if (!ids.length) return;

        if (action === 'delete') {
          const ok = await confirmDialog({
            title: `Delete ${ids.length} prompt${ids.length === 1 ? '' : 's'}?`,
            message: `${ids.length} prompt${ids.length === 1 ? ' will be' : 's will be'} permanently deleted from the database. This can't be undone.`,
            confirmLabel: 'Delete'
          });
          if (!ok) return;
        }

        block.querySelectorAll('[data-bulk]').forEach(b => { b.disabled = true; });
        try {
          // Sequential rather than Promise.all: these are RLS-scoped writes
          // against the free tier, and a partial failure part-way through a
          // parallel burst is harder to reason about than a clean stop.
          for (const id of ids) {
            if (action === 'archive') await archivePrompt(id);
            else await deletePrompt(id);
          }
          selected.clear();
          document.dispatchEvent(new CustomEvent('personalization:changed'));
        } catch (err) {
          alert(err.message || 'Something went wrong.');
        } finally {
          block.querySelectorAll('[data-bulk]').forEach(b => { b.disabled = false; });
          syncSelectionUI();
        }
      });
    });
  }

  function placeDuplicate(list) {
    if (!pendingDuplicate) return list;
    const { duplicatedId, sourceId } = pendingDuplicate;
    const copyIdx = list.findIndex(p => p.id === duplicatedId);
    const srcIdx = list.findIndex(p => p.id === sourceId);
    if (copyIdx === -1 || srcIdx === -1) return list;
    const reordered = list.slice();
    const [copy] = reordered.splice(copyIdx, 1);
    // Recompute the source index after the removal, so the copy lands
    // directly after it rather than one slot off when the copy sorted above.
    reordered.splice(reordered.findIndex(p => p.id === sourceId) + 1, 0, copy);
    return reordered;
  }

  function flashDuplicate() {
    if (!pendingDuplicate) return;
    const { duplicatedId } = pendingDuplicate;
    pendingDuplicate = null;
    const block = ownBlock();
    if (!block) return;
    // The row and the card are separate elements for the same prompt; flash
    // whichever is currently on screen (and harmlessly both if not).
    block.querySelectorAll(`[data-select-id="${CSS.escape(duplicatedId)}"]`).forEach(cb => {
      const target = cb.closest('tr, .prompt-card');
      if (!target) return;
      target.classList.add('is-flash');
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      setTimeout(() => target.classList.remove('is-flash'), 1600);
    });
  }

  function paint(pers, list) {
    list = placeDuplicate(list);
    lastList = list;
    // Drop any selection pointing at rows that no longer exist (deleted,
    // archived, or filtered out by an edit) so the count can't drift.
    const present = new Set(list.map(p => p.id));
    [...selected].forEach(id => { if (!present.has(id)) selected.delete(id); });
    tbody.innerHTML = renderPromptTableRows(list, ctx);

    const dataScript = document.getElementById(`${gridId}-data`);
    if (dataScript) dataScript.textContent = JSON.stringify(list).replace(/</g, '\\u003c');

    initInteractive(tbody);
    wireOwnerActions(tbody, list, pers);
    wireSelection(tbody);
    getQuickView(gridId)?.update(list, pers);

    // If grid view was the persisted preference, viewToggle.js already built
    // #${gridId}-cards from the stale (pre-personalization, or pre-edit)
    // embedded JSON by the time this runs - rebuild it directly rather than
    // leaving it out of sync with the table.
    paintCards(document.getElementById(`${gridId}-cards`), pers, list);

    const emptyEl = document.getElementById(`${gridId}-empty`);
    if (emptyEl) emptyEl.hidden = list.length !== 0;

    if (toolbarId) rebuildToolbar(list, pers.categories);
    updateNewCallout(list);
    syncSelectionUI();
    flashDuplicate();
  }

  // Home's "N new prompts" banner (lib/render.mjs's findNewPrompts) is
  // server-rendered from the build-time catalog list - re-derive it from the
  // caller's own library so it reflects what they actually hold (a prompt
  // they archived or deleted stops being announced), and drop the banner
  // entirely once nothing recent is left to show. Newly seeded copies land
  // with a fresh `added` timestamp, so a catalog prompt published since the
  // last visit shows up here as new without any special handling. No-op on
  // any page without the banner in the first place (Category, Search).
  function updateNewCallout(list) {
    const container = document.getElementById('new-callout');
    if (!container) return;
    const fresh = findNewPrompts(list);
    if (!fresh.length) {
      container.remove();
      return;
    }
    container.dataset.newSlugs = JSON.stringify(fresh.map(p => p.slug));
    const textEl = document.getElementById('new-callout-text');
    if (textEl) {
      textEl.innerHTML = `<strong>${fresh.length} new prompt${fresh.length === 1 ? '' : 's'}</strong> added in the last ${NEW_WINDOW_DAYS} days`;
    }
  }

  // Pills come from the caller's OWN categories now, not a shared constant -
  // which is the whole point of BUILD_BRIEF_v6.md: a user who renamed
  // "Marketing" to "Growth", recoloured it, or invented "Client work" sees
  // exactly that here, in their own order.
  function rebuildToolbar(list, categories) {
    const bar = document.getElementById(toolbarId);
    if (!bar) return;
    const options = (categories || [])
      .map(c => ({ ...c, count: list.filter(p => promptHasCategory(p, c.slug)).length }))
      .filter(c => c.count > 0)
      .map(c => ({ value: c.slug, label: categoryName(c), count: c.count, color: c.color }));
    bar.outerHTML = renderFilterToolbar([{ key: 'category', label: 'Category Filter(s)', options }], { id: toolbarId });
    initTableFilterToolbar(toolbarId, gridId);
    applyCatFromUrl();
  }

  // ?cat=<slug> pre-activates a pill. This is where the signed-in sidebar
  // sends every category link (BUILD_BRIEF_v6.md §5): a user-created category
  // has no statically generated /browse/ page, so Home-filtered-by-category
  // is the destination for all of them rather than only some.
  //
  // Applied after each toolbar rebuild, not once at startup, because the
  // pills don't exist until the caller's categories have loaded - and only
  // when nothing is active yet, so a rebuild triggered by an edit doesn't
  // fight a filter the user has since changed.
  function applyCatFromUrl() {
    const slug = new URLSearchParams(location.search).get('cat');
    if (!slug) return;
    const bar = document.getElementById(toolbarId);
    if (!bar || bar.querySelector('.filter-pill.is-active')) return;
    bar.querySelector(`.filter-pill[data-value="${CSS.escape(slug)}"]`)?.click();
  }

  async function refresh() {
    const fresh = await getPersonalization();
    if (!fresh) return; // signed out mid-session (rare, but don't crash on it)
    const freshItems = filterFn ? fresh.prompts.filter(filterFn) : fresh.prompts;
    paint(fresh, freshItems);
  }

  // `.prompts` excludes archived rows - those live at /archived/ only.
  wireBulkBar();
  const items = filterFn ? personalization.prompts.filter(filterFn) : personalization.prompts;
  paint(personalization, items);
  syncSelectionUI();

  document.addEventListener('personalization:changed', (e) => {
    if (e.detail?.duplicatedId) pendingDuplicate = e.detail;
    refresh();
  });
  // /favorites/ passes a filterFn keyed on the favourites store, so a star
  // toggled on this page changes which rows belong here - repaint rather
  // than leaving an unstarred row sitting in the list until reload.
  document.addEventListener('favorites:changed', refresh);
}

export function initPersonalizedTable(opts) {
  rebuildBlock(opts).catch(err => console.error('Failed to load your prompts:', err));
}
