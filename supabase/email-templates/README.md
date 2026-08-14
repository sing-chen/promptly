# Transactional email — the dashboard half of A1

Everything in this folder is **configuration**, not code. No migration captures
it, nothing in the build reads it, and if the project is ever rebuilt from this
repo it has to be re-entered by hand. That is exactly why it is written down.

The app-side half of A1 is built and shipped (§9ar): sign-up says an activation
email is coming and warns about spam, unconfirmed log-ins offer a resend,
`/account/#forgot` requests a reset link, and `/reset-password/` is where that
link lands. **None of it does anything until the four steps below are done.**

## Current sender — update this line when it changes

> **Gmail SMTP (the §1a interim), live and tested.** Configured 14 August 2026
> and proven end to end: sign-up, confirmation, resend, log-in-before-confirming,
> password reset and the expired-link screen all behave, and **the mail reached
> the inbox — not spam — on both Gmail and Outlook**. That last fact is the one
> nothing in this repo could establish, and it is what makes the interim good
> enough to open sign-ups on.
>
> **Still the interim.** §6 is the cutover to a domain plus Resend, gated on
> OPEN_ITEMS.md A5, and it carries the two things that must not be forgotten:
> revoke the Google app password, and add the email provider to `/privacy/` §7
> before anyone but you has an account.
>
> *Last updated: 14 August 2026.*

This line exists because a dated status claim with no sign of being old is the
failure this project has met three times (CLAUDE.md on v6, the deploy hook, the
"not yet configured" note that outlived itself). Move it when you move the
setting, in the same sitting.

---

## 1. A sending domain — the real blocker, and the one to decide first

### The two options that look like they should work, and don't

Both were asked about directly, so the answers are recorded here rather than
left to be re-derived.

**Supabase's built-in sender is not merely rate-limited — it will not send to
your users at all.** Two separate limits, and the second is the decisive one:

- **2 emails per hour**, project-wide.
- **It refuses to deliver to any address that is not a member of the project's
  team.** ([Supabase docs](https://supabase.com/docs/guides/auth/auth-smtp).)

So it is not a degraded service that gets people signed up slowly. The first
stranger who signs up gets *nothing*, and the app will sit on "check your
email" indefinitely. There is no paid Supabase tier that changes this: custom
SMTP is the supported path on every plan, Pro included. It is called "test
only" because it exists to let you preview the templates.

*Worth knowing for later:* once custom SMTP **is** configured, Supabase applies
its own auth-email rate limit of **30 new users per hour** by default,
adjustable under Authentication → Rate Limits. That one is a real ceiling on
sign-ups rather than a wall, and 30/hour is far above anything this project
expects.

**SimpleLogin cannot send this mail.** It is an alias and *forwarding* service:
it receives at `contact@promptly.simplelogin.com` and passes messages on to a
real mailbox. It deliberately offers **no SMTP access** — the only way to send
from an alias is a reverse-alias, which is a human replying by hand, not
something an application can drive. Their own position is that they are not a
transactional email service and will not open SMTP
([simple-login/app discussion #679](https://github.com/simple-login/app/discussions/679)).
There is a third-party relay project on GitHub that bolts SMTP onto it; running
unofficial infrastructure in the path of your account-activation emails is a
worse failure mode than the problem it solves.

Two further reasons it would not help even if it did: the alias lives on
`simplelogin.com`, a domain **SimpleLogin** controls, so you could not publish
SPF or DKIM records for it either — the exact problem you would be trying to
solve. And forwarding is what it is good at, which is why it stays as the
contact address and the reply-to.

### What that leaves

Custom SMTP means a transactional email provider (Resend, Postmark, Brevo,
Mailgun, SES — any of them). All of them require you to **verify a domain you
control** by publishing SPF and DKIM records in its DNS, because that is what
makes a mailbox provider willing to accept mail claiming to be from you.

And that is the part with no clean answer today: **the site is on a
`*.vercel.app` subdomain, and you cannot publish DNS records for it.** So there
are two real routes and one placeholder, and picking is a decision, not a task:

| Route | What it costs | What it gets you |
| --- | --- | --- |
| **Register a domain** (the end state) | ~£10/year, plus pointing it at Vercel, plus an evening | Aligned SPF/DKIM/DMARC, `hello@yourdomain` as the sender, and a name that is yours — settle OPEN_ITEMS.md **A5** first, since a domain bought for a name you then change is money spent twice |
| **Gmail SMTP with an app password** (works today, no domain) | Free, ~15 minutes | `smtp.gmail.com:587` with a Google app password, sending as `singfenchen@gmail.com`. ~500 recipients/day — orders of magnitude above what this needs — and Google's own sending reputation, so it lands. Costs no new disclosure: that address is already published as the controller contact in `LEGAL_DETAILS` |
| **Provider sandbox** (e.g. Resend's `onboarding@resend.dev`) | Free, minutes | Proves the wiring and nothing else — sandboxes generally deliver only to *your own* verified address, so it cannot test a real sign-up |

### Resend's free tier, since it is the likely destination

Checked August 2026. Free: **3,000 emails/month, capped at 100/day**, **one**
verified domain, 30-day log retention, ticket support, no dedicated IP. Paid
starts at $20/month for 50,000 and removes the daily cap.

Against this project's actual volume that is not close: one email per sign-up
plus the occasional reset. 100/day is the binding limit rather than the
monthly 3,000, and it would take a hundred sign-ups in a day to reach it. Worth
knowing what happens if you ever did, though — the cap is hard, so auth mail
simply stops until the next day, which for this app means sign-ups that cannot
be completed.

The **one domain** is the part that interacts with the decision above: it is
enough for `promptly.<yourdomain>` and nothing else, so there is no free
staging sender.

Resend also offers `onboarding@resend.dev` with no domain at all, which is the
"provider sandbox" row of the table — it will only deliver to the address you
registered the account with, so it proves the SMTP wiring and cannot test a
real sign-up.

SMTP settings for the Supabase form below, once a domain is verified: host
`smtp.resend.com`, port 587, username the literal string `resend`, password an
API key. Publish the SPF and DKIM records Resend gives you, and a DMARC record
while you are in the DNS — the first two are what get you accepted, the third
is what stops someone else sending as you.

The Gmail route's honest caveats, since it is the one that will be tempting:
it needs 2-step verification on the account before an app password can be
created; the From address is a personal mailbox rather than the service's own
identity, which reads as less trustworthy in an inbox and cannot be handed to
anyone else later; and Google's terms are written for personal correspondence
rather than application relay — unenforced at a handful of messages a day, but
it is not a permanent arrangement. Treat it as the thing that unblocks the
first real sign-ups, not as the answer.

The rest of this file works for either route.

## 1a. The Gmail interim — setting it up

**Chosen deliberately as a temporary sender**, to unblock the test sequence in
§5 without waiting on a domain decision. §6 is how it gets undone; read it
before you start, because one of its steps is easier now than later.

**Step 1 — an app password.** Google account → Security → 2-Step Verification
must be **on** first; app passwords do not exist without it. Then Security →
App passwords, create one named `Promptly SMTP`, and copy the 16-character
value. It is shown once.

- If App passwords is missing from the page, the account is either without
  2-Step Verification or enrolled in Advanced Protection, which disables them
  outright. Workspace admins can also switch them off tenant-wide.
- **This is a password to your whole mailbox, scoped only by the fact that it
  cannot pass a 2FA challenge.** It goes into Supabase and nowhere else — not
  into this repo, not into `.env.local`, not into a note. Revoke it from the
  same page the moment §6 is done, and treat "revoked" rather than "unused" as
  the finished state.

**Step 2 — the Supabase form.** Dashboard → **Authentication → Emails** (under
*Notifications* in the Authentication sidebar — see §2, and note it is not
under Project Settings). Values are in §2's table, Gmail column: host
`smtp.gmail.com`, port 587, username the full Gmail address, password the app
password, sender email the same address, sender name `Promptly`.

**Step 3 — a note on what recipients will see.** Gmail rewrites `From` to the
authenticated account, so the mail arrives from `singfenchen@gmail.com` under
the display name Promptly, and replies land in that mailbox. That address is
already the published controller contact in `LEGAL_DETAILS`, so this discloses
nothing new — but it is why the interim cannot simply be left running once
other people hold accounts: the service's mail should come from the service.

**What this does *not* change:** nothing in this repo, and nothing about the
app. The `/account/` flows, the templates, the redirect allow-list and the
60-second resend cooldown are identical on either sender. That is what makes
§6 a settings change rather than a rebuild.

**One thing to decide before real sign-ups, not before testing:** while you are
the only account, Google is processing your own address and nobody else's, so
`/privacy/` §7 is still accurate. The moment a stranger signs up, an email
provider is seeing *their* address and the notice's processor list is wrong
until it says so. See §6 — the same edit is needed for Resend, so the honest
version is that A1's privacy edit is owed on **whichever** sender is live at
launch, not on the interim specifically.

## 2. Custom SMTP

Dashboard → **Authentication → Emails**, the entry under the *Notifications*
heading in the Authentication sidebar. **The same page carries the templates
(§4)** — SMTP and the message bodies are two parts of one screen, not two
places.

*Verified against the dashboard on 14 August 2026.* Written down because this
one has moved: it is **not** under Project Settings, and older guides (and an
earlier draft of this file) send you to `Project Settings → Authentication →
SMTP Settings`, which does not exist — Project Settings has no Authentication
section at all. If it has moved again, the reliable landmark is that SMTP
configuration lives with the email templates, wherever those are.

| Field | Value |
| --- | --- |
| Enable Custom SMTP | on |
| Sender email | an address at the verified domain, e.g. `hello@yourdomain` — or the Gmail account itself on that route, since Gmail rewrites From to the authenticated address anyway |
| Sender name | `Promptly` |
| Host / Port | from the provider (587 with STARTTLS is the usual choice; 465 for implicit TLS). Gmail: `smtp.gmail.com`, 587 |
| Username / Password | the provider's SMTP credentials — an API key, not your account password. Gmail: the full address, and a **16-character app password**, never the account password |
| Minimum interval between emails | leave at 60 seconds |

That last one is not cosmetic: the resend button on `/account/` starts its own
60-second countdown to match it (`RESEND_COOLDOWN_SECONDS` in
`public/scripts/auth.js`). If you change one, change the other, or the button
will invite a press that is guaranteed to fail.

**Reply-to.** The site publishes `contact@promptly.simplelogin.com` everywhere
else, so either send from an address that can receive replies or set the
provider's reply-to to that alias. An unmonitored no-reply address contradicts
the privacy notice's commitment to answering rights requests.

## 3. Auth settings

Dashboard → **Authentication → Sign In / Providers → Email**:

| Setting | Value | Why |
| --- | --- | --- |
| **Confirm email** | **on** | Decided as part of §9ar. Nobody can log in until they click the link. The app is written for this: `signUp()` returning no session is what tells it the mail went out, and it says so explicitly if a session ever comes back instead |
| **Secure password change** | **off — considered, not overlooked** (14 Aug 2026) | It would require re-authentication before a signed-in caller can change their password. Left off: the exposure it closes is someone with an already-unlocked browser, and the `/account/` → `/reset-password/` route (§9au) is a routine action that a re-auth prompt would make feel like a recovery. Worth revisiting if the site ever holds anything a stranger would want, which today it does not — a library of prompts you can also export in one click |

Dashboard → **Authentication → URL Configuration**:

| Setting | Value |
| --- | --- |
| Site URL | the production origin, e.g. `https://promptly-xyz.vercel.app` |
| Redirect URLs | `https://<production origin>/account/**` and `https://<production origin>/reset-password/**`, plus `http://localhost:4173/**` while developing |

**This is the step that fails silently.** If a redirect target is not on the
allow-list, Supabase does not error — it substitutes the Site URL. The visitor
lands on the home page, confirmed but unexplained, or on a password-reset
journey with no password form at the end of it. Both read as "the link didn't
work".

**Link expiry.** Whatever the dashboard's OTP/link expiry is set to, three
pieces of copy state it in words: 24 hours in `confirm-signup.html`, one hour
in `reset-password.html` and in the `/account/` reset panel
(`public/scripts/auth.js`). Nothing keeps them honest but this paragraph — set
the dashboard to match, or change the words.

## 4. The templates

Dashboard → **Authentication → Emails** — the same page as §2, one tab per
template. Paste the file contents into the message body and set the subject.

| Template tab | File | Subject |
| --- | --- | --- |
| Confirm signup | [`confirm-signup.html`](confirm-signup.html) | `Welcome to Promptly — one step to activate your account` |
| Reset Password | [`reset-password.html`](reset-password.html) | `Set a new password for Promptly` |

The other tabs (Magic Link, Invite, Change Email Address) are unused: this
project has no magic-link or invite flow, and no UI for changing an account's
address. Leave them at Supabase's defaults rather than styling mail that cannot
be sent.

### Why there is no separate welcome email

The confirmation email **is** the welcome email, and that is a decision rather
than a shortcut. Three reasons, any one of which would be enough:

- Supabase's templates only cover mail **Supabase Auth itself sends**. A
  standalone welcome message would need its own sender and its own trigger — a
  webhook or Edge Function on user creation — which is a service to build and
  maintain for one message.
- Two emails arriving within a second of each other, one of which must be acted
  on, is how the one that matters gets missed.
- A welcome-only email that is not required for the account to work starts
  looking like marketing, and marketing mail is blocked for reasons that have
  nothing to do with plumbing — see OPEN_ITEMS.md **E6**. Keeping the welcome
  inside the transactional mail keeps it on the right side of that line: it is
  sent because the user asked for an account, and it exists to complete that
  request.

### `{{ .Data.first_name }}`

Both templates greet by first name where there is one. `.Data` is the user's
`raw_user_meta_data`, which `public/scripts/auth.js` populates at `signUp()`
time — the only moment it can, since the value is read when the mail is
triggered. Every template guards it with `{{ if .Data.first_name }}`, because
accounts created before that field existed (including the admin account) have
no name at all and would otherwise be greeted as "Welcome, ".

## 5. Testing it

In order, because each step depends on the one above.

**Do this on a throwaway address, not on the admin account.** Two reasons, and
the second is the one that bites: `ensure_seeded()` deliberately no-ops for
admins, so an admin sign-up exercises none of the copying a real new account
does — and the admin account cannot be deleted from the UI (`0008` refuses), so
a test on it is not undoable. Option D/E in
[`reset_prompts.sql`](../reset_prompts.sql) clears a throwaway afterwards, and
`/account/`'s own delete does it through the real UI.

1. Sign up in the app with a real address you can read. The form should land on
   **"Check your email to activate your account"**.
2. The mail arrives. Check where it landed — inbox or spam — from at least one
   Gmail address and one Outlook/Hotmail address, since they disagree about new
   senders more than any other pair.
3. Try to log in *before* clicking the link. You should get the **"Activate
   your account first"** panel with a resend button, not a raw error.
4. Click the activation link. You should land on `/account/` logged in, with
   the green confirmation banner above the heading.
5. Log out, choose **Forgotten your password?**, and check the reset mail
   arrives.
6. Follow it. `/reset-password/` should show the form, not the "no longer
   valid" state. Set a password and confirm you stay logged in.
7. **Log out first, or open a private window** — then follow the *same* reset
   link a second time. It should say the link is no longer valid.

**Step 7 only tests anything if you are logged out**, and this instruction
originally forgot to say so — which is how the first live run "failed" it. Step
6 leaves you signed in on purpose, and `/reset-password/` serves a signed-in
caller the form regardless of the link, because they can genuinely change their
password whether or not the link was any good. So a second click while signed
in shows the form, and that is correct behaviour, not a spent link being
honoured.

What that run *did* find is worth keeping: the page used to render that form
with no mention of the dead link at all, leaving no way to tell a spent link
from a live one. It now says so in a banner and keeps the form (§9as). Both
halves matter — the honest message, and not taking away an action the visitor
is entitled to.

Step 7 is still the one people skip, and it is the only check on the
fragment-error path.

**And the one thing this repo can never test:** whether mail from your domain
actually reaches strangers. Deliverability is a property of DNS records and
sender reputation, not of code. Publish SPF, DKIM and a DMARC record, then send
to accounts you do not own.

## 6. The cutover — getting off the Gmail interim

Written before the interim was switched on, deliberately. A temporary
arrangement with no written exit is just a permanent one that nobody has
admitted to yet, and this one has a real cost while it runs: the service's mail
comes from a personal mailbox, and the credential in the Supabase form is a
password to that entire mailbox.

**The trigger is not a date.** Cut over when the first of these is true:

- **Sign-ups are about to open to anyone who is not you.** This is the hard
  one. It is also the point at which the privacy edit below stops being
  optional.
- **A5 is settled** and a domain has been bought. Nothing then argues for
  staying.
- Mail starts landing in spam for recipients who are not on Gmail, which is the
  interim's most likely way of failing.

**The steps, in order:**

1. Register the domain and point it at Vercel. (A5 first — a domain bought for
   a name you then change is money spent twice.)
2. Create the Resend account, add the domain, publish the SPF and DKIM records
   it gives you, and add a DMARC record while you are in the DNS.
3. Change **five fields** in Supabase → Authentication → Emails (§2):
   host `smtp.resend.com`, port 587, username `resend`, password
   the Resend API key, sender email `hello@<yourdomain>`. Leave sender name and
   the 60-second interval alone.
4. If the site itself moves to the new domain, update **Site URL** and the
   **Redirect URLs** allow-list to match, or every emailed link silently lands
   on the home page (§3).
5. **Revoke the Google app password**, from the same page it was created on.
   Not "stop using it" — revoke it. This is the step that gets skipped, and it
   is the one that matters, because the credential outlives the configuration.
6. Re-run §5 end to end. It is a different sender, so nothing about the
   previous pass carries over — in particular step 2, which is the only check
   on the thing that actually changed.
7. Update the **Current sender** line at the top of this file, and A1 in
   [OPEN_ITEMS.md](../../OPEN_ITEMS.md).

**And the edit that is owed on whichever sender is live at launch:** `/privacy/`
§7 lists Supabase and Vercel as the processors and credits "service email" to
Supabase. Custom SMTP makes that untrue — Google on the interim, Resend after —
because the sender sees the address every confirmation and reset goes to. The
list needs a fourth entry naming the live provider, and the sentence about
Supabase handling service email needs correcting. `lib/render.mjs` carries the
same warning beside `LEGAL_DETAILS`. It is not owed while you are the only
account, because the only address being processed is your own; it is owed the
day anyone else can sign up.

**What is *not* part of a cutover:** anything in this repo. No rebuild, no
deploy, no code change — the app is written against Supabase Auth, which is
written against SMTP, and neither of them knows or cares which server is on the
other end. That is the property worth preserving: if a future change to the
email flows makes the app depend on a specific provider, it has broken this.
