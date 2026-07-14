-- Generic per-IP rate-limit ledger for the public write endpoints (game create,
-- player/room join). Mirrors community_post_win_attempts but keyed by an opaque
-- composite `key` ("<bucket>:<hmac(bucket:ip)>") so one table backs every bucket.
--
-- This is a coarse *backstop* to the edge (Cloudflare) rate rules — the limits it
-- enforces are generous enough that a real shared-IP venue/classroom won't hit
-- them, while a runaway script hammering thousands of requests will. The caller
-- fails OPEN on any error, so a transient DB issue never blocks legitimate play.
--
-- Privacy: only a keyed HMAC of the IP is stored (peppered with the server-only
-- ADMIN_SESSION_SECRET), never the raw address. Rows are ephemeral — purged
-- opportunistically once their window has elapsed (see api_rate_limit_touch).

create table if not exists api_rate_limit_attempts (
  key text primary key,
  count integer not null default 0,
  window_started_at timestamptz not null default now()
);

-- Service-role-only (RLS on, no policies) — reached solely via getSupabaseAdmin().
alter table api_rate_limit_attempts enable row level security;

-- Atomically reserve one hit for a key and return the resulting count. Doing the
-- window-roll + increment in a single statement makes concurrent requests
-- race-safe (a select-then-write could drop increments). Also opportunistically
-- purges rows whose window has elapsed so stale keys don't linger.
create or replace function api_rate_limit_touch(p_key text, p_window_seconds integer)
returns table (attempt_count integer, window_started_at timestamptz)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_cutoff timestamptz := v_now - make_interval(secs => p_window_seconds);
begin
  -- Reset THIS key's window if it has elapsed. Scoped to p_key on purpose: the
  -- window length varies per bucket (a short-window rule must not purge a
  -- long-window rule's rows), so a global sweep here would be incorrect. Stale
  -- rows for inactive keys are left for a separate GC if ever needed.
  delete from api_rate_limit_attempts a where a.key = p_key and a.window_started_at < v_cutoff;

  -- Insert a fresh window, or increment within the active one. Because a stale
  -- row for this key was just deleted, an existing row here is within the window.
  insert into api_rate_limit_attempts as a (key, count, window_started_at)
    values (p_key, 1, v_now)
  on conflict (key) do update set count = a.count + 1
  returning a.count, a.window_started_at into attempt_count, window_started_at;

  return next;
end;
$$;
