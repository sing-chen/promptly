// Tests for lib/export.mjs. Run with `npm test`.
//
// This is the project's first automated test, and it exists for a specific
// reason rather than as the start of a testing policy: the export engine is
// the one piece of this codebase that is both pure and genuinely fiddly. It
// resolves ids to slugs across four relations, drops references it cannot
// resolve, and computes Markdown fence lengths - none of which is visible by
// reading the output casually, and all of which produces a plausible-looking
// file when wrong. A corrupted export is also uniquely bad: it is the thing a
// user downloads immediately before deleting their account, so nobody finds
// out it was wrong until the original is gone.
//
// Deliberately dependency-free and assertion-library-free. It is a script that
// prints PASS/FAIL lines and exits non-zero, in the same spirit as the
// supabase/verify_*.sql scripts - and for the same reason: something you can
// read top to bottom and trust without knowing a framework.
//
// It does NOT test the browser half (accountDelete.js): downloads, the dialog,
// and the RPC all need a DOM and a session. Those are verified by measurement
// in the browser and, for deletion itself, by OPEN_ITEMS.md A7's throwaway
// signup.
import { buildExportJson, buildExportMarkdown, exportSummary } from '../lib/export.mjs';

const checks = [];
function t(name, cond, extra = '') {
  checks.push({ ok: Boolean(cond), name, extra });
}

// ── fixtures ─────────────────────────────────────────────────────────
//
// Shaped exactly like db.js returns them: categories as objects on each
// prompt (normalizePrompt), collections carrying a collection_prompts array,
// favourites as {prompt_id} rows. Testing against a hand-simplified shape
// would prove the engine works on data it will never receive.
const cats = [
  { id: 'c1', slug: 'code', name: 'Code', description: 'Dev stuff', color: '#34647F', position: 1 },
  { id: 'c2', slug: 'writing', name: 'Writing', description: null, color: '#A8552A', position: 0 }
];

const prompts = [
  {
    id: 'p1', slug: 'refactor', title: 'Refactor helper', purpose: 'Clean code',
    // A body containing a fenced code block - the case fenceFor() exists for.
    body: 'Here is code:\n```js\nconst a = 1;\n```\nRefactor it.',
    notes: 'Works well', categories: [cats[0]], is_archived: false,
    sequence: 'onboard', sequence_step: 1, depends_on: null,
    added: '2026-01-01', updated: '2026-02-01'
  },
  {
    id: 'p2', slug: 'follow-up', title: 'Follow up', purpose: null,
    body: 'Plain body', notes: null, categories: [cats[0], cats[1]],
    is_archived: false, sequence: 'onboard', sequence_step: 2,
    depends_on: 'p1', added: null, updated: null
  },
  {
    id: 'p3', slug: 'old-thing', title: 'Old thing', purpose: null,
    body: 'Archived body', notes: null, categories: [cats[1]], is_archived: true,
    sequence: null, sequence_step: null,
    // Dangling on purpose: depends_on is ON DELETE SET NULL, but a row can
    // still point somewhere the caller no longer owns.
    depends_on: 'MISSING-ID', added: null, updated: null
  }
];

const collections = [{
  id: 'k1', slug: 'faves', title: 'My set', description: 'Desc',
  // 'gone' is a member the caller cannot resolve - RLS can legitimately hide
  // a row the join still references.
  collection_prompts: [{ prompt_id: 'p1' }, { prompt_id: 'p2' }, { prompt_id: 'gone' }]
}];

const input = {
  prompts, categories: cats, collections,
  favoriteIds: [{ prompt_id: 'p2' }, { prompt_id: 'nope' }],
  account: { email: 'a@b.com', first_name: 'Sam' }
};

const json = JSON.parse(buildExportJson(input));
const md = buildExportMarkdown(input);

// ── the record (JSON) ────────────────────────────────────────────────

t('format and version are present', json.format === 'promptly-export' && json.version === 1);
t('exported_at is a valid ISO timestamp', !Number.isNaN(Date.parse(json.exported_at)));
t('archived prompts are exported too', json.prompts.length === 3);

// The rule the whole format rests on: nothing refers to anything by uuid, so
// the file still means something after the account is deleted.
t('no row ids leak anywhere in the file',
  !/\b(p1|p2|p3|c1|c2|k1)\b/.test(JSON.stringify(json)),
  (JSON.stringify(json).match(/\b(p1|p2|p3|c1|c2|k1)\b/g) || []).join(','));

t('depends_on resolves to a slug',
  json.prompts.find(p => p.slug === 'follow-up').depends_on === 'refactor');
t('unresolvable depends_on becomes null, not a stray id',
  json.prompts.find(p => p.slug === 'old-thing').depends_on === null);
t('prompt categories are slugs',
  json.prompts.every(p => p.categories.every(c => typeof c === 'string')));
t('collection members resolve to slugs, unknown dropped',
  JSON.stringify(json.collections[0].prompts) === JSON.stringify(['follow-up', 'refactor']),
  JSON.stringify(json.collections[0].prompts));
t('favourites resolve to slugs, unknown dropped',
  JSON.stringify(json.favorites) === JSON.stringify(['follow-up']),
  JSON.stringify(json.favorites));
t('categories are ordered by position', json.categories[0].slug === 'writing');
t('bookkeeping tables are not exported',
  !('catalog_grants' in json) && !('category_grants' in json) && !('catalog_versions' in json));

// ── the document (Markdown) ──────────────────────────────────────────

// The important one. A hardcoded ``` fence around a body containing ``` still
// renders - it just renders the wrong thing, silently.
const fenceLine = md.split('\n').find(l => /^`{4,}text$/.test(l));
t('a body containing a fence gets a longer fence', Boolean(fenceLine), fenceLine || 'none found');
t('the inner fenced block survives intact', md.includes('```js\nconst a = 1;\n```'));

t('archived prompts get their own section', md.includes('## Archived prompts'));
t('archived prompts do not dilute the main list',
  md.indexOf('Old thing') > md.indexOf('## Archived prompts'));
t('contents lists live prompts only',
  md.split('## Categories')[0].includes('- Follow up') &&
  !md.split('## Categories')[0].includes('- Old thing'));

// Markdown is the readable half, so cross-references are titles here even
// though they are slugs in the JSON.
t('collections list members by title, not slug',
  md.includes('- Follow up') && !/^- follow-up$/m.test(md));

t('no undefined or null leaks into the prose',
  !/undefined|\bnull\b/.test(md),
  (md.match(/undefined|null/g) || []).join(','));

// ── summary counts ───────────────────────────────────────────────────
//
// These drive the deletion dialog's "this removes N prompts" list, so they
// must match the file exactly - a dialog that undercounts is a dialog that
// misleads someone at the one moment they cannot undo.
const s = exportSummary(input);
t('summary matches the exported contents',
  s.prompts === json.prompts.length && s.categories === json.categories.length &&
  s.collections === json.collections.length && s.favorites === json.favorites.length,
  JSON.stringify(s));

// ── degenerate input ─────────────────────────────────────────────────

const emptyInput = { prompts: [], categories: [], collections: [], favoriteIds: [], account: {} };
t('an empty library produces a valid document',
  buildExportMarkdown(emptyInput).includes('*No prompts.*'));
t('an empty library produces valid JSON', (() => {
  const e = JSON.parse(buildExportJson(emptyInput));
  return e.prompts.length === 0 && e.format === 'promptly-export';
})());
t('missing optional fields do not throw', (() => {
  const bare = { prompts: [{ id: 'x', slug: 'x', title: 'X', body: 'b', categories: [] }] };
  return buildExportMarkdown(bare).includes('### X');
})());

// ── report ───────────────────────────────────────────────────────────

for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.extra ? '  -> ' + c.extra : ''}`);
}
const failed = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} passed`);
if (failed) process.exit(1);
