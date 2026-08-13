import { supabase } from './supabaseClient.js';
import { initAccountStats } from './accountStats.js';
import { isAdmin } from './db.js';

function setNavAccountState(session) {
  const link = document.getElementById('nav-account-link');
  if (link) link.textContent = session ? session.user.email : 'Sign in';
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
  root.innerHTML = `
<h1>Account</h1>
<p class="account-identity">Signed in as <strong>${session.user.email}</strong></p>
<div id="account-stats"></div>`;
  initAccountStats(document.getElementById('account-stats'), session.user);
}

function renderSignedOut(root) {
  root.closest('.account-page')?.classList.remove('is-dashboard');
  root.innerHTML = `
<h1>Account</h1>
<div class="filter-pill-group account-tabs">
  <button type="button" class="filter-pill is-active" data-tab="sign-in" aria-pressed="true">Sign in</button>
  <button type="button" class="filter-pill" data-tab="sign-up" aria-pressed="false">Sign up</button>
</div>
<form id="auth-form" class="account-form">
  <label>Email
    <input type="email" name="email" required autocomplete="email">
  </label>
  <label>Password
    <input type="password" name="password" required minlength="6" autocomplete="current-password">
  </label>
  <button type="submit" id="auth-submit-btn" class="btn btn-primary">Sign in</button>
  <p id="auth-message" hidden></p>
</form>`;

  const tabs = [...root.querySelectorAll('[data-tab]')];
  const submitBtn = root.querySelector('#auth-submit-btn');
  const passwordInput = root.querySelector('input[name=password]');
  const form = root.querySelector('#auth-form');
  const messageEl = root.querySelector('#auth-message');
  let mode = 'sign-in';

  tabs.forEach(tab => tab.addEventListener('click', () => {
    mode = tab.dataset.tab;
    tabs.forEach(t => {
      const active = t === tab;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-pressed', String(active));
    });
    submitBtn.textContent = mode === 'sign-in' ? 'Sign in' : 'Sign up';
    passwordInput.autocomplete = mode === 'sign-in' ? 'current-password' : 'new-password';
    messageEl.hidden = true;
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    messageEl.hidden = true;
    submitBtn.disabled = true;
    const email = form.email.value.trim();
    const password = form.password.value;
    const { error } = mode === 'sign-in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
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
