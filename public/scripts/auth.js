import { supabase } from './supabaseClient.js';
import { initAccountStats } from './accountStats.js';
import { isAdmin } from './db.js';
import { esc } from './lib/render.mjs';

function setNavAccountState(session) {
  const link = document.getElementById('nav-account-link');
  if (link) link.textContent = session ? session.user.email : 'Log in';
  // Sign out lives under the email in the sidebar so it's reachable from
  // anywhere, rather than only via /account/. Nothing to sign out of when
  // signed out, so it's hidden then.
  document.getElementById('nav-signout-btn')?.toggleAttribute('hidden', !session);
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
  // Categories are editable only when signed in (BUILD_BRIEF_v6.md §4.1) -
  // a guest still sees the list, just not the "+" that adds to it.
  document.getElementById('new-category-btn')?.toggleAttribute('hidden', !session);
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
  <label>Password
    <input type="password" name="password" required minlength="6" autocomplete="current-password">
  </label>
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
    messageEl.hidden = true;
  }

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
      messageEl.textContent = error.message;
      messageEl.setAttribute('role', 'alert');
      messageEl.hidden = false;
      return;
    }
    if (mode === 'sign-up') {
      messageEl.textContent = 'Check your email to confirm your account, then sign in.';
      messageEl.setAttribute('role', 'status');
      messageEl.hidden = false;
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
