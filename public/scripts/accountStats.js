// Account page metrics (/account/, rendered into #account-stats by
// auth.js's renderSignedIn). Everything here is derived from data the caller
// already owns - their prompts, their grant rows, their collections - so
// there is no new privileged read and nothing is visible across users.
//
// Deliberately not vanity metrics. Each number either tells you something
// about your library you can't see by looking at it (how much of it you
// wrote versus received, how much you've made your own) or points at
// something you might want to act on (archived, uncollected, gaps by
// category).
import { loadMyPrompts, loadMyGrants, loadCollections } from './db.js';
import { categoryHue, categoryLabel, esc, fmtDate } from './lib/render.mjs';
import { ensureFavorites, favoriteCount } from './favoritesStore.js';

const NEW_WINDOW_DAYS = 14;

function daysAgo(n) {
  return Date.now() - n * 24 * 60 * 60 * 1000;
}

export function computeStats({ prompts, grants, collections, favorites, user }) {
  const active = prompts.filter(p => !p.is_archived);
  const archived = prompts.filter(p => p.is_archived);

  // A grant whose user_prompt_id still resolves means that prompt came from
  // the catalog. Anything else in the library the caller wrote or duplicated
  // themselves. Grants with a null pointer are prompts they were given and
  // have since deleted - counted separately rather than silently dropped,
  // since "you removed 4 of the starter prompts" is real information.
  const grantedIds = new Set(grants.map(g => g.user_prompt_id).filter(Boolean));
  const grantedAtById = new Map(
    grants.filter(g => g.user_prompt_id).map(g => [g.user_prompt_id, g.granted_at])
  );
  const fromCatalog = active.filter(p => grantedIds.has(p.id));
  const selfAuthored = active.filter(p => !grantedIds.has(p.id));
  const discarded = grants.filter(g => !g.user_prompt_id).length;

  // "Customised" = a catalog prompt edited since it was handed over. Uses
  // the timestamps rather than diffing content against catalog_versions:
  // same answer for this purpose, one query instead of two, and it can't
  // disagree with what the row itself says.
  const customised = fromCatalog.filter(p => {
    const granted = grantedAtById.get(p.id);
    return granted && new Date(p.updated).getTime() > new Date(granted).getTime() + 1000;
  });

  const collectedIds = new Set(
    collections.flatMap(c => (c.collection_prompts || []).map(cp => cp.prompt_id))
  );
  const uncollected = active.filter(p => !collectedIds.has(p.id));

  const recent = active.filter(p => new Date(p.added).getTime() >= daysAgo(NEW_WINDOW_DAYS));

  const byCategory = {};
  for (const p of active) {
    for (const c of p.categories || []) byCategory[c] = (byCategory[c] || 0) + 1;
  }
  const categories = Object.entries(byCategory)
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));

  // Only ever non-zero for an admin - a regular user can't own a curated row.
  const catalogPublished = prompts.filter(p => p.is_curated && p.published).length;
  const catalogDrafts = prompts.filter(p => p.is_curated && !p.published).length;

  return {
    active: active.length,
    archived: archived.length,
    selfAuthored: selfAuthored.length,
    fromCatalog: fromCatalog.length,
    customised: customised.length,
    discarded,
    collections: collections.length,
    uncollected: uncollected.length,
    recent: recent.length,
    favorites,
    categories,
    catalogPublished,
    catalogDrafts,
    memberSince: user?.created_at || null,
    isAdmin: catalogPublished + catalogDrafts > 0
  };
}

function tile(value, label, hint) {
  return `
<div class="stat-tile">
  <span class="stat-value">${value}</span>
  <span class="stat-label">${esc(label)}</span>
  ${hint ? `<span class="stat-hint">${hint}</span>` : ''}
</div>`;
}

function categoryChart(categories) {
  if (!categories.length) {
    return '<p class="stat-empty">Nothing to chart yet — your prompts will show up here by category.</p>';
  }
  const max = categories[0].count;
  return `
<div class="stat-bars">
  ${categories.map(c => `
  <div class="stat-bar-row">
    <span class="stat-bar-label">${esc(categoryLabel(c.slug))}</span>
    <span class="stat-bar-track">
      <span class="stat-bar-fill ${categoryHue(c.slug)}" style="width:${Math.max(2, Math.round((c.count / max) * 100))}%"></span>
    </span>
    <span class="stat-bar-count">${c.count}</span>
  </div>`).join('')}
</div>`;
}

export function renderStats(root, s) {
  const pct = s.fromCatalog > 0 ? Math.round((s.customised / s.fromCatalog) * 100) : 0;

  const adminBlock = s.isAdmin ? `
<section class="stat-section">
  <h2>Catalog</h2>
  <p class="stat-section-note">Prompts you maintain for everyone else. Editing a published one reaches every user who holds a copy.</p>
  <div class="stat-grid">
    ${tile(s.catalogPublished, 'Published', 'live for everyone')}
    ${tile(s.catalogDrafts, 'Drafts', 'only visible to you')}
  </div>
</section>` : '';

  root.innerHTML = `
<section class="stat-section">
  <h2>Your library</h2>
  <div class="stat-grid">
    ${tile(s.active, 'Prompts', s.archived ? `<a href="/archived/">${s.archived} archived</a>` : 'none archived')}
    ${tile(s.selfAuthored, 'Written by you', 'created or duplicated')}
    ${tile(s.fromCatalog, 'From the catalog', s.discarded ? `${s.discarded} removed` : 'starter prompts')}
    ${tile(s.customised, 'Made your own', s.fromCatalog ? `${pct}% of catalog prompts` : '—')}
  </div>
</section>

<section class="stat-section">
  <h2>Organisation</h2>
  <div class="stat-grid">
    ${tile(s.collections, 'Collections', '<a href="/collections/">manage</a>')}
    ${tile(s.uncollected, 'Not in a collection', 'across your library')}
    ${tile(s.recent, 'Added recently', `last ${NEW_WINDOW_DAYS} days`)}
    ${tile(s.favorites, 'Favourites', '<a href="/favorites/">view</a>')}
  </div>
</section>

${adminBlock}

<section class="stat-section">
  <h2>By category</h2>
  <p class="stat-section-note">Where your library is concentrated, and where the gaps are.</p>
  ${categoryChart(s.categories)}
</section>

${s.memberSince ? `<p class="stat-footnote">Account created ${esc(fmtDate(s.memberSince))}.</p>` : ''}`;
}

export async function initAccountStats(root, user) {
  root.innerHTML = '<p class="stat-empty">Loading your library…</p>';
  try {
    await ensureFavorites();
    const [prompts, grants, collections] = await Promise.all([
      loadMyPrompts(),
      loadMyGrants().catch(() => []), // grants are optional context, not the point
      loadCollections()
    ]);
    renderStats(root, computeStats({
      prompts, grants, collections, favorites: favoriteCount(), user
    }));
  } catch (err) {
    root.innerHTML = `<p class="stat-empty">Couldn’t load your library stats. ${esc(err.message || '')}</p>`;
  }
}
