import { loadPrompts, validatePrompts, buildData, PROMPTS_DIR } from '../lib/content.mjs';

function fail(messages) {
  console.error('\nPrompt validation failed:\n');
  messages.forEach(m => console.error(`  - ${m}`));
  console.error('');
  process.exit(1);
}

const prompts = loadPrompts(PROMPTS_DIR);
const errors = validatePrompts(prompts);
if (errors.length > 0) fail(errors);

const data = buildData(PROMPTS_DIR);

console.log(`Validated ${data.prompts.length} prompt(s).\n`);

console.log('Categories:');
for (const c of data.categories) {
  console.log(`  ${c.slug}: ${c.count}`);
}

console.log(`\nTags (${data.tags.length}):`);
for (const t of data.tags) {
  console.log(`  ${t.slug}: ${t.count}`);
}

console.log(`\nSequences (${data.sequences.length}):`);
for (const s of data.sequences) {
  console.log(`  ${s.slug}: ${s.steps.map(p => `${p.sequence_step}. ${p.title}`).join(' -> ')}`);
}

console.log(`\nCollections (${data.collections.length}):`);
for (const c of data.collections) {
  console.log(`  ${c.slug}: ${c.prompts.map(p => p.title).join(', ')}`);
}

console.log('\nPage generation not wired up yet (next step) — this run only validates content and builds the in-memory data model.');
