-- Make a skipped cron schedule LOUD instead of silent. Fixes the blind spot
-- behind issue #1167.
--
-- What went wrong (production, 2026-09-11): the pg_cron + pg_net scheduling
-- blocks in 20261005120000_scheduled_games_and_rsvps.sql and
-- 20261015120000_warn_idle_waiting_lobbies_cron.sql are written to `return`
-- silently when `app.api_base` / `app.cron_secret` are unset. They ARE unset on
-- the production project, so both migrations applied "successfully" and
-- scheduled nothing. `select jobname from cron.job` returned four jobs, all
-- pure-SQL; not one `net.http_post` job existed. The idle reaper is invoked
-- over HTTP, so it never ran: 97 games sat status='active' for up to 17 days,
-- generating 2.34M /rest/v1/games reads per day.
--
-- Why this is a NEW migration rather than an edit to those two files:
--   * They have already been applied on prod and dev. `supabase db push`
--     tracks applied VERSIONS, so editing their bodies would never re-execute
--     them — the warning would print on exactly zero of the databases that
--     have the problem, while leaving the recorded statements in
--     `supabase_migrations.schema_migrations` out of sync with the repo.
--   * No migration in this repo has ever been amended after landing (every
--     file in supabase/migrations has exactly one commit), and CONTRIBUTING.md
--     treats the applied-history record as load-bearing.
--   * A new migration DOES re-execute, on every database, which is the only
--     way the diagnostic reaches production.
--
-- This changes no job's schedule, URL, or payload. The three `cron.schedule`
-- calls below are byte-for-byte the same jobs the original migrations define
-- (`scheduled_games_push_tick` every minute -> /api/scheduled/tick;
-- `warn_idle_waiting_lobbies` every 2 minutes -> /api/cron/warn-idle-lobbies;
-- `reap_idle_active_games` every 15 minutes -> /api/cron/reap-idle).
-- Re-registering them is idempotent: unschedule-by-name, then schedule.
--
-- ── Ordering with respect to PR #1166 ───────────────────────────────────────
-- `reap_idle_active_games` is defined by
-- 20261123120000_reap_idle_active_games_cron.sql (PR #1166). That migration
-- carries the same GUC-gated `return` this one exists to make loud, so on a
-- project whose GUCs are unset it schedules nothing and -- being already
-- recorded as applied -- never re-runs. Covering the reaper HERE is the whole
-- point: without it an operator could follow the runbook below, see the
-- reassuring "scheduled and verified present" notice, and still leave the
-- reaper dead, which is exactly the failure that left 97 games active for 17
-- days.
--
-- #1166 should land first, so that the definition below and its source file
-- enter the history in the natural order. If it has NOT been applied yet,
-- re-registering the job here is still correct and harmless: the definition is
-- identical, /api/cron/reap-idle already ships (only its SCHEDULING moves in
-- #1166), and #1166's own block starts with `cron.unschedule(... jobname =
-- 'reap_idle_active_games')` before scheduling, so applying it afterwards
-- replaces this registration rather than stacking a duplicate.
--
-- It stays NON-FATAL when pg_cron/pg_net genuinely do not exist or the GUCs are
-- unset — local `supabase db reset`, CI's throwaway stack, and preview branches
-- must keep applying cleanly. It raises an EXCEPTION only in the one case that
-- is a real defect: the preconditions were all met, scheduling ran, and a job is
-- still absent from cron.job afterwards or is registered with the wrong
-- schedule or the wrong route.
--
-- ── The trap this does NOT escape ───────────────────────────────────────────
-- Setting the GUCs later does not retroactively schedule anything: this
-- migration will already be applied and will not re-run either. After
--   alter database postgres set app.api_base   = 'https://fateround.com';
--   alter database postgres set app.cron_secret = '<same value as CRON_SECRET>';
-- an operator must open a NEW session (GUC changes only affect new connections)
-- and re-execute the `do $$ ... $$;` block below verbatim, then confirm with
--   select jobname, schedule from cron.job order by jobname;
-- Expect all three of `scheduled_games_push_tick` (* * * * *),
-- `warn_idle_waiting_lobbies` (*/2 * * * *) and `reap_idle_active_games`
-- (*/15 * * * *) to appear.
--
-- Grep the deploy log for "CRON GUARD" to see which branch was taken.

do $$
declare
  -- Single source of truth for what this migration registers: the jobname, the
  -- cron expression, and the route the job's command must POST to. The
  -- post-scheduling assertion checks all three, not just the name -- these
  -- definitions are copies of the ones in the source migrations and nothing
  -- keeps them in sync automatically, so a drifted schedule or a repointed URL
  -- is the likeliest future regression here.
  expected_jobs jsonb := jsonb_build_array(
    jsonb_build_object(
      'jobname', 'scheduled_games_push_tick',
      'schedule', '* * * * *',
      'route', '/api/scheduled/tick'
    ),
    jsonb_build_object(
      'jobname', 'warn_idle_waiting_lobbies',
      'schedule', '*/2 * * * *',
      'route', '/api/cron/warn-idle-lobbies'
    ),
    jsonb_build_object(
      'jobname', 'reap_idle_active_games',
      'schedule', '*/15 * * * *',
      'route', '/api/cron/reap-idle'
    )
  );
  expected_names text;
  api_base text;
  cron_secret text;
  bad_jobs text[];
  missing_settings text;
begin
  select string_agg(e.job ->> 'jobname', ', ' order by e.ord)
    into expected_names
    from jsonb_array_elements(expected_jobs) with ordinality as e(job, ord);

  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise warning
      'CRON GUARD: pg_cron is not available, so HTTP cron jobs (%) were NOT scheduled. Expected on local/CI stacks; on a hosted project it means the push ticks and the idle reaper are dead.',
      expected_names;
    return;
  end if;

  if not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise warning
      'CRON GUARD: pg_net is not available, so HTTP cron jobs (%) were NOT scheduled. Expected on local/CI stacks; on a hosted project it means the push ticks and the idle reaper are dead.',
      expected_names;
    return;
  end if;

  create extension if not exists pg_cron;
  create extension if not exists pg_net;

  begin
    api_base := current_setting('app.api_base', true);
    cron_secret := current_setting('app.cron_secret', true);
  exception when others then
    api_base := null;
    cron_secret := null;
  end;

  -- concat_ws drops NULL arguments, so this names only the settings that are
  -- actually missing. The ::text casts keep the CASE results from being
  -- unknown-typed in a variadic "any" argument list.
  missing_settings := concat_ws(
    ', ',
    case when api_base is null or api_base = '' then 'app.api_base'::text end,
    case when cron_secret is null or cron_secret = '' then 'app.cron_secret'::text end
  );

  if api_base is null or api_base = '' or cron_secret is null or cron_secret = '' then
    raise warning
      'CRON GUARD: HTTP cron jobs (%) were NOT scheduled because required database settings are unset: %. Set them with "alter database <db> set app.api_base = ''https://fateround.com''" and "alter database <db> set app.cron_secret = ''<same value as the CRON_SECRET env var>''", then re-run the do-block in supabase/migrations/20261124120000_noisy_http_cron_scheduling_guard.sql from a NEW session. Until then the scheduled-games push tick, the idle-lobby warning tick and the idle-active-game reaper do not run at all.',
      expected_names,
      missing_settings;
    return;
  end if;

  -- Identical to 20261005120000_scheduled_games_and_rsvps.sql.
  perform cron.unschedule(jobid) from cron.job where jobname = 'scheduled_games_push_tick';
  perform cron.schedule(
    'scheduled_games_push_tick',
    '* * * * *',
    format(
      $sql$ select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', %L)
      ); $sql$,
      api_base || '/api/scheduled/tick',
      'Bearer ' || cron_secret
    )
  );

  -- Identical to 20261015120000_warn_idle_waiting_lobbies_cron.sql.
  perform cron.unschedule(jobid) from cron.job where jobname = 'warn_idle_waiting_lobbies';
  perform cron.schedule(
    'warn_idle_waiting_lobbies',
    '*/2 * * * *',
    format(
      $sql$ select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', %L)
      ); $sql$,
      api_base || '/api/cron/warn-idle-lobbies',
      'Bearer ' || cron_secret
    )
  );

  -- Identical to 20261123120000_reap_idle_active_games_cron.sql (PR #1166),
  -- including timeout_milliseconds := 90000 -- pg_net's 5s default would log
  -- every healthy 20-game sweep as a failure. See the ordering note in the
  -- header.
  perform cron.unschedule(jobid) from cron.job where jobname = 'reap_idle_active_games';
  perform cron.schedule(
    'reap_idle_active_games',
    '*/15 * * * *',
    format(
      $sql$ select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', %L),
        timeout_milliseconds := 90000
      ); $sql$,
      api_base || '/api/cron/reap-idle',
      'Bearer ' || cron_secret
    )
  );

  -- Every precondition was satisfied and scheduling ran, so anything wrong here
  -- is a genuine defect, not an environment difference. Fail the migration.
  --
  -- Existence alone would be a weak assertion: it still passes if a job's cron
  -- expression drifts to '0 0 * * *', if its URL is repointed at the wrong
  -- route, or if the Authorization header is dropped. So each job is checked
  -- against its expected schedule and route as well.
  select array_agg(format('%s (%s)', expected.jobname, checked.problem) order by expected.jobname)
    into bad_jobs
    from jsonb_to_recordset(expected_jobs)
           as expected(jobname text, schedule text, route text)
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
   where checked.problem is not null;

  if bad_jobs is not null then
    raise exception
      'CRON GUARD: scheduling completed but the expected HTTP cron jobs are not correctly registered: %.',
      array_to_string(bad_jobs, '; ');
  end if;

  raise notice
    'CRON GUARD: HTTP cron jobs scheduled and verified in cron.job (name, schedule and route all match): %.',
    expected_names;
end
$$;
