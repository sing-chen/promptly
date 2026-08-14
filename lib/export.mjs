// Library export - one engine, two formats, every caller.
//
// This exists because there was already an export on the site and it was not
// really an export: /favorites/ shipped a button that wrote a bare JSON array
// of slugs (["prompt-a","prompt-b"]) - a bookmark list with no titles and no
// bodies. When account deletion needed a "take your data with you" step, the
// choice was to write a second, richer exporter alongside it, or to have one.
// Two exporters would have drifted the moment a column was added, and the
// answer to "what does Export give me?" would have depended on which button
// you pressed. So this module is the only place that answers that question,
// and the favourites button is retired (BUILD_BRIEF.md §9ad).
//
// Everything here is pure: it takes rows already loaded by db.js and returns
// strings. It performs no queries and sends nothing anywhere - the file is
// assembled in the browser out of reads the app was already making. That is
// worth stating explicitly because it is what keeps the export outside the
// privacy notice's scope: no new personal data is collected, processed or
// transmitted by exporting, so there is no new lawful basis to declare.
//
// Lives in lib/ rather than public/scripts/ so it is browser-safe *and*
// testable from Node; scripts/build.mjs copies it to dist/scripts/lib/ next
// to render.mjs and schema.mjs.

// Cross-references are by SLUG, never by id.
//
// This is inherited reasoning rather than a new decision: the old favourites
// export already derived slugs rather than using the ids the store holds,
// because "an export keyed by ids would be meaningless outside this account".
// That is exactly right and it applies to the whole export. A row id is a
// uuid that exists in one database, for one user; a slug is a name the user
// chose and can recognise. So a collection lists its prompts by slug, a
// favourite is a slug, and depends_on becomes the slug of the prompt depended
// on. Nothing in the exported file refers to anything by uuid, which means the
// file still means something after the account it came from stops existing -
// the specific situation this was built for.
//
// Slugs are unique per user (prompts has `unique (user_id, slug)`), and an
// export is always one user's rows, so this cannot be ambiguous.
function slugIndex(prompts) {
  return new Map(prompts.map(p => [p.id, p.slug]));
}

// The shape both formats are built from, so they can never disagree about
// what is in the export - only about how it is written down. Any field added
// here appears in JSON immediately and needs a deliberate decision about
// whether it belongs in the Markdown, which is the right way round: JSON is
// the complete record, Markdown is the readable one.
function collect({ prompts = [], categories = [], collections = [], favoriteIds = [], account = {} }) {
  const bySlug = slugIndex(prompts);

  return {
    account: {
      email: account.email || null,
      first_name: account.first_name || null
    },
    categories: [...categories]
      .sort((a, b) => a.position - b.position || a.slug.localeCompare(b.slug))
      .map(c => ({
        slug: c.slug,
        name: c.name,
        description: c.description || null,
        color: c.color,
        position: c.position
      })),
    prompts: [...prompts]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(p => ({
        slug: p.slug,
        title: p.title,
        purpose: p.purpose || null,
        body: p.body,
        notes: p.notes || null,
        // Category objects on the way in (db.js normalises the join into
        // {id,slug,name,color,position}); slugs on the way out. The colour and
        // position live once, on the category itself, rather than being
        // repeated on every prompt that carries the badge.
        categories: (p.categories || []).map(c => (typeof c === 'string' ? c : c.slug)),
        is_archived: Boolean(p.is_archived),
        sequence: p.sequence || null,
        sequence_step: p.sequence_step ?? null,
        // A dangling depends_on is possible and is not an error worth
        // failing on: the column is ON DELETE SET NULL, but a prompt can
        // also point at a row the caller no longer owns in edge cases. Null
        // is the honest answer, rather than an id the file cannot explain.
        depends_on: p.depends_on ? (bySlug.get(p.depends_on) || null) : null,
        added: p.added || null,
        updated: p.updated || null
      })),
    collections: [...collections]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(c => ({
        slug: c.slug,
        title: c.title,
        description: c.description || null,
        prompts: (c.collection_prompts || [])
          .map(cp => bySlug.get(cp.prompt_id))
          .filter(Boolean)
          .sort()
      })),
    favorites: favoriteIds
      .map(f => bySlug.get(typeof f === 'string' ? f : f.prompt_id))
      .filter(Boolean)
      .sort()
  };
}

// Deliberately NOT exported: catalog_grants, category_grants and
// catalog_versions. The first two are private bookkeeping the app never
// renders - which user holds which copy of which catalog row - and the third
// is the catalog's edit history, which belongs to the catalog rather than to
// the person holding a copy of it. None of them would mean anything to a
// reader, and none of them would help a re-import: seeding rebuilds grants
// from scratch for a new account, which is precisely what should happen.

export function buildExportJson(input) {
  const data = collect(input);
  return JSON.stringify({
    // `format` and `version` exist so that a future importer can recognise
    // this file and refuse a shape it does not understand, rather than
    // half-reading one and producing a library that is quietly wrong. Bump
    // `version` on any change that an importer could not survive.
    format: 'promptly-export',
    version: 1,
    exported_at: new Date().toISOString(),
    ...data
  }, null, 2);
}

// Fence length is computed, not assumed.
//
// A prompt body can contain triple backticks - prompts about code very often
// do, and those are exactly the prompts someone most wants out of here
// intact. A hardcoded ``` fence around a body containing ``` produces a file
// that breaks at the point it matters most, and breaks *silently*: the
// Markdown still renders, just with the wrong thing inside and outside the
// block. So the fence is always at least one backtick longer than the longest
// run inside the body, which is what CommonMark requires to nest.
function fenceFor(text) {
  const longest = (String(text).match(/`+/g) || [])
    .reduce((max, run) => Math.max(max, run.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

function promptMarkdown(p) {
  const meta = [];
  if (p.categories.length) meta.push(`Categories: ${p.categories.join(', ')}`);
  if (p.sequence) meta.push(`Sequence: ${p.sequence}${p.sequence_step != null ? `, step ${p.sequence_step}` : ''}`);
  if (p.depends_on) meta.push(`Follows: ${p.depends_on}`);

  const fence = fenceFor(p.body);
  const parts = [`### ${p.title}`];
  if (meta.length) parts.push(`*${meta.join(' · ')}*`);
  if (p.purpose) parts.push(p.purpose);
  // The body goes in a fenced block for one reason above all: it makes the
  // prompt one click to copy, as raw text, with no quoting or escaping to
  // undo. That was the whole point of offering Markdown at all - a JSON
  // string with \n in it is a fine record and a miserable thing to paste
  // into a chat window.
  parts.push(`${fence}text\n${p.body}\n${fence}`);
  if (p.notes) parts.push(`**Notes:** ${p.notes}`);
  return parts.join('\n\n');
}

export function buildExportMarkdown(input) {
  const data = collect(input);
  const live = data.prompts.filter(p => !p.is_archived);
  const archived = data.prompts.filter(p => p.is_archived);
  const when = new Date().toISOString().slice(0, 10);

  // Collections and favourites are stored as slugs (see collect() - that is
  // the right call for the record), but a Markdown file listing "follow-up"
  // where the reader knows the prompt as "Follow up" is a record pretending to
  // be a document. Titles here, slugs in the JSON: the same split of
  // responsibilities the two formats have everywhere else. Falls back to the
  // slug if a title cannot be found, which should not happen but produces
  // something readable rather than a blank bullet if it does.
  const titleOf = new Map(data.prompts.map(p => [p.slug, p.title]));
  const named = slug => titleOf.get(slug) || slug;

  const out = [];
  out.push('# Promptly export');
  out.push([
    data.account.email ? `Account: ${data.account.email}` : null,
    `Exported: ${when}`,
    `${data.prompts.length} prompt${data.prompts.length === 1 ? '' : 's'}`,
    `${data.categories.length} categor${data.categories.length === 1 ? 'y' : 'ies'}`,
    `${data.collections.length} collection${data.collections.length === 1 ? '' : 's'}`
  ].filter(Boolean).join(' · '));

  // A plain list of titles rather than anchor links. Heading anchors are
  // generated differently by every Markdown renderer, and this file is meant
  // to survive being dropped into Obsidian, Notion, a Git repo or a text
  // editor - a list that reads correctly everywhere beats links that work in
  // one of them and dangle in the rest.
  if (live.length) {
    out.push('## Contents');
    out.push(live.map(p => `- ${p.title}`).join('\n'));
  }

  if (data.categories.length) {
    out.push('## Categories');
    out.push(data.categories
      .map(c => `- **${c.name}** (\`${c.slug}\`)${c.description ? ` — ${c.description}` : ''}`)
      .join('\n'));
  }

  out.push('## Prompts');
  out.push(live.length ? live.map(promptMarkdown).join('\n\n') : '*No prompts.*');

  if (data.collections.length) {
    out.push('## Collections');
    out.push(data.collections.map(c => {
      const head = `### ${c.title}`;
      const desc = c.description ? `\n\n${c.description}` : '';
      const list = c.prompts.length
        ? `\n\n${c.prompts.map(s => `- ${named(s)}`).join('\n')}`
        : '\n\n*Empty.*';
      return head + desc + list;
    }).join('\n\n'));
  }

  if (data.favorites.length) {
    out.push('## Favourites');
    out.push(data.favorites.map(s => `- ${named(s)}`).join('\n'));
  }

  // Archived prompts last, in their own section, rather than interleaved.
  // Someone reading this wants their working library to read as their working
  // library; archived rows are still exported in full (they are the user's
  // data and dropping them would make this not a complete export) but they
  // should not dilute the main list.
  if (archived.length) {
    out.push('## Archived prompts');
    out.push(archived.map(promptMarkdown).join('\n\n'));
  }

  return out.join('\n\n') + '\n';
}

// Convenience for callers that want both without collecting twice over.
export function buildExport(input) {
  return {
    json: buildExportJson(input),
    markdown: buildExportMarkdown(input)
  };
}

// Counts for the deletion dialog, which has to say what is about to go in
// specifics rather than "your data". Derived from the same collect() the
// export uses, so the number in the warning and the number of things in the
// downloaded file cannot disagree.
export function exportSummary(input) {
  const data = collect(input);
  return {
    prompts: data.prompts.length,
    categories: data.categories.length,
    collections: data.collections.length,
    favorites: data.favorites.length
  };
}
