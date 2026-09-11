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
-- This changes no job's schedule, URL, or payload. The two `cron.schedule`
-- calls below are byte-for-byte the same jobs the original migrations define
-- (`scheduled_games_push_tick` every minute -> /api/scheduled/tick;
-- `warn_idle_waiting_lobbies` every 2 minutes -> /api/cron/warn-idle-lobbies).
-- Re-registering them is idempotent: unschedule-by-name, then schedule.
--
-- It stays NON-FATAL when pg_cron/pg_net genuinely do not exist or the GUCs are
-- unset — local `supabase db reset`, CI's throwaway stack, and preview branches
-- must keep applying cleanly. It raises an EXCEPTION only in the one case that
-- is a real defect: the preconditions were all met, scheduling ran, and the job
-- still is not in cron.job afterwards.
--
-- ── The trap this does NOT escape ───────────────────────────────────────────
-- Setting the GUCs later does not retroactively schedule anything: this
-- migration will already be applied and will not re-run either. After
--   alter database postgres set app.api_base   = 'https://fateround.com';
--   alter database postgres set app.cron_secret = '<same value as CRON_SECRET>';
-- an operator must open a NEW session (GUC changes only affect new connections)
-- and re-execute the `do $$ ... $$;` block below verbatim, then confirm with
--   select jobname, schedule from cron.job order by jobname;
-- Expect `scheduled_games_push_tick` and `warn_idle_waiting_lobbies` to appear.
--
-- Grep the deploy log for "CRON GUARD" to see which branch was taken.

do $$
declare
  api_base text;
  cron_secret text;
  expected_jobs text[] := array['scheduled_games_push_tick', 'warn_idle_waiting_lobbies'];
  missing_jobs text[];
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise warning
      'CRON GUARD: pg_cron is not available, so HTTP cron jobs (%) were NOT scheduled. Expected on local/CI stacks; on a hosted project it means the push ticks are dead.',
      array_to_string(expected_jobs, ', ');
    return;
  end if;

  if not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise warning
      'CRON GUARD: pg_net is not available, so HTTP cron jobs (%) were NOT scheduled. Expected on local/CI stacks; on a hosted project it means the push ticks are dead.',
      array_to_string(expected_jobs, ', ');
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

  if api_base is null or api_base = '' or cron_secret is null or cron_secret = '' then
    raise warning
      'CRON GUARD: HTTP cron jobs (%) were NOT scheduled because required database settings are unset: %. Set them with "alter database <db> set app.api_base = ''https://fateround.com''" and "alter database <db> set app.cron_secret = ''<same value as the CRON_SECRET env var>''", then re-run the do-block in supabase/migrations/20261124120000_noisy_http_cron_scheduling_guard.sql from a NEW session. Until then the scheduled-games push tick and the idle-lobby warning tick do not run at all.',
      array_to_string(expected_jobs, ', '),
      array_to_string(
        array_remove(
          array[
            case when api_base is null or api_base = '' then 'app.api_base' end,
            case when cron_secret is null or cron_secret = '' then 'app.cron_secret' end
          ],
          null
        ),
        ', '
      );
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

  -- Every precondition was satisfied and scheduling ran, so an absent job here
  -- is a genuine defect, not an environment difference. Fail the migration.
  select array_agg(expected_name order by expected_name)
    into missing_jobs
    from unnest(expected_jobs) as expected_name
   where not exists (select 1 from cron.job j where j.jobname = expected_name);

  if missing_jobs is not null then
    raise exception
      'CRON GUARD: scheduling completed but these expected cron jobs are absent from cron.job: %.',
      array_to_string(missing_jobs, ', ');
  end if;

  raise notice
    'CRON GUARD: HTTP cron jobs scheduled and verified present in cron.job: %.',
    array_to_string(expected_jobs, ', ');
end
$$;
