// Archived Prompts page (/archived/, lib/render.mjs renderArchivedPage) -
// lists default prompts the signed-in caller has archived directly (the
// Archive icon on any default's row/card - personalizedActions() in
// lib/render.mjs, db.js's archiveDefault()), with an Unarchive action per
// row calling db.js's unarchiveDefault() - same publish/unpublish-style
// toggle pattern as /admin/ (public/scripts/admin.js), just reversed
// (Unarchive is the only action here; there's no "archive from this page").
// Deliberately excludes defaults archived as a side effect of forking
// (prompt_overrides.fork_prompt_id set) - see personalizeData.js's
// getPersonalization() comment for why: that default's fork already has
// "View original" pointing back at it, so surfacing it here too would just
// offer a confusing, duplicate way to un-hide something the fork already
// supersedes.
import { supabase } from './supabaseClient.js';
import { unarchiveDefault } from './db.js';
import { getPersonalization, invalidatePersonalization } from './personalizeData.js';
import { renderCatBadges, esc, fmtDate } from './lib/render.mjs';

function renderRow(p) {
  return `
<tr data-id="${esc(p.id)}">
  <td><span class="cat-cell">${renderCatBadges(p.categories, { max: 2 })}</span></td>
  <td class="title-cell">${esc(p.title)}<span class="purpose-line">${esc(p.purpose || '')}</span></td>
  <td class="col-updated">${esc(fmtDate(p.updated || p.added))}</td>
  <td>
    <button type="button" class="btn btn-secondary archived-unarchive-btn" data-id="${esc(p.id)}">Unarchive</button>
  </td>
</tr>`;
}

function renderList(root, prompts) {
  if (prompts.length === 0) {
    root.innerHTML = '<p style="color:var(--ink-faint);">Nothing archived - defaults you archive (from any prompt\'s Archive icon) show up here.</p>';
    return;
  }
  root.innerHTML = `
<div class="table-wrap">
  <table class="browse-table comfortable">
    <thead>
      <tr><th style="width:180px;">Category</th><th>Title</th><th class="col-updated">Updated</th><th style="width:110px;"></th></tr>
    </thead>
    <tbody>${prompts.map(renderRow).join('')}</tbody>
  </table>
</div>`;

  root.querySelectorAll('.archived-unarchive-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await unarchiveDefault(btn.dataset.id);
        invalidatePersonalization();
        document.dispatchEvent(new CustomEvent('personalization:changed'));
        await load(document.getElementById('archived-root'));
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
    root.innerHTML = '<h1>Archived Prompts</h1><p><a href="/account/">Sign in</a> to see your archived prompts.</p>';
    return;
  }

  const personalization = await getPersonalization();
  const archived = personalization.overrides
    .filter(o => o.is_archived && !o.fork_prompt_id)
    .map(o => personalization.byId.get(o.default_prompt_id))
    .filter(Boolean)
    .sort((a, b) => new Date(b.updated || b.added || 0) - new Date(a.updated || a.added || 0));

  root.innerHTML = '<h1>Archived Prompts</h1><p class="card-purpose">Default prompts you’ve hidden from your view - unarchive one to bring it back.</p><div id="archived-list"></div>';
  renderList(document.getElementById('archived-list'), archived);
}

function init() {
  const root = document.getElementById('archived-root');
  if (!root) return;
  if (!supabase) {
    root.innerHTML = '<h1>Archived Prompts</h1><p style="color:var(--ink-faint);">Account features aren’t configured for this build yet.</p>';
    return;
  }
  load(root);
  supabase.auth.onAuthStateChange(() => load(root));
}

document.addEventListener('DOMContentLoaded', init);
