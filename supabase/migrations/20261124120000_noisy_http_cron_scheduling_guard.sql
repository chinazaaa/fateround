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
-- calls below re-register exactly the jobs the source migrations define
-- (`scheduled_games_push_tick` every minute -> /api/scheduled/tick;
-- `warn_idle_waiting_lobbies` every 2 minutes -> /api/cron/warn-idle-lobbies;
-- `reap_idle_active_games` every 15 minutes -> /api/cron/reap-idle, via its
-- tick function). Re-registering them is idempotent: unschedule-by-name, then
-- schedule.
--
-- ── Ordering with respect to PR #1166 ───────────────────────────────────────
-- `reap_idle_active_games` is defined by
-- 20261123120000_reap_idle_active_games_cron.sql (PR #1166), which lands first
-- and runs first (20261123 < 20261124). That migration does NOT bake the route
-- or the bearer token into the job's command: it registers the single call
--   select public.reap_idle_active_games_tick();
-- and the function reads app.api_base / app.cron_secret at RUN time, refuses to
-- send the CRON_SECRET bearer in cleartext to a non-loopback host, and sets
-- timeout_milliseconds := 90000 itself. Read that file's header for why.
--
-- THIS MIGRATION MUST NOT UNDO THAT. Because 20261124 runs later it wins, so
-- re-registering the reaper as a raw `net.http_post` with api_base/cron_secret
-- formatted in at MIGRATION time would (a) freeze the URL and the secret into
-- cron.job, so any later rotation leaves the reaper hitting a stale endpoint or
-- failing auth with nothing to re-run, and (b) bypass #1166's https transport
-- gate, re-opening the cleartext-credential exposure (CWE-319) that #1166
-- closed. So the reaper is re-registered with the SAME tick command #1166 uses,
-- and its assertion is an exact match on that command rather than a route/header
-- substring test -- the route and the Authorization header are no longer visible
-- in j.command at all, they live inside the function body.
--
-- That also means the reaper needs NO GUC at schedule time, so it is scheduled
-- and asserted ABOVE the app.api_base/app.cron_secret gate below, not inside it.
-- Only the two direct-`net.http_post` jobs still need the settings in order to
-- build their commands.
--
-- It stays NON-FATAL when pg_cron/pg_net genuinely do not exist or the GUCs are
-- unset — local `supabase db reset`, CI's throwaway stack, and preview branches
-- must keep applying cleanly. It raises an EXCEPTION in exactly two cases, both
-- of which are real defects:
--   1. pg_cron and pg_net are both present but public.reap_idle_active_games_tick()
--      does not exist, so the command this migration is about to register would
--      be dead on arrival. This fires BEFORE any unschedule/schedule runs, so
--      nothing already in cron.job is disturbed.
--   2. The preconditions were all met, scheduling ran, and a job is still absent
--      from cron.job afterwards or is registered with the wrong schedule, the
--      wrong command or the wrong route.
--
-- ── The trap this does NOT escape ───────────────────────────────────────────
-- Setting the GUCs later does not retroactively schedule the two direct-HTTP
-- jobs: this migration will already be applied and will not re-run either.
-- (`reap_idle_active_games` is exempt -- it is registered above the gate and
-- reads the settings per tick, so it needs no re-run at all.) After
--   alter database postgres set app.api_base   = 'https://fateround.com';
--   alter database postgres set app.cron_secret = '<same value as CRON_SECRET>';
-- an operator must open a NEW session (GUC changes only affect new connections)
-- and re-execute the `do $$ ... $$;` block below verbatim, then confirm with
--   select jobname, schedule from cron.job order by jobname;
-- Expect all three of `scheduled_games_push_tick` (* * * * *),
-- `warn_idle_waiting_lobbies` (*/2 * * * *) and `reap_idle_active_games`
-- (*/15 * * * *) to appear.
--
-- Note what the missing-settings branch does and does NOT mean for the two
-- direct-HTTP jobs: it RE-REGISTERS nothing, it does not unschedule anything.
-- If 20261005120000 / 20261015120000 managed to register them on this database
-- (their own GUC gates passed at the time), those rows are still in cron.job and
-- still firing with whatever url and bearer token were baked in back then. So
-- "not scheduled by this migration" is not the same as "not running", and a
-- stale baked-in URL or a rotated secret looks identical to a dead job from the
-- outside. `select jobname, schedule, command from cron.job order by jobname;`
-- is what actually settles it.
--
-- Grep the deploy log for "CRON GUARD" to see which branch was taken.

do $$
declare
  -- Single source of truth for the two jobs whose command IS the HTTP call:
  -- the jobname, the cron expression, and the route the command must POST to.
  -- The post-scheduling assertion checks all three, not just the name -- these
  -- definitions are copies of the ones in the source migrations and nothing
  -- keeps them in sync automatically, so a drifted schedule or a repointed URL
  -- is the likeliest future regression here.
  --
  -- reap_idle_active_games is deliberately NOT in this list. Its command does
  -- not contain a URL or an Authorization header (see the header note), so a
  -- `position(route in j.command)` test could never pass for it; it gets its own
  -- exact-command assertion below.
  http_jobs jsonb := jsonb_build_array(
    jsonb_build_object(
      'jobname', 'scheduled_games_push_tick',
      'schedule', '* * * * *',
      'route', '/api/scheduled/tick'
    ),
    jsonb_build_object(
      'jobname', 'warn_idle_waiting_lobbies',
      'schedule', '*/2 * * * *',
      'route', '/api/cron/warn-idle-lobbies'
    )
  );
  -- Kept byte-identical to expected_schedule/expected_command in
  -- 20261123120000_reap_idle_active_games_cron.sql. plpgsql cannot import
  -- another migration's local constant, and this file runs LAST, so its value is
  -- the one that ends up in cron.job either way -- the honest guard against the
  -- two literals drifting is not the assertion below (which checks what this
  -- block itself just registered) but the to_regprocedure() probe: it resolves
  -- the exact signature this command calls, so a renamed or dropped tick
  -- function fails the migration here instead of becoming a cron job that errors
  -- every 15 minutes into a log nobody reads. .github/workflows/ci.yml asserts
  -- the same command string against both migrations independently.
  reaper_jobname constant text := 'reap_idle_active_games';
  reaper_schedule constant text := '*/15 * * * *';
  reaper_command constant text := 'select public.reap_idle_active_games_tick();';
  http_job_names text;
  all_job_names text;
  api_base text;
  cron_secret text;
  bad_jobs text[];
  reaper_problem text;
  missing_settings text;
begin
  select string_agg(e.job ->> 'jobname', ', ' order by e.ord)
    into http_job_names
    from jsonb_array_elements(http_jobs) with ordinality as e(job, ord);
  all_job_names := concat_ws(', ', http_job_names, reaper_jobname);

  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise warning
      'CRON GUARD: pg_cron is not available, so HTTP cron jobs (%) were NOT scheduled. Expected on local/CI stacks; on a hosted project it means the push ticks and the idle reaper are dead.',
      all_job_names;
    return;
  end if;

  if not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise warning
      'CRON GUARD: pg_net is not available, so HTTP cron jobs (%) were NOT scheduled. Expected on local/CI stacks; on a hosted project it means the push ticks and the idle reaper are dead.',
      all_job_names;
    return;
  end if;

  create extension if not exists pg_cron;
  create extension if not exists pg_net;

  -- ── The idle reaper, scheduled before (and independently of) the GUC gate ──
  -- Its command is a bare call to public.reap_idle_active_games_tick(), which
  -- reads app.api_base / app.cron_secret at RUN time, so unlike the two jobs
  -- below there is nothing about it that needs the settings to exist now. Doing
  -- it here keeps the missing-GUC warning below truthful -- on an unconfigured
  -- database the reaper IS registered, and claiming otherwise would send an
  -- operator hunting for a problem that is not there.
  if to_regprocedure('public.reap_idle_active_games_tick()') is null then
    raise exception
      'CRON GUARD: public.reap_idle_active_games_tick() does not exist, so % cannot be registered. It is created unconditionally by 20261123120000_reap_idle_active_games_cron.sql, which sorts before this file -- if it is missing here the migration history was applied out of order or partially.',
      reaper_jobname;
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname = reaper_jobname;
  perform cron.schedule(reaper_jobname, reaper_schedule, reaper_command);

  select case
           when j.jobid is null then 'absent from cron.job'
           when j.schedule is distinct from reaper_schedule
             then format('schedule is %L, expected %L', j.schedule, reaper_schedule)
           when j.command is distinct from reaper_command
             then format('command is %L, expected %L', j.command, reaper_command)
         end
    into reaper_problem
    from (select 1) as one
    left join cron.job j on j.jobname = reaper_jobname;

  if reaper_problem is not null then
    raise exception
      'CRON GUARD: scheduling completed but % is not correctly registered: %.',
      reaper_jobname,
      reaper_problem;
  end if;

  raise notice
    'CRON GUARD: % scheduled and verified in cron.job (schedule %, command %). Its route, bearer token and timeout live inside the tick function, which re-reads them every run.',
    reaper_jobname,
    reaper_schedule,
    reaper_command;

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
      'CRON GUARD: the direct-HTTP cron jobs (%) were NOT re-registered because required database settings are unset: %. Set them with "alter database <db> set app.api_base = ''https://fateround.com''" and "alter database <db> set app.cron_secret = ''<same value as the CRON_SECRET env var>''", then re-run the do-block in supabase/migrations/20261124120000_noisy_http_cron_scheduling_guard.sql from a NEW session. This branch unschedules nothing, so it does NOT mean those two jobs are stopped: any rows an earlier migration managed to register are still in cron.job and still firing with the url and bearer token baked in at that time. Check with "select jobname, schedule, command from cron.job order by jobname;" -- absent means dead, present means running against possibly stale values. (% IS registered by this migration -- it reads the same two settings at run time, so it starts working as soon as they are set at DATABASE level, with nothing to re-run.)',
      http_job_names,
      missing_settings,
      reaper_jobname;
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

  -- reap_idle_active_games is NOT re-registered here. It was scheduled above,
  -- before this GUC gate, as the tick call that #1166 defines -- see the header.

  -- Every precondition was satisfied and scheduling ran, so anything wrong here
  -- is a genuine defect, not an environment difference. Fail the migration.
  --
  -- Existence alone would be a weak assertion: it still passes if a job's cron
  -- expression drifts to '0 0 * * *', if its URL is repointed at the wrong
  -- route, or if the Authorization header is dropped. So each job is checked
  -- against its expected schedule and route as well. These two jobs inline the
  -- request in their command, which is what makes the substring tests meaningful
  -- for them and meaningless for the reaper.
  select array_agg(format('%s (%s)', expected.jobname, checked.problem) order by expected.jobname)
    into bad_jobs
    from jsonb_to_recordset(http_jobs)
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
      'CRON GUARD: scheduling completed but the expected direct-HTTP cron jobs are not correctly registered: %.',
      array_to_string(bad_jobs, '; ');
  end if;

  raise notice
    'CRON GUARD: direct-HTTP cron jobs scheduled and verified in cron.job (name, schedule and route all match): %. % was verified separately above.',
    http_job_names,
    reaper_jobname;
end
$$;
