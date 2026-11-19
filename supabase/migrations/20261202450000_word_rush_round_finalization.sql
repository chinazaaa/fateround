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
--   { "turn_index": n, "round": r, "setter_id": uuid|null, "is_last": bool,
--     "turn_deadline_at": timestamptz, "turn_seconds": s, "awarded": bool }
alter table public.word_rush_sessions add column if not exists round_finalize jsonb;

-- Award the setter's mirror points for the finalizing round exactly once.
--
-- Locks the session row, checks the marker is still for p_turn_index and has not already awarded,
-- adds the score and flips `awarded` in the same transaction. A request that retries after a
-- partial failure therefore cannot award twice, and the award cannot be applied after the marker
-- was cleared.
-- Returns 'awarded', 'already_awarded' or 'not_pending' (no marker for that turn: nothing done).
create or replace function public.word_rush_finalize_award(
  p_game_id text,
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

  if not found or v_marker is null or (v_marker ->> 'turn_index')::integer is distinct from p_turn_index then
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
revoke execute on function public.word_rush_finalize_award(text, integer, uuid, integer) from public, anon, authenticated;
grant execute on function public.word_rush_finalize_award(text, integer, uuid, integer) to service_role;
