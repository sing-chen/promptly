// /collections/ (lib/render.mjs renderCollectionsPage) - the signed-in
// user's own collections. Prompts themselves no longer have a separate
// "your prompts" destination (Home/Category/Search show the merged catalog
// directly - see personalizeData.js/personalize.js), so this page is
// single-purpose: create, delete, and manage collection membership.
import { supabase } from './supabaseClient.js';
import { loadCollections, createCollection, deleteCollection, addPromptToCollection, removePromptFromCollection } from './db.js';
import { esc } from './lib/render.mjs';
import { getPersonalization } from './personalizeData.js';

function notifyCollectionsChanged() {
  document.dispatchEvent(new CustomEvent('collections:changed'));
}

function renderCollectionCard(c, byId, addablePrompts) {
  const members = (c.collection_prompts || [])
    .map(cp => byId.get(cp.prompt_id))
    .filter(Boolean);
  const chips = members.length
    ? members.map(p => `
      <span class="chip lib-collection-chip">
        ${esc(p.title)}
        <button type="button" class="lib-chip-remove" data-remove-collection="${esc(c.id)}" data-remove-prompt="${esc(p.id)}" aria-label="Remove ${esc(p.title)} from ${esc(c.title)}">&times;</button>
      </span>`).join('')
    : `<p style="color:var(--ink-faint);font-size:13px;margin:0;">No prompts yet.</p>`;

  const addable = addablePrompts.filter(p => !members.some(m => m.id === p.id));
  const addOptions = addable.map(p => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');
  const addRow = addable.length
    ? `
    <div class="lib-collection-add">
      <select data-add-select="${esc(c.id)}" aria-label="Add a prompt to ${esc(c.title)}">
        <option value="">Add a prompt…</option>
        ${addOptions}
      </select>
      <button type="button" class="btn btn-secondary" data-add-btn="${esc(c.id)}">Add</button>
    </div>`
    : '';

  return `
<div class="surface lib-collection-card" data-collection-id="${esc(c.id)}" data-collection-slug="${esc(c.slug)}">
  <div class="lib-collection-head">
    <div>
      <span class="card-title">${esc(c.title)}</span>
      ${c.description ? `<p class="card-purpose">${esc(c.description)}</p>` : ''}
    </div>
    <button type="button" class="icon-btn" data-delete-collection="${esc(c.id)}" aria-label="Delete collection ${esc(c.title)}" title="Delete collection">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
    </button>
  </div>
  <div class="lib-collection-chips">${chips}</div>
  ${addRow}
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

async function render(root) {
  const [collections, personalization] = await Promise.all([loadCollections(), getPersonalization()]);
  // Any prompt the caller can currently see (own, or a default) is a valid
  // thing to put in a collection - db.js's addPromptToCollection() has no
  // ownership restriction, and neither does the RLS policy behind it.
  const addablePrompts = personalization ? personalization.merged : [];
  const byId = personalization ? personalization.byId : new Map();

  root.innerHTML = `
<h1>Collections</h1>
<form id="cf-form" class="account-form" style="max-width:420px;margin-bottom:24px;">
  <label>Title
    <input type="text" name="title" required maxlength="120">
  </label>
  <label>Description
    <textarea name="description" rows="2" placeholder="What this collection is for"></textarea>
  </label>
  <button type="submit" class="btn btn-primary" id="cf-submit-btn">Create collection</button>
  <p id="cf-message" hidden></p>
</form>
<div id="cf-list"></div>`;

  function paintList() {
    const listEl = document.getElementById('cf-list');
    listEl.innerHTML = collections.length === 0
      ? `<p style="color:var(--ink-faint);padding:24px 0;">No collections yet - create one above.</p>`
      : `<div class="lib-collection-list">${collections.map(c => renderCollectionCard(c, byId, addablePrompts)).join('')}</div>`;
    wireList(listEl);
  }

  function wireList(listEl) {
    listEl.querySelectorAll('[data-delete-collection]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const c = collections.find(c => c.id === btn.dataset.deleteCollection);
        if (!c) return;
        if (!confirm(`Delete the collection "${c.title}"? This can't be undone.`)) return;
        btn.disabled = true;
        try {
          await deleteCollection(c.id);
          notifyCollectionsChanged();
          await reload();
        } catch (err) {
          alert(err.message || 'Something went wrong.');
          btn.disabled = false;
        }
      });
    });

    listEl.querySelectorAll('[data-remove-collection]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await removePromptFromCollection(btn.dataset.removeCollection, btn.dataset.removePrompt);
          await reload();
        } catch (err) {
          alert(err.message || 'Something went wrong.');
          btn.disabled = false;
        }
      });
    });

    listEl.querySelectorAll('[data-add-btn]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const collectionId = btn.dataset.addBtn;
        const select = listEl.querySelector(`[data-add-select="${CSS.escape(collectionId)}"]`);
        const promptId = select?.value;
        if (!promptId) return;
        btn.disabled = true;
        try {
          await addPromptToCollection(collectionId, promptId);
          await reload();
        } catch (err) {
          alert(err.message || 'Something went wrong.');
          btn.disabled = false;
        }
      });
    });
  }

  async function reload() {
    const fresh = await loadCollections();
    collections.length = 0;
    collections.push(...fresh);
    paintList();
  }

  paintList();

  const form = document.getElementById('cf-form');
  const messageEl = document.getElementById('cf-message');
  const submitBtn = document.getElementById('cf-submit-btn');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    messageEl.hidden = true;
    submitBtn.disabled = true;
    try {
      await createWithUniqueSlug({
        title: form.title.value.trim(),
        description: form.description.value.trim() || null
      });
      form.reset();
      notifyCollectionsChanged();
      await reload();
    } catch (err) {
      messageEl.textContent = err.message || 'Something went wrong.';
      messageEl.setAttribute('role', 'alert');
      messageEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });
}

async function init() {
  const root = document.getElementById('collections-root');
  if (!root) return;
  if (!supabase) {
    root.innerHTML = '<h1>Collections</h1><p style="color:var(--ink-faint);">Account features aren’t configured for this build yet.</p>';
    return;
  }

  // Tracks who the page was last rendered for, so the onAuthStateChange
  // listener below only rebuilds the form on a real sign-in/out transition -
  // supabase-js fires that listener once immediately with the *current*
  // session right after it's registered (an INITIAL_SESSION event), which
  // would otherwise wipe out whatever the caller had already typed into the
  // New Collection form a moment after this page finished its first render.
  let renderedForUserId = null;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    root.innerHTML = '<h1>Collections</h1><p><a href="/account/">Sign in</a> to create and manage collections.</p>';
  } else {
    renderedForUserId = session.user.id;
    await render(root);
  }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session) {
      renderedForUserId = null;
      root.innerHTML = '<h1>Collections</h1><p><a href="/account/">Sign in</a> to create and manage collections.</p>';
    } else if (session.user.id !== renderedForUserId) {
      renderedForUserId = session.user.id;
      await render(root);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
