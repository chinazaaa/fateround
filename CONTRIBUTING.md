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

## CI checks (required)

`.github/workflows/ci.yml` runs on push + PR to **`main` and `dev`**:

- **Lint**
- **Format**
- **Type Check**
- **Build**

Branch protection on `main` and `dev` should require a PR plus these four
checks, and block direct/force pushes to `main`. _(Setting protection rules
needs repo-admin access.)_

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

- **Commits/PRs:** clear, imperative messages. **No AI / co-author signature
  lines.**
- **Migrations:** unique numeric prefixes; **never renumber a migration that
  has already merged** (it breaks applied-migration history).
- **Secrets:** via environment variables. State-mutating endpoints
  **default-deny** — refuse to run if the required secret isn't configured,
  rather than failing open.
- **Deploys:** Vercel Hobby caps cron at once/day — don't add sub-daily
  `vercel.json` crons there; drive periodic jobs from an external scheduler.
