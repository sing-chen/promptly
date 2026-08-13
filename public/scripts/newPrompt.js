// New Prompt modal behavior (BUILD_BRIEF_v4.md §6, supabase/README.md "Next
// steps") - wires the sidebar's #new-prompt-btn (rendered hidden by
// lib/render.mjs, toggled visible by auth.js for any signed-in user) to the
// modal shell renderNewPromptModal() renders into every page. A successful
// create shows an inline message inside the modal rather than redirecting -
// Home/Category/Search (public/scripts/personalize.js, search.js) are where
// a created prompt actually shows up, since a signed-in user's own prompts
// are blended straight into those pages rather than living on a separate
// page. Both listen for this module's 'personalization:changed' event to
// refresh themselves if they're the page that's open.
//
// This same modal doubles as the Edit form. Every prompt in a signed-in view
// is one the caller owns (BUILD_BRIEF_v5.md §3.5), so personalize.js /
// search.js / quickview.js's Edit buttons just dispatch
// 'prompt:edit-request' with the row itself as `detail` - there is no
// ownership resolution step any more, and nothing forks on edit. Edit mode
// never touches is_curated/published (the admin checkbox is hidden) or slug
// (kept stable across an edit, unlike a fresh create) - it's a plain field
// update.
import { createPrompt, createCuratedPrompt, updatePrompt, isAdmin } from './db.js';
import { categoryLabel } from './lib/render.mjs';

function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// No slug field in the form - it's generated from the title at submit time.
// `slug` is only unique per-user (schema's `unique (user_id, slug)`), so the
// only way to collide is the same signed-in user creating two prompts that
// slugify to the same thing (e.g. two prompts both titled "Draft the
// brief"). Postgres would reject that with a 23505 unique-violation - retry
// with an incrementing numeric suffix instead of surfacing that raw error.
async function createWithUniqueSlug(fields, createFn) {
  const base = slugify(fields.title) || 'prompt';
  for (let attempt = 1; attempt <= 20; attempt++) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`;
    try {
      return await createFn({ ...fields, slug });
    } catch (err) {
      if (err?.code !== '23505' || attempt === 20) throw err;
    }
  }
}

function init() {
  const btn = document.getElementById('new-prompt-btn');
  const backdrop = document.getElementById('np-backdrop');
  if (!btn || !backdrop) return;

  const form = document.getElementById('np-form');
  const successEl = document.getElementById('np-success');
  const successMessageEl = document.getElementById('np-success-message');
  const messageEl = document.getElementById('np-message');
  const submitBtn = document.getElementById('np-submit-btn');
  const adminRow = document.getElementById('np-admin-row');
  const adminCheckbox = document.getElementById('np-admin-checkbox');
  const titleEl = document.getElementById('np-title');
  const createAnotherBtn = document.getElementById('np-create-another');

  // Set by openForEdit(), cleared by resetForm() - the one piece of state
  // that distinguishes "editing prompt X" from a fresh create.
  let editingId = null;

  function setModalMode(editing) {
    titleEl.textContent = editing ? 'Edit Prompt' : 'New Prompt';
    submitBtn.textContent = editing ? 'Save changes' : 'Create prompt';
    createAnotherBtn.hidden = editing;
  }

  // Category dropdown - a button that toggles a checkbox panel, rather than
  // a flat checkbox grid, since the vocabulary (lib/schema.mjs's CATEGORIES)
  // has grown enough that all-checkboxes-always-visible ate too much of the
  // modal. The checkboxes underneath are unchanged; this only changes how
  // they're revealed and how the selection is summarized.
  const catDropdown = document.getElementById('np-cat-dropdown');
  const catTrigger = document.getElementById('np-cat-trigger');
  const catTriggerText = document.getElementById('np-cat-trigger-text');
  const catPanel = document.getElementById('np-cat-panel');
  const catCheckboxes = [...catPanel.querySelectorAll('input[name=categories]')];

  function updateCatTriggerText() {
    const checked = catCheckboxes.filter(c => c.checked);
    catTriggerText.textContent = checked.length === 0
      ? 'Select categories…'
      : checked.map(c => categoryLabel(c.value)).join(', ');
  }

  function openCatPanel() {
    catPanel.hidden = false;
    catTrigger.setAttribute('aria-expanded', 'true');
  }

  function closeCatPanel() {
    catPanel.hidden = true;
    catTrigger.setAttribute('aria-expanded', 'false');
  }

  catTrigger.addEventListener('click', () => {
    if (catPanel.hidden) openCatPanel(); else closeCatPanel();
  });
  catCheckboxes.forEach(c => c.addEventListener('change', updateCatTriggerText));
  document.addEventListener('click', (e) => {
    if (!catPanel.hidden && !catDropdown.contains(e.target)) closeCatPanel();
  });
  catDropdown.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !catPanel.hidden) { e.stopPropagation(); closeCatPanel(); catTrigger.focus(); }
  });

  // Cached from the last isAdmin() check (open()) so resetForm() - also
  // called by "Create another", which doesn't re-check - can re-apply it
  // without another round trip. Re-checked fresh on every open() itself,
  // since admin status could change between sessions.
  let isAdminUser = false;

  function applyAdminState() {
    // Editing never changes curation status - only the admin-authored
    // "make this a default prompt" checkbox (createCuratedPrompt) can set
    // is_curated in the first place, and that's a create-time-only choice.
    adminRow.hidden = !isAdminUser || editingId !== null;
    // Defaults to checked for an admin - they're far more often making a
    // default prompt than a personal one from this modal - but stays a
    // plain checkbox, so unchecking it for a one-off personal prompt still
    // works.
    adminCheckbox.checked = isAdminUser && editingId === null;
  }

  function resetForm() {
    form.reset();
    editingId = null;
    messageEl.hidden = true;
    form.hidden = false;
    successEl.hidden = true;
    closeCatPanel();
    updateCatTriggerText();
    applyAdminState();
    setModalMode(false);
  }

  function open() {
    resetForm();
    isAdmin().then(admin => { isAdminUser = admin; applyAdminState(); });
    backdrop.classList.add('is-open');
    form.title.focus();
  }

  // Triggered by 'prompt:edit-request' for a prompt the caller owns (see
  // module header - forking, if needed, already happened before this fires)
  // - prefills every field from the existing row instead of leaving them
  // blank, and routes the submit handler below to updatePrompt() instead of
  // create. Slug is intentionally left alone (see module header).
  function openForEdit(prompt) {
    resetForm();
    editingId = prompt.id;
    applyAdminState();
    setModalMode(true);
    form.title.value = prompt.title;
    form.purpose.value = prompt.purpose || '';
    form.body.value = prompt.body;
    form.notes.value = prompt.notes || '';
    const cats = new Set(prompt.categories || []);
    catCheckboxes.forEach(c => { c.checked = cats.has(c.value); });
    updateCatTriggerText();
    backdrop.classList.add('is-open');
    form.title.focus();
  }

  function close() {
    backdrop.classList.remove('is-open');
  }

  btn.addEventListener('click', open);
  document.getElementById('np-close').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', (e) => {
    if (!backdrop.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    messageEl.hidden = true;

    const categories = catCheckboxes.filter(c => c.checked).map(c => c.value);
    if (categories.length === 0) {
      messageEl.textContent = 'Choose at least one category.';
      messageEl.setAttribute('role', 'alert');
      messageEl.hidden = false;
      openCatPanel();
      return;
    }

    const fields = {
      title: form.title.value.trim(),
      categories,
      purpose: form.purpose.value.trim(),
      body: form.body.value,
      notes: form.notes.value.trim() || null
    };

    // Only actually curated if the checkbox is both checked and visible -
    // a hidden (non-admin) row's checkbox can't be checked through the UI,
    // but this guards against a stale DOM state either way.
    const makeCurated = adminCheckbox.checked && !adminRow.hidden;

    submitBtn.disabled = true;
    try {
      if (editingId) {
        await updatePrompt(editingId, fields);
        successMessageEl.textContent = 'Prompt updated.';
      } else {
        await createWithUniqueSlug(fields, makeCurated ? createCuratedPrompt : createPrompt);
        successMessageEl.textContent = makeCurated
          ? 'Default prompt created as an unpublished draft — only visible to you until you publish it. Publish it from the Admin page.'
          : 'Prompt created.';
      }
      form.hidden = true;
      successEl.hidden = false;
      // Lets whichever page is open (Home/Category/Search) refresh its
      // merged list instead of showing stale rows until reload.
      document.dispatchEvent(new CustomEvent('personalization:changed'));
    } catch (err) {
      messageEl.textContent = err.message || 'Something went wrong.';
      messageEl.setAttribute('role', 'alert');
      messageEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.getElementById('np-create-another').addEventListener('click', resetForm);
  document.getElementById('np-done').addEventListener('click', close);

  document.addEventListener('prompt:edit-request', (e) => openForEdit(e.detail));
}

document.addEventListener('DOMContentLoaded', init);
