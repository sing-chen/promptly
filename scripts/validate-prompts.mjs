import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';

const PROMPTS_DIR = join(process.cwd(), 'src', 'content', 'prompts');

function fail(messages) {
  console.error('\nPrompt validation failed:\n');
  messages.forEach(m => console.error(`  - ${m}`));
  console.error('');
  process.exit(1);
}

const files = readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.md'));
const errors = [];
const slugs = new Map();

for (const file of files) {
  const slug = file.replace(/\.md$/, '');
  const raw = readFileSync(join(PROMPTS_DIR, file), 'utf-8');
  const { data } = matter(raw);

  if (!data.title) errors.push(`${file}: missing "title"`);
  if (!data.category) errors.push(`${file}: missing "category"`);
  if (!Array.isArray(data.tags) || data.tags.length === 0) {
    errors.push(`${file}: needs at least one tag`);
  }
  if (data.sequence && data.sequence_step === undefined) {
    errors.push(`${file}: has "sequence" but no "sequence_step"`);
  }

  if (slugs.has(slug)) {
    errors.push(`Duplicate slug: "${slug}"`);
  }
  slugs.set(slug, file);
}

if (errors.length > 0) fail(errors);

console.log(`Validated ${files.length} prompt file(s). No issues found.`);
