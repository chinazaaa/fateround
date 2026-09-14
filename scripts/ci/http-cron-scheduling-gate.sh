#!/usr/bin/env bash
# ── HTTP cron scheduling gate (issue #1167) ──────────────────────────────────
#
# The enforcement half of the `RLS Boundaries (local)` job's HTTP cron check.
# `.github/workflows/ci.yml` extracts THIS FILE from the pull request's BASE
# revision and runs it from outside the working tree, so the assertion LOGIC
# below is not editable by the pull request it is judging. A required check that
# executes code the pull request can edit is not a gate.
#
# ── Scope of that claim: read this before trusting it ─────────────────────────
# Base-pinning the verifier removes SOME bypasses. It does not make this check
# unbypassable, and three independent reviews of PR #1174 each found working
# bypasses of what the then-current comments claimed. What follows is the honest
# accounting; the real boundary is .github/CODEOWNERS, because every bypass
# below needs an edit to a file that file covers: `.github/`, `scripts/`, or
# the install surface of the job that runs this gate -- package.json (whose
# `prepare` hook runs inside `pnpm install`), pnpm-lock.yaml,
# pnpm-workspace.yaml, .npmrc and .husky/. The $PATH route described below
# needs NO workflow edit, which is exactly why the list is wider than
# `.github/`.
#
# CLOSED (verified by running each one against this script):
#   * Rewriting the assertions in the PR's own copy: the copy that runs comes
#     from base, so edits to the tree's copy have no effect.
#   * De-pinning by dropping `fetch-depth: 0`: a base commit missing from the
#     clone is now a hard failure, not a silent "bootstrap".
#   * Pointing BASE_SHA at `github.sha` (the PR's own merge commit), at an
#     orphan commit, or at any commit that is not an ancestor of the checkout.
#   * A `psql` shim that wins on $PATH order, and a shim that just `exit 0`s.
#
# NOT CLOSED, and not closeable from inside this file:
#   * The invocation. The step that runs this script, the environment it passes
#     in, the $PATH it runs under and the job's checkout options are all in
#     `.github/workflows/ci.yml`. A pull request can edit them, or delete the
#     step outright.
#   * $PATH generally. `git cat-file`, `git show`, `git rev-parse` and
#     `git merge-base` -- the commands that implement the pinning -- are $PATH
#     lookups, and `pnpm install --frozen-lockfile` runs about ten steps before
#     the extract step, so package.json's `prepare` hook can install a `git`
#     shim via $GITHUB_PATH with no workflow edit. A demonstration printed
#     "enforcement logic is pinned." while installing a script whose body was
#     `exit 0`. The same route reaches `md5sum` and, via passwordless sudo on
#     hosted runners, /usr/bin/psql itself. (pnpm 10 blocks DEPENDENCY lifecycle
#     scripts by default, and pnpm-workspace.yaml does not allow any, so the
#     root manifest's own `prepare` is the live route -- which is why
#     package.json is a code-owned path.)
#   * The bootstrap branch. The ancestor check accepts ANY ancestor, so a
#     BASE_SHA pointing at a `dev` commit from before this script landed passes
#     every check and then legitimately finds the blob absent. And the `script=`
#     path is a plain assignment in the PR-editable workflow: renaming it to a
#     path the base revision does not have fires the same branch, and reads as
#     a refactor.
#   * A sufficiently patient stub `psql` -- see the liveness probe below for
#     exactly how far that probe goes and where it stops.
#
# None of that makes the gate worthless: it still catches the class of mistake
# it was written for (#1167), and a bypass now has to be a deliberate, visible
# edit to an owned path rather than a quiet tweak to an assertion. It is defence
# in depth behind owner review, not a substitute for it.
#
# The split that makes that worth anything:
#
#   * FIXTURE / ENVIRONMENT setup is the workflow's, and therefore the pull
#     request's: `supabase start` (which applies every migration in this PR from
#     scratch), the local credentials, the hosted-parity service-role grant and
#     the probe row. Those steps decide what state the database is in.
#   * The VERIFIER is this file, pinned to base: which migration counts as the
#     scheduling guard, what preconditions that guard is given, and what
#     `cron.job` must look like afterwards.
#
# So this script still INSPECTS the pull request's tree -- it applies the PR's
# own copy of the guard migration, because the migration is the thing under test
# -- while the choice of file and every expected value come from the revision
# the base branch already trusts. Nothing the pull request can write reaches the
# assertion values below: the local stack's DSN, the guard migration path, the
# GUC fixture values and the expected jobnames/schedules/commands are all
# literals here rather than inputs, precisely so that they cannot be supplied by
# the tree under review. (A PR-supplied DSN would be enough to defeat the whole
# gate: it could point the verifier at a decoy database with hand-inserted
# `cron.job` rows.)
#
# ── What this gate is for ─────────────────────────────────────────────────────
# The scheduling migrations no-op silently when `app.api_base` /
# `app.cron_secret` are unset. On production they WERE unset, so
# `scheduled_games_push_tick`, `warn_idle_waiting_lobbies` and
# `reap_idle_active_games` were never scheduled -- for months, with no failing
# check anywhere.
#
# A "the jobs exist" assertion against the CI stack as-is would be vacuous: the
# GUCs are unset there too, and a no-op is CORRECT in that state. So this script
# creates the state the assertion is actually about -- it sets both GUCs,
# re-executes the scheduling block, and then requires the jobs to be in
# `cron.job`. That makes the guard's happy path a tested path: a typo'd jobname,
# a broken precondition test, or a scheduling call that silently does nothing
# fails HERE instead of on a hosted project.
#
# It does NOT and CANNOT assert that the hosted projects have the GUCs set.
# Nothing in CI can see a hosted project's settings; that check has to live
# post-deploy (see the PR for #1167).
#
# It runs LAST in its job, after the RLS suite, because it mutates the database
# (it registers cron jobs) and must not perturb the security gate that is that
# job's main purpose.
#
# Fail-safe on environment, strict on defects: if pg_cron/pg_net are genuinely
# absent from this stack (a self-hosted or future CLI image without them
# preloaded), this script warns and exits 0 rather than turning an unrelated
# image change into a red required check. Everything after that point is
# hard-asserted -- and the soft-skip is scoped strictly to "the extensions are
# unavailable", never to "psql exited non-zero", so a `supabase start` flake
# cannot quietly turn this gate into a green no-op. (A deliberately crafted stub
# `psql` CAN still steer itself down that branch by failing `create extension`
# and answering the availability query with both names. Scoping the skip stops
# accidents, not an attacker who can install a shim; see the scope section
# above.)

set -euo pipefail

# `psql` by ABSOLUTE PATH rather than a $PATH lookup. $PATH inside this job is
# not something this script gets to control: the invoking step can prepend to
# it, and `pnpm install --frozen-lockfile` earlier in the same job runs
# package.json's `prepare` script, which can append to $GITHUB_PATH with no
# workflow edit at all. A two-line `#!/bin/sh` / `exit 0` shim named `psql`
# ahead of the real binary is otherwise enough to make every assertion below
# report success with no database in existence.
#
# ABSOLUTE IS NOT THE SAME AS TRUSTED, and this line does not make psql
# trustworthy. GitHub's hosted runners give the job passwordless sudo, so the
# same `prepare` hook can `sudo cp` a shim over this path -- and on those images
# /usr/bin/psql is a symlink to /usr/share/postgresql-common/pg_wrapper, so a
# write through it hits every psql caller in the job, not just this one. Pinning
# the path defeats a $PATH-order shim and nothing stronger.
PSQL=/usr/bin/psql
if [ ! -f "$PSQL" ] || [ ! -x "$PSQL" ]; then
  echo "::error::$PSQL is not an executable file. This gate resolves psql by absolute path on purpose and will not fall back to a \$PATH lookup; if the runner image moved the binary, change the path here (in the base-pinned script) rather than reintroducing the lookup."
  exit 1
fi

# The Supabase CLI's fixed local-stack DSN. A literal, not an input -- see the
# header: letting the tree under review choose the database it is judged against
# would defeat the base-pinning entirely.
DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# Which migration counts as the scheduling guard is an enforcement decision and
# lives here. The FILE it names is read out of the pull request's checkout --
# that file is the content under test.
GUARD_MIGRATION=supabase/migrations/20261124120000_noisy_http_cron_scheduling_guard.sql

# This script runs from $RUNNER_TEMP, so relative paths into the tree under test
# have to be resolved against the checkout explicitly. REPO_DIR is provided by
# the workflow from `github.workspace` (an Actions-provided value, not something
# a pull request can set); outside Actions it falls back to the shell's cwd.
REPO_DIR="${REPO_DIR:-$PWD}"
guard_migration_path="$REPO_DIR/$GUARD_MIGRATION"
if [ ! -f "$guard_migration_path" ]; then
  echo "::error::$GUARD_MIGRATION is missing from the checkout at $REPO_DIR. The HTTP cron scheduling gate cannot run without the guard migration it exists to test; if the file was renamed, rename it in this gate too."
  exit 1
fi

# Connectivity first, and HARD-FAIL on it. `psql` exits non-zero for any reason
# at all -- "could not connect to server", auth failure, a wedged stack -- so a
# bare `create extension` probe cannot tell "this image has no pg_cron" from
# "the stack never came up". Treating both as skippable would let a
# `supabase start` flake turn this whole gate into a green no-op with a warning
# nobody reads, which is precisely the silent-skip class this step exists to
# eliminate. Same precedent as "Refusing to run a security gate against a
# half-started stack" earlier in this job.
#
# And `select 1;` is not evidence of a database: any program that exits 0
# satisfies it, which is exactly how a trivial stub `psql` turns this gate
# green. The probe below asks for output a canned string cannot match -- the md5
# of a nonce generated at run time, the server version and a catalog row count
# -- and checks all three.
#
# BE CLEAR ABOUT WHAT THIS BUYS. It is NOT unfakeable, and an earlier version of
# this comment wrongly said a stub could not fake it. A stub is handed the nonce
# verbatim in its own argv (it is right there in `select md5('<nonce>')`), so
# ~12 lines of shell can extract it, run md5sum itself, and echo
# `<md5>|160002|3412`; the version and the row count are just constants to
# print, and the pg_extension read-back below is one more string. That was
# demonstrated against this script. `expected_md5` is also computed with a
# $PATH-resolved `md5sum`, which the same $GITHUB_PATH delivery path can
# replace with a constant. A smaller stub still has to answer the probe -- it
# runs first -- but need not fake the assertions: it can then fail
# `create extension` and print `pg_cron, pg_net` for the availability query to
# take the skip-and-exit-0 branch.
#
# What the probe actually does is raise the floor from "any program that exits
# 0" to "a program that parses the query and answers it plausibly". That is
# worth having and it is all it is. The boundary that stops a shim being
# installed at all is owner review of the paths in .github/CODEOWNERS -- which
# includes package.json, because the `prepare` hook that can install the shim
# runs inside this job's own `pnpm install`, with no workflow edit.
nonce="cron-gate-$$-$(date +%s%N)-${RANDOM}"
expected_md5=$(printf '%s' "$nonce" | md5sum | cut -d' ' -f1)
# (The nonce is interpolated by the shell, not by psql: psql does not expand -v
# variables inside a -c/-tAc command string. It is generated here from $$, the
# clock and $RANDOM, so it contains nothing that needs quoting.)
if ! probe=$("$PSQL" "$DB" -v ON_ERROR_STOP=1 -tAc \
    "select md5('$nonce') || '|' || current_setting('server_version_num') || '|' || (select count(*) from pg_catalog.pg_proc);"); then
  echo "::error::Cannot reach the local Postgres at 127.0.0.1:54322. Refusing to run the HTTP cron scheduling gate against a half-started stack."
  exit 1
fi
probe_md5=${probe%%|*}
probe_rest=${probe#*|}
probe_version=${probe_rest%%|*}
probe_procs=${probe_rest##*|}
if [ "$probe_md5" != "$expected_md5" ] \
   || ! [ "$probe_version" -ge 130000 ] 2>/dev/null \
   || ! [ "$probe_procs" -ge 1000 ] 2>/dev/null; then
  echo "::error::The psql liveness probe did not come back from a real PostgreSQL server (got '$probe'). Refusing to run the HTTP cron scheduling gate: something other than the local stack answered -- check whether a psql shim is shadowing $PSQL, or whether the stack came up at all."
  exit 1
fi
echo "Local Postgres answered the liveness probe (server_version_num $probe_version)."

if ! "$PSQL" "$DB" -v ON_ERROR_STOP=1 -q \
    -c "create extension if not exists pg_cron;" \
    -c "create extension if not exists pg_net;"; then
  # The connection was healthy a moment ago, so narrow the cause before
  # skipping: only "the extension is not available in this image" is an
  # environment difference. Anything else -- including the connection dying in
  # between -- is a real failure.
  if ! unavailable=$("$PSQL" "$DB" -v ON_ERROR_STOP=1 -tAc \
      "select coalesce(string_agg(e, ', '), '') from unnest(array['pg_cron','pg_net']) e where not exists (select 1 from pg_available_extensions a where a.name = e);"); then
    echo "::error::create extension failed and the follow-up availability probe could not connect either. Refusing to skip the HTTP cron scheduling gate on an unhealthy stack."
    exit 1
  fi
  if [ -z "$unavailable" ]; then
    echo "::error::create extension failed even though pg_cron and pg_net are both listed in pg_available_extensions. That is a real failure, not an environment difference."
    exit 1
  fi
  echo "::warning::Not available in this local stack: $unavailable -- HTTP cron scheduling gate skipped."
  exit 0
fi

# `create extension` having exited 0 is again not evidence. Read the catalog
# back: both extensions must actually be installed, with versions. (Also fakeable
# by a stub that prints the string -- this rules out a real stack that silently
# did not install them, not a hostile shim.)
installed=$("$PSQL" "$DB" -v ON_ERROR_STOP=1 -tAc \
  "select coalesce(string_agg(extname || '=' || extversion, ',' order by extname), '') from pg_extension where extname in ('pg_cron','pg_net');")
case "$installed" in
  pg_cron=?*,pg_net=?*)
    echo "Extensions installed: $installed"
    ;;
  *)
    echo "::error::pg_cron and pg_net are not both present in pg_extension after create extension (got '$installed'). Refusing to run the HTTP cron scheduling gate without the extensions it asserts against."
    exit 1
    ;;
esac

# Set the two GUCs at SESSION level, in the SAME psql session that then runs the
# guard. `alter database postgres set app.api_base = ...` does not work here:
# `app.api_base` is a custom placeholder parameter, and PostgreSQL only lets a
# superuser attach one of those to a database or role. The local stack's
# `postgres` role is not a superuser, so that form fails with
# `permission denied to set parameter "app.api_base"`. A session-level SET
# carries no such restriction and is read back by
# `current_setting('app.api_base', true)` in the same connection, which is
# exactly what the guard's do-block reads -- so this creates the same
# precondition state without needing superuser.
#
# psql executes repeated -c/-f options in the order given, all on one
# connection, so the two SETs are still in effect when the -f runs. (This is
# also why they cannot be split across psql invocations: unlike a database-level
# setting, a session SET dies with its connection.)
#
# Re-run the guard migration with the preconditions satisfied. Its own assertion
# raises, and ON_ERROR_STOP turns that into a failed step.
"$PSQL" "$DB" -v ON_ERROR_STOP=1 \
  -c "set app.api_base = 'http://127.0.0.1:3000';" \
  -c "set app.cron_secret = 'ci-not-a-real-secret';" \
  -f "$guard_migration_path"

echo "Scheduled cron jobs:"
"$PSQL" "$DB" -v ON_ERROR_STOP=1 -c "select jobname, schedule from cron.job order by jobname;"

# Independent of the migration's internal check, so a future edit that drops
# that check still cannot make this gate pass vacuously.
#
# Asserts DEFINITION, not just existence. `jobname in (...)` alone still passes
# if someone flips a cron expression to '0 0 * * *', repoints a URL at the wrong
# route, or drops the Authorization header -- and these job definitions are
# copy-pasted between migration files with nothing keeping them in sync, so
# drift is the likeliest regression. One expectation row per job, checked for
# presence + schedule + route + bearer header.
#
# Only the two jobs whose COMMAND is the HTTP call are checked this way.
# reap_idle_active_games is registered as the single call
# `select public.reap_idle_active_games_tick();` (#1166): its route, bearer
# token and 90s timeout live inside the function body and are re-read every run,
# precisely so that a URL/secret rotation cannot leave a stale value baked into
# cron.job and so that the function's https transport gate cannot be bypassed. A
# route/Authorization substring test therefore cannot pass for it and must not
# be reintroduced -- it is asserted by exact command match below.
bad=$("$PSQL" "$DB" -v ON_ERROR_STOP=1 -tAc "
  select coalesce(string_agg(format('%s (%s)', expected.jobname, checked.problem), '; ' order by expected.jobname), '')
    from (values
            ('scheduled_games_push_tick'::text, '* * * * *'::text, '/api/scheduled/tick'::text),
            ('warn_idle_waiting_lobbies', '*/2 * * * *', '/api/cron/warn-idle-lobbies')
         ) as expected(jobname, schedule, route)
    left join cron.job j on j.jobname = expected.jobname
    cross join lateral (
      select case
               when j.jobid is null then 'absent from cron.job'
               when j.schedule is distinct from expected.schedule
                 then format('schedule is %L, expected %L', j.schedule, expected.schedule)
               when position(expected.route in j.command) = 0
                 then format('command does not POST to %s', expected.route)
               when position('Authorization' in j.command) = 0
                 then 'command does not send an Authorization header'
             end as problem
    ) as checked
   where checked.problem is not null;")
if [ -n "$bad" ]; then
  echo "::error::Expected direct-HTTP cron job(s) wrong or missing in cron.job after scheduling with both GUCs set: $bad"
  echo "This is the failure mode from issue #1167 -- a scheduling block that reports success and schedules nothing (or schedules the wrong thing)."
  exit 1
fi
echo "Both direct-HTTP cron jobs are present with the expected schedule and route."

# The reaper, asserted by exact command. This is the regression test for the
# guard migration re-inlining net.http_post over the tick call: anything other
# than the bare tick invocation means baked-in credentials and a bypassed
# transport gate.
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
  echo "::error::reap_idle_active_games is wrong or missing in cron.job after running the guard migration with both GUCs set: $bad"
  echo "It must be registered as the tick call, not as an inlined net.http_post: the URL and the CRON_SECRET bearer must be re-read at run time (rotation-safe) and must pass the function's https transport gate (CWE-319)."
  exit 1
fi
echo "reap_idle_active_games is registered as the tick call with the expected schedule."
