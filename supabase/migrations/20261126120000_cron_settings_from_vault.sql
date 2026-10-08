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

revoke all on function public.cron_setting(text) from public, anon, authenticated;

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
begin
  if to_regprocedure('public.reap_idle_active_games_tick()') is null then
    raise exception
      'cron_settings_from_vault: public.reap_idle_active_games_tick() does not exist, so rescheduling it would register a job that errors every 15 minutes.';
  end if;

  perform cron.unschedule('reap_idle_active_games')
    where exists (select 1 from cron.job where jobname = 'reap_idle_active_games');

  perform cron.schedule(
    'reap_idle_active_games',
    '*/15 * * * *',
    $cmd$select set_config('app.api_base', public.cron_setting('api_base'), false), set_config('app.cron_secret', public.cron_setting('cron_secret'), false); select public.reap_idle_active_games_tick();$cmd$
  );

  raise notice
    'cron_settings_from_vault: reap_idle_active_games rescheduled to seed app.api_base / app.cron_secret from Vault before each tick. It stays inert until vault secrets named api_base and cron_secret exist.';
end;
$$;
