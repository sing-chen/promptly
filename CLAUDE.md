# Promptly

Read [BUILD_BRIEF.md](BUILD_BRIEF.md) first — it's the living design/build spec for the static/anonymous tier (locked decisions, open items, and pass-by-pass history). Don't re-litigate anything marked locked; treat "not yet designed" / "explicitly open" items as open questions, not oversights.

[BUILD_BRIEF_v4.md](BUILD_BRIEF_v4.md) is **historical** — the account-tier plan as originally conceived (Supabase auth, admin-curated defaults, per-user forks). Its §4/§5/§11 describe a model that no longer exists. Read it for the original *why* (§1, §2, §7, §10), never for how anything works now.

Then read [BUILD_BRIEF_v5.md](BUILD_BRIEF_v5.md) — **the current model.** It replaces v4's fork-on-edit / merged-catalog design with *owned copies*: signing up copies the whole published catalog into the user's library, so every prompt a signed-in user sees is genuinely theirs (no borrowing, no forking, no `prompt_overrides`). Migrations `0004_owned_copies.sql` and `0005_publish_webhook.sql` are applied and the app code follows them. Where v4, `supabase/README.md`, or older sections of BUILD_BRIEF.md describe forking, archived defaults, "view original", or a merged catalog, **v5 is what's true** — those are historical.

Then read [BUILD_BRIEF_v6.md](BUILD_BRIEF_v6.md) — **categories, under the same model.** It extends owned copies to the category vocabulary: `prompts.categories` (`text[]`) and its CHECK constraint are replaced by a `categories` table plus a `prompt_categories` join, seeded through the same pull-based `ensure_seeded()`, and category colour becomes per-category data rather than the six `--cat-*` CSS hues. Anywhere v5, BUILD_BRIEF.md §3, or older text describes a hardcoded `CATEGORIES` array or `categoryHue()`, **v6 is what's true**. Migration `0006_user_categories.sql` is written but **not yet applied** — see `supabase/README.md`'s Status before assuming the live schema matches the code.

[`supabase/README.md`](supabase/README.md) is the reference for the schema as it stands, setup steps, and — in its Status section — what's built versus outstanding. It has been rewritten for the owned-copies model, so it and v5/v6 agree.

The UI halves are logged as BUILD_BRIEF.md §9r (v5) and §9s (v6), following that document's pass-by-pass convention.

[BUILD_BRIEF_v6.md](BUILD_BRIEF_v6.md) is **a design pass, not built** — user-owned categories, doing for the category vocabulary what v5 did for prompts (an admin-maintained canonical set that seeds new accounts; each signed-in user then owns and can diverge). Nothing in it is live: categories are still the hardcoded `CATEGORIES` array in `lib/schema.mjs` mirrored by a CHECK constraint. Read it as the plan for the next major change, never as a description of current behaviour.
