// Local-only tool. No network calls. Reads/writes .md files directly via
// the File System Access API against the /src/content/prompts folder.

let dirHandle = null;
let files = []; // { name, handle, frontmatterText, bodyText, data }

const statusEl = document.getElementById('status');
const poolEl = document.getElementById('pool');
const poolHeadingEl = document.getElementById('pool-heading');
const boardsEl = document.getElementById('boards');
const newBoardRow = document.getElementById('new-board-row');

document.getElementById('pick-folder').addEventListener('click', pickFolder);
document.getElementById('create-board').addEventListener('click', createBoard);

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

function serializeFrontmatter(data, originalFm) {
  // Rewrite only sequence/sequence_step lines, preserve line order & everything else.
  const lines = originalFm.split(/\r?\n/);
  const keysToSet = { sequence: data.sequence, sequence_step: data.sequence_step };
  const seen = new Set();
  let out = lines.map(line => {
    const m = line.match(/^([a-zA-Z_]+):/);
    if (m && m[1] in keysToSet) {
      seen.add(m[1]);
      const val = keysToSet[m[1]];
      if (val === undefined) return null; // drop line
      return `${m[1]}: ${val}`;
    }
    return line;
  }).filter(l => l !== null);

  Object.entries(keysToSet).forEach(([key, val]) => {
    if (!seen.has(key) && val !== undefined) {
      out.push(`${key}: ${val}`);
    }
  });

  return out.join('\n');
}

async function writeFile(fileEntry) {
  const newFm = serializeFrontmatter(fileEntry.data, fileEntry.rawFrontmatter);
  const content = `---\n${newFm}\n---\n${fileEntry.body}`;
  const writable = await fileEntry.handle.createWritable();
  await writable.write(content);
  await writable.close();
  fileEntry.rawFrontmatter = newFm;
  flashSaved();
}

function flashSaved() {
  statusEl.textContent = 'Saved ✓';
  setTimeout(() => { statusEl.textContent = `Loaded ${files.length} prompt file(s).`; }, 1200);
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
  card.innerHTML = isSequenced
    ? `<span class="step-num">step ${fileEntry.data.sequence_step ?? '?'}</span>${fileEntry.data.title || fileEntry.name}`
    : `${fileEntry.data.title || fileEntry.name}`;
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
}

function attachLaneEvents(laneEl, sequenceSlug) {
  laneEl.addEventListener('dragover', e => e.preventDefault());
  laneEl.addEventListener('drop', async e => {
    e.preventDefault();
    const name = e.dataTransfer.getData('text/plain');
    const fileEntry = files.find(f => f.name === name);
    if (!fileEntry) return;

    if (sequenceSlug === null) {
      fileEntry.data.sequence = undefined;
      fileEntry.data.sequence_step = undefined;
    } else {
      fileEntry.data.sequence = sequenceSlug;
      const existingSteps = files
        .filter(f => f.data.sequence === sequenceSlug && f.name !== name)
        .map(f => f.data.sequence_step || 0);
      fileEntry.data.sequence_step = existingSteps.length ? Math.max(...existingSteps) + 1 : 1;
    }
    await writeFile(fileEntry);
    render();
  });
}

async function deleteSequence(slug) {
  const members = files.filter(f => f.data.sequence === slug);
  for (const f of members) {
    f.data.sequence = undefined;
    f.data.sequence_step = undefined;
    await writeFile(f);
  }
  render();
}
