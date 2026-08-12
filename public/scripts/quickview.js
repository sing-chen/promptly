// §9b quick-view modal - opens the full detail-page content in a dialog when
// a table row is clicked, so browsing many prompts doesn't mean round-tripping
// through /prompt/[slug]/ for every candidate. Shared across every page that
// renders a prompt table (Category, Tag, Search, Favorites) - the dialog
// markup itself (renderQuickViewModal in lib/render.mjs) is a single shell
// reused by whichever table on the page is currently active.
import { renderCatBadges, esc, fmtDate } from '/scripts/lib/render.mjs';
import { isFavorite, toggleFavorite } from './favorites.js';
import { deletePrompt } from './db.js';
import { resolveOwnPromptForEdit } from './personalizeData.js';

function readEmbedded(gridId) {
  const el = document.getElementById(`${gridId}-data`);
  if (!el) return [];
  try { return JSON.parse(el.textContent); } catch { return []; }
}

function seqLabel(sequenceSlug) {
  return sequenceSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Resolves sequence-stepper info for an item that didn't come with a
// precomputed `.seq` (the search page's live Fuse matches, which are flat
// index records) - mirrors resolveSeqInfo() in lib/render.mjs but works off
// the flat prompt list the client already has instead of data.sequences.
function resolveSeqInfoFlat(item, allPrompts, sequenceTotals) {
  if (!item.sequence || !allPrompts) return null;
  const steps = allPrompts
    .filter(p => p.sequence === item.sequence)
    .sort((a, b) => (a.sequence_step ?? 0) - (b.sequence_step ?? 0));
  const idx = steps.findIndex(s => s.slug === item.slug);
  const prev = steps[idx - 1];
  const next = steps[idx + 1];
  return {
    label: seqLabel(item.sequence),
    step: item.sequence_step,
    total: sequenceTotals ? sequenceTotals[item.sequence] : steps.length,
    prev: prev ? { slug: prev.slug, title: prev.title } : null,
    next: next ? { slug: next.slug, title: next.title } : null
  };
}

export function initQuickView(gridId, opts = {}) {
  const tbody = document.getElementById(gridId);
  const backdrop = document.getElementById('qv-backdrop');
  if (!tbody || !backdrop) return { update() {} };

  let items = opts.data || readEmbedded(gridId);
  let sequenceTotals = opts.sequenceTotals || null;
  let allPrompts = opts.allPrompts || null;
  // Set (and kept current via update()'s second argument) once a page's
  // merged-catalog personalization resolves - the full object
  // personalizeData.js's getPersonalization() returns, not just pieces of
  // it, since resolveOwnPromptForEdit() below needs `.overrides` too.
  // `.byId` covers every prompt the caller can see, including a default
  // they've archived by forking it, which `items`/`allPrompts` deliberately
  // exclude - that's what lets "View original" resolve a source_prompt_id.
  let personalization = opts.personalization || null;

  // The catalog-wide search index, lazily fetched only the first time a
  // sequence Back/Next/Start/End target isn't among the prompts already on
  // this page (e.g. a chained prompt whose category isn't the one being
  // browsed). Lets sequence navigation stay inside the modal everywhere,
  // not just on pages that happen to already list every step.
  let indexFetch = null;
  function ensureIndex() {
    if (allPrompts) return Promise.resolve(allPrompts);
    if (!indexFetch) {
      indexFetch = fetch('/search-index.json').then(r => r.json()).then(idx => {
        allPrompts = idx.prompts;
        if (!sequenceTotals) sequenceTotals = idx.sequenceTotals;
        return allPrompts;
      }).catch(() => null);
    }
    return indexFetch;
  }

  const els = {
    title: document.getElementById('qv-title'),
    catBadges: document.getElementById('qv-cat-badges'),
    purpose: document.getElementById('qv-purpose'),
    body: document.getElementById('qv-body-text'),
    notes: document.getElementById('qv-notes'),
    added: document.getElementById('qv-added'),
    modified: document.getElementById('qv-modified'),
    modifiedRow: document.getElementById('qv-modified-row'),
    seqBlock: document.getElementById('qv-seq-block'),
    seqCurrent: document.getElementById('qv-seq-current'),
    seqNav: document.getElementById('qv-seq-nav'),
    position: document.getElementById('qv-position'),
    prev: document.getElementById('qv-prev'),
    next: document.getElementById('qv-next'),
    close: document.getElementById('qv-close'),
    fav: document.getElementById('qv-fav'),
    copy: document.getElementById('qv-copy'),
    edit: document.getElementById('qv-edit'),
    delete: document.getElementById('qv-delete'),
    openFull: document.getElementById('qv-open-full'),
    viewOriginal: document.getElementById('qv-view-original')
  };

  let currentSlug = null;
  let selectedSlug = null;
  let currentItem = null;

  function visibleSlugsInOrder() {
    return Array.from(tbody.querySelectorAll('[data-slug]:not([hidden])')).map(tr => tr.dataset.slug);
  }

  function markSelectedRow() {
    tbody.querySelectorAll('[data-slug]').forEach(tr => {
      tr.classList.toggle('is-selected', tr.dataset.slug === selectedSlug);
    });
  }

  function syncFavButton(slug) {
    const active = isFavorite(slug);
    els.fav.classList.toggle('is-active', active);
    els.fav.setAttribute('aria-pressed', String(active));
  }

  function populate(item) {
    currentItem = item;
    els.title.textContent = item.title;
    els.catBadges.innerHTML = renderCatBadges(item.categories);
    els.purpose.textContent = item.purpose || '';
    const highlighted = esc(item.body).replace(/\{\{[^}]+\}\}/g, m => `<span class="var">${m}</span>`);
    els.body.innerHTML = highlighted;
    els.notes.textContent = item.notes || '';
    els.added.textContent = fmtDate(item.added);
    if (item.updated) {
      els.modified.textContent = fmtDate(item.updated);
      els.modifiedRow.hidden = false;
    } else {
      els.modifiedRow.hidden = true;
    }

    const seq = item.seq !== undefined && item.seq !== null ? item.seq : resolveSeqInfoFlat(item, allPrompts, sequenceTotals);
    if (seq) {
      els.seqBlock.hidden = false;
      els.seqCurrent.textContent = `${seq.label} · Step ${seq.step} of ${seq.total}`;
      els.seqNav.innerHTML = `
        ${seq.prev ? `<a href="/prompt/${seq.prev.slug}/">← Back</a>` : `<span style="color:var(--ink-faint);">← Start</span>`}
        ${seq.next ? `<a class="next" href="/prompt/${seq.next.slug}/">Next →</a>` : `<span style="color:var(--ink-faint);">End →</span>`}`;
    } else {
      els.seqBlock.hidden = true;
    }

    els.fav.setAttribute('data-fav-slug', item.slug);
    syncFavButton(item.slug);
    // Every build-time item has a real /prompt/[slug]/ page (undefined
    // is_curated/published - see toQuickViewItem in lib/render.mjs). A
    // personalized item that's explicitly is_curated=false or published=false
    // (a personal prompt, an unpublished draft, or a fork) has no static
    // page to open, so hide the link rather than send someone to a 404.
    const hasStaticPage = item.is_curated !== false && item.published !== false;
    els.openFull.hidden = !hasStaticPage;
    if (hasStaticPage) els.openFull.href = `/prompt/${item.slug}/`;

    // Edit is available on anything in a personalized (merged-catalog) view,
    // regardless of ownership - clicking it on a default is what forks it
    // (see els.edit's click handler below). Delete only for a row the caller
    // actually owns. "View original" only for a fork whose source default is
    // still resolvable via `byId` (it always should be - every published
    // default stays in `byId` even after being forked/archived).
    const isOwn = Boolean(personalization) && item.user_id === personalization.userId && !item.is_curated;
    els.edit.hidden = !personalization;
    els.delete.hidden = !isOwn;
    const original = personalization && item.source_prompt_id ? personalization.byId.get(item.source_prompt_id) : null;
    els.viewOriginal.hidden = !original;
    els.viewOriginal.dataset.targetId = original ? original.id : '';

    // A sequence neighbor opened via fallback fetch (see ensureIndex) may not
    // be one of the rows on this page at all - stepping through "the list"
    // doesn't mean anything for it, so the counter/chevrons go inert rather
    // than showing a misleading "0 / N".
    const order = visibleSlugsInOrder();
    const pos = order.indexOf(item.slug);
    if (pos === -1) {
      els.position.textContent = '';
      els.prev.disabled = true;
      els.next.disabled = true;
    } else {
      els.position.textContent = `${pos + 1} / ${order.length}`;
      els.prev.disabled = pos <= 0;
      els.next.disabled = pos >= order.length - 1;
    }

    modal_scrollTop();
  }

  function modal_scrollTop() {
    document.getElementById('qv-modal').scrollTop = 0;
  }

  function findItem(slug) {
    return items.find(p => p.slug === slug) || allPrompts?.find(p => p.slug === slug);
  }

  // Shared by open() (below) and "View original" - the latter shows an
  // archived default that isn't in `items`/`allPrompts` (by design, see
  // `byId` above) and has no row of its own, so it deliberately leaves
  // `selectedSlug` untouched: it's a side-trip from the currently selected
  // row, not a change of which row that is.
  function showItem(item) {
    currentSlug = item.slug;
    populate(item);
    markSelectedRow();
    backdrop.classList.add('is-open');
  }

  // Async because a sequence neighbor might not be among the prompts this
  // page already has - in that case ensureIndex() fetches the catalog-wide
  // index once before opening. Callers don't need to await this; it's safe
  // to fire-and-forget from a click handler.
  async function open(slug) {
    let item = findItem(slug);
    if (!item) item = (await ensureIndex())?.find(p => p.slug === slug);
    if (!item) return;
    selectedSlug = slug;
    showItem(item);
  }

  function step(delta) {
    if (currentSlug === null) return;
    const order = visibleSlugsInOrder();
    const pos = order.indexOf(currentSlug);
    const nextPos = pos + delta;
    if (nextPos < 0 || nextPos >= order.length) return;
    open(order[nextPos]);
  }

  function close() {
    backdrop.classList.remove('is-open');
    currentSlug = null;
    // selectedSlug intentionally persists - row stays highlighted for orientation
  }

  tbody.addEventListener('click', (e) => {
    const tr = e.target.closest('[data-slug]');
    if (!tr || e.target.closest('button')) return;
    // A card can be a real <a href="/prompt/…/"> (e.g. the sequence rail,
    // for no-JS/SEO) rather than a <tr> - stop the navigation so the click
    // opens the modal instead. A no-op on a <tr>, which has no default
    // navigation to prevent.
    e.preventDefault();
    open(tr.dataset.slug);
  });
  tbody.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const tr = e.target.closest('[data-slug]');
    if (!tr) return;
    e.preventDefault();
    open(tr.dataset.slug);
  });

  els.close.addEventListener('click', close);
  els.prev.addEventListener('click', () => step(-1));
  els.next.addEventListener('click', () => step(1));
  // Sequence Back/Next inside the modal stay inside the modal - only a real
  // <a> so it still works (as a normal page navigation) if JS fails or this
  // markup is ever read outside quickview.js's control.
  els.seqNav.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="/prompt/"]');
    if (!a) return;
    e.preventDefault();
    const slug = a.getAttribute('href').replace(/^\/prompt\//, '').replace(/\/$/, '');
    open(slug);
  });
  els.fav.addEventListener('click', () => {
    if (!currentSlug) return;
    toggleFavorite(currentSlug);
    syncFavButton(currentSlug);
  });
  els.copy.addEventListener('click', async () => {
    if (!currentItem) return;
    try { await navigator.clipboard.writeText(currentItem.body); } catch { /* clipboard unavailable */ }
    const original = els.copy.innerHTML;
    els.copy.textContent = 'Copied';
    setTimeout(() => { els.copy.innerHTML = original; }, 2000);
  });
  els.edit.addEventListener('click', async () => {
    if (!currentItem || !personalization) return;
    els.edit.disabled = true;
    try {
      const target = await resolveOwnPromptForEdit(personalization, currentItem);
      document.dispatchEvent(new CustomEvent('prompt:edit-request', { detail: target }));
    } catch (err) {
      alert(err.message || 'Something went wrong.');
    } finally {
      els.edit.disabled = false;
    }
  });
  els.delete.addEventListener('click', async () => {
    if (!currentItem) return;
    if (!confirm(`Delete "${currentItem.title}"? This can't be undone.`)) return;
    els.delete.disabled = true;
    try {
      await deletePrompt(currentItem.id);
      document.dispatchEvent(new CustomEvent('personalization:changed'));
      close();
    } catch (err) {
      alert(err.message || 'Something went wrong.');
    } finally {
      els.delete.disabled = false;
    }
  });
  els.viewOriginal.addEventListener('click', (e) => {
    e.preventDefault();
    const original = personalization?.byId.get(els.viewOriginal.dataset.targetId);
    if (original) showItem(original);
  });
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', (e) => {
    if (!backdrop.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
  });

  // Any favorite toggled elsewhere (a row's own star, another quick-view
  // session) should be reflected here too if it's the open prompt.
  document.addEventListener('favorites:changed', () => {
    if (currentSlug) syncFavButton(currentSlug);
  });

  return {
    update(newItems, newPersonalization) {
      items = newItems;
      if (newPersonalization !== undefined) personalization = newPersonalization;
      if (selectedSlug) markSelectedRow();
    },
    // Exposed so a card-grid view (viewToggle.js, search.js), which isn't
    // the tbody this instance is bound to, can still open the same modal on
    // a card click - see quickViewRegistry.js.
    open
  };
}
