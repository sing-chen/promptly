// /reset-password/ - where the link in the password-reset email lands.
//
// The mechanics are worth stating once, because nothing about them is visible
// from the code alone. The link in the email points at Supabase's own /verify
// endpoint, which validates the token and then redirects here carrying a
// session in the URL fragment. supabase-js picks that up (detectSessionInUrl,
// on by default) during its initialisation and strips the fragment, so by the
// time getSession() resolves the caller is *already signed in* - a short-lived
// recovery session, but a real one. Setting the new password is therefore an
// ordinary updateUser() call, not a special token-redemption API.
//
// Two consequences that shape this page:
//  - There is no token to read, keep or pass around. If getSession() comes
//    back empty, the link was expired, already used, or superseded, and no
//    amount of retrying here fixes it - the only route forward is a new email.
//  - A caller who is *already logged in* and simply navigates here gets the
//    same working form. That is deliberate: "change my password" and "I have
//    forgotten my password" end in exactly the same place, so this page serves
//    both rather than growing a second copy of itself under /account/.
import { supabase } from './supabaseClient.js';
import { LINK_ERROR, LINK_ARRIVAL } from './auth.js';
import { ICON } from './lib/render.mjs';
import {
  MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, PASSWORD_RULES_TEXT,
  validatePassword, attachPasswordToggle, renderStrength
} from './password.js';

// `notice` is the dead-link warning, and it is only ever non-empty for a
// caller who *has* a session — see init() for why that combination is not a
// contradiction. `heading` differs for the two ways in: following a reset link
// is "choose a new password", while a signed-in visitor who simply navigated
// here is changing one they still know. Same form, same rules, and the only
// honest difference is what to call it.
function renderForm(root, session, { notice = '', heading = 'Choose a new password' } = {}) {
  // The form's own measure is 380px and that is right for one field. With the
  // dead-link banner above it the screen is mostly prose, so it takes the
  // wider one - the width follows what is actually on the page rather than
  // which function drew it.
  root.closest('.account-page')?.classList.toggle('is-message', Boolean(notice));
  root.innerHTML = `
<h1>${escapeText(heading)}</h1>
${notice}
<p class="account-identity">For <strong>${escapeText(session.user.email)}</strong></p>
<form id="pwreset-form" class="account-form">
  <label>New password
    <span class="pw-field">
      <input type="password" name="password" required autocomplete="new-password"
             minlength="${MIN_PASSWORD_LENGTH}" maxlength="${MAX_PASSWORD_LENGTH}">
      <button type="button" id="pwreset-toggle" class="icon-btn pw-toggle"
              aria-pressed="false" aria-label="Show password" data-tip="Show password">${ICON.eye}</button>
    </span>
  </label>
  <p class="auth-rules">${PASSWORD_RULES_TEXT}</p>
  <div id="pwreset-strength" class="auth-strength" hidden>
    <div class="auth-strength-bar"><span></span></div>
    <span class="auth-strength-label" aria-live="polite"></span>
  </div>
  <button type="submit" id="pwreset-submit" class="btn btn-primary">Set new password</button>
  <p id="pwreset-message" hidden></p>
</form>`;

  const form = root.querySelector('#pwreset-form');
  const input = form.querySelector('input[name=password]');
  const submitBtn = form.querySelector('#pwreset-submit');
  const strengthEl = root.querySelector('#pwreset-strength');
  const messageEl = root.querySelector('#pwreset-message');

  attachPasswordToggle(input, root.querySelector('#pwreset-toggle'), { eye: ICON.eye, eyeOff: ICON.eyeOff });
  input.addEventListener('input', () => renderStrength(strengthEl, input.value));
  input.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    messageEl.hidden = true;
    const password = input.value;
    // The same rules as sign-up, from the same module, for the same reason:
    // this is a *new* password, so every rule that applied when one was first
    // chosen applies again. The email is passed so the containment check can
    // catch a password built out of the account's own address; there is no
    // first name to check against here, since nothing on this page asked for
    // one.
    const problems = validatePassword(password, { email: session.user.email });
    if (problems.length) {
      messageEl.textContent = problems.join(' ');
      messageEl.setAttribute('role', 'alert');
      messageEl.hidden = false;
      return;
    }
    submitBtn.disabled = true;
    const { error } = await supabase.auth.updateUser({ password });
    submitBtn.disabled = false;
    if (error) {
      messageEl.textContent = error.message;
      messageEl.setAttribute('role', 'alert');
      messageEl.hidden = false;
      return;
    }
    // No redirect. The recovery session is a real session, so they are logged
    // in and can simply carry on - bouncing them to a log-in form to re-enter
    // the password they just chose is the classic version of this screen and
    // it is pointless work.
    // Prose from here on, so it takes the wider measure (§9at) - the same
    // reason the dead-link screen does.
    root.closest('.account-page')?.classList.add('is-message');
    root.innerHTML = `
<h1>Password changed</h1>
<div class="auth-banner" role="status">
  <strong>Your new password is saved.</strong>
  You are logged in on this device. Anywhere else you were logged in stays logged in — if that isn't what you want, log out there too.
</div>
<p class="auth-panel-actions"><a class="btn btn-primary" href="/account/">Go to your account</a></p>`;
  });
}

// The dead-link state. Distinguishing "expired" from "already used" is
// Supabase's job (it says so in the fragment, which auth.js captures before it
// is stripped); when it says nothing, the honest answer is that the link is no
// longer valid without claiming to know why.
function renderNoSession(root) {
  root.closest('.account-page')?.classList.add('is-message');
  root.innerHTML = `
<h1>This link is no longer valid</h1>
<p>${escapeText(LINK_ERROR || 'Password-reset links last an hour and can be used once. Requesting a new one also cancels any older link you were sent.')}
Request a new one and it will work like the first.</p>
<p class="auth-panel-actions"><a class="btn btn-primary" href="/account/#forgot">Request a new link</a></p>`;
}

// Local rather than imported from lib/render.mjs: this file needs exactly one
// escape and one icon set, and the icon set is already the reason render.mjs
// is imported. Keeping esc out of the import list is not the point - the point
// is that every value interpolated below goes through something.
function escapeText(value) {
  return String(value).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function init() {
  const root = document.getElementById('reset-root');
  if (!root) return;
  if (!supabase) {
    root.innerHTML = '<h1>Reset password</h1><p style="color:var(--ink-faint);">Account features aren’t configured for this build yet.</p>';
    return;
  }
  // getSession() awaits supabase-js's own initialisation internally, which is
  // what makes this a single call rather than a poll: by the time it resolves,
  // the fragment has been processed and either produced a session or not.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { renderNoSession(root); return; }

  // A session is not evidence that the link worked, and this is the case that
  // proved it in testing (§9as). Having just set a password, the visitor is
  // logged in; clicking the now-spent link a second time lands here, finds
  // that session, and — before this branch existed — rendered the form as if
  // the link were fine. The one thing the screen must not do is leave someone
  // unable to tell a dead link from a live one.
  //
  // The form still renders, and that is deliberate rather than a compromise:
  // they are signed in, so they genuinely can change their password here, and
  // taking the ability away to punish a stale link would help nobody. What
  // changes is that the screen says what happened.
  const notice = LINK_ERROR ? `
<div class="auth-banner auth-banner-warn" role="status">
  <strong>${escapeText(LINK_ERROR)}</strong>
  You are already logged in on this device, though, so you can still set a new
  password here — there is no need to request another link.
</div>` : '';
  // LINK_ARRIVAL, not the presence of a session: a session is there either
  // way. Someone who followed a link is mid-reset; someone who typed the URL
  // is changing a password they still know, and calling that "choose a new
  // password" implies a process they never started.
  const heading = LINK_ARRIVAL ? 'Choose a new password' : 'Change your password';
  renderForm(root, session, { notice, heading });
}

document.addEventListener('DOMContentLoaded', init);
