// Generic confirm dialog (renderConfirmDialog in lib/render.mjs) - a
// themed replacement for the plain browser confirm() a couple of call
// sites used to use for "delete this?" moments. One shell per page, reused
// for whichever action needs it; confirmDialog() resolves true/false and
// leaves calling the actual destructive action to the caller, same
// division of responsibility a native confirm() would have had.
//
// Only one confirmation can be in flight at a time (a second call while one
// is open just replaces its content and re-resolves the first as `false` -
// there's nowhere in this app two of these could legitimately stack).
let pending = null;

function close(result) {
  const backdrop = document.getElementById('confirm-backdrop');
  if (!backdrop) return;
  backdrop.classList.remove('is-open');
  if (pending) {
    const resolve = pending;
    pending = null;
    resolve(result);
  }
}

export function confirmDialog({ title, message, confirmLabel = 'Delete', danger = true }) {
  const backdrop = document.getElementById('confirm-backdrop');
  if (!backdrop) return Promise.resolve(false);

  if (pending) close(false); // resolve any still-open prior call as cancelled

  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  const okBtn = document.getElementById('confirm-ok');
  okBtn.textContent = confirmLabel;
  okBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';

  backdrop.classList.add('is-open');
  okBtn.focus();

  return new Promise((resolve) => { pending = resolve; });
}

function init() {
  const backdrop = document.getElementById('confirm-backdrop');
  if (!backdrop) return;
  document.getElementById('confirm-ok').addEventListener('click', () => close(true));
  document.getElementById('confirm-cancel').addEventListener('click', () => close(false));
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && backdrop.classList.contains('is-open')) close(false);
  });
}

document.addEventListener('DOMContentLoaded', init);
