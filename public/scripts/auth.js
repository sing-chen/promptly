import { supabase } from './supabaseClient.js';
import { isAdmin } from './db.js';

function setNavAccountState(session) {
  const link = document.getElementById('nav-account-link');
  if (link) link.textContent = session ? session.user.email : 'Sign in';
  // Open to any signed-in user (db.js's createPrompt() has no admin check) -
  // the New Prompt modal's own "make this a default prompt" checkbox is
  // admin-gated, not the button itself. Starts hidden server-side so
  // anonymous visitors (the majority) never see a flash of it before this
  // runs.
  document.getElementById('new-prompt-btn')?.toggleAttribute('hidden', !session);
  // Same reasoning as New Prompt - collections are per-user, no admin
  // concept (db.js's createCollection() has no admin check either).
  document.getElementById('new-collection-btn')?.toggleAttribute('hidden', !session);

  const adminLink = document.getElementById('nav-admin-link');
  if (!adminLink) return;
  if (!session) { adminLink.hidden = true; return; }
  // Async, so this can only ever add the link back after the page's initial
  // signed-out render (hidden by default in lib/render.mjs) - never remove
  // it early and cause a flash of admin nav for a non-admin.
  isAdmin().then(admin => { adminLink.hidden = !admin; });
}

function renderSignedIn(root, session) {
  root.innerHTML = `
<h1>Account</h1>
<p>Signed in as <strong>${session.user.email}</strong></p>
<button type="button" id="sign-out-btn" class="btn btn-secondary">Sign out</button>`;
  root.querySelector('#sign-out-btn').addEventListener('click', () => supabase.auth.signOut());
}

function renderSignedOut(root) {
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

  const { data: { session } } = await supabase.auth.getSession();
  setNavAccountState(session);
  renderAccountRoot(session);

  supabase.auth.onAuthStateChange((_event, session) => {
    setNavAccountState(session);
    renderAccountRoot(session);
  });
}

document.addEventListener('DOMContentLoaded', init);
