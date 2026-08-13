// Build-time Supabase read for default prompts (supabase/README.md "Static
// build vs. live reads") - anonymous visitors get pre-built HTML, not a live
// Supabase query; this is the one place the `anon` role's table-level
// GRANT SELECT on `prompts` actually gets used for real anonymous traffic.
// `prompts_select`'s RLS still applies on top of that grant, so this can
// only ever see published defaults (is_curated=true, published=true),
// exactly the same rows an anonymous browser-side query would get.
//
// Plain fetch() against PostgREST rather than @supabase/supabase-js - this
// is a single GET request, and the project deliberately has no bundler
// (BUILD_BRIEF.md); the browser-side client already avoids adding
// @supabase/supabase-js as a real dependency by loading it from a CDN
// (public/scripts/supabaseClient.js) for the same reason.
async function get(path, { SUPABASE_URL, SUPABASE_ANON_KEY }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!res.ok) {
    throw new Error(`Supabase fetch failed for ${path} (${res.status} ${res.statusText}): ${await res.text()}`);
  }
  return res.json();
}

export async function fetchPublishedPrompts(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return [];

  // Categories come through the prompt_categories join rather than off the
  // prompts row (BUILD_BRIEF_v6.md §3) - prompts.categories no longer exists.
  // The embed's own RLS applies, but that changes nothing here: this query is
  // already scoped to published catalog prompts, whose categories are the
  // admin's curated set, and categories_select exposes those to anon.
  const rows = await get(
    'prompts?is_curated=eq.true&published=eq.true' +
    '&select=*,prompt_categories(category:categories(slug,name,color,position))',
    env
  );

  // Normalize to the flat shape lib/content.mjs's markdown loadPrompts()
  // also produces, so lib/render.mjs and lib/sequences.mjs don't need to
  // know which source a prompt came from. Deliberately excludes `file`
  // (markdown-only, used by validatePrompts() for error messages - it falls
  // back to `slug`) and `handoff` (no such column in Supabase - see
  // lib/content.mjs's loadPrompts() comment).
  //
  // `categories` is an array of category objects, not slug strings: the badge
  // renderers need each one's colour inlined, since colour is per-category
  // data now rather than a CSS class (§6.4).
  return rows.map(row => ({
    slug: row.slug,
    title: row.title,
    categories: (row.prompt_categories || [])
      .map(pc => pc.category)
      .filter(Boolean)
      .sort((a, b) => a.position - b.position || a.slug.localeCompare(b.slug)),
    purpose: row.purpose || '',
    sequence: row.sequence || undefined,
    sequence_step: row.sequence_step ?? undefined,
    depends_on: row.depends_on || undefined,
    notes: row.notes || '',
    added: row.added,
    updated: row.updated,
    body: row.body
  }));
}

// The admin's canonical category set - the vocabulary the static site is
// built from, and what lib/schema.mjs's hardcoded CATEGORIES array used to
// be. Fetched separately from prompts rather than derived from them, because
// a category with no prompts in it still has to appear (the sidebar shows a
// zero count, and /browse/<slug>/ still needs a page).
export async function fetchCatalogCategories(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return [];

  const rows = await get(
    'categories?is_curated=eq.true&select=slug,name,description,color,position&order=position,slug',
    env
  );
  return rows.map(row => ({
    slug: row.slug,
    name: row.name,
    description: row.description || '',
    color: row.color,
    position: row.position
  }));
}
