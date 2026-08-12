// Desktop sidebar collapse/expand (lib/render.mjs's SIDEBAR_INIT_SCRIPT
// applies the persisted state pre-paint via a data-sidebar-collapsed
// attribute on <html>, same anti-flash pattern as the theme toggle).
// Independent of the mobile off-canvas drawer's menu-open toggle
// (initNavToggle in favorites.js) - this only has any visual effect at
// >=901px (styles/base.css's `.app-shell.sidebar-collapsed` rule is scoped
// to that breakpoint), so the two never fight over the same state.
const KEY = 'promptly:sidebarCollapsed';
const desktopMq = window.matchMedia('(min-width: 901px)');

export function initSidebarCollapse() {
  const shell = document.querySelector('.app-shell');
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('sidebar-collapse-toggle');
  if (!shell || !sidebar || !btn) return;

  function setCollapsed(collapsed) {
    // The CSS this drives (.app-shell.sidebar-collapsed) is itself scoped
    // to >=901px, but `inert` isn't CSS-gated - applying it below that
    // width would silently soft-lock the mobile drawer's contents (still
    // visually open via its own menu-open mechanism, but unfocusable) with
    // no visible change to explain why. Below the breakpoint, this always
    // leaves the sidebar interactive and the preference untouched, so it's
    // exactly where it was once the viewport crosses back up.
    const effective = collapsed && desktopMq.matches;
    shell.classList.toggle('sidebar-collapsed', effective);
    sidebar.inert = effective;
    // Not toggleAttribute() - that sets an empty-string value when true,
    // not "true", which wouldn't match SIDEBAR_INIT_SCRIPT's/the CSS's
    // exact-value selector (`[data-sidebar-collapsed="true"]`).
    if (effective) document.documentElement.setAttribute('data-sidebar-collapsed', 'true');
    else document.documentElement.removeAttribute('data-sidebar-collapsed');
    btn.setAttribute('aria-pressed', String(effective));
    btn.setAttribute('aria-label', effective ? 'Expand sidebar' : 'Collapse sidebar');
    btn.title = effective ? 'Expand sidebar' : 'Collapse sidebar';
    try { localStorage.setItem(KEY, String(collapsed)); } catch {
      // localStorage unavailable, ignore - collapse state just won't persist
    }
  }

  // Sync to whatever SIDEBAR_INIT_SCRIPT already applied pre-paint (it only
  // sets the <html> attribute, not the .app-shell class or `inert`, since
  // .app-shell doesn't exist yet when that script runs).
  setCollapsed(document.documentElement.hasAttribute('data-sidebar-collapsed'));

  btn.addEventListener('click', () => setCollapsed(!shell.classList.contains('sidebar-collapsed')));

  // Crossing back up to desktop width with a persisted collapsed
  // preference should re-apply it (it was inert-suppressed, not cleared,
  // while narrow) - re-derive from the stored preference rather than the
  // (currently mobile-forced-false) class state.
  desktopMq.addEventListener('change', () => {
    let stored = false;
    try { stored = localStorage.getItem(KEY) === 'true'; } catch {
      // localStorage unavailable, ignore - nothing to restore
    }
    setCollapsed(stored);
  });
}

document.addEventListener('DOMContentLoaded', initSidebarCollapse);
