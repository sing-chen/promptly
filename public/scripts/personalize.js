// Rebuilds a static .prompt-table-block in place with the signed-in caller's
// merged catalog (personalizeData.js) - used by Home and Category's inline
// scripts. Search does the equivalent directly against its live Fuse index
// (search.js), since it already rebuilds from scratch on every keystroke,
// rather than reusing this module. Signed out, this is a no-op - the static
// build is left exactly as rendered.
import { CATEGORIES } from './lib/schema.mjs';
import {
  renderPromptTableRows, renderPromptCard, renderFilterToolbar,
  categoryHue, categoryLabel
} from './lib/render.mjs';
import { initInteractive } from './favorites.js';
import { getQuickView } from './quickViewRegistry.js';
import { initTableFilterToolbar } from './filters.js';
import { deletePrompt } from './db.js';
import { getPersonalization, resolveOwnPromptForEdit } from './personalizeData.js';

// Exported for search.js to reuse directly - it rebuilds its own results
// from scratch on every keystroke rather than going through rebuildBlock()
// below, but wants the exact same Edit/Delete wiring on what it renders.
// Rebinding, not the block's own 'personalization:changed' listener, is what
// picks up an edit/delete/fork here - both the Edit and Delete handlers
// below dispatch that event themselves once their write completes.
export function wireOwnerActions(container, items, personalization) {
  container.querySelectorAll('[data-edit-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const prompt = items.find(p => p.id === btn.dataset.editId);
      if (!prompt) return;
      btn.disabled = true;
      try {
        const target = await resolveOwnPromptForEdit(personalization, prompt);
        document.dispatchEvent(new CustomEvent('prompt:edit-request', { detail: target }));
      } catch (err) {
        alert(err.message || 'Something went wrong.');
      } finally {
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
      if (!confirm(`Delete "${prompt.title}"? This can't be undone.`)) return;
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

  function paint(pers, list) {
    tbody.innerHTML = renderPromptTableRows(list, ctx);

    const dataScript = document.getElementById(`${gridId}-data`);
    if (dataScript) dataScript.textContent = JSON.stringify(list).replace(/</g, '\\u003c');

    initInteractive(tbody);
    wireOwnerActions(tbody, list, pers);
    getQuickView(gridId)?.update(list, pers);

    // If grid view was the persisted preference, viewToggle.js already built
    // #${gridId}-cards from the stale (pre-merge, or pre-edit) embedded JSON
    // by the time this runs - rebuild it directly rather than leaving it out
    // of sync with the table.
    const cardGrid = document.getElementById(`${gridId}-cards`);
    if (cardGrid) {
      cardGrid.innerHTML = list.map(p => renderPromptCard(p, ctx)).join('');
      initInteractive(cardGrid);
      wireOwnerActions(cardGrid, list, pers);
    }

    const emptyEl = document.getElementById(`${gridId}-empty`);
    if (emptyEl) emptyEl.hidden = list.length !== 0;

    if (toolbarId) rebuildToolbar(list);
  }

  function rebuildToolbar(list) {
    const bar = document.getElementById(toolbarId);
    if (!bar) return;
    const options = CATEGORIES
      .map(slug => ({ slug, count: list.filter(p => p.categories.includes(slug)).length }))
      .filter(c => c.count > 0)
      .map(c => ({ value: c.slug, label: categoryLabel(c.slug), count: c.count, hue: categoryHue(c.slug) }));
    bar.outerHTML = renderFilterToolbar([{ key: 'category', label: 'Category', options }], { id: toolbarId, resultCount: true });
    initTableFilterToolbar(toolbarId, gridId);
  }

  async function refresh() {
    const fresh = await getPersonalization();
    if (!fresh) return; // signed out mid-session (rare, but don't crash on it)
    const freshItems = filterFn ? fresh.merged.filter(filterFn) : fresh.merged;
    paint(fresh, freshItems);
  }

  const items = filterFn ? personalization.merged.filter(filterFn) : personalization.merged;
  paint(personalization, items);

  document.addEventListener('personalization:changed', refresh);
}

export function initPersonalizedTable(opts) {
  rebuildBlock(opts).catch(err => console.error('Failed to load your prompts:', err));
}
