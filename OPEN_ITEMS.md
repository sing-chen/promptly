# Promptly — open items

**The single register.** Everything not built, not decided, or deliberately deferred
lives here. It replaces five separate lists that had drifted apart and, in two places,
contradicted each other:

| Was | Now |
| --- | --- |
| BUILD_BRIEF_v4.md §7 | pointer here |
| BUILD_BRIEF_v5.md §9 | pointer here |
| BUILD_BRIEF_v6.md §9 | pointer here |
| BUILD_BRIEF.md §12 | pointer here |
| `supabase/README.md` "Next steps" | pointer here |

Those documents keep their design rationale and their pass-by-pass history — that is
what they are for. What moved here is the *status*: what is outstanding, what is
decided, and what is done. `supabase/README.md`'s **Status** section stays where it is
and is not duplicated here; it answers "what exists in the database", which is a
different question from "what is left to do".

Sections are ordered by **gate** — what has to be true before an item matters — rather
than by topic, because the ordering between them is the part that is easy to get wrong.
Section H records items that are *finished*, so they aren't raised a third time.

---

## A. Blocks public launch

These four share one gate: the first non-admin user. None of them is code you write in
this repo, and that is exactly why they get forgotten.

**A1. Transactional email / SMTP.** The project is on Supabase's built-in sender, which
is explicitly test-only — a few messages an hour, frequently undelivered. Sign-up
already says "check your email" (`public/scripts/auth.js`) but nothing reliably arrives;
discovered when a test signup produced no email at all. Password reset has the same
dependency and is equally untested.
*Two things to settle:* configure custom SMTP under Authentication → Emails, **and**
decide whether email confirmation is wanted at all for a personal prompt library, or
whether sign-up should be immediate. Pre-release you can turn "Confirm email" off, or
confirm an account by hand with
`update auth.users set email_confirmed_at = now() where email = '…'`.
*Worth knowing when you get to the templates:* sign-up now captures a first name into
`auth.users.raw_user_meta_data`, and Supabase's email templates expose exactly that as
`{{ .Data }}` — so `{{ .Data.first_name }}` personalises the confirmation and
password-reset mails with no extra plumbing. Two limits: it only reaches the templates
Supabase Auth itself sends (confirm sign-up, magic link, reset, invite, email change), so
a *separate* marketing-style welcome email is not covered and would need its own sender;
and metadata is read when the mail is triggered, so it must be passed at `signUp` time —
which it is.
*Not to be confused with E6:* this is **transactional** mail — confirmation, password
reset — which the user asked for by acting, and which rides on contract as its lawful
basis. Configuring SMTP does not make **marketing** mail permissible; that needs consent
collected separately, and E6 explains why the account address cannot just be reused.
*Source: BUILD_BRIEF_v5.md §9; email-template variables per
[Supabase docs](https://supabase.com/docs/guides/auth/auth-email-templates).*

**A2. Auth UX — the pages, not the delivery.** Distinct from A1 and easy to conflate:
Supabase handles the mechanics, but the actual screens and copy for "check your email",
"reset your password" and "confirm your address" have never been designed. A1 makes the
mail arrive; A2 is where it lands.
*Source: BUILD_BRIEF_v4.md §7.*

**A3. Terms of Service and Privacy Policy.** **Drafted and live at `/privacy/` and
`/terms/`, linked from the footer — but not finishable without you.** Written for the UK
(UK GDPR + Data Protection Act 2018, ICO as supervisory authority, **Scots law** as
governing law — data protection is UK-wide so the privacy notice is unaffected by that,
but contract law is devolved so the Terms are Scottish) and describing this system
specifically rather than a generic one: no
analytics or tracking cookies, esm.sh disclosed as a third party that sees visitor IPs,
Supabase and Vercel as the two processors, and a Terms section on the owned-copies model
because no template covers "these prompts are now copies you own".
*Three things remain, and the first is the blocker:*
- ~~**`LEGAL_DETAILS` still holds placeholders.**~~ **Done in §9w** — Sing Chen,
  singfenchen@gmail.com, 14 August 2026. No postal address, deliberately and permanently:
  Article 13 requires contact details, which an email satisfies, and "available on request"
  would have been a standing commitment to disclose a home address. The build warning is
  silent, which is how you know none were missed.
- ~~**The under-13 exclusion is a live decision.**~~ **Decided: it stays.** In place at
  terms §2 ("at least 13 years old to create an account") and privacy §11. No code change
  was needed — this was already the shipped wording — so what is recorded here is the
  reasoning, to stop it being reopened as an oversight. Removing it would invite the ICO's Children's Code, which
  covers under-18s and applies to any service "likely to be accessed by children" — a
  threshold the ICO has refused to quantify beyond "more than de minimis", and one that
  an absent age floor argues *for*. Its fifteen standards include a DPIA and
  high-privacy defaults. Separately, in Scotland the Terms are a contract an under-16
  can only enter for transactions "commonly entered into" on reasonable terms (Age of
  Legal Capacity (Scotland) Act 1991 s.2(1)); a stated floor sidesteps the argument.
- ~~**The cookie-consent judgement is worth confirming.**~~ **Answered in §9v.** The site
  sets **no cookies at all** — verified in-browser (`document.cookie` empty) and in code
  (`createClient` takes no options, so supabase-js keeps the session in localStorage).
  PECR governs storing *any* information on a device rather than cookies specifically, so
  the obligation is the same either way; what discharges it is disclosure of the three
  things stored and why, which is now the policy's section 6. No separate cookie policy:
  cookies are section 5 of the privacy policy, following the BBC's own "Privacy and
  Cookies Policy" pattern, and the footer link reads "Privacy & Cookies" so the word is
  findable. A banner would have nothing to ask about. *This becomes untrue the moment any
  analytics, embed or advertising is added — at which point a consent mechanism is
  required, not optional.*
- **A solicitor's read**, if these are to cover more than a personal project. They are
  researched drafts, not legal advice.
*Corrected in §9x:* the policy originally described only the signed-in experience, and
its lawful-basis table rested entirely on contract — leaving anonymous browsing, the most
common use of the site, with no stated Article 6 basis at all. Legitimate interests now
covers serving the site and securing it, and each section says whether it applies to
everyone or only to account holders. Worth remembering as a pattern: the account tier is
where the design attention goes, so the anonymous tier is where the omissions collect.
*Source: BUILD_BRIEF_v4.md §7; drafted in BUILD_BRIEF.md §9u, restructured in §9v.*

**A6. Confirm the contact alias actually receives mail.** `contact@promptly.simplelogin.com`
is published on every page of the site, in both legal documents, and is the address the
privacy notice commits to answering rights requests on within one month. Nothing in this
repo can test that — send it something and check it arrives. Related to but separate from
A1: A1 is about mail the *service* sends, this is about mail *reaching you*.
*Source: BUILD_BRIEF.md §9y.*

**A5. "Promptly" is already a live product in this exact space.**
[promptly.fyi](https://www.promptly.fyi) is "Promptly AI" — a browser extension with a
curated prompt library, custom folders and saved favourites, claiming 10,000+ users and
listed on the Chrome, Edge and Firefox stores. Found while reviewing it as a privacy-policy
reference. Not a legal opinion and not necessarily a problem — but a same-name, same-category
product with an established user base is worth a deliberate decision *before* sign-ups open
and the name is attached to other people's accounts, rather than after. The options are the
usual ones (proceed, differentiate the name, or check whether they hold a registered mark),
and the cost of choosing rises sharply once there are users.
*Source: observed in BUILD_BRIEF.md §9v.*

**A7. Prove `0008_delete_account.sql` end to end.** The code is written, the UI is
built (BUILD_BRIEF.md §9ad), and the migration is **applied and structurally verified**
— `verify_0008.sql` reads 7 PASS plus check 8 as CHECK. What is left is the only part
that cannot be established from SQL: **no account has actually been deleted through it.**
Still blocks launch, because `/privacy/` and `/terms/` now both tell users they can close
their account themselves, and that promise is currently untested.

~~1. Paste `0008_delete_account.sql` into the SQL editor.~~ **Done.**
~~2. Run `verify_0008.sql`.~~ **Done** — 7 PASS + CHECK. Three results worth carrying
   forward rather than re-deriving: the function's owner is `postgres`, which holds
   DELETE on `auth.users` **by grant** (it is not a superuser and does not own the
   table); `auth.users` **does have RLS enabled**, which is harmless here only because
   `postgres` carries `BYPASSRLS`; and every FK to `auth.users` cascades. If a future
   Supabase change removes that `BYPASSRLS` attribute, deletion would start succeeding
   while removing nothing — check 6 is what would catch it.

   *Checks 5 and 6 each FAILed on their first live run, and the script was wrong both
   times, not the migration.* Check 5 tested whether the owner was a superuser or
   owned `auth.users` — and `postgres` on Supabase is neither (superuser revoked;
   the table belongs to `supabase_auth_admin`) while still being *granted* DELETE,
   the route the list omitted. Check 6 then asserted `auth.users` has no RLS; it
   does, and that turned out to prove nothing, because the question is not whether
   RLS is enabled but whether it applies to this caller — `postgres` carries
   `BYPASSRLS`. Both now ask directly (`has_table_privilege`, and the three
   documented RLS exemptions with `row_security_active()` printed alongside).

   Worth keeping as a shape rather than as two incidents: a check assembled from a
   list of sufficient conditions is only as complete as the list, and it fails
   **closed** — a red row sends you to read the migration rather than the test.
   Reconstruct conditions only where the list is closed by definition.
3. **Prove it on a throwaway non-admin signup.** The function deletes straight out of
   `auth.users`, which is Supabase's own schema — supported by convention, not by
   contract. Nothing in this repo can test it. Sign up a disposable account, let
   `ensure_seeded()` give it a library, export both formats, then delete it and confirm
   the rows are gone (`select count(*) from prompts where user_id = …`).

Also worth doing once, from the admin account: press Delete account and confirm the
dialog *explains* rather than proceeds. That path is guarded twice — the dialog and the
function's `raise` — and it protects the catalog, so it is worth seeing work.
*Source: BUILD_BRIEF.md §9ad.*

**A4. Rate limiting / sign-up abuse.** Supabase has baseline protection; whether it is
sufficient has never been assessed. Unassessed is not the same as insufficient — this is
a "spend an hour looking" item, not necessarily a build.
*Source: BUILD_BRIEF_v4.md §7.*

---

## B. Do before opening sign-ups — order matters

The sequencing here is the single most consequential thing in this document. Each item
gets harder, not easier, if done after the one above it.

**B1. Clear test content and seed canonical prompts.** Everything in the database is
throwaway test content. While you are the only account, editing the catalog is
consequence-free; after anyone else holds copies, every edit to a published prompt is a
broadcast that cannot be recalled (B2). So this goes first.
[`reset_prompts.sql`](supabase/reset_prompts.sql) is the clean-slate script.
**Note:** `seed_default_prompts.sql` no longer runs — every INSERT targets the
`prompts.categories` column that `0006` dropped (see D5). Canonical content is authored
in the app now anyway, which is the intended workflow.
*Source: supabase/README.md Next steps; BUILD_BRIEF_v6.md §9.*

**B2. Notify-and-merge screen** (BUILD_BRIEF_v5.md §6). Specced in full, not built.
`catalog_versions` and `catalog_grants` have been recording the data it needs since
`0004`, so no further migration is required. It has **zero users until a catalog prompt
is edited after someone has already signed up** — which is precisely why B1 comes first,
and why this is not urgent today.
*Two details it must handle, easy to forget:*
- A catalog prompt that is no longer published must read as "no updates available"
  rather than erroring on a missing current version (*demotion semantics*, v5 §9).
- Field classification (title/purpose/body notify; notes/categories ride along) is
  already implemented in the DB trigger and mirrored in `newPrompt.js`; the merge UI must
  agree with both.
*Source: BUILD_BRIEF_v5.md §6, §9.*

**B3. Per-user category limit.** **Done — moved to H.** `0007_category_limit.sql` is
applied and `verify_0007.sql` passes (7 rows; check 7 reads CHECK by design, being an
informational count rather than an assertion).

**B4. Make publish feel weightier in `/admin/`.** Publishing is irreversible in effect
until B2 ships — once granted, a prompt can't be recalled or corrected across users. The
draft flow (`is_curated = true, published = false`) is the mitigation, but the publish
control itself is currently as light as any other toggle. A confirmation naming the
consequence ("this will be copied to N libraries and can't be recalled") is cheap.
*Source: BUILD_BRIEF_v5.md §9.*

---

## C. Configuration to confirm

**C1. Is the Vercel Deploy Hook URL set?** `0005_publish_webhook.sql` is built and
verified but inert until it is. Without it, catalog changes never reach anonymous
visitors — signed-in users are unaffected, which is what makes the failure quiet. Check:
```sql
select deploy_hook_url is not null as hook_is_set from deploy_settings;
```
It cannot be checked from application code: `deploy_settings` has RLS enabled with no
policies, so an anon read returns an empty set whether or not a URL is stored.
*Source: supabase/README.md setup step 7.*

**C2. Vercel env vars are Production-only.** `SUPABASE_URL` / `SUPABASE_ANON_KEY` aren't
set for Preview or Development. Harmless today; it bites the first time a preview-branch
deploy or `vercel env pull` is used, and the symptom is a build that silently produces
zero prompts rather than an error.
*Source: supabase/README.md Status.*

---

## D. Known gaps in shipped behaviour

Things that are wrong or misleading in the product as it stands, as opposed to features
not yet started.

**D1. `/sequences/` and `/sequence/[slug]/` aren't personalization-aware.**
**Fixed — moved to H.** One residual, deliberately left: a sequence a user creates on
their *own* prompts still has no page, because sequence pages are generated at build time
from the catalog. That is E4 (user-authored sequences), not this.
*Source: fixed in BUILD_BRIEF.md §9z.*

**D2. Variable-fill is not built, but the UI teaches it.** The New Prompt modal tells
users to "wrap any fill-in-the-blank part in double braces, e.g. `{{topic}}`, so it can
be filled in later", and nothing consumes the syntax. The hint is honest about being
future-tense, but prompts are accumulating that are written for a feature that doesn't
exist. BUILD_BRIEF_v4.md §6.1 has the design: extract `{{variable}}` tokens from the
body, render fill-in inputs with a live preview, and copy the filled result — shared by
the static prompt page and the signed-in view.
*Source: BUILD_BRIEF_v4.md §6.1; supabase/README.md Next steps.*

**D3. Filter pill counts don't recompute as other pills toggle.** Counts are static
totals over the prompts on the page. This is intended (§9b) and recorded so it isn't
re-raised as a bug. The *related* defect — search showing the admin's categories rather
than the caller's — is fixed (H4).

**D4. `tools/sequence-builder/app.js` holds its own hardcoded copy of the nine category
slugs.** **Resolved — see H.**

**D5b. `--ink-faint` fails AA.** Measured at **2.79:1** against `--paper`, below the
4.5:1 floor for normal text. Found while building §9u's legal pages, and not fixed there:
the token is used across the site (`.stat-empty`, `.cat-slug-note`, `.stat-footnote` and
others), so changing its value is a design decision with a blast radius, not a
one-line correction. §9u simply declined to *adopt* it for two new pieces of text — the
legal date stamp and the at-limit note on `/categories/` — both of which use `--ink-soft`
at 12px instead, letting size rather than contrast carry "this is secondary".
*The decision to make:* darken the token (and re-measure everywhere it lands), or accept
it as decorative-only and write down which uses are legitimate. Note WCAG exempts
disabled controls, so `.btn:disabled` is not part of this.

~~**The sharpest instance, found in §9v: the footer's links.**~~ **Fixed in §9v** — the
footer moved to `--ink-soft` (3.03 → 5.89 light, 3.73 → 7.45 dark) once it became the only
route to the privacy notice. That resolved the *instance*; the token is untouched.

**Scale, counted rather than guessed: `var(--ink-faint)` appears 46 times in
`styles/base.css`.** That is the reason this is a register item and not a quick fix. They
are not all the same problem, and triaging them is most of the work:
- **Text that must pass** — sidebar section labels and counts, `.purpose-line`,
  `.filter-result-count`, table column headers, `.qv-position`, `.pd-meta-row` keys.
  Currently 2.79:1 wherever they sit on `--paper`.
- **Genuinely exempt** — `.btn-primary:disabled` / `.btn-danger:disabled` (WCAG excludes
  inactive controls) and `.footer-sep` (decorative, `aria-hidden`).
- **Not text at all** — several are `background:` values, including the `--cat` fallback,
  where the 4.5:1 rule simply doesn't apply.
Darkening the token fixes the first group and slightly muddies the third, so the likely
answer is a second token rather than a change to this one — but that is the decision, and
it wants making once with the whole list in view rather than incrementally.
*Source: measured in BUILD_BRIEF.md §9u and §9v.*

**D5c. `.btn-danger` fails AA in dark mode.** **Resolved — see H.**

**D5. `supabase/seed_default_prompts.sql` no longer runs.** Writes to the dropped
`prompts.categories` column. Left broken with a header explaining the fix rather than
rewritten, because its five prompts are test content due to be replaced by B1.
*Source: BUILD_BRIEF_v6.md §9.*

---

## E. Deferred features — decided, not now

**E1. Google OAuth.** Confirmed nice-to-have, not required for v1; email/password is the
baseline. Needs a Google Cloud Console OAuth client, consent screen and redirect URI,
then wiring in Supabase Auth — real setup overhead, which is why it isn't bundled with
the existing auth work. *Source: BUILD_BRIEF_v4.md §7.*

**E2. Example output.** The old `prompts.example_output` (a single image URL) was removed
from schema, modal, cards, detail page and search index by `0003` as a deliberate call.
If it returns, treat it as new design work, not a resurrection of the column.
*Source: BUILD_BRIEF_v4.md §7.*

**E3. Submission / moderation workflow.** A non-admin cannot contribute to the catalog at
all (RLS blocks `is_curated = true`). The idea: a user nominates one of their prompts, an
admin reviews, approval runs the existing promote-then-publish path — so the new surface
is the queue and its review UI, not the distribution mechanics. Needs decisions on
attribution and on what happens to the submitter's own copy once it publishes to
everyone. Note BUILD_BRIEF.md §1's "no live submission form or moderation queue" still
holds until this is built. *Source: BUILD_BRIEF_v5.md §9.*

**E4. User-authored sequences.** Whether signed-in users can build their *own* chains —
step ordering, `depends_on` validity across their own prompts, handoff notes. Distinct
from D1: that is rendering chains users already hold; this is letting them create new
ones. Deferred, not decided. *Source: BUILD_BRIEF_v4.md §7.*

**E5. Quality check before a prompt reaches the catalog.** Required fields, ≥1 category,
house style. Originally scoped as a Claude Code skill for hand-authored Markdown; that
workflow is gone, so it now belongs in the New Prompt modal or the `/admin/` publish
step. *Source: BUILD_BRIEF.md §12.*

**E6. Newsletter / product-update emails.** **Not possible today, and the account email
address cannot simply be reused for it.** Three independent blockers, each sufficient on
its own:

1. **The published documents forbid it.** `/privacy/` says "no marketing list to join"
   and "It is never added to a mailing list, because there is no mailing list", and its
   Article 6 table lists only contract plus legitimate interests for security and
   replies. Sending a newsletter would contradict the notice already published — a
   transparency failure before any marketing law is reached.
2. **Purpose limitation** (UK GDPR Art 5(1)(b)). The address was collected to create an
   account and run the service. Marketing is a different purpose, not a compatible
   further use of that one.
3. **PECR reg 22**, which is the binding constraint and is stricter than the GDPR:
   marketing email to an individual needs *prior consent*. The "soft opt-in" exception
   requires details obtained "in the course of a sale or negotiations for a sale" of
   similar products. **Promptly is free, with no paid tier and no payment method, so
   there is no sale and nothing negotiating toward one** — the exception almost certainly
   does not apply. *Revisit this specific point if a paid tier ever exists; it is the one
   fact that would change the analysis.*

*What building it would require — the reason this is section E and not a small task:*
- An **unticked** opt-in at sign-up, worded separately from accepting the terms and
  **not** a condition of getting an account (Art 7(4): bundled consent is not freely
  given).
- A record of *when* consent was given and *what wording* was shown — Art 7(1) puts the
  burden of demonstrating it on you.
- Somewhere to store the preference. Unlike the first name, this does **not** belong in
  `user_metadata`: it is consent evidence, it needs to be queryable to build a send list,
  and metadata sits outside RLS. That means a schema change.
- An unsubscribe link in every message, honoured promptly (PECR, and Art 21(3)).
- Privacy-notice edits: new purpose, lawful basis of **consent** (not contract, not
  legitimate interests), the right to withdraw, and retention — plus deleting the two
  sentences that currently promise the opposite.

Deferred rather than declined: it is a coherent feature, just one with a compliance
surface that has to be built deliberately rather than switched on.
*Source: researched in the §9ac session; ICO guidance on
[direct marketing by electronic mail](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-direct-marketing-using-electronic-mail/).
Researched, not legal advice.*

---

## F. Undecided design questions

Not tasks. Answering them is the work.

**F1. What is the difference between a category, a collection, and a tag?** Three
separate notes turned out to be one question: whether `tags` return to complement
categories (removed in §9c, raised again in §9g as a way to define/find collections);
how collections and sequences become discoverable from Home (§9g, still open); and — now
that categories are user-owned, coloured and reorderable — what a collection is actually
*for* that a category isn't (v6 §9). These should be answered together; answering any one
alone will likely be wrong.
*Sources: BUILD_BRIEF.md §12 and §9g; BUILD_BRIEF_v6.md §9.*

**F2. Multiple admins.** A second admin would see only the prompts and categories *they*
wrote — not the first admin's catalog rows, and they couldn't edit them (RLS scopes
updates to the owner). Fine at one admin, immediately broken at two. Needs either shared
ownership of catalog rows or an admin-wide catalog view. Decide before adding one, not
after. *Source: BUILD_BRIEF_v5.md §9.*

**F3. Categories never merge, deliberately.** If the admin renames or recolours a catalog
category, existing users' copies do not change — divergence is the point. The cost: a bad
colour can't be corrected for anyone who has already signed up, which is why the initial
nine colours matter before the first non-admin signup. This is **not** an inconsistency
with B2: prompts merge, categories don't, and that asymmetry is intended.
*Source: BUILD_BRIEF_v6.md §9.*

**F4. Re-granting resurrects a deleted category.** If a user deletes a category and is
later granted a prompt filed under it, `ensure_seeded()` re-creates it rather than
letting the prompt land with none. Chosen as the least-bad option; the refinement, if it
grates, is to surface it rather than change it. *Source: BUILD_BRIEF_v6.md §7.2, §9.*

---

## G. Watch items and thresholds

**G1. Storage.** Revisit the Supabase tier past roughly 1,000 users or 100 catalog
prompts. ~100 prompts × ~1,000 users ≈ 250MB, comfortable on Pro.
*Source: BUILD_BRIEF_v5.md §9.*

**G2. Vercel build minutes.** The rebuild trigger fires on every catalog change. Volume
is naturally low — only admin writes to published rows qualify, and the trigger is
statement-level so a bulk edit is one build — but worth a glance if catalog editing
becomes frequent. Batching would need pg_cron; deliberately not built, because never
serving stale pages matters more here than saving build minutes.
*Source: BUILD_BRIEF_v5.md §9.*

**G3. Slugs are immutable; renaming changes the label only.** True for prompts (a user's
copy keeps its slug when an accepted update changes the title) and for categories
(renaming `ops-admin` to "Operations" leaves `/browse/ops-admin/` in place). One decision,
applied twice, recorded so neither reads as a bug. Stable links are the trade.
*Sources: BUILD_BRIEF_v5.md §9; BUILD_BRIEF_v6.md §9.*

---

## H. Resolved — do not re-raise

Kept because each of these was live long enough to be written down somewhere, and two
were still being listed as outstanding after they shipped.

| Item | Resolution |
| --- | --- |
| **Admin screen for category management** — "categories are a hardcoded array + matching migration, not DB-backed CRUD" | **Shipped.** BUILD_BRIEF_v6.md; `/categories/` is full CRUD, the array and the CHECK constraint are gone. |
| **`/favorites/` shows only build-time defaults** | **Resolved** in v5. Favourites are two-tier (localStorage by slug signed out, `favorites` table by prompt id signed in, one-time merge on first sign-in) and `/favorites/` is personalized. |
| **Home's stat line doesn't recompute after sign-in** | **Resolved** in §9r — replaced with a fixed sentence that cannot go stale, rather than made to recompute. |
| **Search's category pills show site-wide catalog numbers** | **Resolved** in §9s — `search.js` now rebuilds its pills from the caller's own categories and counts. The separate "counts don't change as you toggle" behaviour is intended (D3). |
| **What admin-unpublishing should do** | **Largely resolved** by v5: unpublishing stops *future* grants, existing copies are untouched, and seeding won't re-grant. The v4 framing of this question is obsolete — it worried about forks and "view original", which no longer exist. **Residual:** whether users holding a copy should be *told* the catalog original was withdrawn. Folds into B2. |
| **Merged-catalog treatment for personalized views** | **Obsolete.** The merged catalog was the v4 model; v5 replaced it with owned copies, so there is nothing to merge. |
| **B3 — per-user category limit** | **Built** in §9u: 20, as a clause on the `categories_insert` RLS policy (`0007`), deliberately *not* a trigger so `ensure_seeded()` stays exempt via table ownership — a capped seeding transaction would silently stop a user's catalog prompts too. Admins are capped as well, which is what keeps a newly seeded account under the ceiling; a user can still exceed 20 via seeding, by design. Mirrored by `MAX_CATEGORIES_PER_USER` in `lib/schema.mjs`. **Applied and verified** — `verify_0007.sql` passes, with check 7 reading CHECK as designed (it reports the largest per-user category count, which is data-dependent and can legitimately exceed 20 via seeding). Checks 4/5/6 are the ones to re-run if seeding ever misbehaves: they assert the three properties the cap's seeding exemption rests on. |
| **D4 — sequence-builder's hardcoded category slugs** | **Retired** in §9u, along with the bulk re-categorize control the array existed to populate. Two independent reasons: per-user categories leave no fixed vocabulary to mirror (and `lib/schema.mjs`'s array is gone, so there is nothing to sync against), and the control had been inert anyway — it wrote a singular `category:` key while the schema reads a `categories:` list. Drag-and-drop sequences and bulk delete are untouched and still wanted; the tool is expected to matter again for D1/E4. |
| **D1 — sequences weren't personalization-aware** | **Fixed** in §9z. `initPersonalizedRail()` rebuilds both rails from the caller's own copies, with quick-view handed the same steps so a card opens *their* text and offers Edit/Delete. The data was never missing — `ensure_seeded()` already copies `sequence`/`sequence_step` and remaps `depends_on` — only the rendering was, exactly as this entry's corrected premise said. Personalized cards drop their `href` (a user's copy has no static page, and where the slug collides the page that exists shows the catalog's text) and take `role="button" tabindex="0"` instead, so keyboard access survives. An emptied chain hides its section on `/sequences/` and explains itself on the detail page. |
| **Contact form backed by Supabase** | **Considered and deliberately not built** (§9y). A guest-usable form means `anon` INSERT — a permanent open write path from the internet — needing length CHECKs, a honeypot and an IP rate limit, and *then* a notification path, since a table row tells nobody. That last part depends on A1, which is unresolved. `/contact/` is a `mailto:` page with subject-prefilled links instead. Revisit only if email genuinely proves insufficient; the hardening list above is the price of entry. |
| **D5c — `.btn-danger` fails AA in dark mode** | **Fixed** in §9ae. White on `--danger` measured 2.38:1 in dark (6.47:1 in light, where the fill is a deep red rather than a pale one). Fixed with a `--danger-ink` token paired to `--danger` exactly as `--accent-ink` is paired to `--accent` — white in light, `#2A0F0B` in dark — consumed by both `.btn-danger` and `.btn-danger-outline:hover`, since a hover state on a danger fill is a filled danger button in all but name. Now 6.47 / 7.54. The principle, which is the part not to lose: **a filled button's label colour follows its fill**, the same conclusion `readableInk()` reaches for category badges. Do not reintroduce a literal `#fff` on anything sitting on `--danger`; it fails in one theme only, so it survives casual review. Distinct from D5b, which remains open — that is a token used *as text*, this was a token used *as a fill* with an assumed label. |
| **Library export — one engine or several** | **Resolved** in §9ad. There is one (`lib/export.mjs`), offered in one place (`/account/`), in Markdown and JSON. The `/favorites/` "Export favorites" button — a slug-only JSON array, the site's only previous export — is **retired**, not repointed: a second button labelled for a subset would only raise the question of how the two differ. Its rule survives and now governs the whole export — cross-references by slug, never row id, so the file still means something after the account is gone. CSV was asked for and rejected on its own stated grounds (a multi-line prompt body in a spreadsheet cell is worse to copy from than Markdown, not better) plus a formula-injection footgun; revisit only if a spreadsheet workflow appears, with escaping as the price of entry. Guests lost their slug-list export, knowingly — they have no library, only local favourites. |
| **CLAUDE.md contradicting itself about v6** | **Fixed** in §9u. One paragraph called user-owned categories applied and deployed; a later one called the same pass "not built" and claimed `lib/schema.mjs` still held the `CATEGORIES` array. The second was stale in place. Recorded because it is the third time this project has been bitten by a status claim that gives no sign of being old — the reason this register exists. |
