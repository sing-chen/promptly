import { loadPrompts, validatePrompts, PROMPTS_DIR } from '../lib/content.mjs';

function fail(messages) {
  console.error('\nPrompt validation failed:\n');
  messages.forEach(m => console.error(`  - ${m}`));
  console.error('');
  process.exit(1);
}

const prompts = loadPrompts(PROMPTS_DIR);
const errors = validatePrompts(prompts);

if (errors.length > 0) fail(errors);

console.log(`Validated ${prompts.length} prompt file(s). No issues found.`);
