-- 1. Rummy: bind the active -> finished transition to the round that ended.
--
-- `games.status` is flipped by a single-winner compare-and-swap, but that guard cannot tell round A
-- from a round B started under the same game id by Play Again. A finalizer that read round A's
-- finished session and paused could therefore finish round B. Play Again deletes the session row and
-- the next round creates a new one (new id), so this function only flips the game when the session
-- the caller observed is still the game's session AND is finished. The games row is locked first and
-- the session is checked in a later statement (see below), so the check sees committed state.
-- Returns true only for the request that actually flipped the row.
create or replace function public.rummy_finish_game_for_session(
  p_game_id text,
  p_session_id uuid,
  p_finished_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_locked text;
begin
  -- Statement 1: take the games row lock. Under READ COMMITTED an UPDATE that has to wait for a
  -- lock re-checks only the locked row itself; a subquery on another table (the session check)
  -- would still use the snapshot taken BEFORE the wait, so it could match round A's session after
  -- Play Again has started round B. Locking in its own statement means the check below starts
  -- after the lock is held and sees committed state.
  select g.id into v_locked
    from public.games g
   where g.id = p_game_id and g.status = 'active'
     for update;
  if v_locked is null then
    return false;
  end if;

  -- Statement 2 (fresh snapshot, lock held): finish only if the observed session is still this
  -- game's session and is finished.
  update public.games g
     set status = 'finished', finished_at = p_finished_at
   where g.id = p_game_id
     and g.status = 'active'
     and exists (
       select 1 from public.rummy_sessions s
        where s.game_id = g.id and s.id = p_session_id and s.phase = 'finished'
     );
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke execute on function public.rummy_finish_game_for_session(text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.rummy_finish_game_for_session(text, uuid, timestamptz) to service_role;

-- 2. Chess: make updated_at (the optimistic-concurrency version) strictly increasing.
--
-- The app stamps updated_at with a millisecond timestamp and compares it back with .eq(); a move and a
-- stale resignation landing in the same millisecond could both match, letting the resignation
-- overwrite a checkmate. Same fix as mahjong/rummy: a before-update trigger moves it to a value
-- strictly greater than the previous one, at microsecond precision.
create or replace function public.chess_sessions_bump_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;

drop trigger if exists chess_sessions_bump_version on public.chess_sessions;
create trigger chess_sessions_bump_version
  before update on public.chess_sessions
  for each row execute function public.chess_sessions_bump_version();
