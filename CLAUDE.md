# Promptly

Read [BUILD_BRIEF.md](BUILD_BRIEF.md) first — it's the living design/build spec for the static/anonymous tier (locked decisions, open items, and pass-by-pass history). Don't re-litigate anything marked locked; treat "not yet designed" / "explicitly open" items as open questions, not oversights.

Then read [BUILD_BRIEF_v4.md](BUILD_BRIEF_v4.md) — the account-tier plan (Supabase auth, admin-curated default prompts, per-user forks). **Its own "Status" section (§11) and intro no longer read as current** — real implementation has moved past what that document originally proposed (admin curation/publish/fork model, a full sidebar nav rebuild replacing v3's top nav, cache-busting).

Then read [BUILD_BRIEF_v5.md](BUILD_BRIEF_v5.md) — **the current model.** It replaces v4's fork-on-edit / merged-catalog design with *owned copies*: signing up copies the whole published catalog into the user's library, so every prompt a signed-in user sees is genuinely theirs (no borrowing, no forking, no `prompt_overrides`). Migration `0004_owned_copies.sql` is applied and the app code follows it. Where v4, `supabase/README.md`, or older sections of BUILD_BRIEF.md describe forking, archived defaults, "view original", or a merged catalog, **v5 is what's true** — those are historical.

[`supabase/README.md`](supabase/README.md) remains the reference for setup, environment, and the parts of the schema v5 didn't change, but **its model sections are stale pending a rewrite** (tracked in v5 §7 Pass 1).
