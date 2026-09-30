#!/usr/bin/env bash
# ── The deploy-equivalent cron.job gate (issues #1166/#1167/#1175) ───────
#
# cron.job immediately after `supabase start` is what applying this PR's
# migration set produces -- the state a deploy produces, PROVIDED nothing
# but migrations shaped it. That proviso is checked below and is not free:
# `supabase start` executes two PR-authored SQL files of its own.
# supabase/roles.sql runs BEFORE the migrations (SetupDatabase ->
# SeedGlobals), and supabase/seed.sql runs AFTER them (MigrateAndSeed ->
# applyMigrationFiles, then applySeedFiles), with seeding on by default at
# sql_paths ["./seed.sql"]. seed.sql is the dangerous one, because running
# last it can undo what a migration did: a post-guard migration that
# schedules a rogue job plus a seed.sql that unschedules it again leaves
# this step looking at a clean database while production, which never runs
# seed.sql, keeps the job. roles.sql cannot do that from where it runs,
# but it is still PR-authored SQL executing inside `supabase start`, and
# this gate's premise is migrations and nothing else. Neither file exists
# in this repo today, so the gate
# requires that to stay true rather than trying to model them.
#
# The state exists only here: `Idle-reaper cron guard branches are exercised`
# unschedules and reschedules reap_idle_active_games as part of its
# fixtures, and the HTTP cron gate re-runs the scheduling guard, so by the
# end of this job the deploy-equivalent state is gone.
#
# It is therefore asserted HERE, against the live database, and not
# recorded for a later step to judge. An earlier version wrote the rows to
# a CSV in RUNNER_TEMP with a SHA-256 in a sidecar file and checked them
# after the RLS suite. That was not worth the bytes it was written in: the
# vitest suite runs in between, the pull request owns that suite and its
# config, and GITHUB_RUN_ID / GITHUB_RUN_ATTEMPT / GITHUB_SHA are all in
# its process.env -- so about fifteen lines of `forge.js` wrote a clean CSV
# and a matching status file, and the gate reported success while the
# database held a reaper posting to an attacker host. A table instead of a
# file buys nothing either: that suite can shell out to psql with the same
# fixed local DSN this step uses. Nothing carried across a step the pull
# request controls is evidence.
#
# What it cannot forge is the RUNNER's own record of whether this step
# passed. So this step asserts immediately, and `continue-on-error` lets
# the job keep going to the RLS boundary suite -- which is this job's main
# purpose and must not be masked by a cron finding. `The deploy-equivalent
# cron gate must have passed`, after the suite, turns a failure here into a
# failed job by reading `steps.deploy_cron_state.outcome`. That value is
# set by the runner when this step ends; no later step can change it.
#
# The other assertion point is the HTTP cron gate at the end of this job,
# which re-runs the scheduling guard with the GUCs set. The two are not
# interchangeable (#1175): the guard unconditionally unschedules and
# reschedules all three of its jobs from literals in its own file, so
# assertions made after it observe what it just wrote. On production
# 20261124 is already applied and will not re-run, so a LATER migration
# wins there; in this job it is force-re-run, so it always wins here.
#   * THIS step red => a migration in this PR changed what a DEPLOY
#     schedules. Production would get the state printed below.
#   * the HTTP gate red => the guard migration's own scheduling path is
#     broken. An already-migrated database would be unaffected.
#
# ── How this file is run, and the scope of that ───────────────────────────────
# `.github/workflows/ci.yml` extracts THIS FILE from the pull request's BASE
# revision, into $RUNNER_TEMP, and runs it from there. The assertion logic below
# is therefore not editable by the pull request it is judging: a required check
# that executes code the pull request can edit is not a gate.
#
# The split: FIXTURE is the workflow's, and so the pull request's -- `supabase
# start` applies THIS PR's migrations from scratch, and that is the point, they
# are the thing under test. The VERIFIER is this file, pinned to base. It still
# INSPECTS the pull request's tree; what comes from base is every enforcement
# decision and every expected value. The DSN, the guard migration path and each
# expectation are literals here rather than inputs precisely so the tree under
# review cannot supply them -- a PR-supplied DSN alone would let the gate be
# pointed at a decoy database with hand-inserted `cron.job` rows.
#
# Base-pinning removes SOME bypasses, not the class, and nothing here should be
# read as claiming otherwise:
#
#   CLOSED: rewriting these assertions in the PR's copy; de-pinning by dropping
#   `fetch-depth: 0` (a base commit missing from the clone is a hard failure,
#   not a silent bootstrap); pointing BASE_SHA at `github.sha`, an orphan commit
#   or any non-ancestor; a `psql` shim that wins on $PATH order or merely
#   `exit 0`s.
#
#   NOT CLOSED: the invocation itself -- the step that runs this script, the
#   environment it passes in, and the job's checkout options are all in
#   `.github/workflows/ci.yml`, which a pull request can edit, and the step can
#   simply be deleted. $PATH generally: the `git` commands that implement the
#   pinning are lookups, and the root `prepare` hook runs inside this job's own
#   `pnpm install` (the extract step is placed BEFORE that install for exactly
#   this reason, which narrows it but does not close it). A patient stub `psql`
#   can answer the liveness probe below.
#
# What actually closes the class is owner review of the paths in
# .github/CODEOWNERS -- `.github/`, `scripts/`, and this job's install surface
# (package.json, pnpm-lock.yaml, pnpm-workspace.yaml, .npmrc, .husky/). Note the
# caveat recorded there: CODEOWNERS blocks a merge only once a ruleset requires
# code-owner review. This file is defence in depth behind that, worth keeping
# because it turns a quiet assertion tweak into a visible edit of an owned path.
#

set -euo pipefail

# ── psql, and the tree under test ─────────────────────────────────────────────
# `psql` by ABSOLUTE PATH rather than a $PATH lookup. $PATH inside this job is
# not something this script controls: the invoking step can prepend to it, and
# the root `prepare` hook runs during `pnpm install --frozen-lockfile` in this
# same job. A two-line `#!/bin/sh` / `exit 0` shim named `psql` ahead of the
# real binary would otherwise make every assertion below report success with no
# database in existence.
#
# ABSOLUTE IS NOT TRUSTED. Hosted runners give the job passwordless sudo, and
# /usr/bin/psql is a symlink to /usr/share/postgresql-common/pg_wrapper, so the
# same hook can write through it. Pinning the path defeats a $PATH-order shim
# and nothing stronger.
PSQL=/usr/bin/psql
if [ ! -f "$PSQL" ] || [ ! -x "$PSQL" ]; then
  echo "::error::$PSQL is not an executable file. This gate resolves psql by absolute path on purpose and will not fall back to a \$PATH lookup; if the runner image moved the binary, change the path here (in the base-pinned script) rather than reintroducing the lookup."
  exit 1
fi

# This script runs from $RUNNER_TEMP, so every repo-relative path below -- the
# guard migration, the migrations git-diff, supabase/config.toml -- has to be
# resolved against the checkout. REPO_DIR comes from `github.workspace`, an
# Actions-provided value rather than anything a pull request sets. Changing
# directory (instead of prefixing paths) keeps the body byte-identical to the
# inline version it was extracted from.
REPO_DIR="${REPO_DIR:-$PWD}"
cd "$REPO_DIR"

set -euo pipefail
DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
GUARD_MIGRATION_FILE=20261124120000_noisy_http_cron_scheduling_guard.sql

# ── Did anything but migrations shape this database? ─────────────────
#
# `supabase start` executes supabase/roles.sql BEFORE the migrations
# (SeedGlobals) and supabase/seed.sql AFTER them (applySeedFiles), and
# both are PR-authored, so "this is what the migrations produced" is
# only true while neither exists. seed.sql is the one that can undo a
# migration: unscheduling a job a migration registered leaves cron.job
# clean here and leaves the job in place on production, which never
# runs it. roles.sql runs too early to do that, and is refused anyway
# because this gate's premise is migrations and nothing else.
#
# [db.migrations] schema_paths is NOT checked: applySchemaFiles is
# gated on viper.GetBool("EXPERIMENTAL"), which comes from a flag or
# environment variable rather than config.toml, and this job sets
# neither.
#
# This is a statement about the TREE, not about the diff: it holds
# however the file arrived. The two names are exactly what
# `supabase start` executes by default -- supabase/tests/*.sql is NOT
# in that set (those are pgTAP files for `supabase test db`, which this
# job never runs), so they are deliberately not listed. A [db.seed]
# sql_paths entry could point somewhere else entirely, including
# outside supabase/, which is why the config is checked too.
stray_sql=""
for f in supabase/roles.sql supabase/seed.sql; do
  [ -f "$f" ] && stray_sql="$stray_sql $f"
done
if [ -n "$stray_sql" ]; then
  echo "::error::SQL that \`supabase start\` executes alongside the migrations is present in this branch:$stray_sql"
  echo "\`supabase start\` runs supabase/roles.sql BEFORE the migrations and supabase/seed.sql AFTER them, with seeding on by default. Production runs neither, so anything they do to cron.job makes the state this gate inspects differ from the state a deploy produces -- a seed that unschedules a job a migration registered is enough to turn this gate green while production keeps the job."
  echo "TO FIX: if the repo is genuinely adopting either file, this gate has to be taught to account for it -- for seed.sql, by asserting before applySeedFiles runs or by proving the seed cannot touch cron.job; for roles.sql, which runs before the migrations, by proving the same of it. Neither can simply be allowed through."
  exit 1
fi
# The seed PATHS, from a real TOML parse rather than a grep for the
# string `sql_paths`. Two reasons the grep was wrong in both
# directions. TOML quoted keys accept \uXXXX escapes, so
# `"sql_p\u0061ths"` is a valid spelling of the same key that a
# substring test never sees -- and with a seed file that is not named
# seed.sql, the loop above misses it too, which was a complete bypass.
# In the other direction, `supabase init` writes the [db.seed] block
# with sql_paths = ["./seed.sql"] uncommented, so regenerating the
# config, or pasting the documented block, failed this job while
# changing nothing at all -- that value IS the default.
#
# So the test is on the decoded tree: every seed path must resolve to
# supabase/seed.sql, whose existence the loop above already refuses.
# Anything else is a redirect to SQL this gate has not accounted for.
# Seeding switched off entirely is fine -- then none of it runs.
# A file that will not parse is a hard failure, not a pass.
if ! seed_paths=$(python3 -c 'import tomllib,sys,os; cfg=tomllib.load(open(sys.argv[1],"rb")); seed=cfg.get("db",{}).get("seed",{}); paths=(seed.get("sql_paths") or []) if isinstance(seed,dict) else ["<db.seed is not a table>"]; off=isinstance(seed,dict) and seed.get("enabled") is False; print(" ".join([] if off else [str(p) for p in paths if os.path.normpath(os.path.join("supabase",str(p))) != os.path.join("supabase","seed.sql")]))' supabase/config.toml 2>&1); then
  echo "::error::supabase/config.toml could not be parsed, so this gate cannot tell what \`supabase start\` will execute alongside the migrations: $(printf '%s\n' "$seed_paths" | tail -n1)"
  printf '%s\n' "$seed_paths"
  exit 1
fi
if [ -n "$seed_paths" ]; then
  echo "::error::supabase/config.toml points db.seed.sql_paths at SQL other than supabase/seed.sql: $seed_paths"
  echo "\`supabase start\` executes those files after every migration; production applies migrations only. Whatever they do to cron.job makes the state this gate inspects differ from the state a deploy produces, and unlike supabase/seed.sql the gate has no way to know they are there."
  echo "TO FIX: this is about the seed PATHS, not about adding a seed file -- if the repo is genuinely adopting seeding, this gate has to be taught to account for it rather than have the paths widened past it."
  exit 1
fi

# ── Is this state deploy-equivalent at all? ──────────────────────────
#
# Only if CI and production apply this PR's migrations in the same
# relative order, and nothing makes them. `supabase start` applies
# every file from scratch in filename order; the deploy runs
# `supabase db push --include-all`, which applies whatever the remote
# history table is missing on top of what is already recorded; and
# `migrations-check` enforces version UNIQUENESS, not monotonicity. So
# a back-dated file sorts BEFORE the scheduling guard here -- the guard
# re-runs afterwards and overwrites whatever it did, leaving a clean
# state -- and applies AFTER the already-recorded guard on production,
# where it wins.
#
# This does not look at file CONTENTS. It was first written as
# `grep -q 'cron\.'`, which missed `SELECT CRON.schedule(...)`,
# `select "cron"."schedule"(...)`, a newline before the dot,
# `set search_path = cron` and string concatenation, while matching
# migrations whose only mention of cron was an English comment. A
# lexical test of SQL is always one quoting trick behind. The invariant
# that makes the two orders agree is purely about filenames: every
# migration this branch ADDS must sort after every migration the base
# branch already has.
#
# --no-renames is load-bearing. `diff.renames` has defaulted to true
# since git 2.9, so introducing a back-dated migration with `git mv`
# from another file in supabase/migrations/ reports as R, not A, and
# selects nothing at all -- neither the prefix check nor the ordering
# check nor the re-apply list. (A rename whose SOURCE is outside the
# pathspec already reports as A, because the pathspec breaks the pair.)
#
# Comparison is by FILENAME under the C collation, not by parsing the
# version as a number: `202611241200001_x.sql` is numerically greater
# than 20261124120000 but sorts BEFORE the guard's filename ('1' 0x31 <
# '_' 0x5F at position 15). Added files must carry exactly the 14-digit
# prefix CONTRIBUTING.md specifies, which removes that class.
#
# This step does NOT check that versions are unique -- two added files
# sharing a <version>_ prefix both sort fine on full filename. That is
# the `migrations-check` job's invariant, and this one leans on it.
#
# HONEST SCOPE: this workflow is part of the pull request it judges, so
# anyone willing to edit it in the same commit is not stopped -- not by
# this rule, not by the declared-jobname lists below, and not by the
# verdict step. What it stops is the accident, and it makes the
# deliberate version a visible edit, in the diff, to the file that
# does the checking -- something a reviewer reading the pull request
# will see. Since PR #1174 it is also an OWNED edit: .github/ and
# scripts/ are in .github/CODEOWNERS, so changing this rule requests a
# code owner's review -- which becomes a block once a ruleset requires
# code-owner review (see that file's caveat). And the assertions
# themselves are no longer in the pull request's copy at all: this
# script is extracted from the base revision and run from there.
#
# On a PULL_REQUEST event the base is HEAD's FIRST PARENT, not
# github.event.pull_request.base.sha. The checkout is refs/pull/N/merge,
# whose first parent is the base branch as it stands NOW; base.sha is
# frozen at event time, so re-running an older run compared new-dev
# against old-dev and attributed another PR's migrations to this branch.
#
# On a PUSH, HEAD^1 is the WRONG question, and this was a real hole.
# HEAD^1 is the parent of the LAST commit in the push, not the tip the
# branch had before the push. A fast-forward push of B..C onto a branch
# sitting at A makes HEAD^1 = B, so everything B added is invisible to
# the diff below -- and a back-dated migration introduced in B walks
# straight past the `before_guard` check that the identical file in C
# would have been caught by. What the push actually moved is
# github.event.before, handed in as PUSH_BEFORE_SHA by the step that runs
# this script. It is empty on every other event, so the first-parent rule
# above still governs there.
#
# However it is chosen, the base is VALIDATED before it is used: it must
# resolve to a commit present in this clone, it must not be the
# checked-out commit itself, and it must be an ancestor of it. Failing
# any of those is a hard failure and never a fallback -- the same rule,
# for the same reason, that the extract step in ci.yml applies to
# BASE_SHA. An all-zero PUSH_BEFORE_SHA (the push that CREATES a branch)
# is refused too: there is no previous tip to compare against, and
# quietly reverting to HEAD^1 would reinstate exactly the omission above.
#
# Ancestry is asserted against the CHECKED-OUT commit, not against
# head_sha, and the difference matters on a pull_request event: there
# head_sha is HEAD^2, the PR's own tip, and HEAD^1 is its SIBLING rather
# than its ancestor whenever the base branch has moved since the branch
# forked -- which is the normal case. Both are parents of the merge
# commit, so the checked-out commit is the one revision both are
# genuinely beneath. On a push, where there is no merge commit, the
# checked-out commit and head_sha are the same thing.
#
# Which files this branch ADDED is then measured from the merge base
# rather than from the base tip, so a migration the base gained while
# this PR was open is not attributed to this PR -- while base_last still
# comes from the base TIP, because that is what production has already
# applied and what an added file must sort after.
checkout_sha=$(git rev-parse --verify HEAD)
head_sha=$(git rev-parse --verify 'HEAD^2' 2>/dev/null || git rev-parse --verify HEAD)
if [ -n "${PUSH_BEFORE_SHA:-}" ]; then
  case "$PUSH_BEFORE_SHA" in
    *[!0]*) base_sha="$PUSH_BEFORE_SHA" ;;
    *)
      echo "::error::PUSH_BEFORE_SHA is the all-zero SHA, which means this push CREATED the branch and there is no previous tip to compare migrations against. Refusing to fall back to HEAD^1: on a multi-commit push that is the parent of the last commit rather than the tip before the push, and it would hide every migration the earlier commits of the push added."
      exit 1
      ;;
  esac
else
  base_sha=$(git rev-parse --verify --quiet 'HEAD^1' || true)
  if [ -z "$base_sha" ]; then
    echo "::error::HEAD has no first parent, so there is no base revision to compare migrations against. Usually this means the checkout is shallow -- this job needs \`fetch-depth: 0\` -- or HEAD is a root commit. Either way the gate cannot tell which migrations this branch adds and will not guess."
    exit 1
  fi
fi
if ! git cat-file -e "$base_sha^{commit}" 2>/dev/null; then
  echo "::error::The base revision $base_sha is not a commit in this clone, so the gate cannot tell which migrations this branch adds. This job needs \`fetch-depth: 0\` so that the whole history of the branch being pushed is present."
  exit 1
fi
base_sha=$(git rev-parse --verify "$base_sha^{commit}")
if [ "$base_sha" = "$checkout_sha" ]; then
  echo "::error::The base revision resolves to the checked-out commit itself ($checkout_sha). That is the revision under test, not a base to compare it against -- diffing it with itself reports that this branch adds no migrations at all, which would pass this gate without inspecting anything."
  exit 1
fi
if ! git merge-base --is-ancestor "$base_sha" "$checkout_sha"; then
  echo "::error::The base revision $base_sha is not an ancestor of the checked-out commit $checkout_sha, so it is not the revision this branch is being compared against. Refusing to guess. On a push this usually means the branch was force-pushed, and the migrations this gate would have to judge are no longer reachable from what was pushed."
  exit 1
fi
fork_point=$(git merge-base "$base_sha" "$head_sha")

base_last=$(git ls-tree --name-only "$base_sha" supabase/migrations/ \
  | sed 's#.*/##' | LC_ALL=C sort | tail -n1)
if [ -z "$base_last" ]; then
  echo "::error::The base revision $base_sha has no files under supabase/migrations/. Refusing to reason about migration ordering from an empty base."
  exit 1
fi

# --no-renames: `diff.renames` defaults to true, and a rename inside
# supabase/migrations/ reports as R, which --diff-filter=A would not
# select at all -- see the comment above.
added=$(git diff --no-renames --name-only --diff-filter=A "$fork_point" "$head_sha" -- supabase/migrations/ | sed 's#.*/##' | LC_ALL=C sort)

# Where this branch is headed decides how strict the ordering rule is
# below. GITHUB_BASE_REF is the PR's target branch and is empty on a
# push, where GITHUB_REF_NAME is the branch being pushed.
target_branch="${GITHUB_BASE_REF:-${GITHUB_REF_NAME:-}}"

reapply_list=""
before_guard=""
behind_base=""
bad_prefix=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  case "$f" in
    [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]_*.sql) : ;;
    *) bad_prefix="$bad_prefix $f"; continue ;;
  esac
  # Two different situations, and conflating them was wrong. Sorting
  # at or before the SCHEDULING GUARD is the bypass this gate exists
  # for: the guard re-runs during `supabase start` and overwrites
  # whatever an earlier file did, so CI sees a clean cron.job while
  # production -- where the guard is already recorded and will not
  # re-run -- applies the earlier file last and keeps its version.
  # That is always an error.
  if [ "$f" = "$GUARD_MIGRATION_FILE" ] || [ "$(printf '%s\n%s\n' "$f" "$GUARD_MIGRATION_FILE" | LC_ALL=C sort | head -n1)" != "$GUARD_MIGRATION_FILE" ]; then
    before_guard="$before_guard $f"
    continue
  fi
  # Sorting after the guard but before the base branch's newest
  # migration is a different thing: another migration landed on the
  # base while this branch was open. On a PR into dev that is routine
  # and does not affect production -- prod migrates on push to main,
  # where both files are still pending and will apply in version order
  # together -- so it is a warning. It is still worth saying, because
  # the dev project HAS already applied the other file and will take
  # this one after it. On a promotion into main it is the reverse and
  # genuinely blocking: main holding a migration dev does not means an
  # unsynced hotfix, and the promotion really would apply dev's
  # backlog out of order against the production project.
  if [ "$f" = "$base_last" ] || [ "$(printf '%s\n%s\n' "$f" "$base_last" | LC_ALL=C sort | head -n1)" != "$base_last" ]; then
    behind_base="$behind_base $f"
  fi
  if [ "$(printf '%s\n%s\n' "$f" "$GUARD_MIGRATION_FILE" | LC_ALL=C sort | head -n1)" = "$GUARD_MIGRATION_FILE" ] && [ "$f" != "$GUARD_MIGRATION_FILE" ]; then
    reapply_list="$reapply_list$(printf 'supabase/migrations/%s\n' "$f")"$'\n'
  fi
done <<< "$added"

# Handed to the HTTP cron gate as a STEP OUTPUT rather than a file, for
# the same reason the inventory is asserted here: the runner holds it
# and no later step can rewrite it. Emitted before any assertion below
# can fail, so the gate sees it even on a red verdict.
{
  echo "reapply<<CRON_REAPPLY_EOF"
  printf '%s' "$reapply_list"
  echo "CRON_REAPPLY_EOF"
  echo "computed=yes"
} >> "$GITHUB_OUTPUT"

if [ -n "$bad_prefix" ]; then
  echo "::error::Migration(s) added by this branch do not carry the 14-digit UTC timestamp prefix CONTRIBUTING.md specifies:$bad_prefix"
  echo "Apply order is decided by filename, so a prefix of any other length cannot be reasoned about -- a 15-digit one sorts before a 14-digit one with a larger value. Rename with \`supabase migration new <name>\`."
  exit 1
fi
if [ -n "$before_guard" ]; then
  echo "::error::Migration(s) added by this branch sort at or before the cron scheduling guard ($GUARD_MIGRATION_FILE):$before_guard"
  echo "The guard is already applied on both hosted projects and will not run again there, but \`supabase start\` re-runs it here -- and it unconditionally reschedules all three of its jobs. So a migration that sorts before it is overwritten in CI and wins on production, and this gate would be judging a state no deploy produces. Give the migration a filename that sorts after $GUARD_MIGRATION_FILE."
  exit 1
fi
if [ -n "$behind_base" ]; then
  if [ "$target_branch" = "main" ]; then
    echo "::error::This is a promotion into main, and migration(s) it brings sort before main's newest migration ($base_last):$behind_base"
    echo "main holding a migration dev does not means a hotfix landed there without the sync-back CONTRIBUTING.md requires. Until that sync happens the promotion really would apply these out of order against the production project, which has already applied $base_last. Merge main back into dev first."
    exit 1
  fi
  echo "::warning::Migration(s) added by this branch sort before the newest migration already on $target_branch ($base_last):$behind_base -- another migration landed while this branch was open."
  echo "Not blocking, and nothing to do about it: production migrates on push to main, where these are all still pending and will apply together in version order. The $target_branch project has already applied $base_last and will take these after it, so if both touch the same object, check that order is harmless there."
fi
echo "No migration this branch adds sorts at or before $GUARD_MIGRATION_FILE, so CI and the deploy agree about what the scheduling guard leaves behind."
if [ -n "$reapply_list" ]; then
  echo "Added after the scheduling guard, to be re-applied with the GUCs set by the HTTP cron gate:"
  printf '%s' "$reapply_list" | sed 's/^/  /'
else
  echo "This branch adds no migration after the scheduling guard."
fi

# ── The state itself ────────────────────────────────────────────────
# `select 1;` is not evidence of a database: any program that exits 0 satisfies
# it, which is exactly how a stub `psql` turns a gate green. So demand output
# only a real PostgreSQL server can produce and check it -- the md5 of a nonce
# generated here at run time, the server version, and a catalog row count.
#
# NOT unfakeable: the nonce is in the stub's own argv, so a stub can md5 it
# itself, and `md5sum` here is a $PATH lookup. It raises the floor from "any
# program that exits 0" to "a program that parses the query and answers it
# plausibly". The boundary that stops a shim being installed at all is owner
# review of the paths in .github/CODEOWNERS.
cron_gate_nonce="cron-gate-$$-$(date +%s%N)-${RANDOM}"
cron_gate_expected_md5=$(printf '%s' "$cron_gate_nonce" | md5sum | cut -d' ' -f1)
if ! cron_gate_probe=$("$PSQL" "$DB" -v ON_ERROR_STOP=1 -tAc \
    "select md5('$cron_gate_nonce') || '|' || current_setting('server_version_num') || '|' || (select count(*) from pg_catalog.pg_proc);"); then
  echo "::error::Cannot reach the local Postgres at 127.0.0.1:54322. Refusing to judge the deploy-equivalent cron state on a half-started stack."
  exit 1
fi
cron_gate_probe_md5=${cron_gate_probe%%|*}
cron_gate_probe_rest=${cron_gate_probe#*|}
cron_gate_probe_version=${cron_gate_probe_rest%%|*}
cron_gate_probe_procs=${cron_gate_probe_rest##*|}
if [ "$cron_gate_probe_md5" != "$cron_gate_expected_md5" ] \
   || ! [ "$cron_gate_probe_version" -ge 130000 ] 2>/dev/null \
   || ! [ "$cron_gate_probe_procs" -ge 1000 ] 2>/dev/null; then
  echo "::error::The psql liveness probe did not come back from a real PostgreSQL server (got '$cron_gate_probe'). Something other than the local stack answered -- check whether a psql shim is shadowing $PSQL, or whether the stack came up at all."
  exit 1
fi
echo "Local Postgres answered the liveness probe (server_version_num $cron_gate_probe_version)."


# Deliberately NOT `create extension if not exists pg_cron`. The point
# is to look at the state the MIGRATIONS left; installing the extension
# now would manufacture an empty cron.job and turn "nothing was
# scheduled" into a confusing per-job "absent" list.
#
# pg_net availability changes what the migrations schedule:
# 20261123120000 and 20261124120000 both return before registering
# reap_idle_active_games when pg_net is missing, so on such an image
# the reaper is legitimately absent. 20261005120000 schedules its two
# pure-SQL jobs BEFORE its own pg_net check, so those are present
# either way.
cron_present=$("$PSQL" "$DB" -v ON_ERROR_STOP=1 -tAc "select to_regclass('cron.job') is not null;")
pg_net_available=$("$PSQL" "$DB" -v ON_ERROR_STOP=1 -tAc "select exists (select 1 from pg_available_extensions where name = 'pg_net');")
if [ "$cron_present" != "t" ]; then
  if ! unavailable=$("$PSQL" "$DB" -v ON_ERROR_STOP=1 -tAc \
      "select coalesce(string_agg(e, ', '), '') from unnest(array['pg_cron','pg_net']) e where not exists (select 1 from pg_available_extensions a where a.name = e);"); then
    echo "::error::cron.job does not exist and the follow-up availability probe could not connect either. Refusing to skip on an unhealthy stack."
    exit 1
  fi
  if [ -z "$unavailable" ]; then
    echo "::error::cron.job does not exist even though pg_cron is listed in pg_available_extensions. The migrations should have created the extension and scheduled the jobs -- that is a real failure, not an environment difference."
    exit 1
  fi
  echo "::warning::Not available in this local stack: $unavailable -- deploy-equivalent cron inventory skipped."
  exit 0
fi

echo "cron.job as \`supabase start\` left it (pg_net available: $pg_net_available):"
"$PSQL" "$DB" -v ON_ERROR_STOP=1 -c "select jobname, schedule, active, database, username, nodename, nodeport, command from cron.job order by jobname, jobid;"

if [ "$pg_net_available" = "t" ]; then
  reaper_must_exist=true
  reaper_absent_reason=null
else
  reaper_must_exist=false
  reaper_absent_reason="'pg_net is unavailable in this stack, so both cron migrations return before scheduling it'"
  echo "::warning::pg_net is unavailable in this stack, so reap_idle_active_games is expected to be absent."
fi

# A FULL INVENTORY, not a whitelist-of-three presence check (#1175).
# Every row is accounted for: each declared job is checked for
# presence/absence, schedule, command, and the five columns that decide
# whether it runs at all and against what -- `active`, `database`,
# `username`, `nodename`, `nodeport`. Any row whose jobname is not
# declared is reported as rogue. Without the inventory half, an extra
# job posting to an attacker host is invisible here.
#
# Commands are compared in full with runs of whitespace collapsed --
# and the whitespace class is spelled out as ASCII rather than written
# `\s`. In this image's en_US.UTF-8 locale Postgres's `\s` also matches
# U+2000, U+2003, U+2028, U+2029 and U+3000, which the SQL lexer does
# NOT accept, so `select<U+2003>close_idle_waiting_lobbies(15);` would
# normalise to the expected text while erroring on every tick. Only
# ASCII whitespace is collapsed, so a reindentation of a migration's
# dollar-quoted literal is tolerated and nothing else is.
bad=$("$PSQL" "$DB" -v ON_ERROR_STOP=1 -tAc "
  with expected(jobname, schedule, command, must_exist, absent_reason) as (
    values
      ('close_idle_waiting_lobbies'::text, '*/2 * * * *'::text, 'select close_idle_waiting_lobbies(15);'::text, true, null::text),
      ('drop_stale_unconfirmed_rsvps', '*/2 * * * *', 'select drop_stale_unconfirmed_rsvps();', true, null),
      ('notification_dispatches_gc', '17 * * * *', 'delete from public.notification_dispatches where sent_at < now() - interval ''24 hours'';', true, null),
      ('open_scheduled_games_due', '* * * * *', 'select open_scheduled_games_due();', true, null),
      ('reap_idle_active_games', '*/15 * * * *', 'select public.reap_idle_active_games_tick();', $reaper_must_exist, $reaper_absent_reason),
      ('scheduled_games_push_tick', '* * * * *', null, false, 'app.api_base / app.cron_secret are unset in this stack, so a migration baked a URL and a bearer token in instead of reading them at run time'),
      ('warn_idle_waiting_lobbies', '*/2 * * * *', null, false, 'app.api_base / app.cron_secret are unset in this stack, so a migration baked a URL and a bearer token in instead of reading them at run time')
  ),
  actual as (
    select jobid, jobname, schedule, command, active, database, username, nodename, nodeport,
           btrim(regexp_replace(command, '[ \t\r\n\f\v]+', ' ', 'g')) as norm
      from cron.job
  ),
  rogue as (
    select format('%s is in cron.job but is not a declared job (schedule %L, command %L)',
                  coalesce(a.jobname, '<a row with no jobname>'), a.schedule, a.command) as problem
      from actual a
     where a.jobname is null
        or not exists (select 1 from expected e where e.jobname = a.jobname)
  ),
  declared as (
    select format('%s (%s)', e.jobname, checked.problem) as problem
      from expected e
      left join actual a on a.jobname = e.jobname
      cross join lateral (
        select case
                 when a.jobid is null and e.must_exist then 'absent from cron.job'
                 when a.jobid is not null and not e.must_exist
                   then format('is in cron.job even though %s: command %L', e.absent_reason, a.command)
                 when a.jobid is null then null
                 when a.schedule is distinct from e.schedule
                   then format('schedule is %L, expected %L', a.schedule, e.schedule)
                 when a.norm is distinct from e.command
                      and btrim(regexp_replace(a.command, '\s+', ' ', 'g')) is not distinct from e.command
                   then format('command matches %L only if NON-ASCII whitespace is treated as whitespace. It contains a character such as U+2000/U+2003/U+2028/U+2029/U+3000, which Postgres regex \s matches but the SQL lexer does not -- pg_cron would raise a syntax error on every tick. Raw command: %L', e.command, a.command)
                 when a.norm is distinct from e.command
                   then format('command is %L, expected %L (ASCII whitespace normalised)', a.norm, e.command)
                 when a.active is distinct from true
                   then 'is registered but cron.job.active is false, so it never fires -- present-and-disabled is the #1167 failure mode, not a fix for it'
                 when a.database is distinct from 'postgres'
                   then format('is registered against database %L, expected %L -- a job in another database does nothing useful here', a.database, 'postgres')
                 when a.username is distinct from 'postgres'
                   then format('runs as %L, expected %L', a.username, 'postgres')
                 when a.nodename is distinct from 'localhost'
                   then format('is registered against nodename %L, expected %L -- anything else sends this job somewhere other than this server', a.nodename, 'localhost')
                 when a.nodeport is distinct from current_setting('port')::int
                   then format('is registered against nodeport %L, expected %L -- with cron.use_background_workers off pg_cron dials nodename:nodeport', a.nodeport, current_setting('port'))
               end as problem
      ) as checked
     where checked.problem is not null
  )
  select coalesce(string_agg(problem, '; ' order by problem), '')
    from (select problem from rogue union all select problem from declared) as problems;")
if [ -n "$bad" ]; then
  echo "::error::cron.job does not match the deploy-equivalent inventory after applying this PR's migrations: $bad"
  echo "This is the state a DEPLOY would produce -- what production runs. Unlike the HTTP cron gate below it is not overwritten by re-running the scheduling guard, so a difference here is a difference production would get. See issue #1175."
  echo "TO FIX: if a migration in this PR changed a job on purpose, update its row in the \`expected\` VALUES list in THIS step, and -- for scheduled_games_push_tick and warn_idle_waiting_lobbies -- the expectation rows in the direct-HTTP \`values\` list and the declared-jobname array of the rogue check, both in the HTTP cron gate below. If a job is new, add a row here and its name to that array. If you did not mean to change a cron job, a migration in this PR is scheduling something nobody asked for."
  exit 1
fi

# The reaper, byte-for-byte. The inventory above already compared it
# with ASCII whitespace normalised; this repeats it exactly, because
# #1166 is the regression that matters most here and because the HTTP
# cron gate makes the identical byte-exact assertion. Anything other
# than the bare tick invocation means the route and the CRON_SECRET
# bearer are baked into cron.job rather than re-read each run, and the
# function's https transport gate (CWE-319) is bypassed.
if [ "$pg_net_available" = "t" ]; then
  bad=$("$PSQL" "$DB" -v ON_ERROR_STOP=1 -tAc "
    select coalesce(
             case
               when j.jobid is null then 'absent from cron.job'
               when j.schedule is distinct from '*/15 * * * *'
                 then format('schedule is %L, expected %L', j.schedule, '*/15 * * * *')
               when j.command is distinct from 'select public.reap_idle_active_games_tick();'
                 then format('command is %L, expected %L', j.command, 'select public.reap_idle_active_games_tick();')
             end, '')
      from (select 1) as one
      left join cron.job j on j.jobname = 'reap_idle_active_games';")
  if [ -n "$bad" ]; then
    echo "::error::reap_idle_active_games is wrong or missing in the cron.job state this PR's migrations produce: $bad"
    echo "It must be registered as the tick call, not as an inlined net.http_post: the URL and the CRON_SECRET bearer must be re-read at run time (rotation-safe) and must pass the function's https transport gate (CWE-319)."
    echo "TO FIX: find the migration in this PR that re-registers reap_idle_active_games and delete that registration. A LATER migration that re-registers it is what this assertion point exists to catch -- the scheduling guard is already applied on production and will not re-run to undo it. See issue #1175."
    exit 1
  fi
fi
echo "cron.job matches the deploy-equivalent inventory."
