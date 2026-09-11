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
-- Skips cleanly when pg_cron/pg_net or the two GUCs are unavailable, so it is a
-- no-op on local dev, CI and preview branches.
--
-- Operator setup (one-off per project, same GUCs the other HTTP ticks use):
--   alter database <db> set app.api_base = 'https://fateround.com';
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

do $$
declare
  api_base text;
  cron_secret text;
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    return;
  end if;
  if not exists (select 1 from pg_available_extensions where name = 'pg_net') then
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
    return;
  end if;

  -- Unschedule any prior version of this job first so re-running the migration
  -- doesn't stack duplicate schedules on the same name.
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
end
$$;
