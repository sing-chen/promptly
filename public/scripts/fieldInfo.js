// Click-to-pin for the site's (i) hints (§9al).
//
// The hints were CSS-only: `.field-info:hover + .field-hint` showed them and
// nothing else did. That is fine for a sentence you read and move on from, and
// useless the moment the hint contains something you have to reach - there is
// no rule keeping it open while the pointer travels, so moving toward a link
// inside dismisses the thing you are moving toward.
//
// Hover still works and is untouched, because it is the right interaction for
// the common case. This adds a second, deliberate one: click (or Enter/Space,
// which a <button> gives for free) pins the hint open until you dismiss it.
//
// Applies to every .field-info on the page, not just the sidebar's - the New
// Prompt modal and the Sequences label use the same idiom, and a control that
// pins in one place and not another is worse than one that never pins.

const OPEN_CLASS = 'is-pinned';

// The currently pinned button, or null. Only one at a time: two open hints
// would overlap in the sidebar, and closing the previous one is what makes
// clicking between them behave the way people expect.
let pinned = null;

function hintFor(btn) {
  // The hint is always the button's next sibling - fieldInfo() emits them as a
  // pair. aria-describedby would be the more robust lookup, but it points at
  // an id, and ids in the New Prompt modal are duplicated per instance in a
  // way that predates this.
  return btn.nextElementSibling?.classList.contains('field-hint')
    ? btn.nextElementSibling
    : null;
}

function unpin() {
  if (!pinned) return;
  hintFor(pinned)?.classList.remove(OPEN_CLASS);
  pinned.setAttribute('aria-expanded', 'false');
  pinned = null;
}

function pin(btn) {
  const hint = hintFor(btn);
  if (!hint) return;
  unpin();
  hint.classList.add(OPEN_CLASS);
  btn.setAttribute('aria-expanded', 'true');
  pinned = btn;
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.field-info');
  if (btn) {
    // preventDefault because these sit inside <label> elements in the New
    // Prompt modal, where a click would otherwise be forwarded to the labelled
    // input - focusing a text field every time you ask for help.
    e.preventDefault();
    if (pinned === btn) unpin();
    else pin(btn);
    return;
  }
  // A click inside the hint itself must not close it - that is the whole
  // point, and it includes the link the hint may carry.
  if (e.target.closest('.field-hint')) return;
  unpin();
});

// Esc closes, matching every other dismissible thing on the site. Focus goes
// back to the button: the hint may have been reached by keyboard, and leaving
// focus on a now-hidden element strands it.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !pinned) return;
  const btn = pinned;
  unpin();
  btn.focus();
});

// Tabbing past the hint's last focusable child closes it. Without this a
// pinned hint stays open behind whatever you move on to, since the click and
// Esc handlers above never fire.
document.addEventListener('focusin', (e) => {
  if (!pinned) return;
  if (e.target === pinned || hintFor(pinned)?.contains(e.target)) return;
  unpin();
});
