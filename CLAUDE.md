# Promptly

Read [BUILD_BRIEF.md](BUILD_BRIEF.md) first — it's the living design/build spec for the static/anonymous tier (locked decisions, open items, and pass-by-pass history). Don't re-litigate anything marked locked; treat "not yet designed" / "explicitly open" items as open questions, not oversights.

Then read [BUILD_BRIEF_v4.md](BUILD_BRIEF_v4.md) — the account-tier plan (Supabase auth, admin-curated default prompts, per-user forks). **Its own "Status" section (§11) and intro no longer read as current** — real implementation has moved past what that document originally proposed (admin curation/publish/fork model, a full sidebar nav rebuild replacing v3's top nav, cache-busting). [`supabase/README.md`](supabase/README.md) is the up-to-date source of truth for the actual current schema and what's built vs. pending — read that for current state, not v4's §4/§5/§11.
