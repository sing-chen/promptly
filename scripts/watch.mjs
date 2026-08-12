import { watch } from 'node:fs';
import { runBuild } from './build.mjs';

const WATCH_DIRS = ['prompts', 'lib', 'styles', 'public'];
const DEBOUNCE_MS = 200;

async function build(reason) {
  const time = new Date().toLocaleTimeString();
  try {
    const summary = await runBuild();
    console.log(`[${time}] ${reason ? reason + ' -> ' : ''}${summary}`);
  } catch (err) {
    // Print and keep watching - a bad edit (e.g. mid-save, invalid
    // frontmatter, a Supabase fetch failure) shouldn't kill the watcher.
    console.error(`[${time}] Build failed:\n${err.message}\n`);
  }
}

let timer = null;
function scheduleBuild(reason) {
  clearTimeout(timer);
  timer = setTimeout(() => build(reason), DEBOUNCE_MS);
}

build('Initial build');

for (const dir of WATCH_DIRS) {
  try {
    watch(dir, { recursive: true }, (eventType, filename) => {
      scheduleBuild(`${dir}/${filename || ''} changed`);
    });
  } catch (err) {
    console.error(`Could not watch "${dir}/": ${err.message}`);
  }
}

console.log(`\nWatching ${WATCH_DIRS.map(d => d + '/').join(', ')} for changes. Ctrl+C to stop.`);
console.log('Note: editing scripts/build.mjs or scripts/watch.mjs itself needs a restart to take effect - they are not watched.\n');
