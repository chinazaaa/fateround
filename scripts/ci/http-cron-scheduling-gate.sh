#!/usr/bin/env bash
# ── HTTP cron scheduling gate (issue #1167) ──────────────────────────────
# The scheduling migrations no-op silently when `app.api_base` /
# `app.cron_secret` are unset. On production they WERE unset, so
# `scheduled_games_push_tick`, `warn_idle_waiting_lobbies` and
# `reap_idle_active_games` were never scheduled -- for months, with no
# failing check anywhere.
#
# A "the jobs exist" assertion against this stack as-is would be vacuous:
# the GUCs are unset here too, and a no-op is CORRECT in that state. So
# this step creates the state the assertion is actually about -- it sets
# both GUCs, re-executes the scheduling block, and then requires the jobs
# to be in cron.job. That makes the guard's happy path a tested path: a
# typo'd jobname, a broken precondition test, or a scheduling call that
# silently does nothing fails HERE instead of on a hosted project.
#
# It does NOT and CANNOT assert that the hosted projects have the GUCs
# set. Nothing in CI can see a hosted project's settings; that check has
# to live post-deploy (see the PR for #1167).
#
# NOR IS IT THE DEPLOY-EQUIVALENT ASSERTION, and it must never be treated
# as one (issue #1175). By the time it asserts, it has re-run the guard
# migration, which unconditionally unschedules and reschedules all three
# jobs from literals in its own file -- so what it sees is what it just
# wrote, one statement earlier, not what this PR's migration set produces.
# On production 20261124 is already applied and will not re-run, so a
# LATER migration is what wins there; here it is force-re-run last, so it
# always wins. That question is answered by
# `cron.job matches the deploy-equivalent inventory`, which asserts
# immediately after `supabase start` and BEFORE anything in this job has
# touched cron.job. Keep both: this step proves the guard's scheduling path
# still works, that one proves a deploy schedules the right things. If this
# step is red the guard migration is broken; if that one is red a migration
# in the PR changed what production would run.
#
# Runs LAST, after the RLS suite, because it mutates the database (it
# registers cron jobs) and must not perturb the security gate that is this
# job's main purpose.
#
# Fail-safe on environment, strict on defects: if pg_cron/pg_net are
# genuinely absent from this stack (a self-hosted or future CLI image
# without them preloaded), the step warns and exits 0 rather than turning
# an unrelated image change into a red required check. Everything after
# that point is hard-asserted -- and the soft-skip is scoped strictly to
# "the extensions are unavailable", never to "psql exited non-zero", so a
# `supabase start` flake cannot quietly turn this gate into a green no-op.
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

# The re-apply list and its computed flag arrive as environment variables from
# the workflow, sourced from `steps.deploy_cron_state.outputs.*`. They are
# runner-held step outputs, not a file any step in between could rewrite, and
# they are Actions context rather than repository content -- unlike the
# expectations below, which are literals here on purpose.

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
GUARD_MIGRATION=supabase/migrations/20261124120000_noisy_http_cron_scheduling_guard.sql

# Connectivity first, and HARD-FAIL on it. `psql` exits non-zero for
# any reason at all -- "could not connect to server", auth failure, a
# wedged stack -- so a bare `create extension` probe cannot tell "this
# image has no pg_cron" from "the stack never came up". Treating both
# as skippable would let a `supabase start` flake turn this whole gate
# into a green no-op with a warning nobody reads, which is precisely
# the silent-skip class this step exists to eliminate. Same precedent
# as "Refusing to run a security gate against a half-started stack"
# earlier in this job.
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
  echo "::error::Cannot reach the local Postgres at 127.0.0.1:54322. Refusing to run the HTTP cron scheduling gate against a half-started stack."
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

if ! "$PSQL" "$DB" -v ON_ERROR_STOP=1 -q \
    -c "create extension if not exists pg_cron;" \
    -c "create extension if not exists pg_net;"; then
  # The connection was healthy a moment ago, so narrow the cause
  # before skipping: only "the extension is not available in this
  # image" is an environment difference. Anything else -- including
  # the connection dying in between -- is a real failure.
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

# `create extension` having exited 0 is not evidence either. Read the catalog
# back: both extensions must actually be installed, with versions. (Also
# fakeable by a stub that prints the string -- this rules out a real stack that
# silently did not install them, not a hostile shim.)
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

# Set the two GUCs at SESSION level, in the SAME psql session that then
# runs the guard. `alter database postgres set app.api_base = ...` does
# not work here: `app.api_base` is a custom placeholder parameter, and
# PostgreSQL only lets a superuser attach one of those to a database or
# role. The local stack's `postgres` role is not a superuser, so that
# form fails with `permission denied to set parameter "app.api_base"`.
# A session-level SET carries no such restriction and is read back by
# `current_setting('app.api_base', true)` in the same connection, which
# is exactly what the guard's do-block reads -- so this creates the same
# precondition state without needing superuser.
#
# psql executes repeated -c/-f options in the order given, all on one
# connection, so the two SETs are still in effect when the -f runs.
# (This is also why they cannot be split across psql invocations: unlike
# a database-level setting, a session SET dies with its connection.)
#
# Re-run the guard migration with the preconditions satisfied. Its own
# assertion raises, and ON_ERROR_STOP turns that into a failed step.
#
# The two fixture values are shell variables rather than repeated
# literals because the expected COMMAND text below is derived from
# them: the guard builds each job's command with
# `format($sql$ ... %L ... $sql$, api_base || '<route>', 'Bearer ' || cron_secret)`,
# so with both GUCs pinned here the command is fully deterministic and
# can be compared in full rather than sniffed for substrings. If these
# two values and the expectations below ever drift apart, the gate
# fails closed.
API_BASE='http://127.0.0.1:3000'
CRON_SECRET='ci-not-a-real-secret'

# Re-running ONLY the guard is not enough (issue #1175). On production
# the guard is already applied; what actually runs on a deploy is the
# migrations that come AFTER it, and those are the ones that get the
# last word on cron.job. A new migration that copy-pastes the
# GUC-gated scheduling block out of 20261005120000 or 20261015120000 --
# the idiomatic way to add one -- no-ops during `supabase start`
# because CI never sets the GUCs at database level, so the
# deploy-equivalent snapshot correctly sees nothing, and it would never
# be executed with the GUCs set anywhere in this job either. It could
# point scheduled_games_push_tick at any host with the real bearer and
# stay green. So: apply them here too, in order, in this same GUC-set
# session, exactly as production would.
#
# WHICH migrations, and why not by grepping them for `cron.`: that
# predicate missed `SELECT CRON.schedule(...)`,
# `select "cron"."schedule"(...)`, a newline before the dot,
# `set search_path = cron` and string concatenation -- all of which
# schedule a job -- while matching migrations whose only mention of
# cron was in an English comment, which would then be re-executed for
# nothing. So the list is computed WITHOUT reading the files: it is
# exactly the migrations this branch ADDS that sort after the guard,
# written out by `cron.job matches the deploy-equivalent inventory`
# from `git diff --diff-filter=A` against the base revision. Those are
# precisely the files production applies after the already-recorded
# guard, whatever SQL they happen to contain.
#
# The cost of not reading them is that a migration which is not safe to
# apply twice fails here. That is a real constraint on post-guard
# migrations and it is deliberate: the alternative is a lexical filter,
# and this is the third round of narrowing one. The failure names the
# file and says what to do.
# The list arrives as a STEP OUTPUT of `cron.job matches the
# deploy-equivalent inventory`, not as a file. The runner holds step
# outputs; the steps in between -- including the PR-owned vitest suite
# -- cannot rewrite one. A file in RUNNER_TEMP could simply be emptied,
# which would silently restore the bypass this re-application closes.
if [ "${CRON_REAPPLY_COMPUTED:-}" != "yes" ]; then
  echo "::error::\`cron.job matches the deploy-equivalent inventory\` did not publish a re-apply list. It must run immediately after \`supabase start\`; without it this gate cannot know which of this PR's migrations production applies after the scheduling guard."
  exit 1
fi
later_cron_migrations=()
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if [ ! -f "$f" ]; then
    echo "::error::$f is listed for re-application but is not in the checkout."
    exit 1
  fi
  echo "Also applying $f with both GUCs set (it applies after the guard on production too)."
  later_cron_migrations+=(-f "$f")
done <<< "${CRON_REAPPLY_MIGRATIONS:-}"

# psql runs repeated -c/-f options in order on one connection, so the
# two SETs are still in effect for every -f that follows.
if ! "$PSQL" "$DB" -v ON_ERROR_STOP=1 \
    -c "set app.api_base = '$API_BASE';" \
    -c "set app.cron_secret = '$CRON_SECRET';" \
    -f "$GUARD_MIGRATION" \
    ${later_cron_migrations[@]+"${later_cron_migrations[@]}"}; then
  echo "::error::Re-applying the scheduling guard (and any migration this branch adds after it) with both GUCs set failed."
  echo "If the failure is from one of the migrations listed above rather than from the guard's own assertion, that migration is not safe to apply twice. This gate has to run post-guard migrations with the GUCs set -- CI never sets them at database level, so a GUC-gated scheduling block is otherwise never executed anywhere in CI and could point a cron job at any host with the real bearer. Make the migration idempotent (\`if not exists\`, \`or replace\`, \`on conflict do nothing\`)."
  exit 1
fi

echo "Scheduled cron jobs:"
"$PSQL" "$DB" -v ON_ERROR_STOP=1 -c "select jobname, schedule, active, database, username, nodename, command from cron.job order by jobname, jobid;"

# The expected command text, built from the same two fixture values
# that were just fed to the guard. Single quotes are doubled for the
# SQL literal below; these values contain none today, and doing it
# anyway keeps a future edit to them from silently breaking the query.
expected_push="select net.http_post( url := '$API_BASE/api/scheduled/tick', headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer $CRON_SECRET') );"
expected_warn="select net.http_post( url := '$API_BASE/api/cron/warn-idle-lobbies', headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer $CRON_SECRET') );"
expected_push_sql=${expected_push//\'/\'\'}
expected_warn_sql=${expected_warn//\'/\'\'}

# Independent of the migration's internal check, so a future edit that
# drops that check still cannot make this gate pass vacuously.
#
# Asserts DEFINITION, not just existence. `jobname in (...)` alone
# still passes if someone flips a cron expression to '0 0 * * *',
# repoints a URL at the wrong route, or drops the Authorization
# header -- and these job definitions are copy-pasted between
# migration files with nothing keeping them in sync, so drift is the
# likeliest regression.
#
# The command is compared IN FULL against the text the guard must have
# produced from the two fixture GUCs, with runs of whitespace
# collapsed. It used to be two `position(... in command) <> 0`
# substring tests, which issue #1175 showed pass on: a route repointed
# to `/api/scheduled/tickle` (the expected route is a prefix of it);
# the route and the word `Authorization` appearing only inside an SQL
# comment while the real call posts to an attacker host; a
# `jsonb_build_object('X-Note','Authorization removed')` header with no
# bearer at all; `net.http_get` in place of `net.http_post`; and the
# bare `select '/api/scheduled/tick Authorization';`. A full comparison
# rejects every one of them, and subsumes "the bearer is present and
# non-empty" -- the exact bearer is part of the compared text.
#
# Whitespace is normalised, and only whitespace: the command comes from
# a dollar-quoted literal in the migration, so reindenting that file
# must not red CI, while every other byte -- method, scheme, host,
# path, header names and values -- must match exactly.
#
# `active`, `database`, `username` and `nodename` are checked too. A
# job that is present and correctly defined but `active = false` never
# fires, which is #1167's "the jobs exist, nothing runs" failure mode
# reproduced through the gate; and one registered via
# `cron.schedule_in_database(..., database := 'template1')` (or against
# another nodename) satisfies every definition check while doing
# nothing useful in production.
#
# Only the two jobs whose COMMAND is the HTTP call are checked this
# way. reap_idle_active_games is registered as the single call
# `select public.reap_idle_active_games_tick();` (#1166): its route,
# bearer token and 90s timeout live inside the function body and are
# re-read every run, precisely so that a URL/secret rotation cannot
# leave a stale value baked into cron.job and so that the function's
# https transport gate cannot be bypassed. A route/Authorization
# substring test therefore cannot pass for it and must not be
# reintroduced -- it is asserted by exact command match below.
bad=$("$PSQL" "$DB" -v ON_ERROR_STOP=1 -tAc "
  select coalesce(string_agg(format('%s (%s)', expected.jobname, checked.problem), '; ' order by expected.jobname), '')
    from (values
            ('scheduled_games_push_tick'::text, '* * * * *'::text, '$expected_push_sql'::text),
            ('warn_idle_waiting_lobbies', '*/2 * * * *', '$expected_warn_sql')
         ) as expected(jobname, schedule, command)
    left join cron.job j on j.jobname = expected.jobname
    cross join lateral (
      select case
               when j.jobid is null then 'absent from cron.job'
               when j.schedule is distinct from expected.schedule
                 then format('schedule is %L, expected %L', j.schedule, expected.schedule)
               when btrim(regexp_replace(j.command, '[ \t\r\n\f\v]+', ' ', 'g')) is distinct from expected.command
                    and btrim(regexp_replace(j.command, '\s+', ' ', 'g')) is not distinct from expected.command
                 then format('command matches %L only if NON-ASCII whitespace is treated as whitespace. It contains a character such as U+2000/U+2003/U+2028/U+2029/U+3000, which Postgres regex \s matches but the SQL lexer does not -- pg_cron would raise a syntax error on every tick. Raw command: %L', expected.command, j.command)
               when btrim(regexp_replace(j.command, '[ \t\r\n\f\v]+', ' ', 'g')) is distinct from expected.command
                 then format('command is %L, expected %L (ASCII whitespace normalised)', btrim(regexp_replace(j.command, '[ \t\r\n\f\v]+', ' ', 'g')), expected.command)
               when j.active is distinct from true
                 then 'is registered but cron.job.active is false, so it never fires'
               when j.database is distinct from 'postgres'
                 then format('is registered against database %L, expected %L', j.database, 'postgres')
               when j.username is distinct from 'postgres'
                 then format('runs as %L, expected %L', j.username, 'postgres')
               when j.nodename is distinct from 'localhost'
                 then format('is registered against nodename %L, expected %L', j.nodename, 'localhost')
               when j.nodeport is distinct from current_setting('port')::int
                 then format('is registered against nodeport %L, expected %L', j.nodeport, current_setting('port'))
             end as problem
    ) as checked
   where checked.problem is not null;")
if [ -n "$bad" ]; then
  echo "::error::Expected direct-HTTP cron job(s) wrong or missing in cron.job after scheduling with both GUCs set: $bad"
  echo "This is the failure mode from issue #1167 -- a scheduling block that reports success and schedules nothing (or schedules the wrong thing)."
  exit 1
fi
echo "Both direct-HTTP cron jobs are present with the expected schedule and exact command."

# The reaper, asserted by exact command. This is the regression test
# for the guard migration re-inlining net.http_post over the tick call:
# anything other than the bare tick invocation means baked-in
# credentials and a bypassed transport gate. Byte-for-byte, NOT
# whitespace-normalised: this command is a plain constant in the
# migration rather than a dollar-quoted block, so there is no
# reindentation to tolerate and no reason to accept anything else.
bad=$("$PSQL" "$DB" -v ON_ERROR_STOP=1 -tAc "
  select coalesce(
           case
             when j.jobid is null then 'absent from cron.job'
             when j.schedule is distinct from '*/15 * * * *'
               then format('schedule is %L, expected %L', j.schedule, '*/15 * * * *')
             when j.command is distinct from 'select public.reap_idle_active_games_tick();'
               then format('command is %L, expected %L', j.command, 'select public.reap_idle_active_games_tick();')
             when j.active is distinct from true
               then 'is registered but cron.job.active is false, so it never fires'
             when j.database is distinct from 'postgres'
               then format('is registered against database %L, expected %L', j.database, 'postgres')
             when j.username is distinct from 'postgres'
               then format('runs as %L, expected %L', j.username, 'postgres')
             when j.nodename is distinct from 'localhost'
               then format('is registered against nodename %L, expected %L', j.nodename, 'localhost')
             when j.nodeport is distinct from current_setting('port')::int
               then format('is registered against nodeport %L, expected %L', j.nodeport, current_setting('port'))
           end, '')
    from (select 1) as one
    left join cron.job j on j.jobname = 'reap_idle_active_games';")
if [ -n "$bad" ]; then
  echo "::error::reap_idle_active_games is wrong or missing in cron.job after running the guard migration with both GUCs set: $bad"
  echo "It must be registered as the tick call, not as an inlined net.http_post: the URL and the CRON_SECRET bearer must be re-read at run time (rotation-safe) and must pass the function's https transport gate (CWE-319)."
  echo "TO FIX: find the migration that re-registers reap_idle_active_games and delete that registration."
  exit 1
fi
echo "reap_idle_active_games is registered as the tick call with the expected schedule."

# Finally, an INVENTORY (#1175 finding 4): everything in cron.job must
# be one of the seven jobs this repo's migrations register. Without
# this the gate is a whitelist-of-three presence check and an extra job
# posting to an attacker host is simply invisible to it.
#
# The commands of the four pure-SQL housekeeping jobs are pinned by
# `cron.job matches the deploy-equivalent inventory` earlier in this
# job, and nothing between there and here touches them, so only their
# names are re-checked at this point.
#
# ADDING A LEGITIMATE CRON JOB: this fails with "is in cron.job but is
# not a declared job", printing the jobname, schedule and command.
# A pure-SQL job needs TWO edits: the jobname array just below, and a
# full expectation row in `cron.job matched the deploy-equivalent
# inventory` above. A GUC-gated HTTP job needs THREE: those two plus an
# expectation row in the direct-HTTP check earlier in this step, since
# it is absent from the deploy-equivalent snapshot and present here.
# A cron job reaching production without being declared in every one of
# those places is exactly what this check exists to stop.
bad=$("$PSQL" "$DB" -v ON_ERROR_STOP=1 -tAc "
  select coalesce(string_agg(format('%s is in cron.job but is not a declared job (schedule %L, command %L)',
                                    coalesce(j.jobname, '<a row with no jobname>'), j.schedule, j.command), '; ' order by j.jobid), '')
    from cron.job j
   where j.jobname is null
      or j.jobname <> all (array[
           'close_idle_waiting_lobbies',
           'drop_stale_unconfirmed_rsvps',
           'notification_dispatches_gc',
           'open_scheduled_games_due',
           'reap_idle_active_games',
           'scheduled_games_push_tick',
           'warn_idle_waiting_lobbies'
         ]);")
if [ -n "$bad" ]; then
  echo "::error::Undeclared cron job(s) in cron.job after running the scheduling guard: $bad"
  echo "TO FIX: every cron job this repo schedules must be declared. If the job is legitimate, add its name to the array in this step, a full expectation row to \`cron.job matches the deploy-equivalent inventory\` above, and -- if it is a GUC-gated HTTP job -- an expectation row to the direct-HTTP check earlier in this step. If it is not legitimate, a migration in this PR is scheduling something nobody asked for."
  exit 1
fi
echo "cron.job contains no undeclared jobs."
