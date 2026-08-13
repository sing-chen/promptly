// /categories/ - create, rename, recolour, reorder and delete the caller's own
// categories (BUILD_BRIEF_v6.md §4). Client-rendered into the static shell
// renderCategoriesPage puts on the page, same pattern as /collections/ and
// /admin/.
//
// Two things here are less obvious than they look:
//
// 1. Delete is not a plain delete. Removing a category can strand a prompt
//    that has no other, which 0006's trigger refuses outright - so the dialog
//    pre-flights (db.js's categoryUsage) and, where anything would be
//    stranded, requires a replacement before the button enables. The actual
//    work happens in the delete_category() RPC so the reassignment and the
//    delete share a transaction.
//
// 2. Slug is immutable, so renaming only changes the display name. That is
//    deliberate (§3): the slug is what seeding matches catalog categories on
//    and what /browse/<slug>/ is built from.
import { supabase } from './supabaseClient.js';
import {
  loadMyCategories, createCategory, updateCategory, deleteCategory,
  reorderCategories, categoryUsage, loadMyPrompts
} from './db.js';
import { esc, catColorVars, categoryName } from './lib/render.mjs';
import { CATEGORY_COLOR_PRESETS, readableInk, promptHasCategory } from './lib/schema.mjs';
import { confirmDialog } from './confirmDialog.js';

const root = document.getElementById('categories-root');

// Broadcast so the New Prompt modal's checkbox list and the sidebar list
// refresh without a page reload - same shape as the existing
// 'personalization:changed' contract.
function announce() {
  document.dispatchEvent(new CustomEvent('categories:changed'));
}

function signedOutView() {
  return `
<div class="surface sidebar-callout categories-callout">
  <p>Categories organise your prompts. Browsing uses the shared set; signing in gives you your own — rename them, pick their colours, add ones that fit how you actually work.</p>
  <p><a href="/why-sign-in/" class="btn btn-primary">Why sign in?</a></p>
</div>`;
}

function colorField(id, selected) {
  const swatches = CATEGORY_COLOR_PRESETS.map(c => `
    <button type="button" class="cat-swatch${c.toLowerCase() === (selected || '').toLowerCase() ? ' is-selected' : ''}"
            data-color="${esc(c)}" style="${catColorVars({ color: c })}"
            aria-label="Use ${esc(c)}" title="${esc(c)}"></button>`).join('');
  return `
<div class="cat-color-field">
  <span class="np-field-label">Colour</span>
  <div class="cat-swatches" role="group" aria-label="Category colour">${swatches}</div>
  <label class="cat-hex-label">Custom
    <input type="text" id="${id}" name="color" value="${esc(selected)}" maxlength="7"
           pattern="#[0-9A-Fa-f]{6}" spellcheck="false" aria-describedby="${id}-preview">
  </label>
  <span class="cat-preview" id="${id}-preview" style="${catColorVars({ color: selected })}">Preview</span>
</div>`;
}

function rowView(c, counts) {
  const used = counts.get(c.slug) || 0;
  return `
<li class="cat-row surface" data-id="${esc(c.id)}" draggable="true">
  <span class="cat-drag" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
  <span class="cat-badge" style="${catColorVars(c)}">${esc(categoryName(c))}</span>
  <span class="cat-row-desc">${esc(c.description || '')}</span>
  <span class="cat-row-count">${used} prompt${used === 1 ? '' : 's'}</span>
  <span class="cat-row-actions">
    <button type="button" class="btn btn-ghost" data-edit="${esc(c.id)}">Edit</button>
    <button type="button" class="btn btn-ghost" data-delete="${esc(c.id)}">Delete</button>
  </span>
</li>`;
}

function editorView(c) {
  const isNew = !c;
  const color = c?.color || CATEGORY_COLOR_PRESETS[0];
  return `
<form class="surface cat-editor" id="cat-editor">
  <h2>${isNew ? 'New category' : `Edit ${esc(categoryName(c))}`}</h2>
  <label>Name
    <input type="text" name="name" required maxlength="40" value="${esc(c?.name || '')}">
  </label>
  <label>Description <span class="cat-optional">(optional)</span>
    <input type="text" name="description" maxlength="160" value="${esc(c?.description || '')}"
           placeholder="One line, shown on the category page">
  </label>
  ${colorField('cat-color', color)}
  ${isNew ? '' : `<p class="cat-slug-note">URL name stays <code>${esc(c.slug)}</code> — renaming changes the label, not the link.</p>`}
  <div class="cat-editor-actions">
    <button type="submit" class="btn btn-primary">${isNew ? 'Create category' : 'Save changes'}</button>
    <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
  </div>
  <p class="np-message" id="cat-message" hidden></p>
</form>`;
}

async function render() {
  const [categories, prompts] = await Promise.all([loadMyCategories(), loadMyPrompts()]);
  // Counts exclude archived prompts, matching what the sidebar and the filter
  // pills count - otherwise "3 prompts" here wouldn't match "3" there.
  const active = prompts.filter(p => !p.is_archived);
  const counts = new Map(categories.map(c =>
    [c.slug, active.filter(p => promptHasCategory(p, c.slug)).length]));

  root.innerHTML = `
<div class="cat-page-head">
  <button type="button" class="btn btn-primary" id="cat-new-btn">+ New category</button>
</div>
<div id="cat-editor-slot"></div>
${categories.length
  ? `<ul class="cat-list" id="cat-list">${categories.map(c => rowView(c, counts)).join('')}</ul>`
  : '<p class="stat-empty">No categories yet. Every prompt needs at least one, so start by adding a couple.</p>'}`;

  wire(categories, counts);
}

function wire(categories, counts) {
  const slot = document.getElementById('cat-editor-slot');
  const byId = new Map(categories.map(c => [c.id, c]));

  function openEditor(cat) {
    slot.innerHTML = editorView(cat);
    const form = document.getElementById('cat-editor');
    const hex = form.querySelector('#cat-color');
    const preview = form.querySelector('#cat-color-preview');
    const message = form.querySelector('#cat-message');

    // The preview is the whole contrast story for the user: rather than
    // forbidding a pale colour, show the badge exactly as it will render,
    // ink and all, so a bad pick is self-evident (§6.3).
    function paint(color) {
      preview.setAttribute('style', `--cat:${color};--cat-ink:${readableInk(color)}`);
    }
    form.querySelectorAll('.cat-swatch').forEach(b => b.addEventListener('click', () => {
      hex.value = b.dataset.color;
      form.querySelectorAll('.cat-swatch').forEach(x => x.classList.toggle('is-selected', x === b));
      paint(b.dataset.color);
    }));
    hex.addEventListener('input', () => {
      if (/^#[0-9a-f]{6}$/i.test(hex.value)) paint(hex.value);
    });
    form.querySelector('[data-cancel]').addEventListener('click', () => { slot.innerHTML = ''; });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      message.hidden = true;
      const name = form.name.value.trim();
      const color = hex.value.trim();
      if (!/^#[0-9a-f]{6}$/i.test(color)) {
        message.textContent = 'Colour must be a hex value like #A8552A.';
        message.hidden = false;
        return;
      }
      try {
        if (cat) {
          await updateCategory(cat.id, { name, description: form.description.value.trim(), color });
        } else {
          await createCategory({
            name, description: form.description.value.trim(), color,
            position: categories.length + 1
          });
        }
        slot.innerHTML = '';
        announce();
        await render();
      } catch (err) {
        message.textContent = err?.message || 'Could not save that category.';
        message.hidden = false;
      }
    });
    form.name.focus();
  }

  document.getElementById('cat-new-btn').addEventListener('click', () => openEditor(null));

  root.querySelectorAll('[data-edit]').forEach(b =>
    b.addEventListener('click', () => openEditor(byId.get(b.dataset.edit))));

  root.querySelectorAll('[data-delete]').forEach(b =>
    b.addEventListener('click', () => promptDelete(byId.get(b.dataset.delete), categories)));

  wireDragReorder();
}

// The pre-flight the ≥1-category rule demands (§4.3). Three outcomes, and
// only the third asks the user for anything - deleting a category that
// nothing depends on shouldn't be made to feel dangerous.
async function promptDelete(cat, categories) {
  let usage;
  try {
    usage = await categoryUsage(cat.id);
  } catch (err) {
    await confirmDialog({
      title: 'Could not check usage',
      message: err?.message || 'Something went wrong reading which prompts use this category.',
      confirmLabel: 'OK'
    });
    return;
  }

  const others = categories.filter(c => c.id !== cat.id);
  const name = categoryName(cat);

  if (usage.sole.length === 0) {
    const ok = await confirmDialog({
      title: `Delete ${name}?`,
      message: usage.total === 0
        ? 'Nothing is filed under it.'
        : `It will be removed from ${usage.total} prompt${usage.total === 1 ? '' : 's'}, all of which have other categories.`,
      confirmLabel: 'Delete'
    });
    if (!ok) return;
    await doDelete(cat.id, null);
    return;
  }

  // Sole-category case: a replacement is required, so this can't go through
  // the generic confirm dialog - it needs a control in it.
  if (others.length === 0) {
    await confirmDialog({
      title: `Can't delete ${name}`,
      message: `${usage.sole.length} prompt${usage.sole.length === 1 ? ' has' : 's have'} no other category, and every prompt must have at least one. Create another category first.`,
      confirmLabel: 'OK'
    });
    return;
  }

  const slot = document.getElementById('cat-editor-slot');
  slot.innerHTML = `
<form class="surface cat-editor cat-delete-form" id="cat-delete-form">
  <h2>Delete ${esc(name)}</h2>
  <p>${usage.sole.length} prompt${usage.sole.length === 1 ? '' : 's'} ${usage.sole.length === 1 ? 'has' : 'have'} <strong>${esc(name)}</strong> as ${usage.sole.length === 1 ? 'its' : 'their'} only category. Pick where ${usage.sole.length === 1 ? 'it' : 'they'} should go instead.</p>
  <ul class="cat-affected">${usage.sole.slice(0, 8).map(p => `<li>${esc(p.title)}</li>`).join('')}${usage.sole.length > 8 ? `<li>…and ${usage.sole.length - 8} more</li>` : ''}</ul>
  <label>File them under
    <select name="reassign" required>
      <option value="">Choose a category…</option>
      ${others.map(c => `<option value="${esc(c.id)}">${esc(categoryName(c))}</option>`).join('')}
    </select>
  </label>
  <div class="cat-editor-actions">
    <button type="submit" class="btn btn-danger" id="cat-delete-confirm" disabled>Reassign and delete</button>
    <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
  </div>
  <p class="np-message" id="cat-delete-message" hidden></p>
</form>`;

  const form = document.getElementById('cat-delete-form');
  const select = form.reassign;
  const confirm = document.getElementById('cat-delete-confirm');
  select.addEventListener('change', () => { confirm.disabled = !select.value; });
  form.querySelector('[data-cancel]').addEventListener('click', () => { slot.innerHTML = ''; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('cat-delete-message');
    msg.hidden = true;
    try {
      await doDelete(cat.id, select.value);
    } catch (err) {
      msg.textContent = err?.message || 'Could not delete that category.';
      msg.hidden = false;
    }
  });
  form.scrollIntoView({ block: 'nearest' });
}

async function doDelete(id, reassignTo) {
  await deleteCategory(id, reassignTo || null);
  document.getElementById('cat-editor-slot').innerHTML = '';
  announce();
  // Prompts may have been recategorised, so the library is stale too.
  document.dispatchEvent(new CustomEvent('personalization:changed'));
  await render();
}

// Plain HTML5 drag-and-drop rather than pointer maths: the list is short, the
// rows are big targets, and this keeps keyboard users on the native
// reordering path the browser already provides for draggable items.
function wireDragReorder() {
  const list = document.getElementById('cat-list');
  if (!list) return;
  let dragging = null;

  list.addEventListener('dragstart', (e) => {
    dragging = e.target.closest('.cat-row');
    if (dragging) dragging.classList.add('is-dragging');
  });
  list.addEventListener('dragend', async () => {
    if (!dragging) return;
    dragging.classList.remove('is-dragging');
    dragging = null;
    const ids = [...list.querySelectorAll('.cat-row')].map(r => r.dataset.id);
    try {
      await reorderCategories(ids);
      announce();
    } catch {
      await render(); // put it back the way the database still has it
    }
  });
  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!dragging) return;
    const over = e.target.closest('.cat-row');
    if (!over || over === dragging) return;
    const rect = over.getBoundingClientRect();
    const after = (e.clientY - rect.top) / rect.height > 0.5;
    list.insertBefore(dragging, after ? over.nextSibling : over);
  });
}

async function init() {
  if (!root) return;
  if (!supabase) {
    root.innerHTML = signedOutView();
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    root.innerHTML = signedOutView();
    return;
  }
  try {
    await render();
  } catch (err) {
    root.innerHTML = `<p class="stat-empty">Could not load your categories. ${esc(err?.message || '')}</p>`;
  }
}

init();
supabase?.auth.onAuthStateChange(() => init());
