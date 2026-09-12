-- Schedule the idle-active-game reaper from the DB instead of EC2 user-data.
--
-- WHY: /api/cron/reap-idle's only caller was the `fateround-reap-idle.timer`
-- systemd unit baked into infra/templates/user-data.sh.tftpl. That unit is
-- installed at INSTANCE PROVISION time, so it exists only on instances created
-- after that template change — not on instances that predate it, and never as a
-- result of an ordinary app deploy or a migration. On production (2026-09-11)
-- nothing had been reaped in 17 days: 97 games sat at status='active' with zero
-- activity in the last 30 minutes, the oldest idle for 17 days, while the server
-- ticker kept poking them (2.34M/day server reads of /rest/v1/games; the worst
-- single game took 94,824 requests in 25 hours). Moving the schedule into
-- pg_cron makes the reaper a property of the DATABASE, which every environment
-- gets from `supabase db push`, rather than of a particular AMI generation.
--
-- Mirrors 20261015120000_warn_idle_waiting_lobbies_cron.sql exactly: pg_cron +
-- pg_net POST carrying the shared CRON_SECRET bearer, and the Node route does
-- the work (the finish pipeline — room points, round-facts snapshot, tournament
-- resolution, trophies — is TypeScript and cannot run in-database, which is why
-- this is an HTTP tick and not a SQL function like close_idle_waiting_lobbies).
-- Skips (loudly -- see the guard notes below) when pg_cron/pg_net or the two GUCs
-- are unavailable, so it is a no-op on local dev, CI and preview branches.
--
-- Operator setup (one-off per project, same GUCs the other HTTP ticks use):
--   alter database <db> set app.api_base = 'https://fateround.com';   -- https required
--   alter database <db> set app.cron_secret = '<same value as the CRON_SECRET env>';
--
-- CADENCE — every 15 minutes, matching the systemd timer's OnUnitActiveSec=15min
-- and the reaper's documented design cadence (src/lib/idle-reaper.ts). The route
-- closes at most REAPER_BATCH_LIMIT=20 games per sweep; that bound exists because
-- an earlier 200-per-sweep-every-5-minutes configuration saturated the DB and made
-- PostgREST/Auth health checks flap. So one invocation does NOT clear the current
-- 97-game backlog — it takes ~5 sweeps (~75 minutes) to drain, which is the
-- intended "chip away gently" behaviour. Going faster to drain a one-off backlog
-- would permanently raise the steady-state rate toward the configuration that
-- caused that incident, and buys nothing at steady state: the idle threshold is
-- 30 minutes, so a 15-minute tick already closes a game within 30-45 minutes of
-- it going quiet.
--
-- DOUBLE-INVOCATION IS SAFE. The systemd timer is deliberately left in place (its
-- removal is a separate infra decision), so instances that have it will POST the
-- same route in parallel with this job. closeIdleActiveGames() passes
-- `{ onlyIfActive: true }` to adminEndGame, which makes the active->finished flip a
-- single-winner compare-and-set (`update ... .eq('status','active').select('id')` in
-- src/lib/game-finish.ts); the loser gets `won === false`, counts the game as `raced`
-- and returns without awarding room points, resolving the tournament match or
-- stamping result_reason. Overlapping sweeps therefore duplicate work, not effects.
--
-- timeout_milliseconds is raised from pg_net's 5s default to 90s to match the
-- systemd unit's `curl --max-time 90`: a full 20-game sweep runs the whole
-- TypeScript finish path per game and comfortably outlives 5 seconds, and a
-- premature client-side timeout would log every healthy sweep as a failure.

-- ── Why this guard is LOUD, and how it composes with #1168 ──────────────────
-- The first version of this file `return`ed silently when pg_cron/pg_net or the
-- two GUCs were missing. That is the exact defect behind issue #1167: a
-- migration that skips is still RECORDED AS APPLIED, so setting the GUCs later
-- never re-runs it and the job is never scheduled. On production the two
-- earlier HTTP-cron migrations skipped that way, nothing said so, and the
-- reaper never ran -- 97 games sat status='active' for up to 17 days at 2.34M
-- /rest/v1/games reads/day.
--
-- The remedy is split deliberately, and this file owns only half of it:
--   * THIS file makes its own skip VISIBLE (`raise warning`, naming what is
--     missing and the commands that fix it) and makes a genuine defect FATAL
--     (preconditions met, `cron.schedule` ran, job still not correctly
--     registered -> `raise exception`).
--   * 20261124120000_noisy_http_cron_scheduling_guard.sql (PR #1168) owns the
--     RE-REGISTRATION path: it is a later migration that re-schedules all three
--     HTTP ticks -- including this one -- behind the same loud guard, and its
--     header carries the operator runbook for an already-applied database.
-- So there is exactly ONE re-registration block per job to re-execute after the
-- GUCs are set (#1168's), not two competing ones. Adding a second one here
-- would give an operator two do-blocks for `reap_idle_active_games` with no
-- rule for which is authoritative. Visibility, on the other hand, must live in
-- BOTH files: this migration can land, and be applied, before #1168 exists.
--
-- The trap itself is not escapable from inside a migration: after
--   alter database <db> set app.api_base   = 'https://fateround.com';
--   alter database <db> set app.cron_secret = '<same value as CRON_SECRET>';
-- an operator must open a NEW session (database-level settings only affect new
-- connections) and re-execute the do-block in #1168's migration verbatim, then
--   select jobname, schedule from cron.job order by jobname;
-- Grep a deploy log for "REAPER CRON GUARD" to see which branch this file took.
--
-- ── Transport: HTTPS required, loopback the only exception ──────────────────
-- The POST carries the reusable per-environment CRON_SECRET as a bearer token,
-- and that one secret authenticates every cron entrypoint (see
-- src/app/api/cron/*/route.ts and infra/secrets.tf). Over plaintext http:// to a
-- remote host that is a cleartext transmission of a long-lived credential
-- (CWE-319) -- anyone on the path gets the key to every cron route. So a
-- non-https api_base is REFUSED before `cron.schedule` rather than scheduled.
--
-- The one exception is a loopback host (localhost, 127.0.0.0/8, [::1]), where
-- the request never leaves the machine and there is no path to intercept. That
-- carve-out is not hypothetical: it is the repo's own existing precedent --
-- infra/templates/user-data.sh.tftpl POSTs this same bearer to
-- `http://localhost:8080/api/cron/reap-idle`, and CI's cron-scheduling gate in
-- .github/workflows/ci.yml sets `app.api_base = 'http://127.0.0.1:3000'` to
-- exercise the scheduling path. Refusing loopback http would break both for no
-- security gain. Every documented hosted value is `https://fateround.com`.
--
-- The refusal is a warning-and-skip, not an exception: like the missing-GUC
-- branch it is an environment/configuration difference, and hard-failing would
-- make a mis-set GUC block `supabase db push` entirely. The job simply does not
-- get scheduled, and the log says exactly why.

do $$
declare
  expected_schedule constant text := '*/15 * * * *';
  expected_route constant text := '/api/cron/reap-idle';
  api_base text;
  cron_secret text;
  missing_settings text;
  authority text;
  api_scheme text;
  api_host text;
  job_problem text;
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise warning
      'REAPER CRON GUARD: pg_cron is not available, so the idle-active-game reaper (reap_idle_active_games -> %) was NOT scheduled. Expected on local/CI stacks; on a hosted project it means idle games are never closed.',
      expected_route;
    return;
  end if;
  if not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise warning
      'REAPER CRON GUARD: pg_net is not available, so the idle-active-game reaper (reap_idle_active_games -> %) was NOT scheduled. Expected on local/CI stacks; on a hosted project it means idle games are never closed.',
      expected_route;
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
    case when coalesce(api_base, '') = '' then 'app.api_base'::text end,
    case when coalesce(cron_secret, '') = '' then 'app.cron_secret'::text end
  );

  if coalesce(missing_settings, '') <> '' then
    raise warning
      'REAPER CRON GUARD: the idle-active-game reaper (reap_idle_active_games) was NOT scheduled because required database settings are unset: %. Set them with "alter database <db> set app.api_base = ''https://fateround.com''" and "alter database <db> set app.cron_secret = ''<same value as the CRON_SECRET env var>''", then -- because this migration is already recorded as applied and will not re-run -- open a NEW session and re-execute the do-block in supabase/migrations/20261124120000_noisy_http_cron_scheduling_guard.sql. Until then idle active games are never closed.',
      missing_settings;
    return;
  end if;

  -- Split api_base into scheme + host so the transport check looks at the HOST,
  -- not at a substring of the whole URL: 'http://evil.test/?x=localhost' must
  -- not pass a naive `like '%localhost%'` test. Strip the scheme, keep the
  -- authority (up to the first '/'), drop any userinfo, then take the host --
  -- bracketed for IPv6, up to the port otherwise.
  api_scheme := lower(split_part(api_base, '://', 1));
  authority := regexp_replace(api_base, '^[a-zA-Z][a-zA-Z0-9+.-]*://', '');
  authority := split_part(authority, '/', 1);
  authority := regexp_replace(authority, '^[^@]*@', '');
  if left(authority, 1) = '[' then
    api_host := lower(split_part(substring(authority from 2), ']', 1));
  else
    api_host := lower(split_part(authority, ':', 1));
  end if;

  if api_scheme <> 'https'
     and not (
       api_scheme = 'http'
       and (
         api_host in ('localhost', '::1')
         or api_host ~ '^127\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$'
       )
     )
  then
    raise warning
      'REAPER CRON GUARD: app.api_base is "%" (scheme "%", host "%"), so the idle-active-game reaper (reap_idle_active_games) was NOT scheduled: refusing to send the CRON_SECRET bearer token in cleartext to a non-loopback host. Set app.api_base to an https:// URL (e.g. ''https://fateround.com''); plaintext http:// is accepted only for loopback hosts (localhost, 127.0.0.0/8, [::1]), where the request never leaves the machine.',
      api_base,
      api_scheme,
      api_host;
    return;
  end if;

  -- Unschedule any prior version of this job first so re-running the migration
  -- doesn't stack duplicate schedules on the same name.
  perform cron.unschedule(jobid) from cron.job where jobname = 'reap_idle_active_games';
  perform cron.schedule(
    'reap_idle_active_games',
    expected_schedule,
    format(
      $sql$ select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', %L),
        timeout_milliseconds := 90000
      ); $sql$,
      api_base || expected_route,
      'Bearer ' || cron_secret
    )
  );

  -- Every precondition was satisfied and cron.schedule ran, so anything wrong
  -- from here is a genuine defect rather than an environment difference: fail
  -- the migration. Existence alone would be too weak -- it still passes if the
  -- cron expression drifts, the URL is repointed at another route, or the
  -- Authorization header is dropped -- so presence, schedule, route and bearer
  -- header are each checked. (#1168 asserts the same three jobs across
  -- migrations; this one asserts only the job it itself just scheduled.)
  select case
           when j.jobid is null then 'absent from cron.job'
           when j.schedule is distinct from expected_schedule
             then format('schedule is %L, expected %L', j.schedule, expected_schedule)
           when position(expected_route in j.command) = 0
             then format('command does not POST to %s', expected_route)
           when position('Authorization' in j.command) = 0
             then 'command does not send an Authorization header'
         end
    into job_problem
    from (select 1) as one
    left join cron.job j on j.jobname = 'reap_idle_active_games';

  if job_problem is not null then
    raise exception
      'REAPER CRON GUARD: scheduling completed but reap_idle_active_games is not correctly registered: %.',
      job_problem;
  end if;

  raise notice
    'REAPER CRON GUARD: reap_idle_active_games scheduled and verified in cron.job (schedule %, route %).',
    expected_schedule,
    expected_route;
end
$$;
