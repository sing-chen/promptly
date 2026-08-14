// Fills the "In collections" row on a static prompt page (§9aq).
//
// The page itself is generated at build time from the catalog, which cannot
// know anything about collections - they are per-account and user-generated.
// So the row ships hidden and empty, and this fills it if there is a session
// and the prompt is in at least one collection.
//
// The modal's copy of this row is filled by quickview.js instead, from the
// same helper. Two call sites rather than one shared component because the two
// contexts differ in everything except the answer: the modal already holds a
// personalization object and re-renders per prompt, while this page has one
// prompt and has to go and fetch.
import { getPersonalization, collectionsForPrompt } from './personalizeData.js';
import { esc } from './lib/render.mjs';

async function init() {
  const row = document.getElementById('pd-collections-row');
  if (!row) return;

  const pers = await getPersonalization();
  if (!pers) return; // signed out - the row stays hidden, as rendered

  // Matched by slug, not id. The static page is the CATALOG's copy of this
  // prompt; a signed-in user holds their own row with its own id (the
  // owned-copies model), so the id in the URL-shaped world and the id in their
  // library are different values for the same prompt. Slug is what survives
  // the copy - which is also why the export uses it (§9ad).
  const slug = location.pathname.split('/').filter(Boolean).pop();
  const mine = pers.prompts.find(p => p.slug === slug);
  if (!mine) return;

  const collections = collectionsForPrompt(pers, mine.id);
  if (!collections.length) return; // nothing to say; leave it hidden

  document.getElementById('pd-collections-list').innerHTML = collections
    .map(c => `<a class="pd-collection-chip" href="/by-collection/?collection=${encodeURIComponent(c.slug)}">${esc(c.title)}</a>`)
    .join('');
  row.hidden = false;
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => console.error('Could not load collections for this prompt', err));
});
