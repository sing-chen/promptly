// Archived Prompts page (/archived/, lib/render.mjs renderArchivedPage) -
// lists the caller's own archived prompts (prompts.is_archived, set by the
// Archive icon on any row/card - personalizedActions() in lib/render.mjs,
// db.js's archivePrompt()), with an Unarchive action per row. Unarchive is
// the only action here; there's no "archive from this page".
//
// Under the owned-copies model this is simply "your library, filtered to
// archived" (BUILD_BRIEF_v5.md §5.2). It previously listed *catalog* prompts
// the caller had hidden, which required reading the overrides table and
// excluding ones hidden as a side effect of forking - none of which exists
// any more.
import { supabase } from './supabaseClient.js';
import { unarchivePrompt } from './db.js';
import { getPersonalization, invalidatePersonalization } from './personalizeData.js';
import { renderCatBadges, esc, fmtDate } from './lib/render.mjs';

function renderRow(p) {
  return `
<tr data-id="${esc(p.id)}">
  <td class="col-category"><span class="cat-cell">${renderCatBadges(p.categories, { max: 2 })}</span></td>
  <td class="title-cell">${esc(p.title)}<span class="purpose-line">${esc(p.purpose || '')}</span></td>
  <td class="col-updated">${esc(fmtDate(p.updated || p.added))}</td>
  <td>
    <button type="button" class="btn btn-secondary archived-unarchive-btn" data-id="${esc(p.id)}">Unarchive</button>
  </td>
</tr>`;
}

function renderList(root, prompts) {
  if (prompts.length === 0) {
    root.innerHTML = '<p style="color:var(--ink-faint);">Nothing archived - prompts you archive (from any prompt\'s Archive icon) show up here.</p>';
    return;
  }
  root.innerHTML = `
<div class="table-wrap">
  <table class="browse-table comfortable">
    <thead>
      <tr><th class="col-category">Category</th><th>Title</th><th class="col-updated">Updated</th><th style="width:110px;"></th></tr>
    </thead>
    <tbody>${prompts.map(renderRow).join('')}</tbody>
  </table>
</div>`;

  root.querySelectorAll('.archived-unarchive-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await unarchivePrompt(btn.dataset.id);
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
  const archived = personalization.archived
    .slice()
    .sort((a, b) => new Date(b.updated || b.added || 0) - new Date(a.updated || a.added || 0));

  root.innerHTML = '<h1>Archived Prompts</h1><p class="card-purpose">Prompts you’ve hidden from your library - unarchive one to bring it back.</p><div id="archived-list"></div>';
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
