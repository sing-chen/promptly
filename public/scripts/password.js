// Password rules, scoring and the two field behaviours that go with them.
//
// Extracted from auth.js in §9ar, when /reset-password/ became a second place
// a *new* password is chosen. The alternative was a second copy of the rules
// on that page, which fails in the quiet direction: the copy drifts, the form
// says one thing, Supabase enforces another, and the user is told their
// perfectly valid password is invalid (or worse, the reverse). One definition,
// two consumers.
//
// Nothing in here is a security control - a determined user can edit any of it
// out in devtools in about four seconds. What it buys is a decent error
// *before* a round trip, and a statement of the rules before someone has
// already picked a password.

// This mirrors a rule that is actually enforced somewhere else: Supabase
// Auth's own password policy (dashboard → Authentication → Sign In / Providers
// → Email → Minimum password length, currently 10).
//
// If you change the number in the dashboard, change it here too. There is no
// way to read the setting back from the client, so the two are kept in step by
// hand and by nothing else.
export const MIN_PASSWORD_LENGTH = 10;
// Not a policy choice. Supabase hashes with bcrypt, which ignores everything
// past 72 *bytes* - so a longer password is silently truncated, and two
// passwords sharing their first 72 bytes are the same password as far as
// logging in is concerned. Better to say so than to let it happen invisibly.
// Bytes, not characters, is the real limit; this counts characters, which is
// the conservative direction for ASCII and the wrong one for heavy emoji use.
// Not worth a TextEncoder for a limit nobody is going near.
export const MAX_PASSWORD_LENGTH = 72;

// The one sentence shown under the field, kept here so the two forms cannot
// describe the same rule differently.
export const PASSWORD_RULES_TEXT =
  `At least ${MIN_PASSWORD_LENGTH} characters. No capitals, digits or symbols needed — length does more for security than variety does.`;

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
export function validatePassword(password, { email = '', firstName = '' } = {}) {
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
export function scorePassword(password) {
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
export const STRENGTH_LEVELS = [`Under ${MIN_PASSWORD_LENGTH} characters`, 'Weak', 'Good', 'Strong'];

// Show/hide password (§9ai), as a behaviour attachable to any field rather
// than a block of code inside one form. Worth having wherever a password is
// typed, not just on sign-up: the commonest use is checking a password
// manager's generated string actually landed in the field, and the second
// commonest is working out why a login keeps failing.
//
// aria-pressed carries the state, aria-label and data-tip carry the action.
// The icon alone names nothing to a screen reader, and an eye with no label
// is ambiguous even visually - it reads equally as "is shown" or "click to
// show".
//
// Returns a setter so callers that need to force the field back to masked
// (auth.js does, on every tab switch) do not have to reach into the DOM
// themselves.
export function attachPasswordToggle(input, button, { eye, eyeOff }) {
  function setVisible(visible) {
    // Guard: callers invoke this on state changes that may not be a change at
    // all (auth.js calls it from setMode(), which fires on every tab click).
    // Without it, switching tabs would re-render the icon and reset the
    // selection below for no reason.
    if ((input.type === 'text') === visible) return;
    // Restoring the caret is the whole reason this is more than one line.
    // Changing an input's type discards its selection in every engine tested,
    // so a toggle mid-typing would otherwise dump the cursor at one end of the
    // field - which is exactly when someone reaches for this control.
    const { selectionStart, selectionEnd } = input;
    const hadFocus = document.activeElement === input;
    input.type = visible ? 'text' : 'password';
    if (hadFocus) {
      input.focus();
      // try/catch because selectionStart is null on some input types and
      // setSelectionRange throws on those; not worth failing a toggle over.
      try { input.setSelectionRange(selectionStart, selectionEnd); } catch {}
    }
    button.innerHTML = visible ? eyeOff : eye;
    button.setAttribute('aria-pressed', String(visible));
    const label = visible ? 'Hide password' : 'Show password';
    button.setAttribute('aria-label', label);
    button.dataset.tip = label;
  }

  button.addEventListener('click', () => setVisible(input.type === 'password'));
  return setVisible;
}

// Paints the advisory meter. `el` is the .auth-strength block; it must contain
// .auth-strength-bar span and .auth-strength-label, which both forms render
// from the same markup shape.
export function renderStrength(el, password) {
  // Nothing to rate on an empty field, and an empty field is the state both
  // forms open in - showing "Under 10 characters" before a single keystroke
  // reads as a complaint about something the user has not done yet.
  if (!password) { el.hidden = true; return; }
  const score = scorePassword(password);
  el.hidden = false;
  el.dataset.score = String(score);
  el.querySelector('.auth-strength-bar span').style.width = `${((score + 1) / 4) * 100}%`;
  el.querySelector('.auth-strength-label').textContent = STRENGTH_LEVELS[score];
}
