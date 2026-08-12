// Admin page (/admin/, lib/render.mjs renderAdminPage) - lists the
// signed-in admin's own curated prompts (drafts and already-published
// alike) and lets them publish/unpublish, via db.js's existing
// publishPrompt()/unpublishPrompt(). No editing UI here - just the
// publish/unpublish toggle supabase/README.md's "Next steps" called for.
import { supabase } from './supabaseClient.js';
import { isAdmin, loadPrompts, publishPrompt, unpublishPrompt } from './db.js';
import { esc, fmtDate, categoryLabel } from './lib/render.mjs';

function renderRow(p) {
  const statusClass = p.published ? 'admin-status-published' : 'admin-status-draft';
  const statusLabel = p.published ? 'Published' : 'Draft';
  return `
<tr data-id="${p.id}">
  <td>
    <strong>${esc(p.title)}</strong>
    <div class="admin-row-cats">${esc(p.categories.map(categoryLabel).join(', '))}</div>
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
    root.innerHTML = '<p style="color:var(--ink-faint);">No default prompts yet. Create one from the sidebar\'s "+ New Prompt" button and check "Make this a default prompt".</p>';
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

  root.querySelectorAll('.admin-publish-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const wasPublished = btn.dataset.published === 'true';
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
    root.innerHTML = '<h1>Admin</h1><p><a href="/account/">Sign in</a> to access the admin page.</p>';
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
