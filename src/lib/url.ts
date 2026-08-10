// Resolves an app-internal path against Astro's configured `base`, so every
// link/script/asset reference stays correct if the site is deployed under a
// subfolder (or the project itself is moved/renamed) instead of domain root.
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const trimmedBase = base.endsWith('/') ? base : `${base}/`;
  const trimmedPath = path.startsWith('/') ? path.slice(1) : path;
  return `${trimmedBase}${trimmedPath}`;
}
