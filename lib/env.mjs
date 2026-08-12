import { readFileSync, existsSync } from 'node:fs';

// Minimal, dependency-free .env parser - good enough for plain KEY=value
// lines, which is all this project needs (no quoting/multiline support).
// Values already present in process.env (e.g. injected by Vercel at build
// time) take precedence over the file, so the same code path works both
// locally (reads .env.local) and in deployment (reads real env vars).
export function loadEnv(path = '.env.local') {
  const env = { ...process.env };
  if (!existsSync(path)) return env;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in env)) env[key] = value;
  }
  return env;
}
