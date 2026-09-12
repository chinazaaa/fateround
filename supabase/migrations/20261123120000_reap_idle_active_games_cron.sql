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
-- Same transport as 20261015120000_warn_idle_waiting_lobbies_cron.sql: pg_cron +
-- pg_net POST carrying the shared CRON_SECRET bearer, and the Node route does
-- the work (the finish pipeline — room points, round-facts snapshot, tournament
-- resolution, trophies — is TypeScript and cannot run in-database, which is why
-- this is an HTTP tick and not a SQL function like close_idle_waiting_lobbies).
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

-- ── Why the configuration checks live in the FUNCTION, not in the migration ──
-- The first versions of this file read app.api_base / app.cron_secret at
-- MIGRATION time and skipped `cron.schedule` when they were missing or unsafe.
-- That is the exact defect behind issue #1167: a migration that skips is still
-- RECORDED AS APPLIED, so setting the GUCs afterwards never re-runs it and the
-- job is never scheduled. On production the two earlier HTTP-cron migrations
-- skipped that way, nothing said so, and the reaper never ran -- 97 games sat
-- status='active' for up to 17 days at 2.34M /rest/v1/games reads/day. Making
-- the skip loud (PR #1166) made that visible but did not make it recoverable:
-- the operator still needed something to re-run, and "a later re-registration
-- migration" is a promise, not a mechanism.
--
-- So the ordering trap is removed rather than documented. Each check now lives
-- where the thing it checks is actually decided:
--
--   * EXTENSION availability is a MIGRATION-time concern. `cron.schedule` is a
--     pg_cron function: without pg_cron there is no scheduler to register a job
--     with, and no amount of later configuration changes that for an already
--     provisioned database. A stack without pg_cron/pg_net (local dev, CI,
--     preview branches) therefore still warns and skips, exactly as before.
--
--   * GUC availability and transport safety are RUN-time concerns. api_base and
--     cron_secret are only needed to build and send the request, which happens
--     on each tick, not when the job is registered. They are read inside
--     public.reap_idle_active_games_tick() and re-evaluated every 15 minutes.
--
-- The consequence is the property that was missing: on a stack that has pg_cron,
-- the job is scheduled UNCONDITIONALLY. An operator fixes a misconfigured
-- database by setting the two settings --
--   alter database <db> set app.api_base   = 'https://fateround.com';
--   alter database <db> set app.cron_secret = '<same value as CRON_SECRET>';
-- -- and the very next tick picks them up. No re-migration, no manual re-run of
-- any file, nothing to remember. Confirm with
--   select jobname, schedule from cron.job order by jobname;
-- Grep a deploy log or the cron logs for "REAPER CRON GUARD" to see which branch
-- was taken.
--
-- WARNING CADENCE: a misconfigured database now warns once per tick (96/day at
-- */15) instead of once at migration time. That is deliberate and is the cheaper
-- side of the trade: the previous design warned exactly once, into a deploy log
-- nobody re-reads, and then went quiet forever while doing nothing -- which is
-- how the 17-day outage stayed invisible. A recurring warning is self-limiting:
-- it stops the moment the GUCs are set, and 96 log lines/day is noise only for
-- as long as the reaper is actually broken. Suppressing it would need either a
-- state table or an extension, and both cost more than they save here.
--
-- ONE CONSEQUENCE WORTH KNOWING: api_base/cron_secret are no longer baked into
-- the job's command string at schedule time, they are read by whatever session
-- runs the tick. pg_cron opens its own connection, so the settings must be set
-- at DATABASE level (`alter database ... set`, as documented above) or on the
-- job's role -- a session-level `set app.api_base = ...` is invisible to the
-- scheduled job. It does reach a direct
-- `select public.reap_idle_active_games_tick();` in that same session, which is
-- how CI exercises the branches without superuser. The tick also has to be
-- reachable from the database pg_cron runs jobs in (cron.database_name): that is
-- the database this migration is applied to, the same coupling the previous
-- net.http_post-inside-the-command form already had for the `net` schema.

-- The tick body. `create or replace` so re-running this file is a no-op beyond
-- refreshing the definition. plpgsql function bodies are not resolved against
-- the catalog at creation time, so this is creatable even where pg_net is
-- absent -- the do-block below simply never schedules it there.
--
-- Intentionally not SECURITY DEFINER: pg_cron runs a job as the role that
-- scheduled it (the migration runner), which is exactly the privilege level
-- this needs. search_path is pinned and every object is schema-qualified so a
-- caller's search_path cannot redirect net.http_post.
create or replace function public.reap_idle_active_games_tick()
returns void
language plpgsql
set search_path = pg_catalog, public
as $fn$
declare
  expected_route constant text := '/api/cron/reap-idle';
  api_base text;
  cron_secret text;
  missing_settings text;
  authority text;
  api_scheme text;
  api_host text;
begin
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
      'REAPER CRON GUARD: the idle-active-game reaper (reap_idle_active_games) made NO request because required database settings are unset: %. Set them with "alter database <db> set app.api_base = ''https://fateround.com''" and "alter database <db> set app.cron_secret = ''<same value as the CRON_SECRET env var>''". The job itself is already scheduled, so the next tick after those settings exist will start reaping -- nothing needs to be re-migrated. Until then idle active games are never closed.',
      missing_settings;
    return;
  end if;

  -- ── Transport: HTTPS required, loopback the only exception ────────────────
  -- The POST carries the reusable per-environment CRON_SECRET as a bearer
  -- token, and that one secret authenticates every cron entrypoint (see
  -- src/app/api/cron/*/route.ts and infra/secrets.tf). Over plaintext http:// to
  -- a remote host that is a cleartext transmission of a long-lived credential
  -- (CWE-319) -- anyone on the path gets the key to every cron route. So a
  -- non-https api_base means NO request is made.
  --
  -- The one exception is a loopback host (localhost, 127.0.0.0/8, [::1]), where
  -- the request never leaves the machine and there is no path to intercept.
  -- That carve-out is not hypothetical: it is the repo's own existing precedent
  -- -- infra/templates/user-data.sh.tftpl POSTs this same bearer to
  -- `http://localhost:8080/api/cron/reap-idle`, and CI's cron gate in
  -- .github/workflows/ci.yml sets `app.api_base = 'http://127.0.0.1:3000'` to
  -- exercise the request path. Refusing loopback http would break both for no
  -- security gain. Every documented hosted value is `https://fateround.com`.
  --
  -- The refusal is a warning-and-return, not an exception: a mis-set GUC is an
  -- environment/configuration difference, and raising would only turn every
  -- tick into a cron-job error without telling anyone anything the warning does
  -- not already say.
  --
  -- Split api_base into scheme + host so the transport check looks at the HOST,
  -- not at a substring of the whole URL: 'http://evil.test/?x=localhost' must
  -- not pass a naive `like '%localhost%'` test. Strip the scheme, keep the
  -- authority (up to the first '/'), drop any userinfo, then take the host --
  -- bracketed for IPv6, up to the port otherwise.
  --
  -- The 127.0.0.0/8 test spells out each octet as 0-255 rather than a loose
  -- [0-9]{1,3}: '127.999.999.999' is not a dotted quad, so libcurl inside
  -- pg_net would treat it as a NAME and DNS-resolve it -- potentially to a
  -- non-loopback address that then receives the CRON_SECRET bearer in
  -- cleartext. Only a genuinely parseable 127.x.x.x address is loopback.
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
         or api_host ~ '^127\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])$'
       )
     )
  then
    raise warning
      'REAPER CRON GUARD: app.api_base is "%" (scheme "%", host "%"), so the idle-active-game reaper (reap_idle_active_games) made NO request: refusing to send the CRON_SECRET bearer token in cleartext to a non-loopback host. Set app.api_base to an https:// URL (e.g. ''https://fateround.com''); plaintext http:// is accepted only for loopback hosts (localhost, 127.0.0.0/8, [::1]), where the request never leaves the machine.',
      api_base,
      api_scheme,
      api_host;
    return;
  end if;

  perform net.http_post(
    url := api_base || expected_route,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    timeout_milliseconds := 90000
  );
end
$fn$;

comment on function public.reap_idle_active_games_tick() is
  'One idle-active-game reaper tick: reads app.api_base / app.cron_secret at RUN time, refuses to send the CRON_SECRET bearer over cleartext http to a non-loopback host, and otherwise POSTs /api/cron/reap-idle via pg_net. Scheduled unconditionally by 20261123120000_reap_idle_active_games_cron.sql as cron job reap_idle_active_games.';

do $$
declare
  expected_schedule constant text := '*/15 * * * *';
  expected_command constant text := 'select public.reap_idle_active_games_tick();';
  job_problem text;
begin
  -- Extension availability is the one genuine migration-time precondition:
  -- cron.schedule is a pg_cron function, so without it there is nothing to
  -- register a job with. pg_net is checked alongside it because a job that can
  -- never make a request is not worth registering. Neither can be fixed by a
  -- later `alter database ... set`, so unlike the GUCs there is no ordering
  -- trap in deciding this here.
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise warning
      'REAPER CRON GUARD: pg_cron is not available, so the idle-active-game reaper (reap_idle_active_games) was NOT scheduled. Expected on local/CI stacks; on a hosted project it means idle games are never closed.';
    return;
  end if;
  if not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise warning
      'REAPER CRON GUARD: pg_net is not available, so the idle-active-game reaper (reap_idle_active_games) was NOT scheduled. Expected on local/CI stacks; on a hosted project it means idle games are never closed.';
    return;
  end if;
  create extension if not exists pg_cron;
  create extension if not exists pg_net;

  -- Unconditional from here: no GUC is consulted, so there is no configuration
  -- state in which this migration records itself as applied without scheduling
  -- the job. Unschedule any prior version of the job first so re-running the
  -- migration refreshes rather than stacks a duplicate on the same name.
  perform cron.unschedule(jobid) from cron.job where jobname = 'reap_idle_active_games';
  perform cron.schedule('reap_idle_active_games', expected_schedule, expected_command);

  -- cron.schedule ran, so anything wrong from here is a genuine defect rather
  -- than an environment difference: fail the migration. Existence alone would
  -- be too weak -- it still passes if the cron expression drifts or the command
  -- is repointed at something else -- so presence, schedule and command are each
  -- checked. (The route and the Authorization header are no longer visible in
  -- j.command; they now live in the function body, which is why the command
  -- check is an exact match on the call.) (#1168 asserts the same three jobs
  -- across migrations; this one asserts only the job it itself just scheduled.)
  select case
           when j.jobid is null then 'absent from cron.job'
           when j.schedule is distinct from expected_schedule
             then format('schedule is %L, expected %L', j.schedule, expected_schedule)
           when j.command is distinct from expected_command
             then format('command is %L, expected %L', j.command, expected_command)
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
    'REAPER CRON GUARD: reap_idle_active_games scheduled and verified in cron.job (schedule %, command %). Transport and credential checks run inside the function on every tick.',
    expected_schedule,
    expected_command;
end
$$;
