-- Word Rush individual mode: make round finalization resumable.
--
-- Closing an individual round is two steps: (1) claim the phase transition on word_rush_sessions
-- (playing -> intermission/finished) and (2) the effects of that round — award the setter's
-- mirror points, refresh the "N guessed it" message and, on the last round, finish the game.
-- Step 1 commits on its own, so if step 2 failed (a read error, a crash) nothing could redo it:
-- a retry of the old round no longer matches the claim, and the setter's points were lost for good.
--
-- The claim now also writes a durable marker, `round_finalize`, in the SAME UPDATE statement, so
-- "round closed" and "effects still owed" can never be out of step. The effects are idempotent and
-- any later request that loads the session (poll, advance, expire, submit) resumes them from the
-- marker and clears it when done. The marker holds what the effects need once the session row has
-- moved on to the next round:
--   { "session_id": uuid, "turn_index": n, "round": r, "setter_id": uuid|null, "is_last": bool,
--     "turn_deadline_at": timestamptz, "turn_seconds": s, "awarded": bool }
--
-- `session_id` is the word_rush_sessions.id the round belonged to. Play Again deletes the session
-- row and the next game gets a new id, so an in-flight finalizer that outlives a replay can neither
-- award points to nor finish the NEW game: every step below is bound to that id (a turn index alone
-- cannot tell two games apart, both start at turn 0).
alter table public.word_rush_sessions add column if not exists round_finalize jsonb;

-- Award the setter's mirror points for the finalizing round exactly once.
--
-- Locks the session row, checks the marker is still for p_turn_index and has not already awarded,
-- adds the score and flips `awarded` in the same transaction. A request that retries after a
-- partial failure therefore cannot award twice, and the award cannot be applied after the marker
-- was cleared.
-- Returns 'awarded', 'already_awarded' or 'not_pending' (no marker for that session and turn: nothing done).
create or replace function public.word_rush_finalize_award(
  p_game_id text,
  p_session_id uuid,
  p_turn_index integer,
  p_player_id uuid,
  p_delta integer
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_marker jsonb;
begin
  select round_finalize into v_marker
  from public.word_rush_sessions
  where game_id = p_game_id
  for update;

  if not found or v_marker is null
     or (v_marker ->> 'session_id')::uuid is distinct from p_session_id
     or (v_marker ->> 'turn_index')::integer is distinct from p_turn_index then
    return 'not_pending';
  end if;

  if coalesce((v_marker ->> 'awarded')::boolean, false) then
    return 'already_awarded';
  end if;

  if p_player_id is not null and coalesce(p_delta, 0) > 0 then
    update public.word_rush_players
    set score = score + p_delta
    where game_id = p_game_id and player_id = p_player_id;
  end if;

  update public.word_rush_sessions
  set round_finalize = jsonb_set(v_marker, '{awarded}', 'true'::jsonb)
  where game_id = p_game_id;

  return 'awarded';
end;
$$;

-- Writes scores, so only the service role may call it.
revoke execute on function public.word_rush_finalize_award(text, uuid, integer, uuid, integer) from public, anon, authenticated;
grant execute on function public.word_rush_finalize_award(text, uuid, integer, uuid, integer) to service_role;

-- Finish the game for the last round of THIS session only.
--
-- `games.status` is flipped by a single-winner compare-and-swap, but that cannot tell the game that
-- just ended from a new game started under the same id by Play Again. This flips it only if the
-- word_rush_sessions row with p_session_id still exists for the game and is finished. The games row
-- is locked first and the session is checked in a second statement: under READ COMMITTED an UPDATE
-- that waits for a lock re-checks only the locked row, so a subquery on another table would keep
-- the snapshot from before the wait and could still match the old session after Play Again.
-- Returns true only for the request that actually flipped the row.
create or replace function public.word_rush_finish_game_for_session(
  p_game_id text,
  p_finished_at timestamptz,
  p_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_locked text;
  v_count integer;
begin
  select g.id into v_locked
    from public.games g
   where g.id = p_game_id and g.status = 'active'
     for update;
  if v_locked is null then
    return false;
  end if;

  update public.games g
     set status = 'finished', finished_at = p_finished_at
   where g.id = p_game_id
     and g.status = 'active'
     and exists (
       select 1 from public.word_rush_sessions s
        where s.game_id = g.id and s.id = p_session_id and s.status = 'finished'
     );
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke execute on function public.word_rush_finish_game_for_session(text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.word_rush_finish_game_for_session(text, timestamptz, uuid) to service_role;

-- Serialises the game-finish bookkeeping (room points, trophy snapshot) for one round.
--
-- Play Again deletes the session and answers those steps read, so a finalizer must never clear the
-- marker (which lets the reset proceed) while another one is still running them, and a runner that
-- died mid-way must be recoverable. A runner claims a lease stored in the marker: 'claimed' lets it
-- run the (idempotent) bookkeeping, 'held' means a live runner owns it, 'not_pending' means the
-- marker is gone or belongs to another round/session. The lease outlives the platform's request
-- limit, so an expired lease means its holder is dead and takeover is safe.
create or replace function public.word_rush_claim_finish_bookkeeping(
  p_game_id text,
  p_session_id uuid,
  p_turn_index integer,
  p_lease_seconds integer,
  p_owner uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_marker jsonb;
  v_until timestamptz;
begin
  select s.round_finalize into v_marker
    from public.word_rush_sessions s
   where s.game_id = p_game_id and s.id = p_session_id
     for update;
  if v_marker is null or (v_marker->>'turn_index')::integer is distinct from p_turn_index then
    return 'not_pending';
  end if;
  -- p_lease_seconds <= 0 releases the caller's lease (a runner that failed before it could finish).
  -- Only the current owner may release: a runner that outlived its lease must not free the
  -- lease of the runner that took over.
  if p_lease_seconds <= 0 then
    if v_marker->>'bookkeeping_owner' is distinct from p_owner::text then
      return 'not_owner';
    end if;
    update public.word_rush_sessions
       set round_finalize = v_marker - 'bookkeeping_lease_until' - 'bookkeeping_owner'
     where game_id = p_game_id and id = p_session_id;
    return 'released';
  end if;
  v_until := nullif(v_marker->>'bookkeeping_lease_until', '')::timestamptz;
  if v_until is not null and v_until > now() then
    return 'held';
  end if;
  update public.word_rush_sessions
     set round_finalize = jsonb_set(
           v_marker,
           '{bookkeeping_lease_until}',
           to_jsonb(to_char((now() + make_interval(secs => greatest(p_lease_seconds, 1))) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
         ) || jsonb_build_object('bookkeeping_owner', p_owner::text)
   where game_id = p_game_id and id = p_session_id;
  return 'claimed';
end;
$$;

revoke execute on function public.word_rush_claim_finish_bookkeeping(text, uuid, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.word_rush_claim_finish_bookkeeping(text, uuid, integer, integer, uuid) to service_role;
