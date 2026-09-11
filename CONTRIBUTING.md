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

This is how the **Code review** gate above is actually run; `/verify` and
`/security-review` still run after it comes back clean.

**review → fix the findings → re-review the fixed code → repeat until a review
comes back with no issues.** A PR is not ready while its head commit is
unreviewed — the fixes are new code and get reviewed like any other. **No PR
is opened on unreviewed code**: that is the point of the loop, not a nicety,
and a head commit no reviewer has seen is not ready however green CI is. If a
review is still finding new issues after ~3 rounds, the PR is too big: split
it, or escalate for a human call.

| Reviewer              | How                                             | When                              |
| --------------------- | ----------------------------------------------- | --------------------------------- |
| **CodeRabbit CLI**    | `coderabbit review --plain` (from the worktree) | default — after commit and push   |
| **CodeRabbit GH bot** | comment `@coderabbitai review` on the PR        | only when the CLI is unavailable  |

- **Install:** `curl -fsSL https://cli.coderabbit.ai/install.sh | sh` (see
  [the CLI docs](https://docs.coderabbit.ai/cli)). The installer puts
  `coderabbit` (alias `cr`) on `~/.local/bin`, so add that to your `PATH` if it
  isn't there. `coderabbit --version` confirms it; `coderabbit update` upgrades.
- **Quota:** the Free plan allows roughly **3 CLI reviews an hour** per
  developer, as a rolling allowance rather than a fixed reset — see
  [plans](https://docs.coderabbit.ai/management/plans). Nothing reports what's
  left: v0.3.7 has only `auth`, `review` and `update`, and `coderabbit usage`
  falls through to `review` and errors with "too many arguments". So count your
  own reviews, and treat the rate-limit message a review returns as the only
  signal you get. It is a separate allowance from the bot's, so a local review
  does not spend the PR-review slot, but it is not unlimited either.
- Flags worth knowing: `--plain` (non-interactive text output — use this from a
  script or an agent), `-t/--type all|committed|uncommitted`, and `--base
  <branch>` to review against something other than the default base. There is no
  `--pr` flag and no output-file flag — it reviews the worktree you run it in.
  Flags move between versions (this was checked against v0.3.7; v0.4.5 is
  current), so `coderabbit review --help` is the authority on the rest.
- **Auth:** `coderabbit auth status` shows the logged-in account and org;
  `coderabbit auth login` does the OAuth flow, `auth logout` / `auth org` round
  it out. If a review errors as unauthenticated, log in (or pass `--api-key`)
  rather than falling straight through to the bot.
- The bot is the **fallback**: on the free tier this account gets roughly **one
  review an hour**. While `auto_review` is disabled in `.coderabbit.yaml` (see
  the note there for why), reviews are on-demand — pushing does not burn one,
  but each `@coderabbitai review` does. The config is the source of truth for
  that; if it is ever re-enabled, every push spends a review again.
- **A rate limit means wait, not downgrade.** The allowance is rolling, not
  spent for good: wait the window out and re-run rather than skipping the gate.
  Both reviewers are in play and they do not compete — they draw on separate
  allowances, so using one never starves the other, which is why "the CLI is
  rate-limited" is a reason to fall back to the bot, never a reason to skip
  review. Neither is a way to review more than the plan allows.
- **The author's own read-through is not a review.** Writing a change and then
  writing your own assessment of it is marking your own homework. If CodeRabbit
  is unavailable, get a second reviewer who did not write the code to go through
  it adversarially, and say in the PR description which reviewer was used.
  Skipping this is what let #1166 and #1168 be opened on code no independent
  reviewer had seen.

#### Gotchas the loop taught us

Each of these cost a review round on a real PR here:

- **Commit and push before you review.** Reviewing a dirty tree is a supported
  mode — `-t/--type` takes `all` (the default), `committed` or `uncommitted` —
  but on the version we ran it on (v0.3.7) it is what cost us rounds. Against a
  dirty tree the CLI mis-assembled the diff and reported findings that do not
  exist — on #1157 it claimed a duplicated code tail and an unmatched `}` that
  made a file "not parse", in a file that passed `tsc`, prettier and 92 tests;
  re-running on the committed tree made all four vanish. The branch also has to
  be on the remote: on #1161 the review failed with `Review failed: Unknown
  error` twice, then succeeded immediately after a (non-force) push. Committing
  and pushing first avoids both, so that is the practice here.
- **It reviews outside the PR diff.** On #1159 it returned a finding against a
  `tournaments/` test file the branch never touched. Check the diff against the
  PR's own base — `git diff --name-only origin/dev...HEAD` for a feature or fix
  PR, `origin/main...HEAD` for a `dev` → `main` promotion — and reject
  out-of-diff findings; and do **not** keep looping on one: a re-run returns it
  identically, forever. Stopping at one round is correct when the only finding
  left is out of diff.
- **A transient `REVIEW ERROR: Unknown error` usually passes on an immediate
  retry.** Retry once before concluding anything from it.
- **A finding is a proposal, not an instruction** — verify it before acting.
  Twice, following the suggestion would have shipped a bug: on #1163 it proposed
  `hostToken: z.string().optional()` for a body guard, which rejects
  `{"hostToken": null}` with "expected string, received null" while the route
  treats a null token as absent, turning a working request into a 400; on #1153
  the same class of mistake (`.partial()` tolerates `undefined`, not `null`) had
  already regressed `{"gameId": null}`. Reject structurally-impossible findings
  (syntax errors, "does not parse", missing code) with the `tsc`/prettier/test
  output as the evidence.
- **The loop is finished only on a clean pass**, or on an explicit written
  review by someone who did not write the code standing in for one. "Waiting on
  CI and the CodeRabbit retry" is not a finished loop, and neither is the
  author's own read-through. When the CLI is rate-limited, get that independent
  review, keep working, and re-run when the window opens.
- **A characterization test pins _current_ behaviour, so when a PR deliberately
  changes that behaviour the pin moves with it.** On #1163,
  `branding/logo/route.host-auth.test.ts` asserted `500s on an unparseable
  body` — the exact bug the PR fixed — and that one assertion was updated to
  expect 400. This is the one legitimate reason to edit a characterization test,
  and it belongs in the PR description when it happens.

### Verdicts, not reflex fixes

Every finding gets a decision, and the decision goes on the thread:

- **Right and in scope** → fix it in this PR, then re-review — the fix is new
  code, so it goes back through the loop above.
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
