import { supabase } from './supabaseClient.js';
import { initAccountStats } from './accountStats.js';
import { isAdmin } from './db.js';
import { esc, ICON } from './lib/render.mjs';
import {
  MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, PASSWORD_RULES_TEXT,
  validatePassword, attachPasswordToggle, renderStrength, passwordToggleContent
} from './password.js';

// Where Supabase sends people back to after they click a link in one of its
// emails. Both are absolute URLs because that is what the `redirect_to`
// parameter requires, and both must be listed under Authentication → URL
// Configuration → Redirect URLs in the dashboard or Supabase silently
// substitutes the Site URL instead - the failure mode is a confirmed account
// that lands on the home page with no explanation, which reads as the link
// not having worked.
const CONFIRM_LANDING = () => new URL('/account/?confirmed=1', location.origin).href;
const RESET_LANDING = () => new URL('/reset-password/', location.origin).href;

// Read the URL fragment *now*, at module-evaluation time, before anything is
// awaited. supabase-js is configured with detectSessionInUrl on (the default),
// which consumes the fragment and strips it as part of its own async
// initialisation - so by the time init() below runs, an error carried in the
// hash may already be gone. This is the one thing on the page that has to be
// read synchronously.
//
// A failed link arrives as #error=access_denied&error_code=otp_expired&…
// rather than as a rejected promise anywhere, so without this an expired
// confirmation link is indistinguishable from a working one that quietly did
// nothing.
//
// Both values below come from that one synchronous read. They are separate
// exports because they answer different questions and a page can need either:
// LINK_ERROR is "the link was dead", LINK_ARRIVAL is "the visitor got here by
// following a link at all", which is not otherwise recoverable once the
// fragment is gone.
const LINK_PARAMS = new URLSearchParams(location.hash.replace(/^#/, ''));

// True when this page load came from an emailed link — success or failure.
// A working link carries type=recovery (or type=signup) alongside the tokens;
// a dead one carries the error fields instead.
//
// This exists because a session is NOT evidence of a good link. Someone who is
// already logged in has a session before the link is even considered, so a
// page that only asks "is there a session?" cannot tell a spent link from a
// working one — which is how §9ar's first live test produced a "no longer
// valid" screen that never appeared. See resetPassword.js.
export const LINK_ARRIVAL = Boolean(
  LINK_PARAMS.get('type') || LINK_PARAMS.get('error') || LINK_PARAMS.get('error_code')
);

export const LINK_ERROR = (() => {
  const params = LINK_PARAMS;
  const code = params.get('error_code');
  if (!params.get('error') && !code) return null;
  // Supabase's own description is URL-encoded prose written for a developer;
  // the two cases people actually hit get their own sentence, and anything
  // else falls back to what the server said rather than to a shrug.
  //
  // These are **diagnoses only** — no "request a new one below", because what
  // to do next is not the same on every screen that shows this. /account/
  // appends its own instruction, /reset-password/ has a button for it, and the
  // already-signed-in case (§9as) needs the opposite advice: carry on, you do
  // not need a new link at all. A shared string with a call to action baked in
  // had one caller cutting the end off the other's sentence with a regex,
  // which is the version of this that eventually goes wrong silently.
  //
  // Deliberately does not name a lifetime either: this is shown for both kinds
  // of link, and they expire on different clocks (24 hours for a signup
  // confirmation, one hour for a password reset). The screen that knows which
  // is which says so; this one only knows the link is dead.
  if (code === 'otp_expired') return 'That link has expired. Links are single-use and last a limited time.';
  if (code === 'access_denied') return 'That link has already been used, or was replaced by a newer one.';
  return params.get('error_description')?.replace(/\+/g, ' ') || 'That link could not be used.';
})();

function setNavAccountState(session) {
  // The sidebar footer is two mutually exclusive states (§9ag). Signed out:
  // a "Log in" link. Signed in: the email as inert text, with View account /
  // Export library / Log out beneath it.
  //
  // The email is deliberately NOT a link any more. It used to be the only
  // route to /account/ from the sidebar, which nothing signalled - an email
  // address does not read as a control, so the page went unfound unless you
  // thought to click your own address. Naming the three actions fixes the
  // discoverability; making the address inert is the other half, because a
  // link that looks like plain text is worse than no link at all.
  const link = document.getElementById('nav-account-link');
  if (link) link.hidden = Boolean(session);
  const emailEl = document.getElementById('nav-account-email');
  if (emailEl) {
    // textContent, not innerHTML - this is user-supplied and rendered on
    // every page of the site.
    emailEl.textContent = session ? session.user.email : '';
    emailEl.hidden = !session;
  }
  // One toggle for all three actions rather than three, so they cannot get
  // out of step with each other. Every one of them is meaningless without a
  // session: nothing to view, nothing to export, nothing to log out of.
  document.getElementById('nav-account-actions')?.toggleAttribute('hidden', !session);
  // Open to any signed-in user (db.js's createPrompt() has no admin check) -
  // the New Prompt modal's own "make this a default prompt" checkbox is
  // admin-gated, not the button itself. Starts hidden server-side so
  // anonymous visitors (the majority) never see a flash of it before this
  // runs.
  document.getElementById('new-prompt-btn')?.toggleAttribute('hidden', !session);
  // Same reasoning as New Prompt - collections are per-user, no admin
  // concept (db.js's createCollection() has no admin check either). This is
  // the gear that replaced the "+" in §9am; it navigates to /collections/
  // rather than opening a modal, and is hidden signed out because there is
  // nothing there to manage without an account.
  document.getElementById('manage-collections-btn')?.toggleAttribute('hidden', !session);
  // /why-sign-in/'s call to action and its "what signing up asks for"
  // section - the two toggles here that run the other way round. Everything
  // above appears when you log in; these disappear, because neither says
  // anything to someone who already has an account.
  // Note the negation: `!!session`, not `!session`.
  document.getElementById('why-signin-cta')?.toggleAttribute('hidden', !!session);
  document.getElementById('why-signup-asks')?.toggleAttribute('hidden', !!session);
  document.getElementById('why-intro-out')?.toggleAttribute('hidden', !!session);
  // ...and the two that appear only once there IS a session. Note these take
  // `!session` like everything above - the page carries both halves in its
  // static markup and shows one, because it cannot tell a visitor with no
  // account from one who simply has not logged in.
  document.getElementById('why-intro-in')?.toggleAttribute('hidden', !session);
  document.getElementById('why-next-in')?.toggleAttribute('hidden', !session);
  // Categories are editable only when signed in (BUILD_BRIEF_v6.md §4.1) -
  // a guest still sees the list, just not the "+" that adds to it.
  document.getElementById('manage-categories-btn')?.toggleAttribute('hidden', !session);
  // The "log in to…" half of each sidebar hint (§9an). Advice aimed at
  // someone who has already taken it is noise in a tooltip trying to be
  // brief, so it goes once there is a session. The rest of the hint - what
  // the thing actually is - stays in both states, since that is the part a
  // signed-in user might still be reading it for.
  document.getElementById('collections-info-guest')?.toggleAttribute('hidden', !!session);
  document.getElementById('categories-info-guest')?.toggleAttribute('hidden', !!session);
  // Library is per-user content with no meaningful signed-out state - hide
  // rather than send an anonymous visitor to a page that just tells them
  // to sign in.
  document.getElementById('nav-library-link')?.toggleAttribute('hidden', !session);
  // Archived Prompts is per-user content too - same reasoning.
  document.getElementById('nav-archived-link')?.toggleAttribute('hidden', !session);
  // The Collections "(i)" used to be hidden signed out, on the reasoning that
  // the explainer callout below it already said the same thing. §9al removed
  // the callout and moved its text into the hint, which reverses the
  // conclusion: the hint is now the ONLY place that explanation lives, so
  // hiding it from logged-out visitors would hide it from exactly the people
  // it was written for. Both (i) buttons are permanent, in both states, and
  // are not toggled here at all.

  const adminLink = document.getElementById('nav-admin-link');
  if (!adminLink) return;
  if (!session) { adminLink.hidden = true; return; }
  // Async, so this can only ever add the link back after the page's initial
  // signed-out render (hidden by default in lib/render.mjs) - never remove
  // it early and cause a flash of admin nav for a non-admin.
  isAdmin().then(admin => { adminLink.hidden = !admin; });
}

// True when the caller arrived here by clicking the activation link in their
// welcome email. Under Supabase's implicit flow that link both confirms the
// address and signs them in, so the usual landing is the dashboard - which
// would otherwise say nothing at all about the thing they just did.
//
// Read once and cleared from the URL, so a refresh (or a bookmark of the
// landing URL) doesn't re-announce a confirmation that happened days ago.
function takeConfirmedFlag() {
  const params = new URLSearchParams(location.search);
  if (!params.has('confirmed')) return false;
  params.delete('confirmed');
  const qs = params.toString();
  history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : ''));
  return true;
}
let justConfirmed = false;

function renderSignedIn(root, session) {
  // Sign out lives in the sidebar footer now (reachable from anywhere), so
  // this page's job is what the sidebar can't do: say something about the
  // library itself. Stats render asynchronously into #account-stats.
  // Widens the page for the stat grid; the signed-out form keeps the narrow
  // measure .account-page was sized for.
  root.closest('.account-page')?.classList.add('is-dashboard');
  // …and drop the message measure, which a caller can be carrying if they got
  // here by confirming from the "check your email" panel.
  root.closest('.account-page')?.classList.remove('is-message');
  // The first name captured at sign-up is used here, and this is the only
  // place it is used - which is the point rather than an afterthought. Under
  // UK GDPR's data-minimisation principle, collecting a name and then never
  // showing it is collecting personal data with no purpose; either it earns a
  // place on screen or the field should not be asking for it. The email stays
  // regardless: it is what identifies *which* account you are signed in to,
  // which matters more than the greeting does.
  //
  // esc() because this is free text the user typed, rendered into innerHTML.
  // The exposure is only to themselves, but "only self-XSS" is not a reason to
  // interpolate raw user input into markup.
  // The greeting sits in the identity line rather than the <h1>, so the page
  // still announces itself as "Account" in the heading and the tab title.
  // Accounts created before the first-name field existed have no name at all,
  // so the greeting has to be genuinely optional - not "Hi , you are logged
  // in as…".
  const firstName = (session.user.user_metadata?.first_name || '').trim();
  const greeting = firstName ? `Hi ${esc(firstName)}, you are` : 'You are';
  // Rendered above the heading rather than inside the stats, because it is
  // about the *event* that just happened rather than about the library. It is
  // shown once and never again - see takeConfirmedFlag().
  const confirmedBanner = justConfirmed ? `
<div class="auth-banner" role="status">
  <strong>Your email address is confirmed.</strong>
  Your account is active and you are logged in. Your library already holds a copy of every prompt in the catalog — they are yours to edit, file and delete.
</div>` : '';
  root.innerHTML = `
${confirmedBanner}
<h1>Account</h1>
<p class="account-identity">${greeting} logged in as <strong>${esc(session.user.email)}</strong></p>
<div id="account-stats"></div>`;
  initAccountStats(document.getElementById('account-stats'), session.user);
  // Export and Delete account, appended below the stats rather than baked
  // into the markup above, because both need the async isAdmin() answer and
  // the library reads before they can say anything specific. See
  // accountDelete.js. This is also the only place the export lives now - the
  // slug-list export that used to sit on /favorites/ is retired (§9ad).
  //
  // Imported dynamically, unlike everything else this file pulls in. auth.js
  // runs on every page (it paints the nav), and accountDelete.js drags in the
  // whole export engine - which is wanted on exactly one page, by users who
  // are signed in, at the moment they open it. A static import would put that
  // on the critical path of every anonymous visitor's first load for no
  // benefit at all.
  //
  // The dialog shell it drives is rendered only by renderAccountPage(), so
  // this is also the only page where its getElementById calls resolve.
  import('./accountDelete.js')
    .then(m => m.initAccountTools(document.getElementById('account-root'), session.user))
    .catch(err => console.error('Account tools failed to load', err));
}

// Supabase throttles auth mail per address (60 seconds by default). A resend
// button that fires into that limit produces a rate-limit error where the user
// expected an email, so the button counts down instead of failing.
const RESEND_COOLDOWN_SECONDS = 60;

function renderSignedOut(root) {
  // Both alternative measures cleared on a fresh paint - this function always
  // renders the form, which owns the default 380px.
  root.closest('.account-page')?.classList.remove('is-dashboard', 'is-message');
  root.innerHTML = `
<h1>Account</h1>
<div class="filter-pill-group account-tabs" id="auth-tabs">
  <button type="button" class="filter-pill is-active" data-tab="sign-in" aria-pressed="true">Log in</button>
  <button type="button" class="filter-pill" data-tab="sign-up" aria-pressed="false">Sign up</button>
</div>
<!-- Forgot-password mode has no tabs (it is not a third peer of log in and
     sign up, it is a detour off one of them), so it needs its own heading or
     the form loses its title entirely. -->
<div id="auth-forgot-head" hidden>
  <h2 class="auth-subhead">Reset your password</h2>
  <p class="auth-rules">Tell us the address on the account and we'll email you a link to set a new password. The link lasts an hour and can be used once.</p>
</div>
<form id="auth-form" class="account-form">
  <!-- Sign-up only. One form serves all three modes, so this field is hidden
       (and un-required) elsewhere by the mode handler below, rather than
       living in a separate form. The "required" property MUST be toggled
       alongside "hidden": a hidden required input is an invalid control the
       browser cannot focus, so the form silently refuses to submit, with a
       console warning and no visible cause.
       (No backticks in this comment - it sits inside a template literal, and
       a stray one ends the string. That is exactly how it broke once.) -->
  <label id="auth-firstname-field" hidden>First name
    <input type="text" name="first_name" maxlength="60" autocomplete="given-name">
  </label>
  <label>Email
    <input type="email" name="email" required autocomplete="email">
  </label>
  <!-- No minlength/maxlength here, and that is not an oversight. Both are
       sign-up-only and get set by setMode() below. The form defaults to
       sign-in mode, where a length rule would be actively harmful: accounts
       made before this policy existed have shorter passwords, and the login
       form refusing a password that genuinely works is a lockout with no
       explanation and no way round it. -->
  <label id="auth-password-field">Password
    <!-- The wrapper exists purely so the toggle has something to be
         positioned against. .account-form label is a flex column, and an
         absolutely-positioned child of that would anchor to the label - i.e.
         to the "Password" text as well as the input - rather than to the
         field itself. -->
    <span class="pw-field" id="auth-pw-wrap">
      <input type="password" name="password" required autocomplete="current-password">
      <button type="button" id="auth-pw-toggle" class="icon-btn pw-toggle"
              aria-pressed="false" aria-label="Show password" data-tip="Show password">${passwordToggleContent(ICON.eye, 'Show')}</button>
    </span>
  </label>
  <!-- Stated before the attempt rather than revealed by failing one. Both of
       these are hidden outside sign-up mode - the rules do not apply to a
       password that already exists, and rating one the user cannot change here
       would be a pointless thing to do to somebody trying to log in. -->
  <p id="auth-password-rules" class="auth-rules" hidden>${PASSWORD_RULES_TEXT}</p>
  <div id="auth-strength" class="auth-strength" hidden>
    <div class="auth-strength-bar"><span></span></div>
    <!-- aria-live so the rating is announced as it changes; the bar itself is
         decorative and carries no text of its own. -->
    <span class="auth-strength-label" aria-live="polite"></span>
  </div>
  <!-- Sign-up only, and shown *before* the button rather than after the
       submit. Someone who has already pressed Sign up and is staring at a
       "check your email" screen is past the point where "we will email you"
       is news; the person who benefits is the one deciding whether to give
       an address they can actually receive mail at. -->
  <p id="auth-signup-note" class="auth-rules" hidden>We'll send a welcome email with a link that activates your account. You'll need to click it before you can log in — and if it hasn't arrived within a few minutes, check your spam or junk folder.</p>
  <button type="submit" id="auth-submit-btn" class="btn btn-primary">Log in</button>
  <p id="auth-message" hidden></p>
</form>
<p class="auth-aside">
  <button type="button" class="linkish" id="auth-forgot-link">Forgotten your password?</button>
  <button type="button" class="linkish" id="auth-back-link" hidden>Back to log in</button>
</p>
<!-- Replaces the form outright for the two states where the next step is not
     on this screen at all: "we have sent you an email". A message under the
     submit button would leave a filled-in form sitting above it inviting a
     second attempt, which is how people end up requesting four links and
     using the oldest one. -->
<div id="auth-panel" class="auth-panel" hidden></div>`;

  const tabsEl = root.querySelector('#auth-tabs');
  const tabs = [...tabsEl.querySelectorAll('[data-tab]')];
  const submitBtn = root.querySelector('#auth-submit-btn');
  const passwordInput = root.querySelector('input[name=password]');
  const form = root.querySelector('#auth-form');
  const messageEl = root.querySelector('#auth-message');
  let mode = 'sign-in';

  const firstNameField = root.querySelector('#auth-firstname-field');
  const firstNameInput = firstNameField.querySelector('input');
  const passwordField = root.querySelector('#auth-password-field');
  const pwWrap = root.querySelector('#auth-pw-wrap');
  const pwToggle = root.querySelector('#auth-pw-toggle');
  const rulesEl = root.querySelector('#auth-password-rules');
  const signupNote = root.querySelector('#auth-signup-note');
  const strengthEl = root.querySelector('#auth-strength');
  const forgotHead = root.querySelector('#auth-forgot-head');
  const forgotLink = root.querySelector('#auth-forgot-link');
  const backLink = root.querySelector('#auth-back-link');
  const panel = root.querySelector('#auth-panel');

  // Both call sites set role as well as text - a message that stays role=alert
  // from a previous failure would have the next success announced as an error.
  function showMessage(text, role) {
    messageEl.textContent = text;
    messageEl.setAttribute('role', role);
    messageEl.hidden = false;
  }

  const setPasswordVisible = attachPasswordToggle(passwordInput, pwToggle, {
    eye: ICON.eye, eyeOff: ICON.eyeOff
  });

  // ---- the "check your email" panel -------------------------------------
  //
  // One renderer for both cases (a new signup, and a password reset) because
  // the screens differ only in their heading and one sentence. What they share
  // is the part that matters and the part people get wrong: naming the address
  // it went to, saying what to do when it does not arrive, and offering a
  // resend that cannot be hammered.
  //
  // `kind` is 'signup' or 'recovery' and selects which Supabase call the
  // resend button makes.
  function showEmailSentPanel({ kind, email, heading, lead }) {
    // Widen the column: this screen is prose, not a form, and the form's
    // 380px measure squashes it (§9at).
    root.closest('.account-page')?.classList.add('is-message');
    form.hidden = true;
    tabsEl.hidden = true;
    forgotHead.hidden = true;
    forgotLink.hidden = true;
    backLink.hidden = true;
    panel.hidden = false;
    panel.innerHTML = `
<h2 class="auth-subhead">${esc(heading)}</h2>
<p>${lead}</p>
<p class="auth-sent-to">Sent to <strong>${esc(email)}</strong></p>
<ul class="auth-checklist">
  <li><strong>Check your spam or junk folder.</strong> Mail from a service you have only just used is the most likely of all to land there. Marking it "not spam" keeps the rest out of it.</li>
  <li>Give it a few minutes. Mail is not instant, and some providers hold new senders back briefly.</li>
  <li>Check the address above is right. If it isn't, start again with the correct one.</li>
</ul>
<div class="auth-panel-actions">
  <button type="button" class="btn btn-secondary" id="auth-resend">Resend email</button>
  <button type="button" class="linkish" id="auth-panel-back">Back to log in</button>
</div>
<p id="auth-panel-message" hidden></p>`;

    const resendBtn = panel.querySelector('#auth-resend');
    const panelMessage = panel.querySelector('#auth-panel-message');
    // Starts on cooldown, because an email was sent to get here. Without this
    // the button is immediately pressable and the first press is guaranteed to
    // hit Supabase's own throttle.
    startCooldown(resendBtn, RESEND_COOLDOWN_SECONDS);

    resendBtn.addEventListener('click', async () => {
      panelMessage.hidden = true;
      resendBtn.disabled = true;
      const { error } = kind === 'signup'
        ? await supabase.auth.resend({
            type: 'signup', email,
            options: { emailRedirectTo: CONFIRM_LANDING() }
          })
        : await supabase.auth.resetPasswordForEmail(email, { redirectTo: RESET_LANDING() });
      if (error) {
        panelMessage.textContent = error.message;
        panelMessage.setAttribute('role', 'alert');
        panelMessage.hidden = false;
        resendBtn.disabled = false;
        return;
      }
      panelMessage.textContent = 'Sent again. The newest link is the one that works — older ones stop working as soon as a new one is issued.';
      panelMessage.setAttribute('role', 'status');
      panelMessage.hidden = false;
      startCooldown(resendBtn, RESEND_COOLDOWN_SECONDS);
    });

    panel.querySelector('#auth-panel-back').addEventListener('click', () => {
      // Back to the form, so back to the form's measure. Paired with the
      // add() above; leaving it wide would make the log-in fields stretch to
      // 560px for no reason other than where the visitor had just been.
      root.closest('.account-page')?.classList.remove('is-message');
      panel.hidden = true;
      panel.innerHTML = '';
      form.hidden = false;
      tabsEl.hidden = false;
      setMode(tabs.find(t => t.dataset.tab === 'sign-in'));
    });
  }

  // Counts the button down rather than just disabling it, so the wait is
  // legible. Any previous timer on the same button is cleared first - two
  // overlapping intervals would race to re-enable it and the earlier one would
  // win, unlocking the button before the cooldown it belongs to has expired.
  function startCooldown(btn, seconds) {
    clearInterval(btn._cooldown);
    let left = seconds;
    btn.disabled = true;
    const tick = () => {
      btn.textContent = left > 0 ? `Resend email (${left}s)` : 'Resend email';
      if (left <= 0) { clearInterval(btn._cooldown); btn.disabled = false; }
      left -= 1;
    };
    tick();
    btn._cooldown = setInterval(tick, 1000);
  }

  // ---- modes -------------------------------------------------------------
  //
  // Three now: sign-in, sign-up, forgot. `tab` is a tab button for the first
  // two and null for forgot, which has no tab of its own.
  function setMode(tab) {
    mode = tab ? tab.dataset.tab : 'forgot';
    tabs.forEach(t => {
      const active = t === tab;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-pressed', String(active));
    });
    const signingUp = mode === 'sign-up';
    const forgot = mode === 'forgot';

    tabsEl.hidden = forgot;
    forgotHead.hidden = !forgot;
    forgotLink.hidden = mode !== 'sign-in';
    backLink.hidden = !forgot;

    submitBtn.textContent = forgot ? 'Email me a reset link' : signingUp ? 'Sign up' : 'Log in';
    passwordInput.autocomplete = signingUp ? 'new-password' : 'current-password';
    // Both, together, always - see the comment on the field itself.
    firstNameField.hidden = !signingUp;
    firstNameInput.required = signingUp;
    // Same hidden/required pairing as the first name, for the same reason: a
    // hidden required password field makes the reset form refuse to submit
    // with nothing on screen to explain it.
    passwordField.hidden = forgot;
    passwordInput.required = !forgot;
    // The length rules are sign-up-only for the reason given on the input
    // itself: an existing password predating the policy still has to work.
    // Set as attributes on the way in and removed on the way out, rather than
    // left in place and ignored - a stale minlength would make the browser
    // block submit on a valid login with its own message, which no code here
    // could override.
    if (signingUp) {
      passwordInput.minLength = MIN_PASSWORD_LENGTH;
      passwordInput.maxLength = MAX_PASSWORD_LENGTH;
    } else {
      passwordInput.removeAttribute('minlength');
      passwordInput.removeAttribute('maxlength');
    }
    rulesEl.hidden = !signingUp;
    signupNote.hidden = !signingUp;
    // The reveal carries a visible "Show" on sign-up only (§9au). This is the
    // screen where a password is being *chosen*, so a typo is not caught by
    // the login failing — it is caught days later, by a login that fails for
    // no visible reason. On the log-in tab the icon alone is enough: you are
    // recalling a password, not composing one, and the tab is narrow on the
    // things it asks for.
    pwWrap.classList.toggle('has-label', signingUp);
    // Re-mask on every mode switch. Leaving a password on screen because the
    // user changed tabs is a decision nobody made - the reveal was asked for
    // in one context and should not silently carry into another.
    setPasswordVisible(false);
    // Re-rate rather than just hide: switching tabs with a password already
    // typed would otherwise leave the previous mode's rating on screen, or
    // leave a sign-up password unrated until the next keystroke.
    if (signingUp) renderStrength(strengthEl, passwordInput.value);
    else strengthEl.hidden = true;
    messageEl.hidden = true;
  }

  // Only meaningful in sign-up mode; renderStrength is not called elsewhere
  // because setMode has already hidden the meter and nothing here shows it
  // again.
  passwordInput.addEventListener('input', () => {
    if (mode === 'sign-up') renderStrength(strengthEl, passwordInput.value);
  });

  tabs.forEach(tab => tab.addEventListener('click', () => setMode(tab)));
  forgotLink.addEventListener('click', () => {
    setMode(null);
    // Carry whatever they had already typed. Someone who reaches for "forgotten
    // your password" has usually just typed their address into the field above.
    root.querySelector('input[name=email]').focus();
  });
  backLink.addEventListener('click', () => setMode(tabs.find(t => t.dataset.tab === 'sign-in')));

  // /why-sign-in/ links Sign up at /account/#sign-up, and the expired-link
  // message below points at /account/#forgot. Without this the deep links
  // would be cosmetic - all of them would land on the log-in form and the
  // reader would have to find the right mode themselves. Reusing setMode()
  // rather than setting `mode` directly is what keeps every hidden/required
  // pair in step; setting the variable alone would show a form that silently
  // refuses to submit.
  if (location.hash === '#sign-up') {
    const tab = tabs.find(t => t.dataset.tab === 'sign-up');
    if (tab) setMode(tab);
  } else if (location.hash === '#forgot') {
    setMode(null);
  }

  // A dead link (expired, already used, superseded) is the one auth failure
  // that arrives with no form submission behind it, so it has to be surfaced
  // on load or not at all. LINK_ERROR is the diagnosis; the instruction is
  // this screen's to add, because this screen is the one with the controls
  // that carry it out.
  if (LINK_ERROR) showMessage(`${LINK_ERROR} Sign up again, or use “Forgotten your password?” below, to get a new one.`, 'alert');
  // Confirmed, but no session - the address is now verified and they simply
  // need to log in. Happens when the link is opened somewhere that cannot
  // keep the session (a mail app's in-app browser, most often).
  else if (justConfirmed) showMessage('Your email address is confirmed. Log in to get started.', 'status');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    messageEl.hidden = true;
    submitBtn.disabled = true;
    const email = form.email.value.trim();
    const password = form.password.value;
    const firstName = form.first_name.value.trim();

    // ---- forgot password -------------------------------------------------
    //
    // Deliberately says the same thing whether or not an account exists, and
    // Supabase deliberately returns success either way. The alternative turns
    // this form into an oracle for which addresses have accounts here, which
    // is a privacy leak dressed up as helpfulness.
    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: RESET_LANDING() });
      submitBtn.disabled = false;
      if (error) { showMessage(error.message, 'alert'); return; }
      showEmailSentPanel({
        kind: 'recovery',
        email,
        heading: 'Check your email',
        lead: 'If there is an account with that address, a link to set a new password is on its way. It lasts an hour and can be used once.'
      });
      return;
    }

    // Sign-up only. Running this on sign-in would lock out any account whose
    // password predates the policy - the whole point of checking here rather
    // than on the shared path.
    //
    // Ahead of the network call so the common mistakes cost nothing, but the
    // server is still the thing that decides: Supabase enforces its own
    // minimum regardless of what this concludes, and its error surfaces
    // through the same messageEl below.
    if (mode === 'sign-up') {
      const problems = validatePassword(password, { email, firstName });
      if (problems.length) {
        // Re-enable before returning - the button was disabled at the top of
        // this handler on the assumption a request was about to go out, and
        // bailing early has to undo that or the form is dead.
        submitBtn.disabled = false;
        // All of them at once. Reporting the first and making the user
        // resubmit to discover the second is how a two-rule form turns into
        // four attempts.
        showMessage(problems.join(' '), 'alert');
        return;
      }
    }

    // First name rides in options.data, which Supabase Auth stores on
    // auth.users.raw_user_meta_data and returns as user.user_metadata. No
    // migration and no profiles table for one field - and deliberately not a
    // column on a table of ours, since that would mean a row that has to be
    // created in step with the auth user and kept in step with deletions.
    //
    // It is also what the confirmation email greets them by: Supabase exposes
    // exactly this as {{ .Data.first_name }} in its templates, read at the
    // moment the mail is triggered, which is why it has to be passed here at
    // signUp time rather than set afterwards.
    const { data, error } = mode === 'sign-in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email, password,
          options: { data: { first_name: firstName }, emailRedirectTo: CONFIRM_LANDING() }
        });
    submitBtn.disabled = false;

    if (error) {
      // The one error worth intercepting rather than printing. "Email not
      // confirmed" is not a failure the user can fix by trying again, and the
      // action it calls for (send me that link again) is not on screen - so
      // the panel replaces the message and puts the resend in front of them.
      if (error.code === 'email_not_confirmed' || /not confirmed/i.test(error.message)) {
        showEmailSentPanel({
          kind: 'signup',
          email,
          heading: 'Activate your account first',
          lead: 'This account exists but its email address has not been confirmed yet. The welcome email we sent has the activation link in it — clicking it is the last step.'
        });
        return;
      }
      showMessage(error.message, 'alert');
      return;
    }
    if (mode === 'sign-up') {
      // With "Confirm email" on, a successful signUp returns no session -
      // that is the signal that a confirmation mail went out and the account
      // is not usable yet. If it ever DOES return a session, confirmation has
      // been switched off in the dashboard, and pretending otherwise would
      // strand the user waiting for an email nobody sent.
      if (data?.session) {
        showMessage('Account created. You are logged in.', 'status');
        return;
      }
      // Note this same panel appears when the address is already registered:
      // Supabase returns a success with an obfuscated user rather than telling
      // a stranger which addresses have accounts here, and this screen does
      // not second-guess that. The mail that arrives in that case tells the
      // real owner what happened.
      showEmailSentPanel({
        kind: 'signup',
        email,
        heading: 'Check your email to activate your account',
        lead: 'We have sent you a welcome email with a link that activates your account. You need to click it before you can log in.'
      });
    }
    // A successful sign-in re-renders via onAuthStateChange below, not here.
  });
}

// Tracks what is currently painted, so a repeat notification of the state
// already on screen does not repaint it. This matters now that the signed-out
// view holds *state* - a "check your email" panel, or a half-filled reset form.
// onAuthStateChange fires INITIAL_SESSION on subscribe and can fire again for
// events that change nothing here, and each of those used to rebuild the form
// from scratch, throwing away whatever the user was in the middle of.
let paintedState = null;

function renderAccountRoot(session) {
  const root = document.getElementById('account-root');
  if (!root) return;
  if (!supabase) {
    root.innerHTML = '<h1>Account</h1><p style="color:var(--ink-faint);">Account features aren’t configured for this build yet.</p>';
    return;
  }
  // Keyed by user id rather than by a boolean, so signing in as someone else
  // (which the delete-then-signup path can produce) still repaints.
  const next = session ? `in:${session.user.id}` : 'out';
  if (next === paintedState) return;
  paintedState = next;
  if (session) renderSignedIn(root, session);
  else renderSignedOut(root);
}

async function init() {
  if (!supabase) {
    setNavAccountState(null);
    renderAccountRoot(null);
    return;
  }

  document.getElementById('nav-signout-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await supabase.auth.signOut();
      // onAuthStateChange below repaints the nav; reload so any page showing
      // personalized content (Home, Category, Search, /archived/) drops back
      // to the static build rather than keeping the previous user's rows.
      window.location.reload();
    } catch (err) {
      alert(err.message || 'Could not sign out.');
      btn.disabled = false;
    }
  });

  // Read before the first render, and only on the page that can say anything
  // about it. Both branches of renderAccountRoot use it - signed in it is a
  // banner, signed out it is the message above the form.
  justConfirmed = takeConfirmedFlag();

  const { data: { session } } = await supabase.auth.getSession();
  setNavAccountState(session);
  renderAccountRoot(session);

  supabase.auth.onAuthStateChange((_event, session) => {
    setNavAccountState(session);
    renderAccountRoot(session);
  });
}

document.addEventListener('DOMContentLoaded', init);
