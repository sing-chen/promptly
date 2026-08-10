import { defineConfig } from 'astro/config';

// SITE_BASE lets this site be deployed under any subfolder (e.g. a project
// page at /prompt-library/) without touching any links — every internal
// href/src goes through src/lib/url.ts's withBase(), which reads this at
// build time via import.meta.env.BASE_URL.
export default defineConfig({
  site: 'https://example.com',
  base: process.env.SITE_BASE || '/',
  outDir: './dist',
  build: {
    format: 'directory'
  }
});
