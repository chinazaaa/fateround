-- Rate-limit ledger for the public winner self-post endpoint.
--
-- The weekly post code is short and memorable by design (see POST_CODE_MIN_LENGTH),
-- which makes it cheap to guess. This table backs a per-IP throttle so wrong-code
-- attempts are capped within a rolling window, making brute-force impractical
-- across serverless instances (a single in-memory counter wouldn't be shared).
--
-- Privacy: we store a SHA-256 HASH of the IP (ip_hash), never the raw address.
-- Rows are ephemeral — cleared on a successful post and opportunistically purged
-- once their window has elapsed (see community_post_win_touch).

create table if not exists community_post_win_attempts (
  ip_hash text primary key,
  count integer not null default 0,
  window_started_at timestamptz not null default now()
);

-- Service-role-only, consistent with the other community tables.
alter table community_post_win_attempts enable row level security;

-- Atomically reserve one attempt for an IP hash and return the resulting count.
-- Doing the window-roll + increment in a single statement makes concurrent
-- wrong-code guesses race-safe (the select-then-write approach could drop
-- increments). Also opportunistically purges rows whose window has elapsed, so
-- stale IP hashes don't linger.
create or replace function community_post_win_touch(p_ip_hash text, p_window_seconds integer)
returns table (attempt_count integer, window_started_at timestamptz)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_cutoff timestamptz := v_now - make_interval(secs => p_window_seconds);
begin
  -- Retention: drop any rows whose window has already elapsed.
  delete from community_post_win_attempts a where a.window_started_at < v_cutoff;

  -- Insert a fresh window, or increment within the active one. Because stale rows
  -- were just deleted, an existing row here is guaranteed to be within the window.
  insert into community_post_win_attempts as a (ip_hash, count, window_started_at)
    values (p_ip_hash, 1, v_now)
  on conflict (ip_hash) do update set count = a.count + 1
  returning a.count, a.window_started_at into attempt_count, window_started_at;

  return next;
end;
$$;
