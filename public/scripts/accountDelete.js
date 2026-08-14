// /account/ — export your library, and close your account.
//
// Two features in one module because they are one flow: the deletion dialog
// offers the export inline, and both call the same engine (lib/export.mjs) so
// the file you get from "Export" and the file you get on the way out are
// byte-identical for identical data. Keeping them apart would have meant two
// call sites that agree today and drift later.
//
// The export is entirely client-side: it assembles a file out of reads db.js
// already makes, and sends nothing anywhere. That is why adding it needed no
// change to the privacy notice - no new personal data is collected or
// transmitted by pressing these buttons.
import { supabase } from './supabaseClient.js';
import {
  loadMyPrompts, loadMyCategories, loadCollections, loadFavorites,
  deleteMyAccount, isAdmin
} from './db.js';
import { buildExportJson, buildExportMarkdown, exportSummary } from './lib/export.mjs';

// Fetched once per page view and reused. Not cached longer than that: the
// counts shown in the deletion dialog have to match what is actually there,
// and a stale count in a dialog that says "this cannot be undone" is exactly
// the wrong place to be approximate.
let cached = null;

async function loadExportData() {
  if (cached) return cached;
  const { data: { user } } = await supabase.auth.getUser();
  const [prompts, categories, collections, favorites] = await Promise.all([
    loadMyPrompts(), loadMyCategories(), loadCollections(), loadFavorites()
  ]);
  cached = {
    prompts, categories, collections,
    favoriteIds: favorites,
    account: { email: user?.email, first_name: user?.user_metadata?.first_name }
  };
  return cached;
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Deferred rather than revoked immediately after click(). The old
  // favourites export revoked synchronously, which happens to work in the
  // browsers it was tried in but is a race: some browsers read the blob after
  // the click handler returns, and a revoked URL there produces a silently
  // empty or failed download. A tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

async function exportAs(format, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Preparing…';
  try {
    const data = await loadExportData();
    if (format === 'json') {
      download(`promptly-export-${stamp()}.json`, buildExportJson(data), 'application/json');
    } else {
      download(`promptly-export-${stamp()}.md`, buildExportMarkdown(data), 'text/markdown');
    }
  } catch (err) {
    alert(err.message || 'Could not build the export.');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ── the deletion dialog ──────────────────────────────────────────────

// Set once the account is actually gone. After that point every exit from
// the dialog has to navigate: the page behind it is a signed-in account page
// for an account that no longer exists, so dismissing the dialog and being
// returned to it would be the worst possible last screen.
let finished = false;

function showPane(name) {
  for (const pane of ['explain', 'confirm', 'done', 'admin']) {
    document.getElementById(`del-step-${pane}`).hidden = pane !== name;
  }
}

function leave() {
  // replace(), not assign(): Back must not return to the account page of a
  // deleted account.
  window.location.replace('/');
}

function closeDialog() {
  if (finished) { leave(); return; }
  document.getElementById('del-backdrop')?.classList.remove('is-open');
}

function openDialog(pane) {
  const backdrop = document.getElementById('del-backdrop');
  if (!backdrop) return;
  showPane(pane);
  backdrop.classList.add('is-open');
}

// The summary has to be specific. "This will delete your data" is the kind of
// sentence people click past; "47 prompts, 9 categories" is the kind they
// read. Counts come from the same collect() the export uses, so the number in
// the warning and the number of things in the downloaded file cannot disagree.
async function fillSummary() {
  const list = document.getElementById('del-summary');
  list.innerHTML = '<li>Counting…</li>';
  try {
    const s = exportSummary(await loadExportData());
    const rows = [
      [s.prompts, 'prompt', 'prompts'],
      [s.categories, 'category', 'categories'],
      [s.collections, 'collection', 'collections'],
      [s.favorites, 'favourite', 'favourites']
    ].filter(([n]) => n > 0);
    list.innerHTML = rows.length
      ? rows.map(([n, one, many]) => `<li><strong>${n}</strong> ${n === 1 ? one : many}</li>`).join('')
      : '<li>Nothing saved yet — your library is empty.</li>';
  } catch {
    // A failed count must not block the dialog. Someone who wants to leave
    // should be able to leave whether or not we can tell them the numbers.
    list.innerHTML = '<li>Everything in your library.</li>';
  }
}

// The dialog shell lives outside #account-root, so it survives the re-render
// that auth.js performs on every onAuthStateChange. Its listeners therefore
// must be attached exactly once - without this guard a token refresh would
// silently stack a second set, and the delete handler would fire twice.
// Because those listeners outlive any single render, they must not close over
// the user object that was current when they were attached. currentUser is
// updated on every render instead, so the address echoed in step two and the
// address compared against are always this session's.
let dialogWired = false;
let currentUser = null;

function initDialog() {
  if (dialogWired) return;
  dialogWired = true;
  const emailInput = document.getElementById('del-email-input');
  const confirmBtn = document.getElementById('del-confirm');
  const errorEl = document.getElementById('del-error');
  const backdrop = document.getElementById('del-backdrop');

  document.getElementById('del-export-md')
    .addEventListener('click', (e) => exportAs('md', e.currentTarget));
  document.getElementById('del-export-json')
    .addEventListener('click', (e) => exportAs('json', e.currentTarget));

  document.getElementById('del-cancel-1').addEventListener('click', closeDialog);
  document.getElementById('del-cancel-2').addEventListener('click', closeDialog);
  document.getElementById('del-admin-ok').addEventListener('click', closeDialog);
  document.getElementById('del-done-ok').addEventListener('click', leave);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeDialog(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && backdrop.classList.contains('is-open')) closeDialog();
  });

  document.getElementById('del-continue').addEventListener('click', () => {
    document.getElementById('del-email-echo').textContent = currentUser?.email || '';
    emailInput.value = '';
    confirmBtn.disabled = true;
    errorEl.hidden = true;
    showPane('confirm');
    emailInput.focus();
  });

  // Compared case-insensitively and trimmed. The point of typing the address
  // is to prove deliberate intent, not to test whether someone can reproduce
  // their own capitalisation - and an address that looks right but is refused
  // for an invisible reason is a genuinely maddening thing to hit at this
  // particular moment.
  const matches = () => {
    const typed = emailInput.value.trim().toLowerCase();
    const actual = (currentUser?.email || '').toLowerCase();
    return Boolean(actual) && typed === actual;
  };
  emailInput.addEventListener('input', () => {
    confirmBtn.disabled = !matches();
    errorEl.hidden = true;
  });

  confirmBtn.addEventListener('click', async () => {
    if (!matches()) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting…';
    try {
      await deleteMyAccount();
      // Local sign-out, not the default. A normal signOut() calls the auth
      // server to revoke the session - for a user that no longer exists,
      // which can fail. A failed sign-out here would leave the browser
      // holding a JWT for a deleted account: nothing leaks (RLS returns
      // nothing for rows that are gone) but the UI would look signed in and
      // behave as though everything had vanished, which is a far worse last
      // impression than the deletion itself.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      // Confirm before navigating, rather than dropping them on the home page
      // and leaving them to infer it worked. This is an irreversible action
      // taken deliberately; it deserves an acknowledgement, and doing it in
      // the dialog keeps that self-contained instead of requiring the home
      // page to notice a query parameter.
      //
      // Leaving here is a full navigation for the same reason the sidebar's
      // log out reloads: every personalized view has to drop back to the
      // static build rather than keep the previous session's rows on screen.
      // Guest continuity then comes free - favoritesStore.js kept the local
      // slug copy alive, so their pre-account favourites are simply there
      // again.
      finished = true;
      document.getElementById('del-title').textContent = 'Account deleted';
      showPane('done');
      document.getElementById('del-done-ok').focus();
    } catch (err) {
      confirmBtn.textContent = 'Delete my account';
      confirmBtn.disabled = false;
      errorEl.textContent = /admin/i.test(err.message || '')
        ? 'This is the admin account and cannot be deleted from the app.'
        : (err.message || 'Could not delete the account.');
      errorEl.hidden = false;
    }
  });
}

// ── page sections ────────────────────────────────────────────────────

const TOOLS_MARKUP = `
<section class="account-tools">
  <h2>Export your library</h2>
  <p>Everything in your account, in a file you keep. Built in your browser — nothing is sent anywhere.</p>
  <div class="export-options">
    <div class="export-option">
      <h3>Markdown</h3>
      <p>Readable, and the easiest to reuse. Each prompt sits in its own block, so copying one out is a single click, and the file drops straight into Obsidian, Notion, a notes app or a chat window.</p>
      <button type="button" class="btn btn-secondary" id="export-md-btn">Download .md</button>
    </div>
    <div class="export-option">
      <h3>JSON</h3>
      <p>The complete record. Keeps every field and every relationship — categories, collections, favourites, sequence order — so it is the one to keep if you might want to load your library into something else, or back into Promptly.</p>
      <button type="button" class="btn btn-secondary" id="export-json-btn">Download .json</button>
    </div>
  </div>
</section>
<section class="account-danger">
  <h2>Delete account</h2>
  <p>Close your account and remove your library. You can carry on using Promptly as a guest afterwards.</p>
  <button type="button" class="btn btn-danger" id="delete-account-btn">Delete account</button>
</section>`;

export function initAccountTools(root, user) {
  if (!root || !supabase) return;
  currentUser = user;
  // A fresh render means a fresh library read on the next export. Without
  // this, signing in as someone else in the same tab would hand them the
  // previous account's data.
  cached = null;
  const host = document.createElement('div');
  host.innerHTML = TOOLS_MARKUP;
  root.appendChild(host);

  document.getElementById('export-md-btn')
    .addEventListener('click', (e) => exportAs('md', e.currentTarget));
  document.getElementById('export-json-btn')
    .addEventListener('click', (e) => exportAs('json', e.currentTarget));

  initDialog();

  document.getElementById('delete-account-btn').addEventListener('click', async () => {
    // Asked at click time rather than at render time, so the button is never
    // briefly wrong. An admin gets the explanation pane; everyone else gets
    // the real flow. Either way 0008 is what enforces it - this only decides
    // which of two dialogs to show.
    if (await isAdmin()) { openDialog('admin'); return; }
    openDialog('explain');
    fillSummary();
  });
}
