// Rebuilds a static .prompt-table-block in place with the signed-in caller's
// library (personalizeData.js) - used by Home and Category's inline scripts.
// Search does the equivalent directly against its live Fuse index
// (search.js), since it already rebuilds from scratch on every keystroke,
// rather than reusing this module. Signed out, this is a no-op - the static
// build is left exactly as rendered.
import { CATEGORIES } from './lib/schema.mjs';
import {
  renderPromptTableRows, renderPromptCard, renderFilterToolbar,
  categoryHue, categoryLabel, findNewPrompts, NEW_WINDOW_DAYS
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
        await duplicatePrompt(prompt);
        document.dispatchEvent(new CustomEvent('personalization:changed'));
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

  function paintCards(cardGrid, pers, list) {
    if (!cardGrid) return;
    cardGrid.innerHTML = list.map(p => renderPromptCard(p, ctx)).join('');
    initInteractive(cardGrid);
    wireOwnerActions(cardGrid, list, pers);
  }

  document.addEventListener('promptly:cards-built', (e) => {
    if (e.detail?.gridId !== gridId || !lastList) return;
    paintCards(e.detail.cardGrid, personalization, lastList);
  });

  function paint(pers, list) {
    lastList = list;
    tbody.innerHTML = renderPromptTableRows(list, ctx);

    const dataScript = document.getElementById(`${gridId}-data`);
    if (dataScript) dataScript.textContent = JSON.stringify(list).replace(/</g, '\\u003c');

    initInteractive(tbody);
    wireOwnerActions(tbody, list, pers);
    getQuickView(gridId)?.update(list, pers);

    // If grid view was the persisted preference, viewToggle.js already built
    // #${gridId}-cards from the stale (pre-personalization, or pre-edit)
    // embedded JSON by the time this runs - rebuild it directly rather than
    // leaving it out of sync with the table.
    paintCards(document.getElementById(`${gridId}-cards`), pers, list);

    const emptyEl = document.getElementById(`${gridId}-empty`);
    if (emptyEl) emptyEl.hidden = list.length !== 0;

    if (toolbarId) rebuildToolbar(list);
    updateNewCallout(list);
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

  function rebuildToolbar(list) {
    const bar = document.getElementById(toolbarId);
    if (!bar) return;
    const options = CATEGORIES
      .map(slug => ({ slug, count: list.filter(p => p.categories.includes(slug)).length }))
      .filter(c => c.count > 0)
      .map(c => ({ value: c.slug, label: categoryLabel(c.slug), count: c.count, hue: categoryHue(c.slug) }));
    bar.outerHTML = renderFilterToolbar([{ key: 'category', label: 'Category Filter(s)', options }], { id: toolbarId });
    initTableFilterToolbar(toolbarId, gridId);
  }

  async function refresh() {
    const fresh = await getPersonalization();
    if (!fresh) return; // signed out mid-session (rare, but don't crash on it)
    const freshItems = filterFn ? fresh.prompts.filter(filterFn) : fresh.prompts;
    paint(fresh, freshItems);
  }

  // `.prompts` excludes archived rows - those live at /archived/ only.
  const items = filterFn ? personalization.prompts.filter(filterFn) : personalization.prompts;
  paint(personalization, items);

  document.addEventListener('personalization:changed', refresh);
}

export function initPersonalizedTable(opts) {
  rebuildBlock(opts).catch(err => console.error('Failed to load your prompts:', err));
}
