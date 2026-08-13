# Promptly

Read [BUILD_BRIEF.md](BUILD_BRIEF.md) first — it's the living design/build spec for the static/anonymous tier (locked decisions, open items, and pass-by-pass history). Don't re-litigate anything marked locked; treat "not yet designed" / "explicitly open" items as open questions, not oversights.

[BUILD_BRIEF_v4.md](BUILD_BRIEF_v4.md) is **historical** — the account-tier plan as originally conceived (Supabase auth, admin-curated defaults, per-user forks). Its §4/§5/§11 describe a model that no longer exists. Read it for the original *why* (§1, §2, §7, §10), never for how anything works now.

Then read [BUILD_BRIEF_v5.md](BUILD_BRIEF_v5.md) — **the current model.** It replaces v4's fork-on-edit / merged-catalog design with *owned copies*: signing up copies the whole published catalog into the user's library, so every prompt a signed-in user sees is genuinely theirs (no borrowing, no forking, no `prompt_overrides`). Migrations `0004_owned_copies.sql` and `0005_publish_webhook.sql` are applied and the app code follows them. Where v4, `supabase/README.md`, or older sections of BUILD_BRIEF.md describe forking, archived defaults, "view original", or a merged catalog, **v5 is what's true** — those are historical.

[`supabase/README.md`](supabase/README.md) is the reference for the schema as it stands, setup steps, and — in its Status section — what's built versus outstanding. It has been rewritten for the owned-copies model, so it and v5 agree.

The UI half of v5 is logged as BUILD_BRIEF.md §9r, following that document's pass-by-pass convention.
