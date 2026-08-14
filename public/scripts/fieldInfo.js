// Click/tap-to-open for the site's (i) hints (§9al, narrowed in §9am).
//
// This existed briefly to let a hint hold a link. It no longer holds one - the
// routes moved onto each section's gear - and it survives for the reason that
// turned out to matter more: **the hints were unreachable on touch.**
//
// Measured, not assumed. The CSS shows a hint on `.field-info:hover` or
// `:focus-visible`. A tap fires neither: hover has no meaning without a
// pointer, and `:focus-visible` deliberately does not match a tap (it is the
// keyboard-only half of :focus). Emulating a touch tap on the (i) left the
// hint at `visibility: hidden` - so on a phone these buttons did nothing at
// all, silently. That was true before any of this, but it matters more now
// that the hint is the only place the explanation lives, the sidebar callout
// having been folded into it.
//
// Hover is untouched and still the common case on a desktop. This adds the
// second, explicit interaction: click, tap, or Enter/Space (free from
// <button>) opens; a second one, a click elsewhere, or Esc closes.
//
// Applies to every .field-info on the page, not just the sidebar's - the
// Sequences label and the New Prompt modal use the same idiom, and a control
// that opens in one place but not another is worse than one that never does.

const OPEN_CLASS = 'is-pinned';

// The currently open button, or null. One at a time: two open hints would
// overlap in the sidebar, and closing the previous is what makes clicking
// between them behave the way people expect.
let open = null;

function hintFor(btn) {
  // Always the button's next sibling - fieldInfo() emits them as a pair.
  // aria-describedby would be the more robust lookup, but it points at an id,
  // and ids in the New Prompt modal are duplicated per instance in a way that
  // predates this.
  return btn.nextElementSibling?.classList.contains('field-hint')
    ? btn.nextElementSibling
    : null;
}

function close() {
  if (!open) return;
  hintFor(open)?.classList.remove(OPEN_CLASS);
  open.setAttribute('aria-expanded', 'false');
  open = null;
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.field-info');
  if (!btn) { close(); return; }
  // preventDefault because these sit inside <label> elements in the New Prompt
  // modal, where the click would otherwise be forwarded to the labelled input
  // - focusing a text field every time you ask for help.
  e.preventDefault();
  const hint = hintFor(btn);
  if (open === btn || !hint) { close(); return; }
  close();
  hint.classList.add(OPEN_CLASS);
  btn.setAttribute('aria-expanded', 'true');
  open = btn;
});

// Esc closes, matching every other dismissible thing on the site. Focus goes
// back to the button rather than being left wherever it was.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !open) return;
  const btn = open;
  close();
  btn.focus();
});

// Moving focus elsewhere closes it - otherwise a hint opened by keyboard stays
// visible behind whatever you tab on to, since neither handler above fires.
document.addEventListener('focusin', (e) => {
  if (open && e.target !== open) close();
});
