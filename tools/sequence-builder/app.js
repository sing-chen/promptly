// Local-only tool. No network calls. Reads/writes .md files directly via
// the File System Access API against the /prompts folder.

// This file used to open with a hardcoded nine-slug CATEGORIES array, copied
// by hand from lib/schema.mjs because a file:// page can't import across
// files. It fed one control: the bulk "Change category…" dropdown. Both the
// array and that control are gone (OPEN_ITEMS.md D4), for two independent
// reasons, either of which would have been enough:
//
// 1. There is no longer a fixed category vocabulary to copy. Categories are
//    per-user rows in the `categories` table (BUILD_BRIEF_v6.md), so no
//    hardcoded list can be correct for anyone — not even the admin, whose set
//    is now editable at /categories/ and therefore not knowable from source.
//    lib/schema.mjs's array is gone, so there is nothing left to "keep in
//    sync with" either.
//
// 2. The control had stopped working regardless. It wrote a singular
//    `category:` frontmatter key, while the markdown schema reads a
//    `categories:` list (lib/content.mjs) — so a file it touched kept its old
//    categories and gained a key nothing reads. BUILD_BRIEF.md §386 recorded
//    the narrowing to `category` as deliberate; against the schema as it
//    stands it was simply inert.
//
// What remains is what still works and is still wanted: drag-and-drop
// sequence assignment, and bulk delete. Sequences are the part of this tool
// with a future — see OPEN_ITEMS.md D1 and E4 — and none of that depends on
// the category vocabulary.

let dirHandle = null;
let files = []; // { name, handle, rawFrontmatter, bodyText, data }
const selected = new Set(); // file names

const statusEl = document.getElementById('status');
const poolEl = document.getElementById('pool');
const poolHeadingEl = document.getElementById('pool-heading');
const boardsEl = document.getElementById('boards');
const newBoardRow = document.getElementById('new-board-row');
const bulkBar = document.getElementById('bulk-bar');
const bulkCount = document.getElementById('bulk-count');

document.getElementById('pick-folder').addEventListener('click', pickFolder);
document.getElementById('create-board').addEventListener('click', createBoard);
document.getElementById('bulk-delete').addEventListener('click', applyBulkDelete);
document.getElementById('bulk-clear').addEventListener('click', () => { selected.clear(); render(); });

async function pickFolder() {
  if (!window.showDirectoryPicker) {
    statusEl.textContent = 'File System Access API not supported in this browser. Use Chrome or Edge.';
    return;
  }
  dirHandle = await window.showDirectoryPicker();
  await loadFiles();
}

async function loadFiles() {
  files = [];
  selected.clear();
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'file' && name.endsWith('.md')) {
      const file = await handle.getFile();
      const text = await file.text();
      const parsed = parseFrontmatter(text);
      files.push({ name, handle, ...parsed });
    }
  }
  statusEl.textContent = `Loaded ${files.length} prompt file(s).`;
  newBoardRow.hidden = false;
  poolHeadingEl.hidden = false;
  poolEl.hidden = false;
  render();
}

// Minimal frontmatter parser/serializer — only understands the flat
// `key: value` and `key: [a, b]` shapes this project's schema uses.
function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, rawFrontmatter: '', body: text };
  const [, fm, body] = match;
  const data = {};
  fm.split(/\r?\n/).forEach(line => {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!m) return;
    const [, key, rawVal] = m;
    let val = rawVal.trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      data[key] = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    } else if (val === '') {
      data[key] = undefined;
    } else if (!isNaN(Number(val))) {
      data[key] = Number(val);
    } else {
      data[key] = val;
    }
  });
  return { data, rawFrontmatter: fm, body };
}

function formatValue(val) {
  return Array.isArray(val) ? `[${val.join(', ')}]` : String(val);
}

// Rewrites only the keys named in keysToSet, preserving every other line
// (order, unrelated fields, comments) untouched. Generalized from the
// original sequence-only version so it can also drive bulk re-categorize.
function serializeFrontmatter(originalFm, keysToSet) {
  const lines = originalFm.split(/\r?\n/);
  const seen = new Set();
  let out = lines.map(line => {
    const m = line.match(/^([a-zA-Z_]+):/);
    if (m && m[1] in keysToSet) {
      seen.add(m[1]);
      const val = keysToSet[m[1]];
      if (val === undefined) return null; // drop line
      return `${m[1]}: ${formatValue(val)}`;
    }
    return line;
  }).filter(l => l !== null);

  Object.entries(keysToSet).forEach(([key, val]) => {
    if (!seen.has(key) && val !== undefined) {
      out.push(`${key}: ${formatValue(val)}`);
    }
  });

  return out.join('\n');
}

async function writeFile(fileEntry, keysToSet) {
  const newFm = serializeFrontmatter(fileEntry.rawFrontmatter, keysToSet);
  const content = `---\n${newFm}\n---\n${fileEntry.body}`;
  const writable = await fileEntry.handle.createWritable();
  await writable.write(content);
  await writable.close();
  fileEntry.rawFrontmatter = newFm;
}

function flashStatus(msg) {
  statusEl.textContent = msg;
  setTimeout(() => { statusEl.textContent = `Loaded ${files.length} prompt file(s).`; }, 1600);
}

function getSequenceSlugs() {
  const set = new Set();
  files.forEach(f => { if (f.data.sequence) set.add(f.data.sequence); });
  return Array.from(set);
}

function createBoard() {
  const input = document.getElementById('new-board-name');
  const slug = input.value.trim();
  if (!slug) return;
  input.value = '';
  render(slug);
}

function makeCard(fileEntry, isSequenced) {
  const card = document.createElement('div');
  card.className = 'card';
  card.draggable = true;
  card.dataset.name = fileEntry.name;

  const label = document.createElement('label');
  label.className = 'card-select';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = selected.has(fileEntry.name);
  checkbox.addEventListener('click', e => e.stopPropagation());
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) selected.add(fileEntry.name);
    else selected.delete(fileEntry.name);
    updateBulkBar();
  });
  label.appendChild(checkbox);
  card.appendChild(label);

  const body = document.createElement('div');
  body.className = 'card-body';
  body.innerHTML = isSequenced
    ? `<span class="step-num">step ${fileEntry.data.sequence_step ?? '?'}</span>${fileEntry.data.title || fileEntry.name}`
    : `${fileEntry.data.title || fileEntry.name}`;
  card.appendChild(body);

  card.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', fileEntry.name);
  });
  return card;
}

function render(focusNewSlug) {
  const seqSlugs = getSequenceSlugs();
  if (focusNewSlug && !seqSlugs.includes(focusNewSlug)) seqSlugs.push(focusNewSlug);

  // Pool: unassigned prompts
  poolEl.innerHTML = '';
  files.filter(f => !f.data.sequence).forEach(f => {
    poolEl.appendChild(makeCard(f, false));
  });
  attachLaneEvents(poolEl, null);

  boardsEl.innerHTML = '';
  seqSlugs.forEach(slug => {
    const board = document.createElement('div');
    board.className = 'board';

    const header = document.createElement('div');
    header.className = 'board-header';
    header.innerHTML = `<input value="${slug}" disabled /> <button data-delete="${slug}">Delete sequence</button>`;
    board.appendChild(header);

    const lane = document.createElement('div');
    lane.className = 'lane';
    lane.dataset.sequence = slug;
    const members = files
      .filter(f => f.data.sequence === slug)
      .sort((a, b) => (a.data.sequence_step ?? 0) - (b.data.sequence_step ?? 0));
    members.forEach(f => lane.appendChild(makeCard(f, true)));
    board.appendChild(lane);
    attachLaneEvents(lane, slug);

    header.querySelector('[data-delete]').addEventListener('click', () => deleteSequence(slug));

    boardsEl.appendChild(board);
  });

  updateBulkBar();
}

function attachLaneEvents(laneEl, sequenceSlug) {
  laneEl.addEventListener('dragover', e => e.preventDefault());
  laneEl.addEventListener('drop', async e => {
    e.preventDefault();
    const name = e.dataTransfer.getData('text/plain');
    const fileEntry = files.find(f => f.name === name);
    if (!fileEntry) return;

    let keysToSet;
    if (sequenceSlug === null) {
      fileEntry.data.sequence = undefined;
      fileEntry.data.sequence_step = undefined;
      keysToSet = { sequence: undefined, sequence_step: undefined };
    } else {
      fileEntry.data.sequence = sequenceSlug;
      const existingSteps = files
        .filter(f => f.data.sequence === sequenceSlug && f.name !== name)
        .map(f => f.data.sequence_step || 0);
      fileEntry.data.sequence_step = existingSteps.length ? Math.max(...existingSteps) + 1 : 1;
      keysToSet = { sequence: fileEntry.data.sequence, sequence_step: fileEntry.data.sequence_step };
    }
    await writeFile(fileEntry, keysToSet);
    flashStatus('Saved ✓');
    render();
  });
}

async function deleteSequence(slug) {
  const members = files.filter(f => f.data.sequence === slug);
  for (const f of members) {
    f.data.sequence = undefined;
    f.data.sequence_step = undefined;
    await writeFile(f, { sequence: undefined, sequence_step: undefined });
  }
  flashStatus('Saved ✓');
  render();
}

// --- Bulk admin (multi-select delete / re-categorize) ---

function updateBulkBar() {
  // Selection can reference files that no longer exist after a delete —
  // drop those first so the count and Apply targets stay accurate.
  for (const name of Array.from(selected)) {
    if (!files.some(f => f.name === name)) selected.delete(name);
  }
  const count = selected.size;
  bulkBar.hidden = count === 0;
  bulkCount.textContent = `${count} selected`;
}

async function applyBulkDelete() {
  const count = selected.size;
  if (count === 0) return;
  const names = Array.from(selected);
  const preview = names.slice(0, 5).join(', ') + (names.length > 5 ? `, +${names.length - 5} more` : '');
  if (!confirm(`Delete ${count} prompt file(s)?\n\n${preview}\n\nThis removes the .md files from /prompts. If you haven't committed, this is recoverable via git checkout — otherwise it's permanent.`)) {
    return;
  }
  for (const name of names) {
    const entry = files.find(f => f.name === name);
    if (!entry) continue;
    await dirHandle.removeEntry(name);
    files = files.filter(f => f.name !== name);
    selected.delete(name);
  }
  flashStatus(`Deleted ${count} file(s) ✓`);
  render();
}
