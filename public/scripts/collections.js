// /collections/ - create, rename, reorder, delete the caller's own
// collections, and manage which prompts are in each.
//
// Rewritten in §9an to mirror /categories/ (public/scripts/categories.js)
// structure for structure: a "+ New collection" button opening an inline
// editor, then a draggable list of rows with Edit and Delete. It used to be
// a permanently-open create form above a grid of cards, which is a different
// answer to the same question for no reason anyone could state - the two
// pages manage the same kind of thing.
//
// Read categories.js alongside this. Where the shapes match, they match on
// purpose, and a change to one is usually wanted in the other.
import { supabase } from './supabaseClient.js';
import {
  loadCollections, createCollection, updateCollection, deleteCollection,
  reorderCollections, addPromptToCollection, removePromptFromCollection
} from './db.js';
import { esc } from './lib/render.mjs';
import { getPersonalization } from './personalizeData.js';
import { confirmDialog } from './confirmDialog.js';
import { initQuickView } from './quickview.js';

const root = document.getElementById('collections-root');

function notifyCollectionsChanged() {
  document.dispatchEvent(new CustomEvent('collections:changed'));
}

function signedOutView() {
  return `
<div class="surface sidebar-callout categories-callout">
  <p>Collections group your prompts for a project or workflow, so you can pull them all up at once — a client, a launch, a weekly routine.</p>
  <p><a href="/why-sign-in/" class="btn btn-primary">Why log in?</a></p>
</div>`;
}

function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function createWithUniqueSlug(fields) {
  const base = slugify(fields.title) || 'collection';
  for (let attempt = 1; attempt <= 20; attempt++) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`;
    try {
      return await createCollection({ ...fields, slug });
    } catch (err) {
      if (err?.code !== '23505' || attempt === 20) throw err;
    }
  }
}

// The members list is the one thing /categories/ has no equivalent of: a
// category's contents live on its own browse page, while a collection's are
// the whole point of the row.
//
// Each prompt is an <a href> to its real page carrying data-slug. Both halves
// matter. The href means middle-click, "open in new tab" and no-JS all work,
// and it is what a link should be; the data-slug is what initQuickView() binds
// to, and its handler calls preventDefault() so an ordinary click opens the
// modal instead of navigating. That is the same trick the sequence rail uses.
function membersView(c, byId) {
  const members = (c.collection_prompts || [])
    .map(cp => byId.get(cp.prompt_id))
    .filter(Boolean);
  if (!members.length) {
    return '<p class="col-empty-note">No prompts in this collection yet.</p>';
  }
  return `<ul class="col-members">${members.map(p => `
  <li class="col-member">
    <a class="col-member-link" href="/prompt/${esc(p.slug)}/" data-slug="${esc(p.slug)}">${esc(p.title)}</a>
    <button type="button" class="col-member-remove" data-remove-collection="${esc(c.id)}" data-remove-prompt="${esc(p.id)}"
            aria-label="Remove ${esc(p.title)} from ${esc(c.title)}" data-tip="Remove from collection">&times;</button>
  </li>`).join('')}</ul>`;
}

function addRowView(c, addable) {
  if (!addable.length) return '';
  return `
<div class="col-add-row">
  <select data-add-select="${esc(c.id)}" aria-label="Add a prompt to ${esc(c.title)}">
    <option value="">Add a prompt…</option>
    ${addable.map(p => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('')}
  </select>
  <button type="button" class="btn btn-ghost" data-add-btn="${esc(c.id)}">Add</button>
</div>`;
}

function rowView(c, byId, allPrompts) {
  const members = (c.collection_prompts || []).map(cp => byId.get(cp.prompt_id)).filter(Boolean);
  const addable = allPrompts.filter(p => !members.some(m => m.id === p.id));
  const count = members.length;
  return `
<li class="col-row surface" data-id="${esc(c.id)}" draggable="true">
  <div class="col-row-head">
    <span class="cat-drag" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
    <span class="col-row-title">${esc(c.title)}</span>
    <span class="col-row-desc" title="${esc(c.description || '')}">${esc(c.description || '')}</span>
    <span class="cat-row-count">${count} prompt${count === 1 ? '' : 's'}</span>
    <span class="cat-row-actions">
      <button type="button" class="btn btn-ghost" data-edit="${esc(c.id)}">Edit</button>
      <button type="button" class="btn btn-ghost" data-delete="${esc(c.id)}">Delete</button>
    </span>
  </div>
  ${membersView(c, byId)}
  ${addRowView(c, addable)}
</li>`;
}

// Mirrors categories.js's editorView, including the Description field being a
// plain <input type="text"> rather than a <textarea>. That was the reported
// mismatch: a textarea in a form of inputs reads as a different kind of
// control, and a collection's description is a one-liner shown in a row - the
// same job the category description does, so the same control.
function editorView(c) {
  const isNew = !c;
  return `
<form class="surface cat-editor" id="col-editor">
  <h2>${isNew ? 'New collection' : `Edit ${esc(c.title)}`}</h2>
  <label>Title
    <input type="text" name="title" required maxlength="120" value="${esc(c?.title || '')}">
  </label>
  <label>Description <span class="cat-optional">(optional)</span>
    <input type="text" name="description" maxlength="160" value="${esc(c?.description || '')}"
           placeholder="One line, shown beside the collection">
  </label>
  ${isNew ? '' : `<p class="cat-slug-note">URL name stays <code>${esc(c.slug)}</code> — renaming changes the label, not the link.</p>`}
  <div class="cat-editor-actions">
    <button type="submit" class="btn btn-primary">${isNew ? 'Create collection' : 'Save changes'}</button>
    <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
  </div>
  <p class="np-message" id="col-message" hidden></p>
</form>`;
}

async function render() {
  const [collections, personalization] = await Promise.all([loadCollections(), getPersonalization()]);
  // Any prompt the caller can currently see is a valid thing to collect -
  // db.js's addPromptToCollection() has no ownership restriction and neither
  // does the RLS policy behind it. Archived ones are excluded: they are
  // hidden everywhere else, and offering them here would be the one place
  // they reappear.
  const allPrompts = personalization ? personalization.prompts : [];
  const byId = personalization ? personalization.byId : new Map();

  root.innerHTML = `
<div class="cat-page-head">
  <button type="button" class="btn btn-primary" id="col-new-btn">+ New collection</button>
</div>
<div id="col-editor-slot"></div>
${collections.length
  ? `<ul class="col-list" id="col-list">${collections.map(c => rowView(c, byId, allPrompts)).join('')}</ul>`
  : '<p class="stat-empty">No collections yet. Make one for a project or a routine, then add the prompts you reach for.</p>'}`;

  wire(collections, byId, allPrompts);

  // Bound to the whole list rather than per row: initQuickView() attaches one
  // delegated handler to the element it is given, so a single call covers
  // every prompt in every collection.
  //
  // Safe to call again on each repaint, and it has to be: render() replaces
  // #col-list wholesale, so the previous node and the listeners on it are
  // gone. There is no accumulating-handler problem precisely because the
  // element they were attached to no longer exists.
  if (document.getElementById('col-list')) {
    initQuickView('col-list', { data: allPrompts, personalization, allPrompts });
  }
}

function wire(collections, byId, allPrompts) {
  const slot = document.getElementById('col-editor-slot');
  const byCollectionId = new Map(collections.map(c => [c.id, c]));

  function openEditor(col) {
    slot.innerHTML = editorView(col);
    const form = document.getElementById('col-editor');
    const message = form.querySelector('#col-message');
    form.querySelector('[data-cancel]').addEventListener('click', () => { slot.innerHTML = ''; });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      message.hidden = true;
      const title = form.title.value.trim();
      const description = form.description.value.trim() || null;
      try {
        if (col) {
          // Title only - the slug deliberately does not follow a rename, for
          // the reason the note in the editor gives. A slug that chased its
          // title would break every link anyone had kept.
          await updateCollection(col.id, { title, description });
        } else {
          await createWithUniqueSlug({ title, description, position: collections.length + 1 });
        }
        slot.innerHTML = '';
        notifyCollectionsChanged();
        await render();
      } catch (err) {
        message.textContent = err?.message || 'Could not save that collection.';
        message.hidden = false;
      }
    });
    form.title.focus();
  }

  document.getElementById('col-new-btn').addEventListener('click', () => openEditor(null));

  root.querySelectorAll('[data-edit]').forEach(b =>
    b.addEventListener('click', () => openEditor(byCollectionId.get(b.dataset.edit))));

  root.querySelectorAll('[data-delete]').forEach(b =>
    b.addEventListener('click', () => promptDelete(byCollectionId.get(b.dataset.delete))));

  root.querySelectorAll('[data-remove-collection]').forEach(btn =>
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await removePromptFromCollection(btn.dataset.removeCollection, btn.dataset.removePrompt);
        await render();
      } catch (err) {
        await confirmDialog({
          title: 'Could not remove that prompt',
          message: err?.message || 'Something went wrong.',
          confirmLabel: 'OK'
        });
        btn.disabled = false;
      }
    }));

  root.querySelectorAll('[data-add-btn]').forEach(btn =>
    btn.addEventListener('click', async () => {
      const collectionId = btn.dataset.addBtn;
      const select = root.querySelector(`[data-add-select="${CSS.escape(collectionId)}"]`);
      const promptId = select?.value;
      if (!promptId) return;
      btn.disabled = true;
      try {
        await addPromptToCollection(collectionId, promptId);
        await render();
      } catch (err) {
        await confirmDialog({
          title: 'Could not add that prompt',
          message: err?.message || 'Something went wrong.',
          confirmLabel: 'OK'
        });
        btn.disabled = false;
      }
    }));

  wireDragReorder();
}

// Deleting a collection destroys no prompts - collection_prompts cascades and
// the prompts themselves are untouched. The confirm says so, because "delete"
// next to a list of prompt titles reads more alarming than it is.
async function promptDelete(col) {
  if (!col) return;
  const count = (col.collection_prompts || []).length;
  const ok = await confirmDialog({
    title: `Delete ${col.title}?`,
    message: count === 0
      ? 'It has no prompts in it.'
      : `The ${count} prompt${count === 1 ? '' : 's'} in it will stay in your library — only the grouping goes.`,
    confirmLabel: 'Delete'
  });
  if (!ok) return;
  try {
    await deleteCollection(col.id);
    notifyCollectionsChanged();
    await render();
  } catch (err) {
    await confirmDialog({
      title: 'Could not delete that collection',
      message: err?.message || 'Something went wrong.',
      confirmLabel: 'OK'
    });
  }
}

// Lifted from categories.js's wireDragReorder, against .col-row instead of
// .cat-row. Kept as a copy rather than shared: it is fifteen lines, and the
// shared version would need the row selector, the list id and the persist
// call injected, which is most of the function.
function wireDragReorder() {
  const list = document.getElementById('col-list');
  if (!list) return;
  let dragging = null;

  list.addEventListener('dragstart', (e) => {
    dragging = e.target.closest('.col-row');
    if (dragging) dragging.classList.add('is-dragging');
  });
  list.addEventListener('dragend', async () => {
    if (!dragging) return;
    dragging.classList.remove('is-dragging');
    dragging = null;
    const ids = [...list.querySelectorAll('.col-row')].map(r => r.dataset.id);
    try {
      await reorderCollections(ids);
      notifyCollectionsChanged();
    } catch {
      await render(); // put it back the way the database still has it
    }
  });
  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!dragging) return;
    const over = e.target.closest('.col-row');
    if (!over || over === dragging) return;
    const rect = over.getBoundingClientRect();
    const after = (e.clientY - rect.top) / rect.height > 0.5;
    list.insertBefore(dragging, after ? over.nextSibling : over);
  });
}

async function init() {
  if (!root) return;
  if (!supabase) {
    root.innerHTML = '<p style="color:var(--ink-faint);">Account features aren’t configured for this build yet.</p>';
    return;
  }

  // Tracks who the page was last rendered for, so the onAuthStateChange
  // listener below only rebuilds on a real sign-in/out transition -
  // supabase-js fires it once immediately with the current session
  // (INITIAL_SESSION), which would otherwise wipe whatever the caller had
  // already typed into the editor a moment after the first render.
  let renderedForUserId = null;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    root.innerHTML = signedOutView();
  } else {
    renderedForUserId = session.user.id;
    await render();
  }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session) {
      renderedForUserId = null;
      root.innerHTML = signedOutView();
    } else if (session.user.id !== renderedForUserId) {
      renderedForUserId = session.user.id;
      await render();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
