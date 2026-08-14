import { supabase } from './supabaseClient.js';
import { initAccountStats } from './accountStats.js';
import { isAdmin } from './db.js';
import { esc, ICON } from './lib/render.mjs';

// These two mirror a rule that is actually enforced somewhere else: Supabase
// Auth's own password policy (dashboard → Authentication → Sign In / Providers
// → Email → Minimum password length, currently 10). Nothing in this file is a
// security control - a determined user can edit it out in devtools in about
// four seconds. What it buys is a decent error *before* a round trip, and a
// statement of the rules before someone has already picked a password.
//
// If you change the number in the dashboard, change it here too. There is no
// way to read the setting back from the client, so the two are kept in step by
// hand and by nothing else.
const MIN_PASSWORD_LENGTH = 10;
// Not a policy choice. Supabase hashes with bcrypt, which ignores everything
// past 72 *bytes* - so a longer password is silently truncated, and two
// passwords sharing their first 72 bytes are the same password as far as
// logging in is concerned. Better to say so than to let it happen invisibly.
// Bytes, not characters, is the real limit; this counts characters, which is
// the conservative direction for ASCII and the wrong one for heavy emoji use.
// Not worth a TextEncoder for a limit nobody is going near.
const MAX_PASSWORD_LENGTH = 72;

// Deliberately NOT checking for capitals, digits or symbols. Composition rules
// of that kind mostly produce "Password1!" - which satisfies every one of them
// and is far weaker than a long lowercase phrase. Current guidance (NIST
// SP 800-63B, NCSC) is length first, and the Supabase side is configured to
// match: minimum length raised, "Password Requirements" left at no required
// characters.
//
// The one content rule here is the containment check, which catches a pattern
// composition rules never do: a password built out of the account's own email
// or the first name typed into the field directly above it.
//
// Returns an array of human-readable problems, empty when the password passes.
function validatePassword(password, { email = '', firstName = '' } = {}) {
  const problems = [];
  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  // Reachable despite the maxlength attribute on the input: maxlength only
  // constrains what a *person* types or pastes, and a password manager filling
  // the field by assigning to .value walks straight past it.
  if (password.length > MAX_PASSWORD_LENGTH) {
    problems.push(`Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`);
  }

  const haystack = password.toLowerCase();
  // The part before the @, not the whole address - "sing@gmail.com" as a
  // password is the local part plus a domain everyone shares, and it is the
  // local part that makes it guessable.
  const localPart = email.split('@')[0].trim().toLowerCase();
  // The 3-character floor on both checks is what stops this being obnoxious.
  // A two-letter name or local part would reject any password happening to
  // contain those letters in order, which is most of them.
  if (localPart.length >= 3 && haystack.includes(localPart)) {
    problems.push('Password must not contain your email address.');
  }
  const name = firstName.trim().toLowerCase();
  if (name.length >= 3 && haystack.includes(name)) {
    problems.push('Password must not contain your name.');
  }
  return problems;
}

// Advisory only - nothing here can block a submit, and it is deliberately not
// wired into validatePassword(). A meter that vetoes is a composition rule
// wearing a different hat, and it fails the same way: it rejects long
// memorable phrases for lacking variety while waving through short noisy ones.
//
// No zxcvbn. It is the better estimator by some distance, but it is ~400KB for
// a hint, on a site whose entire dependency list is two packages. The scoring
// below is length-dominant on purpose, because that is what the policy above
// says matters - a meter rewarding a different thing to the rule it sits under
// would just be arguing with itself on screen.
//
// Returns 0-3, indexing STRENGTH_LEVELS.
function scorePassword(password) {
  const len = password.length;
  if (len < MIN_PASSWORD_LENGTH) return 0;
  let score = len >= 16 ? 3 : len >= 12 ? 2 : 1;
  // Variety earns at most one step, and only once the password is long enough
  // for that step to mean something. Cheap approximation of "search space is
  // bigger than 26 characters wide".
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/]
    .filter(re => re.test(password)).length;
  if (classes >= 3 && len >= 12) score = Math.min(3, score + 1);
  return score;
}

// Index 0 is what shows below the minimum - phrased as the rule rather than as
// a judgement ("Weak" would be misleading; it is not weak, it is not allowed).
const STRENGTH_LEVELS = [`Under ${MIN_PASSWORD_LENGTH} characters`, 'Weak', 'Good', 'Strong'];

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
  // concept (db.js's createCollection() has no admin check either).
  document.getElementById('new-collection-btn')?.toggleAttribute('hidden', !session);
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
  // Library is per-user content with no meaningful signed-out state - hide
  // rather than send an anonymous visitor to a page that just tells them
  // to sign in.
  document.getElementById('nav-library-link')?.toggleAttribute('hidden', !session);
  // Archived Prompts is per-user content too - same reasoning.
  document.getElementById('nav-archived-link')?.toggleAttribute('hidden', !session);
  // The Collections "(i)" tooltip is redundant signed out - the sidebar
  // already shows an explainer callout there instead of a live list
  // (collectionsNav.js), so the tooltip only earns its place once that
  // callout is gone.
  document.getElementById('collections-info-btn')?.toggleAttribute('hidden', !session);

  const adminLink = document.getElementById('nav-admin-link');
  if (!adminLink) return;
  if (!session) { adminLink.hidden = true; return; }
  // Async, so this can only ever add the link back after the page's initial
  // signed-out render (hidden by default in lib/render.mjs) - never remove
  // it early and cause a flash of admin nav for a non-admin.
  isAdmin().then(admin => { adminLink.hidden = !admin; });
}

function renderSignedIn(root, session) {
  // Sign out lives in the sidebar footer now (reachable from anywhere), so
  // this page's job is what the sidebar can't do: say something about the
  // library itself. Stats render asynchronously into #account-stats.
  // Widens the page for the stat grid; the signed-out form keeps the narrow
  // measure .account-page was sized for.
  root.closest('.account-page')?.classList.add('is-dashboard');
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
  root.innerHTML = `
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

function renderSignedOut(root) {
  root.closest('.account-page')?.classList.remove('is-dashboard');
  root.innerHTML = `
<h1>Account</h1>
<div class="filter-pill-group account-tabs">
  <button type="button" class="filter-pill is-active" data-tab="sign-in" aria-pressed="true">Log in</button>
  <button type="button" class="filter-pill" data-tab="sign-up" aria-pressed="false">Sign up</button>
</div>
<form id="auth-form" class="account-form">
  <!-- Sign-up only. One form serves both modes, so this field is hidden (and
       un-required) in sign-in mode by the tab handler below, rather than
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
  <label>Password
    <!-- The wrapper exists purely so the toggle has something to be
         positioned against. .account-form label is a flex column, and an
         absolutely-positioned child of that would anchor to the label - i.e.
         to the "Password" text as well as the input - rather than to the
         field itself. -->
    <span class="pw-field">
      <input type="password" name="password" required autocomplete="current-password">
      <button type="button" id="auth-pw-toggle" class="icon-btn pw-toggle"
              aria-pressed="false" aria-label="Show password" data-tip="Show password">${ICON.eye}</button>
    </span>
  </label>
  <!-- Stated before the attempt rather than revealed by failing one. Both of
       these are hidden in sign-in mode - the rules do not apply to a password
       that already exists, and rating one the user cannot change here would be
       a pointless thing to do to somebody trying to log in. -->
  <p id="auth-password-rules" class="auth-rules" hidden>At least ${MIN_PASSWORD_LENGTH} characters. No capitals, digits or symbols needed — length does more for security than variety does.</p>
  <div id="auth-strength" class="auth-strength" hidden>
    <div class="auth-strength-bar"><span></span></div>
    <!-- aria-live so the rating is announced as it changes; the bar itself is
         decorative and carries no text of its own. -->
    <span class="auth-strength-label" aria-live="polite"></span>
  </div>
  <button type="submit" id="auth-submit-btn" class="btn btn-primary">Log in</button>
  <p id="auth-message" hidden></p>
</form>`;

  const tabs = [...root.querySelectorAll('[data-tab]')];
  const submitBtn = root.querySelector('#auth-submit-btn');
  const passwordInput = root.querySelector('input[name=password]');
  const form = root.querySelector('#auth-form');
  const messageEl = root.querySelector('#auth-message');
  let mode = 'sign-in';

  const firstNameField = root.querySelector('#auth-firstname-field');
  const firstNameInput = firstNameField.querySelector('input');
  const pwToggle = root.querySelector('#auth-pw-toggle');
  const rulesEl = root.querySelector('#auth-password-rules');
  const strengthEl = root.querySelector('#auth-strength');
  const strengthFill = strengthEl.querySelector('.auth-strength-bar span');
  const strengthLabel = strengthEl.querySelector('.auth-strength-label');

  // Both call sites set role as well as text - a message that stays role=alert
  // from a previous failure would have the next success announced as an error.
  function showMessage(text, role) {
    messageEl.textContent = text;
    messageEl.setAttribute('role', role);
    messageEl.hidden = false;
  }

  // Show/hide password (§9ai). Worth having on both tabs, not just sign-up:
  // the commonest use is checking a password manager's generated string
  // actually landed in the field, and the second commonest is working out why
  // a login keeps failing.
  //
  // aria-pressed carries the state, aria-label and data-tip carry the action.
  // The icon alone names nothing to a screen reader, and an eye with no label
  // is ambiguous even visually - it reads equally as "is shown" or "click to
  // show".
  function setPasswordVisible(visible) {
    // Guard: this runs from setMode() too, which fires on every tab click.
    // Without it, switching tabs would re-render the icon and reset the
    // selection below for no reason.
    if ((passwordInput.type === 'text') === visible) return;
    // Restoring the caret is the whole reason this is more than one line.
    // Changing an input's type discards its selection in every engine tested,
    // so a toggle mid-typing would otherwise dump the cursor at one end of the
    // field - which is exactly when someone reaches for this control.
    const { selectionStart, selectionEnd } = passwordInput;
    const hadFocus = document.activeElement === passwordInput;
    passwordInput.type = visible ? 'text' : 'password';
    if (hadFocus) {
      passwordInput.focus();
      // try/catch because selectionStart is null on some input types and
      // setSelectionRange throws on those; not worth failing a toggle over.
      try { passwordInput.setSelectionRange(selectionStart, selectionEnd); } catch {}
    }
    pwToggle.innerHTML = visible ? ICON.eyeOff : ICON.eye;
    pwToggle.setAttribute('aria-pressed', String(visible));
    const label = visible ? 'Hide password' : 'Show password';
    pwToggle.setAttribute('aria-label', label);
    pwToggle.dataset.tip = label;
  }

  pwToggle.addEventListener('click', () => {
    setPasswordVisible(passwordInput.type === 'password');
  });

  function updateStrength(password) {
    // Nothing to rate on an empty field, and an empty field is the state the
    // form opens in - showing "Under 10 characters" before a single keystroke
    // reads as a complaint about something the user has not done yet.
    if (!password) { strengthEl.hidden = true; return; }
    const score = scorePassword(password);
    strengthEl.hidden = false;
    strengthEl.dataset.score = String(score);
    strengthFill.style.width = `${((score + 1) / 4) * 100}%`;
    strengthLabel.textContent = STRENGTH_LEVELS[score];
  }

  function setMode(tab) {
    mode = tab.dataset.tab;
    tabs.forEach(t => {
      const active = t === tab;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-pressed', String(active));
    });
    submitBtn.textContent = mode === 'sign-in' ? 'Log in' : 'Sign up';
    passwordInput.autocomplete = mode === 'sign-in' ? 'current-password' : 'new-password';
    // Both, together, always - see the comment on the field itself.
    const signingUp = mode === 'sign-up';
    firstNameField.hidden = !signingUp;
    firstNameInput.required = signingUp;
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
    // Re-mask on every tab switch. Leaving a password on screen because the
    // user changed tabs is a decision nobody made - the reveal was asked for
    // in one context and should not silently carry into another.
    setPasswordVisible(false);
    // Re-rate rather than just hide: switching tabs with a password already
    // typed would otherwise leave the previous mode's rating on screen, or
    // leave a sign-up password unrated until the next keystroke.
    if (signingUp) updateStrength(passwordInput.value);
    else strengthEl.hidden = true;
    messageEl.hidden = true;
  }

  // Only meaningful in sign-up mode; updateStrength is a no-op elsewhere
  // because setMode has already hidden the meter and nothing here shows it
  // again.
  passwordInput.addEventListener('input', () => {
    if (mode === 'sign-up') updateStrength(passwordInput.value);
  });

  tabs.forEach(tab => tab.addEventListener('click', () => setMode(tab)));

  // /why-sign-in/ links Sign up at /account/#sign-up. Without this the split
  // into two buttons would be cosmetic - both would land on the log-in form
  // and the reader would have to find the tab themselves. Reusing setMode()
  // rather than setting `mode` directly is what keeps the first-name field's
  // hidden/required pair in step; setting the variable alone would show a
  // sign-up form that silently refuses to submit.
  if (location.hash === '#sign-up') {
    const tab = tabs.find(t => t.dataset.tab === 'sign-up');
    if (tab) setMode(tab);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    messageEl.hidden = true;
    submitBtn.disabled = true;
    const email = form.email.value.trim();
    const password = form.password.value;
    const firstName = form.first_name.value.trim();

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
    const { error } = mode === 'sign-in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email, password,
          options: { data: { first_name: firstName } }
        });
    submitBtn.disabled = false;

    if (error) {
      showMessage(error.message, 'alert');
      return;
    }
    if (mode === 'sign-up') {
      showMessage('Check your email to confirm your account, then sign in.', 'status');
    }
    // A successful sign-in re-renders via onAuthStateChange below, not here.
  });
}

function renderAccountRoot(session) {
  const root = document.getElementById('account-root');
  if (!root) return;
  if (!supabase) {
    root.innerHTML = '<h1>Account</h1><p style="color:var(--ink-faint);">Account features aren’t configured for this build yet.</p>';
    return;
  }
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

  const { data: { session } } = await supabase.auth.getSession();
  setNavAccountState(session);
  renderAccountRoot(session);

  supabase.auth.onAuthStateChange((_event, session) => {
    setNavAccountState(session);
    renderAccountRoot(session);
  });
}

document.addEventListener('DOMContentLoaded', init);
