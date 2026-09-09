# Contributing & Development Workflow

This document describes how we ship changes to **fateround**. It applies to
everyone — humans and AI coding agents alike.

## Branching model: `dev` integrates, `main` releases

```
feature/fix branch  ──PR──▶  dev  ──promotion PR──▶  main
```

- **`main`** — stable / production. Never push to it directly.
- **`dev`** — the integration branch. All work lands here first.
- **Feature & fix branches** branch off `dev` and open a PR **into `dev`**.
- When `dev` is green, open a **promotion PR (`dev` → `main`)** as the release.

Keep PRs small and scoped. Update your branch with the latest `dev` before
merging (`gh pr update-branch <n>` or merge `origin/dev` in).

### Merge method: squash features, **merge** promotions

- **Feature/fix → `dev`:** squash-merge (one tidy commit per change).
- **`dev` ↔ `main` (promotion _and_ sync-back):** **"Create a merge commit" —
  never squash.** A squash drops the ancestry link, so `main` never becomes
  part of `dev`'s history; after a few of those, the `dev`→`main` 3-way merge
  diverges from an ancient base and conflicts even though the content matches.
  Merge commits keep the two branches sharing history, so promotions stay
  fast-forward-clean.
- Because of the above, **"Require linear history" must stay OFF** on `dev` and
  `main` (it forbids merge commits). It can stay on elsewhere.
- If a promotion ever does conflict (e.g. someone squashed a sync), reconcile
  by overlaying `dev`'s tree onto a branch off `main`:
  `git checkout -B promote origin/main && git read-tree -u --reset origin/dev &&
  git commit -m "Promote dev → main"`, then PR that branch into `main`.

## Quality gates — run on every PR before it merges

CI must be green, **and** the review skills must be run on the diff:

| Gate                | How                                | What it catches                                     |
| ------------------- | ---------------------------------- | --------------------------------------------------- |
| **Code review**     | `/code-review` (or `/review <PR>`) | correctness bugs, reuse/simplification, conventions |
| **QA**              | `/verify`                          | does the change actually work when the app runs     |
| **Security review** | `/security-review`                 | auth bypass, injection, data exposure on the diff   |

Run them in order: **code review → QA → security**. Reconcile findings (a
security pass may down- or up-grade a code-review finding). Address or
consciously accept each finding before promoting to `main`.

### Review is a loop, not a pass

**review → fix the findings → re-review the fixed code → repeat until a review
comes back with no issues.** A PR is not ready while its head commit is
unreviewed — the fixes are new code and get reviewed like any other. If a
review is still finding new issues after ~3 rounds, the PR is too big: split
it, or escalate for a human call.

| Reviewer              | How                                             | When                              |
| --------------------- | ----------------------------------------------- | --------------------------------- |
| **CodeRabbit CLI**    | `coderabbit review --plain` (from the worktree) | default — not on the hourly quota |
| **CodeRabbit GH bot** | comment `@coderabbitai review` on the PR        | only when the CLI is unavailable  |

- The CLI is `coderabbit` (alias `cr`, v0.3.7) on `~/.local/bin`. Useful flags:
  `--plain` (non-interactive text), `--prompt-only`, `-t/--type
  all|committed|uncommitted`, `--base <branch>`, `--base-commit <commit>`,
  `--cwd <path>`, `-c/--config <files…>`, `--api-key <key>`. That is the whole
  `review` flag set in v0.3.7 (no `--pr`, no output-file flag); confirm with
  `coderabbit review --help`, and `coderabbit update` to upgrade.
- **Auth:** `coderabbit auth status` shows the logged-in account and org;
  `coderabbit auth login` does the OAuth flow, `auth logout` / `auth org` round
  it out. If a review errors as unauthenticated, log in (or pass `--api-key`)
  rather than falling straight through to the bot.
- The bot is the **fallback**: the free tier is roughly **one review an hour**,
  and `auto_review` is disabled in `.coderabbit.yaml`, so reviews are
  on-demand — pushing does **not** burn a review, but each `@coderabbitai
  review` does.
- **A subagent owns the whole cycle for its PR** — review, fix, re-review — and
  reports back when a review is clean, not after one round.

### Verdicts, not reflex fixes

Every finding gets a decision, and the decision goes on the thread:

- **Wrong** → reply with the reasoning for why it doesn't apply. Don't edit code
  to silence a reviewer.
- **Right but out of scope** → split it into a stacked PR and record that PR on
  the thread.
- Then **resolve the thread yourself, with the reasoning in the reply** (same
  convention as the note in `.coderabbit.yaml` — CodeRabbit won't resolve a
  fixed thread until a later pass reconfirms it, and it blocks the merge
  meanwhile).

### Refactors: characterization tests first

When you're changing how existing behaviour is implemented:

1. Pin the current `{status, body}` in tests **against the unchanged code**.
2. Prove them green — a characterization test that never ran against the old
   code pins nothing.
3. Change the implementation and re-run **the same tests, unmodified**.

Gotcha: a case must combine the independent gates it means to separate (e.g.
wrong type **and** wrong status in one request). Test them one at a time and a
swapped precedence still passes every test.

## CI checks (required)

`.github/workflows/ci.yml` runs on push + PR to **`main` and `dev`**. It has
**8 jobs**:

- **Migrations Check** (`migrations-check`) — rejects duplicate migration version prefixes
- **Lint**
- **Format**
- **Type Check**
- **Test** (vitest — `pnpm test`)
- **Build**
- **DB Migrate** (`migrate`) — applies migrations on push to `dev`/`main` only (see Conventions)
- **Security Scan** (`security`) — `pnpm audit` + hardcoded-secret grep

Branch protection on `main` and `dev` should require a PR plus the CI gates
(at least Lint, Format, Type Check, Test, Build, plus Migrations Check), and
block direct/force pushes to `main`. _(Setting protection rules needs repo-admin
access.)_

## Always parallelize with subagents

When work has independent parts, **dispatch subagents concurrently** instead of
doing it serially:

- Decompose the task and launch multiple agents in **one message** (multiple
  tool calls) so they run in parallel.
- Use **background** agents for long, independent tasks; keep the main thread
  for coordination and synthesis.
- Wait for results before starting work that depends on them.
- Examples in this repo: a code review fans out independent "finder" agents per
  angle; multi-file edits across unrelated files go to one subagent each;
  parallel status/research lookups run together.

Reserve serial work for genuinely dependent steps or edits to the same file.

## Conventions

- **New game types:** follow the full wiring checklist in
  [`docs/new-game-checklist.md`](./new-game-checklist.md) — lobby, spectators,
  late join, ready-up, play again, leaderboard, and rules pages all share the
  same shell; half-wiring is the usual source of playtest bugs.
- **Commits/PRs:** clear, imperative messages. **No AI / co-author signature
  lines.**
- **Migrations — the rules that keep the CI migrate step working** (a long drift
  saga taught us these the hard way):
  - **Name new migrations with a UTC timestamp prefix** so the latest is obvious
    and the version is always unique: `YYYYMMDDHHMMSS_short_name.sql` (e.g.
    `20260628143000_add_foo.sql`). Running `supabase migration new <name>`
    generates this for you. The historical `0001…0128` files (plus a stray
    3-digit `093_chess_board_appearance.sql`) predate this and stay as-is; new
    timestamped files sort cleanly after them.
  - **The migration files are the only source of schema truth — never change the
    schema directly in the Supabase SQL Editor.** Supabase records applied
    migrations in `supabase_migrations.schema_migrations`; manual SQL-Editor
    edits aren't recorded there, silently drift prod out of sync, and break the
    next `db push`. (Treat the SQL Editor as read-only for schema.)
  - **Never reuse, duplicate, or renumber a prefix.** Two PRs must not land the
    same prefix — timestamps make collisions essentially impossible, which is the
    whole point. Renumbering an already-merged migration breaks the applied-history
    record.
  - **Migrations are applied by CI, not on PR open.** The **"DB Migrate"
    (`migrate`) job** in `.github/workflows/ci.yml` runs `supabase link
    --project-ref … && supabase db push` **on push to `dev` or `main`** (never on
    PR open — this is a two-project setup, not Supabase Branching). Per
    `supabase/config.toml`: **`main` → the prod project, `dev` → a separate dev
    Supabase project.** Merging your PR into `dev` (then promoting to `main`)
    runs the push against the matching project — no manual SQL pasting. The job is
    guarded on that environment's Supabase secrets (`SUPABASE_ACCESS_TOKEN` /
    `SUPABASE_DB_PASSWORD`): if they aren't configured for the target environment,
    it logs a skip rather than pushing.
- **Secrets:** via environment variables. State-mutating endpoints
  **default-deny** — refuse to run if the required secret isn't configured,
  rather than failing open.
- **Deploys:** Vercel Hobby caps cron at once/day — don't add sub-daily
  `vercel.json` crons there; drive periodic jobs from an external scheduler.
