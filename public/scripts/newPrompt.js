// New Prompt modal behavior (BUILD_BRIEF_v4.md §6, supabase/README.md "Next
// steps") - wires the sidebar's #new-prompt-btn (rendered hidden by
// lib/render.mjs, toggled visible by auth.js for any signed-in user) to the
// modal shell renderNewPromptModal() renders into every page. No /library/
// view exists yet to send the user to on success, so a successful create
// just shows an inline message inside the modal instead of redirecting.
import { createPrompt, createCuratedPrompt, isAdmin } from './db.js';
import { categoryLabel } from './lib/render.mjs';

function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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

  // Auto-fill the slug from the title until the user edits the slug field
  // directly - mirrors the common "auto-slug" pattern without ever
  // overwriting something the user typed on purpose.
  let slugTouched = false;
  form.slug.addEventListener('input', () => { slugTouched = true; });
  form.title.addEventListener('input', () => {
    if (!slugTouched) form.slug.value = slugify(form.title.value);
  });

  function resetForm() {
    form.reset();
    slugTouched = false;
    messageEl.hidden = true;
    form.hidden = false;
    successEl.hidden = true;
    closeCatPanel();
    updateCatTriggerText();
  }

  function open() {
    resetForm();
    // Checked fresh every open rather than cached - admin status could
    // change between sessions and this is a cheap single-row read (db.js's
    // isAdmin()).
    isAdmin().then(admin => { adminRow.hidden = !admin; });
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
      slug: form.slug.value.trim(),
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
      await (makeCurated ? createCuratedPrompt(fields) : createPrompt(fields));
      form.hidden = true;
      successMessageEl.textContent = makeCurated
        ? 'Default prompt created as an unpublished draft — only visible to you until you publish it. Publish it from the Admin page.'
        : 'Prompt created.';
      successEl.hidden = false;
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
}

document.addEventListener('DOMContentLoaded', init);
