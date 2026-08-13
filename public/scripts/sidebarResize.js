// Desktop sidebar drag-to-resize (lib/render.mjs's SIDEBAR_WIDTH_INIT_SCRIPT
// applies the persisted width pre-paint as a --sidebar-width custom property
// on <html>, same anti-flash pattern as the theme/collapse preferences).
// MIN/MAX are duplicated (not imported) from SIDEBAR_MIN/SIDEBAR_MAX in
// lib/render.mjs - keep the two in sync if either changes. MIN is the
// original fixed width (240px) - the whole point is "wider for long
// category names," never narrower than the design's baseline. MAX is a
// sanity cap so a runaway drag (or a corrupted stored value) can't eat the
// entire viewport; there's no product reason to go past it.
const KEY = 'promptly:sidebarWidth';
const MIN = 240;
const MAX = 480;
const desktopMq = window.matchMedia('(min-width: 901px)');

function clamp(px) {
  return Math.min(MAX, Math.max(MIN, px));
}

function readStored() {
  try {
    const w = parseInt(localStorage.getItem(KEY), 10);
    return Number.isFinite(w) ? clamp(w) : null;
  } catch {
    return null;
  }
}

export function initSidebarResize() {
  const sidebar = document.getElementById('sidebar');
  const handle = document.getElementById('sidebar-resize-handle');
  if (!sidebar || !handle) return;

  function apply(px) {
    document.documentElement.style.setProperty('--sidebar-width', `${px}px`);
    handle.setAttribute('aria-valuenow', String(px));
  }

  function persist(px) {
    try { localStorage.setItem(KEY, String(px)); } catch {
      // localStorage unavailable, ignore - width just won't persist across reloads
    }
  }

  handle.setAttribute('aria-valuemin', String(MIN));
  handle.setAttribute('aria-valuemax', String(MAX));
  // Sync the live value to whatever SIDEBAR_WIDTH_INIT_SCRIPT already
  // applied pre-paint (falls back to the CSS default if nothing was stored,
  // or the stored value was out of range and ignored).
  apply(readStored() || MIN);

  // Only meaningful at the same breakpoint the collapse feature uses - below
  // it the sidebar is an off-canvas drawer with no room to widen into.
  if (!desktopMq.matches) return;

  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  function onPointerMove(e) {
    if (!dragging) return;
    apply(clamp(startWidth + (e.clientX - startX)));
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    sidebar.classList.remove('is-resizing');
    document.body.style.userSelect = '';
    persist(parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'), 10) || MIN);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
  }

  handle.addEventListener('pointerdown', (e) => {
    dragging = true;
    startX = e.clientX;
    startWidth = sidebar.getBoundingClientRect().width;
    sidebar.classList.add('is-resizing');
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  });

  // Keyboard: Left/Right (or Down/Up, same axis convention as a horizontal
  // splitter) nudge by 16px, Home/End jump to the min/max bounds - matches
  // the WAI-ARIA "window splitter" pattern for a separator used as a resize
  // control.
  handle.addEventListener('keydown', (e) => {
    const current = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'), 10) || MIN;
    let next = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = clamp(current - 16);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = clamp(current + 16);
    else if (e.key === 'Home') next = MIN;
    else if (e.key === 'End') next = MAX;
    if (next === null) return;
    e.preventDefault();
    apply(next);
    persist(next);
  });
}

document.addEventListener('DOMContentLoaded', initSidebarResize);
