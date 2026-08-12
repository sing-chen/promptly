// New Collection modal behavior - wires the sidebar's #new-collection-btn
// (hidden until signed in, toggled by auth.js) to the modal shell
// renderNewCollectionModal() renders into every page. Mirrors
// newPrompt.js's slug handling: no slug field in the form, generated from
// the title at submit time with the same dedupe-on-collision approach
// (collections.slug is also unique(user_id, slug) - see db.js).
import { createCollection } from './db.js';

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

function init() {
  const btn = document.getElementById('new-collection-btn');
  const backdrop = document.getElementById('nc-backdrop');
  if (!btn || !backdrop) return;

  const form = document.getElementById('nc-form');
  const successEl = document.getElementById('nc-success');
  const messageEl = document.getElementById('nc-message');
  const submitBtn = document.getElementById('nc-submit-btn');

  function resetForm() {
    form.reset();
    messageEl.hidden = true;
    form.hidden = false;
    successEl.hidden = true;
  }

  function open() {
    resetForm();
    backdrop.classList.add('is-open');
    form.title.focus();
  }

  function close() {
    backdrop.classList.remove('is-open');
  }

  btn.addEventListener('click', open);
  document.getElementById('nc-close').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', (e) => {
    if (!backdrop.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    messageEl.hidden = true;

    const fields = {
      title: form.title.value.trim(),
      description: form.description.value.trim() || null
    };

    submitBtn.disabled = true;
    try {
      await createWithUniqueSlug(fields);
      form.hidden = true;
      successEl.hidden = false;
    } catch (err) {
      messageEl.textContent = err.message || 'Something went wrong.';
      messageEl.setAttribute('role', 'alert');
      messageEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.getElementById('nc-create-another').addEventListener('click', resetForm);
  document.getElementById('nc-done').addEventListener('click', close);
}

document.addEventListener('DOMContentLoaded', init);
