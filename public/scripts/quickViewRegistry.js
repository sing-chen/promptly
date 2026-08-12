// Tiny lookup so viewToggle.js's lazily-built card grids (and search.js's
// own) can reach the page's already-initialized quick-view controller and
// open the modal on a card click, the same way table rows already do -
// without each page needing to wire that up itself. Registered by whichever
// inline script calls initQuickView() for a given gridId.
const registry = new Map();

export function registerQuickView(gridId, api) {
  registry.set(gridId, api);
}

export function getQuickView(gridId) {
  return registry.get(gridId);
}
