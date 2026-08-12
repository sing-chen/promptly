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
export async function fetchPublishedPrompts({ SUPABASE_URL, SUPABASE_ANON_KEY }) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];

  const url = `${SUPABASE_URL}/rest/v1/prompts?is_curated=eq.true&published=eq.true&select=*`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!res.ok) {
    throw new Error(`Supabase prompts fetch failed (${res.status} ${res.statusText}): ${await res.text()}`);
  }

  const rows = await res.json();

  // Normalize to the flat shape lib/content.mjs's markdown loadPrompts()
  // also produces, so lib/render.mjs and lib/sequences.mjs don't need to
  // know which source a prompt came from. Deliberately excludes `file`
  // (markdown-only, used by validatePrompts() for error messages - it falls
  // back to `slug`) and `handoff` (no such column in Supabase - see
  // lib/content.mjs's loadPrompts() comment).
  return rows.map(row => ({
    slug: row.slug,
    title: row.title,
    categories: row.categories,
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
