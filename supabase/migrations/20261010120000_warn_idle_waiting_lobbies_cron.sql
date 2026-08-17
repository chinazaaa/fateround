-- Register the T-13 idle-warning push tick. Mirrors the scheduled-games
-- push tick pattern from 20261005120000_scheduled_games_and_rsvps.sql —
-- pg_cron + pg_net POST to /api/cron/warn-idle-lobbies with the shared
-- CRON_SECRET bearer, and the Node route does the actual fan-out (webpush
-- + Expo push can't run in-database). Skips cleanly when pg_net or the
-- two required GUCs are unavailable — the schema is a no-op there.

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
end
$$;
