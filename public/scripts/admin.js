// Admin page (/admin/, lib/render.mjs renderAdminPage) - lists the
// signed-in admin's own curated prompts (drafts and already-published
// alike) and lets them publish/unpublish, via db.js's existing
// publishPrompt()/unpublishPrompt(). No editing UI here - just the
// publish/unpublish toggle supabase/README.md's "Next steps" called for.
import { supabase } from './supabaseClient.js';
import { isAdmin, loadPrompts, publishPrompt, unpublishPrompt } from './db.js';
import { confirmDialog } from './confirmDialog.js';
import { esc, fmtDate, categoryName } from './lib/render.mjs';

// OPEN_ITEMS.md B4. Publishing is the one control on this page whose effect
// can't be undone: ensure_seeded() hands out independent copies, so
// unpublishing afterwards stops future grants and removes nothing (§0004's
// catalog_grants comment). Until the notify-and-merge screen exists (B2),
// a mistake published is a mistake in every library that received it. The
// button was as light as any other toggle; these two dialogs are the
// mitigation the draft flow (is_curated=true, published=false) was only ever
// half of.
//
// Deliberately no "this will be copied to N libraries". The number can't be
// read from here and the client is the wrong place to fix that: catalog_grants
// is RLS'd to `user_id = auth.uid()` (0004), and an admin never holds grants
// at all because ensure_seeded() no-ops for them - so the honest count from
// this session is always zero, which reads as reassurance rather than a
// warning. Getting a real N means a SECURITY DEFINER RPC and a migration,
// which is a bigger change than B4 asked for. The wording therefore names the
// consequence rather than counting it.
//
// Unpublish gets a dialog too, matching the one newPrompt.js already shows for
// the same action on the Edit modal's curation checkbox. That one is not new
// weight - it's the same action behaving the same way in both places it's
// offered, which it didn't before.
const PUBLISH_CONFIRM = (title) => ({
  title: 'Publish to everyone?',
  message: `"${title}" will be copied into every account's library — the ones that exist now, and every account created later. Those copies are independent, so this can't be recalled: unpublishing stops new copies but leaves the ones already handed out. Editing it after this is a broadcast to everyone holding one.`,
  confirmLabel: 'Publish to everyone',
  danger: false
});

const UNPUBLISH_CONFIRM = (title) => ({
  title: 'Remove from the catalog?',
  message: `"${title}" will stop being handed out to new accounts. Users who already have a copy keep it — copies are independent — but nobody new will receive it.`,
  confirmLabel: 'Unpublish'
});

function renderRow(p) {
  const statusClass = p.published ? 'admin-status-published' : 'admin-status-draft';
  const statusLabel = p.published ? 'Published' : 'Draft';
  return `
<tr data-id="${p.id}">
  <td>
    <strong>${esc(p.title)}</strong>
    <div class="admin-row-cats">${esc(p.categories.map(categoryName).join(', '))}</div>
  </td>
  <td><span class="admin-status ${statusClass}">${statusLabel}</span></td>
  <td>${esc(fmtDate(p.updated || p.added))}</td>
  <td>
    <button type="button" class="btn btn-secondary admin-publish-btn" data-id="${esc(p.id)}" data-published="${p.published}">
      ${p.published ? 'Unpublish' : 'Publish'}
    </button>
  </td>
</tr>`;
}

function renderList(root, prompts) {
  if (prompts.length === 0) {
    // The checkbox this names is #np-admin-checkbox in renderNewPromptModal.
    // It read "Make this a default prompt" until §9av - a label that had not
    // existed for some time, which is the failure mode of quoting another
    // screen's wording from memory. Quote what is on the screen, or don't quote.
    root.innerHTML = '<p style="color:var(--ink-faint);">No default prompts yet. Create one from the sidebar\'s "+ New Prompt" button and tick "Publish to everyone".</p>';
    return;
  }
  root.innerHTML = `
<div class="table-wrap">
  <table class="browse-table comfortable">
    <thead>
      <tr><th>Title</th><th style="width:110px;">Status</th><th class="col-updated">Updated</th><th style="width:110px;"></th></tr>
    </thead>
    <tbody>${prompts.map(renderRow).join('')}</tbody>
  </table>
</div>`;

  // Titles come from this map rather than a data-title attribute so the
  // dialog gets the real string - the table's markup is HTML-escaped, and a
  // title with an apostrophe or an ampersand in it would otherwise reach the
  // confirmation still carrying the entities.
  const titleById = new Map(prompts.map(p => [String(p.id), p.title]));

  root.querySelectorAll('.admin-publish-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const wasPublished = btn.dataset.published === 'true';
      const title = titleById.get(String(id)) || 'This prompt';

      // Confirm before the button is disabled, not after: a cancelled dialog
      // has to leave the row exactly as it was, ready to be clicked again.
      const ok = await confirmDialog(
        wasPublished ? UNPUBLISH_CONFIRM(title) : PUBLISH_CONFIRM(title)
      );
      if (!ok) return;

      btn.disabled = true;
      try {
        await (wasPublished ? unpublishPrompt(id) : publishPrompt(id));
        // Reload the whole page shell (not just this list) - `root` here is
        // #admin-list, one level below the #admin-root load() rebuilds.
        await load(document.getElementById('admin-root'));
      } catch (err) {
        alert(err.message || 'Something went wrong.');
        btn.disabled = false;
      }
    });
  });
}

async function load(root) {
  root.innerHTML = '<p style="color:var(--ink-faint);">Loading…</p>';
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    root.innerHTML = '<h1>Admin</h1><p><a href="/account/">Log in</a> to access the admin page.</p>';
    return;
  }
  const admin = await isAdmin();
  if (!admin) {
    root.innerHTML = '<h1>Admin</h1><p style="color:var(--ink-faint);">This page is only available to admins.</p>';
    return;
  }

  const all = await loadPrompts();
  // loadPrompts() returns the caller's own rows plus every published
  // default from any admin (db.js's module comment) - narrow to just this
  // admin's own curated rows, since publish/unpublish only works on rows
  // they own (prompts_update RLS).
  const own = all.filter(p => p.is_curated && p.user_id === session.user.id)
    .sort((a, b) => new Date(b.updated || b.added) - new Date(a.updated || a.added));

  root.innerHTML = '<h1>Admin</h1><p class="card-purpose">Your default prompts.</p><div id="admin-list"></div>';
  renderList(document.getElementById('admin-list'), own);
}

function init() {
  const root = document.getElementById('admin-root');
  if (!root) return;
  if (!supabase) {
    root.innerHTML = '<h1>Admin</h1><p style="color:var(--ink-faint);">Account features aren’t configured for this build yet.</p>';
    return;
  }
  load(root);
  supabase.auth.onAuthStateChange(() => load(root));
}

document.addEventListener('DOMContentLoaded', init);
