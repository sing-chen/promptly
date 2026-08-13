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
// ownership resolution step any more, and nothing forks on edit. Slug is kept
// stable across an edit, unlike a fresh create.
//
// For an admin, edit mode also exposes two catalog-only choices: the
// publish-to-everyone checkbox (which promotes a personal prompt into the
// catalog as a draft, or demotes one back out) and, for an already-published
// catalog prompt, the notify override - see BUILD_BRIEF_v5.md §5.3 and §6.2.
import {
  createPrompt, createCuratedPrompt, updatePrompt, isAdmin,
  promoteToCatalog, demoteFromCatalog, setLatestVersionNotifiable,
  loadMyCategories
} from './db.js';
import { categoryName, catColorVars, esc } from './lib/render.mjs';
import { confirmDialog } from './confirmDialog.js';

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
  const notifyRow = document.getElementById('np-notify-row');
  const notifyCheckbox = document.getElementById('np-notify-checkbox');
  const notifyHint = document.getElementById('np-notify-hint');
  const adminHint = document.getElementById('np-admin-hint');
  const titleEl = document.getElementById('np-title');
  const createAnotherBtn = document.getElementById('np-create-another');

  // Set by openForEdit(), cleared by resetForm() - the one piece of state
  // that distinguishes "editing prompt X" from a fresh create.
  let editingId = null;
  // The row being edited, kept so submit can tell what actually changed
  // (which drives the notify default) and whether curation status is being
  // flipped. Null for a fresh create.
  let editingPrompt = null;

  function setModalMode(editing) {
    titleEl.textContent = editing ? 'Edit Prompt' : 'New Prompt';
    submitBtn.textContent = editing ? 'Save changes' : 'Create prompt';
    createAnotherBtn.hidden = editing;
  }

  // Category dropdown - a button that toggles a checkbox panel, rather than
  // a flat checkbox grid, which stops the list eating the modal now that a
  // user can create as many categories as they want.
  //
  // The panel is populated at runtime from the caller's own categories
  // (BUILD_BRIEF_v6.md §3). It used to be server-rendered into the static
  // markup from lib/schema.mjs's CATEGORIES, which can't work any more: this
  // one modal is baked into every static page, and the vocabulary now differs
  // per user. Checkbox `value` is a category id rather than a slug, since
  // that is what prompt_categories joins on and it survives a rename.
  const catDropdown = document.getElementById('np-cat-dropdown');
  const catTrigger = document.getElementById('np-cat-trigger');
  const catTriggerText = document.getElementById('np-cat-trigger-text');
  const catPanel = document.getElementById('np-cat-panel');
  let catCheckboxes = [];
  let myCategories = [];

  // Loaded once per page and then reused: the modal is opened repeatedly and
  // the list only changes from /categories/, which reloads the page's data
  // through the same personalization:changed event everything else uses.
  async function ensureCategoriesLoaded() {
    if (myCategories.length) return;
    try {
      myCategories = await loadMyCategories();
    } catch (err) {
      console.warn('Could not load categories', err);
      return;
    }
    catPanel.innerHTML = myCategories.map(c => `
            <label class="np-cat-check">
              <input type="checkbox" name="categories" value="${esc(c.id)}" data-slug="${esc(c.slug)}">
              <span class="np-cat-swatch" style="${catColorVars(c)}" aria-hidden="true"></span>
              ${esc(categoryName(c))}
            </label>`).join('');
    catCheckboxes = [...catPanel.querySelectorAll('input[name=categories]')];
  }

  document.addEventListener('categories:changed', () => {
    myCategories = [];
    ensureCategoriesLoaded();
  });

  function updateCatTriggerText() {
    const checked = catCheckboxes.filter(c => c.checked);
    catTriggerText.textContent = checked.length === 0
      ? 'Select categories…'
      : checked.map(c => c.parentElement.textContent.trim()).join(', ');
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
  // Delegated, not bound per checkbox: the checkboxes don't exist at init any
  // more - ensureCategoriesLoaded() creates them - and rebinding after every
  // repopulate would be one more thing to forget.
  catPanel.addEventListener('change', (e) => {
    if (e.target.name === 'categories') updateCatTriggerText();
  });
  // Keep the notify default in step with what's actually been changed so far,
  // so the checkbox reflects the real classification at the moment of saving
  // rather than whatever it was when the modal opened.
  ['title', 'purpose', 'body'].forEach(name => {
    form[name].addEventListener('input', syncNotifyDefault);
  });
  notifyCheckbox.addEventListener('change', () => { notifyCheckbox.dataset.touched = '1'; });
  document.addEventListener('click', (e) => {
    if (!catPanel.hidden && !catDropdown.contains(e.target)) closeCatPanel();
  });
  catDropdown.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !catPanel.hidden) { e.stopPropagation(); closeCatPanel(); catTrigger.focus(); }
  });

  // Resolved once at init and re-checked whenever the modal opens, by either
  // entry point. It must be resolved for Edit too, not just create: the
  // admin-only curation checkbox is hidden while this is false, and a hidden
  // checkbox reads as unchecked - which submit would otherwise interpret as
  // "the admin chose to remove this from the catalog".
  let isAdminUser = false;

  function refreshAdminState() {
    return isAdmin().then(admin => { isAdminUser = admin; applyAdminState(); });
  }

  // The same checkbox means four different things depending on what's being
  // edited, and only one of them is "adds this to the catalog". Describing
  // the add case while the user is editing something already published puts
  // the explanation on the wrong side of the decision - the live consequence
  // there is removal, not addition.
  function adminHintText() {
    if (!editingPrompt) {
      return 'Adds this to the catalog as a draft — publish it from the Admin page to copy it into every user’s library. Leave unticked to keep it personal to you.';
    }
    if (!editingPrompt.is_curated) {
      return 'Promotes this into the catalog as a draft — publish it from the Admin page to copy it into every user’s library. Leave unticked to keep it personal to you.';
    }
    if (!editingPrompt.published) {
      return 'This is a catalog draft, visible only to you until you publish it from the Admin page. Unticking removes it from the catalog and makes it a personal prompt again.';
    }
    return 'This is published to everyone. Unticking unpublishes it and makes it personal — anyone who already has a copy keeps it, but nobody new will receive it.';
  }

  function applyAdminState() {
    // Shown on create *and* edit. On edit it's what promotes a personal
    // prompt into the catalog, or demotes one back out - BUILD_BRIEF_v5.md
    // §5.3, "start private, decide later". RLS already permits both for an
    // admin; this is the missing UI, not a new capability.
    adminRow.hidden = !isAdminUser;
    adminCheckbox.checked = isAdminUser && (editingPrompt ? Boolean(editingPrompt.is_curated) : true);
    adminHint.textContent = adminHintText();
    // Only the published case is destructive, so only it gets the warning
    // treatment - colouring all four would make the styling meaningless.
    adminHint.classList.toggle(
      'np-admin-hint-warn',
      Boolean(editingPrompt?.is_curated && editingPrompt?.published)
    );

    // The notify override (§6.2) only means anything for a catalog prompt
    // that's already published - nothing else has anyone holding copies to
    // notify. Its default tracks the field classifier live (see
    // syncNotifyDefault) until the admin touches it themselves.
    const editingPublished = Boolean(editingPrompt?.is_curated && editingPrompt?.published);
    notifyRow.hidden = !isAdminUser || !editingPublished;
    if (!notifyRow.hidden) {
      notifyCheckbox.dataset.touched = '';
      syncNotifyDefault();
    }
  }

  // Significant fields (title/purpose/body) notify; notes/categories alone
  // ride along with the next significant change instead. Mirrors
  // write_catalog_version()'s classification in 0004_owned_copies.sql - the
  // two must agree, or the checkbox would misreport what the DB just did.
  function significantChange() {
    if (!editingPrompt) return false;
    return form.title.value.trim() !== (editingPrompt.title || '')
      || form.purpose.value.trim() !== (editingPrompt.purpose || '')
      || form.body.value !== editingPrompt.body;
  }

  function syncNotifyDefault() {
    if (notifyRow.hidden) return;
    const auto = significantChange();
    if (!notifyCheckbox.dataset.touched) notifyCheckbox.checked = auto;
    notifyHint.textContent = auto
      ? 'The prompt text changed, so everyone holding a copy will be told. Untick for a minor correction.'
      : 'Only notes or categories changed, so this stays quiet. Tick to tell everyone anyway.';
  }

  function resetForm() {
    form.reset();
    editingId = null;
    editingPrompt = null;
    messageEl.hidden = true;
    form.hidden = false;
    successEl.hidden = true;
    closeCatPanel();
    updateCatTriggerText();
    applyAdminState();
    setModalMode(false);
  }

  async function open() {
    resetForm();
    refreshAdminState();
    backdrop.classList.add('is-open');
    form.title.focus();
    // After the modal is already on screen: the checkbox panel is collapsed
    // behind its trigger, so it can fill in a moment later without anything
    // visibly reflowing - and the user isn't held at a blank modal waiting
    // on a round trip they may not even need.
    await ensureCategoriesLoaded();
    updateCatTriggerText();
  }

  // Triggered by 'prompt:edit-request' for a prompt the caller owns (see
  // module header - forking, if needed, already happened before this fires)
  // - prefills every field from the existing row instead of leaving them
  // blank, and routes the submit handler below to updatePrompt() instead of
  // create. Slug is intentionally left alone (see module header).
  async function openForEdit(prompt) {
    resetForm();
    editingId = prompt.id;
    editingPrompt = prompt;
    applyAdminState();
    refreshAdminState(); // may resolve after paint; applyAdminState reruns then
    setModalMode(true);
    form.title.value = prompt.title;
    form.purpose.value = prompt.purpose || '';
    form.body.value = prompt.body;
    form.notes.value = prompt.notes || '';
    // Awaited before ticking boxes, unlike open(): there is nothing to tick
    // until the panel exists. A prompt's categories are objects now, so this
    // matches on id.
    await ensureCategoriesLoaded();
    const cats = new Set((prompt.categories || []).map(c => c.id));
    catCheckboxes.forEach(c => { c.checked = cats.has(c.value); });
    updateCatTriggerText();
    syncNotifyDefault();
    backdrop.classList.add('is-open');
    form.title.focus();
  }

  function close() {
    backdrop.classList.remove('is-open');
  }

  btn.addEventListener('click', open);
  // Resolve up front so the first Edit click doesn't race the check.
  refreshAdminState();
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
    // You can only change what you were shown. If the curation control isn't
    // visible - non-admin, or admin status hadn't resolved yet - curation
    // status must carry over untouched rather than being read off a hidden,
    // and therefore unchecked, checkbox. Without this, opening Edit on a
    // published catalog prompt before isAdmin() resolved offered to
    // unpublish it.
    const canChooseCuration = isAdminUser && !adminRow.hidden;
    const makeCurated = canChooseCuration
      ? adminCheckbox.checked
      : Boolean(editingPrompt?.is_curated);

    // Demoting something that's already published pulls it from the catalog
    // for everyone who hasn't been given it yet - worth a confirmation, since
    // it's the inverse of an action that's otherwise irreversible.
    if (editingPrompt?.published && !makeCurated) {
      const ok = await confirmDialog({
        title: 'Remove from the catalog?',
        message: `"${editingPrompt.title}" will be unpublished and become a personal prompt. Users who already have a copy keep it — copies are independent — but nobody new will receive it.`,
        confirmLabel: 'Remove from catalog'
      });
      if (!ok) return;
    }

    submitBtn.disabled = true;
    try {
      if (editingId) {
        const wasCurated = Boolean(editingPrompt?.is_curated);
        const wantsNotify = notifyCheckbox.checked;
        const autoNotify = significantChange();

        await updatePrompt(editingId, fields);

        // Curation flips are separate calls: promoteToCatalog() lands it as a
        // draft rather than publishing (BUILD_BRIEF_v5.md §5.3), keeping the
        // reversible step apart from the irreversible one.
        if (!wasCurated && makeCurated) await promoteToCatalog(editingId);
        else if (wasCurated && !makeCurated) await demoteFromCatalog(editingId);

        // The DB trigger already classified this edit by field; only correct
        // it when the admin overrode that choice. Skipped entirely unless the
        // row was a published catalog prompt, since nothing else writes a
        // version worth flagging.
        if (!notifyRow.hidden && wantsNotify !== autoNotify) {
          await setLatestVersionNotifiable(editingId, wantsNotify);
        }

        successMessageEl.textContent = !wasCurated && makeCurated
          ? 'Prompt updated and added to the catalog as an unpublished draft — publish it from the Admin page to send it to everyone.'
          : wasCurated && !makeCurated
            ? 'Prompt updated and removed from the catalog — it’s personal to you now.'
            : 'Prompt updated.';
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
