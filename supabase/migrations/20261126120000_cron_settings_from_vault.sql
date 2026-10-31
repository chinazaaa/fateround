-- Make the idle-active-game reaper actually run, by sourcing its two settings from Vault.
--
-- THE PROBLEM. `reap_idle_active_games_tick()` reads `app.api_base` and `app.cron_secret`
-- with `current_setting(..., true)` at run time, and both are unset on the hosted projects.
-- Every tick since the job was scheduled has logged
--
--   REAPER CRON GUARD: ... made NO request because required database settings are unset
--
-- and returned without reaping, so idle active games are never closed. That is not a cosmetic
-- gap: unclosed games keep their per-game tickers alive, which the egress investigation
-- measured as ~93% of REST traffic. The reaper is the fix for that, and it has never run.
--
-- WHY THE OBVIOUS FIX IS IMPOSSIBLE. The warning tells you to run
-- `alter database <db> set app.api_base = ...`. You cannot. Attaching a custom (placeholder)
-- parameter to a database or a role requires SUPERUSER, and on hosted Supabase `postgres` is
-- not one -- `rolsuper = false`, with `supabase_admin` reserved to the platform. The attempt
-- returns 42501. No amount of project-level configuration changes that.
--
-- WHAT IS ACTUALLY PERMITTED. `set_config()` within a session is not privileged: any role may
-- set a placeholder parameter for its own session. pg_cron runs each job in its own session,
-- so the job command can seed both settings immediately before calling the tick function, and
-- the function then reads them exactly as it does today. No function body changes, which
-- matters because those bodies carry the transport rules (https-only except loopback) that are
-- worth leaving alone.
--
-- WHERE THE VALUES LIVE. `app.cron_secret` is a long-lived bearer that authenticates every
-- cron route, so it must not sit in a migration, in `cron.job.command`, or anywhere else that
-- `select` can reach casually. Supabase Vault (`supabase_vault`, already installed) encrypts
-- secrets at rest and exposes them through `vault.decrypted_secrets`, readable only by roles
-- granted it. The helper below reads Vault first and falls back to `current_setting`, which
-- keeps CI working unchanged -- the cron gate sets `app.api_base` to a loopback URL as a plain
-- GUC and has no Vault entries.
--
-- OPERATOR STEP, ONCE PER PROJECT -- this migration cannot do it, by design. The values are
-- not in git:
--
--   select vault.create_secret('https://fateround.com', 'api_base',
--                              'Base URL the pg_cron HTTP ticks POST to');
--   select vault.create_secret('<same value as the CRON_SECRET env var>', 'cron_secret',
--                              'Bearer token for /api/cron/* routes');
--
-- Re-running with the same name raises a unique violation; use `vault.update_secret(id, ...)`
-- to rotate. Until both exist the reaper keeps warning and reaping nothing -- exactly today's
-- behaviour, so applying this migration alone changes nothing observable. That is deliberate:
-- it makes the migration safe to ship ahead of the secrets.

create extension if not exists supabase_vault with schema vault;

-- Vault first, GUC second. SECURITY DEFINER because `vault.decrypted_secrets` is not readable
-- by the job's role; owned by the migration role, which is.
--
-- `search_path = ''` and fully-qualified names throughout: a SECURITY DEFINER function with a
-- mutable search_path is how a caller-controlled schema gets to impersonate `vault`.
create or replace function public.cron_setting(setting_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  value text;
begin
  -- Vault. Wrapped because the extension may be absent (local stacks that never created it),
  -- and an exception here must not stop the GUC fallback from being tried.
  begin
    select s.decrypted_secret
      into value
      from vault.decrypted_secrets as s
     where s.name = setting_name
     limit 1;
  exception when others then
    value := null;
  end;

  if coalesce(value, '') <> '' then
    return value;
  end if;

  -- GUC fallback, which is what CI and local stacks use.
  begin
    value := current_setting('app.' || setting_name, true);
  exception when others then
    value := null;
  end;

  return nullif(value, '');
end;
$$;

comment on function public.cron_setting(text) is
  'Reads a cron setting from Vault (by secret name), falling back to the app.<name> GUC. '
  'Exists because custom GUCs cannot be attached to a database without superuser on hosted '
  'Supabase. See 20261126120000_cron_settings_from_vault.sql.';

revoke all on function public.cron_setting(text) from public;

-- service_role included deliberately, and unlike
-- 20261123120000_reap_idle_active_games_cron.sql which leaves it alone for the tick
-- function. This function RETURNS the decrypted secret, so EXECUTE on it is a read
-- oracle for app.cron_secret over POST /rest/v1/rpc/cron_setting -- a different kind
-- of exposure from a function that merely does work. Nothing needs to call it but the
-- pg_cron job command, which runs as postgres: there is no caller in src/ and the only
-- other references are this migration and the CI gates.
--
-- Guarded by to_regrole, same shape as 20261123120000, so a local database without
-- these roles still applies cleanly.
do $roles$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if to_regrole(r) is not null then
      execute format('revoke all on function public.cron_setting(text) from %I', r);
    end if;
  end loop;
end
$roles$;

-- Reschedule the reaper so its command seeds both settings from Vault first. The tick function
-- is unchanged and still reads them with current_setting, so a stack with the GUCs set and no
-- Vault entries behaves exactly as before.
--
-- `set_config(..., false)` is session-scoped rather than transaction-scoped. pg_cron gives each
-- run its own session, so nothing leaks between ticks.
--
-- NOTE: the command string is pinned by scripts/ci/deploy-cron-inventory-gate.sh. Changing it
-- here without changing it there fails CI, which is the intended coupling.
do $$
declare
  problem text;
begin
  if to_regprocedure('public.reap_idle_active_games_tick()') is null then
    raise exception
      'cron_settings_from_vault: public.reap_idle_active_games_tick() does not exist, so rescheduling it would register a job that errors every 15 minutes.';
  end if;

  -- Mirrors 20261124120000_noisy_http_cron_scheduling_guard.sql, which returns early
  -- on the same condition and therefore never schedules the job on such a stack. Two
  -- reasons to check pg_extension (installed) rather than pg_available_extensions
  -- (installable): cron.unschedule / cron.schedule below resolve the `cron` schema at
  -- RUN time, so without pg_cron installed this block aborts the whole migration; and
  -- without pg_net the tick's HTTP call fails on every run, which is the "job exists,
  -- nothing works" state issue #1167 is about. Leaving the job absent also keeps this
  -- consistent with the deploy-equivalent inventory gate, which expects it to be
  -- absent exactly when pg_net is unavailable.
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise warning
      'cron_settings_from_vault: pg_cron and/or pg_net are not installed, so reap_idle_active_games was NOT rescheduled. Expected on local/CI stacks without them; on a hosted project it means the reaper is still reading unset settings.';
    return;
  end if;

  perform cron.unschedule('reap_idle_active_games')
    where exists (select 1 from cron.job where jobname = 'reap_idle_active_games');

  perform cron.schedule(
    'reap_idle_active_games',
    '*/15 * * * *',
    $cmd$select set_config('app.api_base', public.cron_setting('api_base'), false), set_config('app.cron_secret', public.cron_setting('cron_secret'), false); select public.reap_idle_active_games_tick();$cmd$
  );

  -- Same shape as 20261124120000_noisy_http_cron_scheduling_guard.sql and
  -- 20261123120000: re-read cron.job and raise rather than trusting that
  -- cron.schedule did what it said. This is the repo's standing defence against
  -- issue #1167 -- "reported success, scheduled nothing". It is the check closest
  -- to the act: the deploy-equivalent inventory gate also pins this command, but
  -- only in CI, and it cannot see a production stack where the early return above
  -- took the skip path. This raises during the migration itself, in every
  -- environment, so a reschedule that silently did not happen is never
  -- indistinguishable from success in the deploy log.
  select case
           when j.jobid is null then 'absent from cron.job'
           when j.schedule is distinct from '*/15 * * * *'
             then format('schedule is %L, expected %L', j.schedule, '*/15 * * * *')
           when j.command is distinct from $cmd$select set_config('app.api_base', public.cron_setting('api_base'), false), set_config('app.cron_secret', public.cron_setting('cron_secret'), false); select public.reap_idle_active_games_tick();$cmd$
             then format('command is %L, which is not the Vault-seeding command', j.command)
         end
    into problem
    from (select 1) as one
    left join cron.job j on j.jobname = 'reap_idle_active_games';

  if problem is not null then
    raise exception
      'cron_settings_from_vault: rescheduling completed but reap_idle_active_games is not correctly registered: %.',
      problem;
  end if;

  raise notice
    'cron_settings_from_vault: reap_idle_active_games rescheduled to seed app.api_base / app.cron_secret from Vault before each tick. It stays inert until vault secrets named api_base and cron_secret exist.';
end;
$$;
