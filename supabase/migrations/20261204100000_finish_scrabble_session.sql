-- Finishing a Scrabble (Word Tiles) round in ONE transaction.
--
-- A finish used to be several separate statements (claim the session row, write the mover's rack / clock, write
-- every player's final score, flip games.status, delete a leaver's rows), each of which could be overtaken between
-- two of them: a round published before its scores landed, a host "end game" reporting success while the round was
-- still running, a games flip that failed after the session was saved finished and never got repaired. None of
-- those windows exists when the whole finish is one transaction under a lock, so this function is that
-- transaction. The app still computes the winner / tie / final scores in memory exactly as before and passes them
-- as a payload; the function only VALIDATES and APPLIES it.
--
-- finish_scrabble_session() takes FOR UPDATE on the games row and then the scrabble_sessions row and decides
-- against the CURRENT rows:
--   * `p_round` (optional) names the round the caller decided about ({session_started_at, sessions_played}); a
--     mismatch with the games row under the lock -> `lost` with reason `round` (distinct from a stale version), so an expiry decided from a snapshot can never finish a
--     LATER round after a rematch.
--   * session already `finished` -> `already_finished`. Nothing is re-tallied or rewritten and NO player is removed
--     from the published result; only the games-row flip is completed, and only for a game that is still `active`
--     (a replayed game is back to `waiting`). This is the repair path for a finish whose games flip failed.
--   * `updated_at` differs from the caller's expected value -> `lost` (the compare-and-swap, now inside the
--     function). The caller can tell "someone else finished it" (a re-read shows finished) from "a play moved the
--     session and the round is still running".
--   * otherwise, atomically: the session patch (+ phase finished, turn_deadline_at / turn_started_at null), the
--     player state writes (final scores, the mover's rack / clock / stats), the optional removal of a leaver's
--     state + player rows, and the games-row flip (status finished, finished_at, and the durable
--     finish_bookkeeping marker owed by exactly this finish) -> `finished`.
--   * a malformed payload (a null, mistyped, duplicated or not-in-this-game player id, an unknown key, ...) ->
--     `invalid` with a `reason`, nothing written.
-- jsonb outcome: { status: finished | already_finished | lost | invalid, games_flipped: bool, finished_at?, reason? }
--
-- Execute is revoked from public / anon / authenticated and granted to service_role only. NULL arguments for the
-- required parameters raise.
--
-- Additive: two new functions, nothing existing is altered.

create or replace function public.finish_scrabble_session(
  p_game_id text,
  p_expected_updated_at timestamptz,
  p_session_patch jsonb,
  p_state_writes jsonb,
  p_remove_player_id uuid default null,
  p_round jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text;
  v_game public.games%rowtype;
  v_session public.scrabble_sessions%rowtype;
  v_now timestamptz;
  v_bad text;
  v_cols text;
  v_elem jsonb;
  v_flipped boolean;
begin
  if p_game_id is null or p_expected_updated_at is null or p_session_patch is null or p_state_writes is null then
    raise exception 'finish_scrabble_session: game id, expected version, session patch and state writes are required';
  end if;
  v_id := upper(p_game_id);

  select * into v_game from public.games where id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'invalid', 'reason', 'game_missing', 'games_flipped', false);
  end if;
  select * into v_session from public.scrabble_sessions where game_id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'invalid', 'reason', 'session_missing', 'games_flipped', false);
  end if;

  v_now := now();

  -- The finish must apply only to the round the caller decided about (an expiry decided from a snapshot must never
  -- finish a LATER round after a rematch): compare the round identity under the same lock.
  if p_round is not null then
    if jsonb_typeof(p_round) <> 'object'
       or exists (select 1 from jsonb_object_keys(p_round) k where k not in ('session_started_at', 'sessions_played')) then
      return jsonb_build_object('status', 'invalid', 'reason', 'round', 'games_flipped', false);
    end if;
    if (p_round ? 'sessions_played' and v_game.sessions_played is distinct from (p_round->>'sessions_played')::integer)
       or (p_round ? 'session_started_at' and v_game.session_started_at is distinct from (p_round->>'session_started_at')::timestamptz) then
      return jsonb_build_object('status', 'lost', 'reason', 'round', 'games_flipped', false);
    end if;
  end if;

  -- Already finished: never re-tally / rewrite, and never remove a player from a published result. Only complete the
  -- flip of a game that is still ACTIVE (a replayed game is back to `waiting` and keeps this finished session row
  -- until it is re-dealt: a stale request must not finish it again).
  if v_session.phase = 'finished' then
    update public.games
      set status = 'finished',
          finished_at = v_now,
          finish_bookkeeping = jsonb_build_object('finished_at', v_now, 'attempts', 0)
      where id = v_id and status = 'active';
    v_flipped := found;
    return jsonb_build_object('status', 'already_finished', 'games_flipped', v_flipped);
  end if;

  if v_session.updated_at <> p_expected_updated_at then
    return jsonb_build_object('status', 'lost', 'games_flipped', false);
  end if;

  -- ---- validation (nothing is written until all of it passes) ----
  if jsonb_typeof(p_session_patch) <> 'object' or jsonb_typeof(p_state_writes) <> 'array' then
    return jsonb_build_object('status', 'invalid', 'reason', 'payload_shape', 'games_flipped', false);
  end if;

  select string_agg(k, ',') into v_bad
    from jsonb_object_keys(p_session_patch) as k
    where k in ('id', 'game_id', 'created_at', 'updated_at', 'phase')
       or not exists (
         select 1 from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = 'scrabble_sessions' and c.column_name = k
       );
  if v_bad is not null then
    return jsonb_build_object('status', 'invalid', 'reason', 'patch_column: ' || v_bad, 'games_flipped', false);
  end if;

  -- Every state write: an object, a non-null uuid-shaped player_id that has a state row in THIS game, only known keys
  -- with the right types, and no player twice.
  for v_elem in select * from jsonb_array_elements(p_state_writes) loop
    if jsonb_typeof(v_elem) <> 'object'
       or (v_elem->>'player_id') is null
       or jsonb_typeof(v_elem->'player_id') <> 'string'
       or (v_elem->>'player_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or exists (
         select 1 from jsonb_object_keys(v_elem) k
         where k not in ('player_id', 'score', 'rack', 'clock_ms_remaining', 'timed_out', 'stats')
       )
       or (v_elem ? 'score' and (jsonb_typeof(v_elem->'score') <> 'number'))
       or (v_elem ? 'rack' and jsonb_typeof(v_elem->'rack') <> 'array')
       or (v_elem ? 'clock_ms_remaining' and jsonb_typeof(v_elem->'clock_ms_remaining') not in ('number', 'null'))
       or (v_elem ? 'timed_out' and jsonb_typeof(v_elem->'timed_out') <> 'boolean')
       or (v_elem ? 'stats' and jsonb_typeof(v_elem->'stats') <> 'object')
       or not exists (
         select 1 from public.scrabble_player_state st
         where st.game_id = v_id and st.player_id = (v_elem->>'player_id')::uuid
       ) then
      return jsonb_build_object('status', 'invalid', 'reason', 'state_write', 'games_flipped', false);
    end if;
  end loop;
  if (select count(distinct (e->>'player_id')::uuid) from jsonb_array_elements(p_state_writes) e) <> jsonb_array_length(p_state_writes) then
    return jsonb_build_object('status', 'invalid', 'reason', 'state_write_duplicate', 'games_flipped', false);
  end if;
  if p_remove_player_id is not null
     and not exists (select 1 from public.players p where p.id = p_remove_player_id and p.game_id = v_id) then
    return jsonb_build_object('status', 'invalid', 'reason', 'remove_player', 'games_flipped', false);
  end if;

  -- ---- apply, atomically ----
  select string_agg(quote_ident(k), ', ') into v_cols from jsonb_object_keys(p_session_patch) as k;
  if v_cols is not null then
    execute format(
      'update public.scrabble_sessions s set (%1$s) = (select %1$s from jsonb_populate_record(null::public.scrabble_sessions, $1)) where s.game_id = $2',
      v_cols
    ) using p_session_patch, v_id;
  end if;
  update public.scrabble_sessions
    set phase = 'finished', turn_deadline_at = null, turn_started_at = null
    where game_id = v_id;

  for v_elem in select * from jsonb_array_elements(p_state_writes) loop
    update public.scrabble_player_state
      set score = coalesce((v_elem->>'score')::integer, score),
          rack = coalesce(v_elem->'rack', rack),
          clock_ms_remaining = case when v_elem ? 'clock_ms_remaining' then (v_elem->>'clock_ms_remaining')::integer else clock_ms_remaining end,
          timed_out = coalesce((v_elem->>'timed_out')::boolean, timed_out),
          stats = coalesce(v_elem->'stats', stats)
      where game_id = v_id and player_id = (v_elem->>'player_id')::uuid;
  end loop;

  if p_remove_player_id is not null then
    delete from public.players where id = p_remove_player_id and game_id = v_id;
  end if;

  update public.games
    set status = 'finished',
        finished_at = v_now,
        finish_bookkeeping = jsonb_build_object('finished_at', v_now, 'attempts', 0)
    where id = v_id and status in ('waiting', 'active');
  v_flipped := found;

  return jsonb_build_object('status', 'finished', 'games_flipped', v_flipped, 'finished_at', v_now);
end;
$$;

revoke execute on function public.finish_scrabble_session(text, timestamptz, jsonb, jsonb, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.finish_scrabble_session(text, timestamptz, jsonb, jsonb, uuid, jsonb) to service_role;

-- A mover's rack / score / clock write for a move that does NOT end the round, refused once the round is finished
-- and bound to the state row the move loaded.
-- The move's session claim and the mover's state write are separate statements. A finish that landed in between
-- (published from the states it read) must not have its scores changed afterwards, and a rematch that landed in
-- between must not have its NEW round's rack / score overwritten by a delayed write of the old round: a rematch
-- re-deals every player's state row (new row ids), so the write targets the row id the move loaded and finds no row
-- (`stale`) in a later round. The write takes the same session row lock the finish takes, so it either lands before
-- the finish or is refused (`finished`) after it.
-- p_patch keys: rack (array), score (number), clock_ms_remaining (number | null), timed_out (boolean), stats (object).
-- Outcome: written | finished | stale (the row is gone or belongs to another round: the move is moot) | invalid
-- (a malformed patch or an unknown game / session). NULL game id / player id / patch / state id raise.
create or replace function public.scrabble_write_state_if_open(
  p_game_id text,
  p_player_id uuid,
  p_patch jsonb,
  p_state_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text;
  v_phase text;
begin
  if p_game_id is null or p_player_id is null or p_patch is null or p_state_id is null then
    raise exception 'scrabble_write_state_if_open: game id, player id, patch and state row id are required';
  end if;
  v_id := upper(p_game_id);
  if jsonb_typeof(p_patch) is distinct from 'object'
     or exists (
       select 1 from jsonb_object_keys(p_patch) k
       where k not in ('rack', 'score', 'clock_ms_remaining', 'timed_out', 'stats')
     )
     or (p_patch ? 'score' and jsonb_typeof(p_patch->'score') is distinct from 'number')
     or (p_patch ? 'rack' and jsonb_typeof(p_patch->'rack') is distinct from 'array')
     or (p_patch ? 'clock_ms_remaining' and jsonb_typeof(p_patch->'clock_ms_remaining') not in ('number', 'null'))
     or (p_patch ? 'timed_out' and jsonb_typeof(p_patch->'timed_out') is distinct from 'boolean')
     or (p_patch ? 'stats' and jsonb_typeof(p_patch->'stats') is distinct from 'object') then
    return jsonb_build_object('status', 'invalid');
  end if;
  select phase into v_phase from public.scrabble_sessions where game_id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_phase = 'finished' then
    return jsonb_build_object('status', 'finished');
  end if;
  update public.scrabble_player_state
    set score = coalesce((p_patch->>'score')::integer, score),
        rack = coalesce(p_patch->'rack', rack),
        clock_ms_remaining = case when p_patch ? 'clock_ms_remaining' then (p_patch->>'clock_ms_remaining')::integer else clock_ms_remaining end,
        timed_out = coalesce((p_patch->>'timed_out')::boolean, timed_out),
        stats = coalesce(p_patch->'stats', stats)
    where id = p_state_id and game_id = v_id and player_id = p_player_id;
  if not found then
    return jsonb_build_object('status', 'stale');
  end if;
  return jsonb_build_object('status', 'written');
end;
$$;

revoke execute on function public.scrabble_write_state_if_open(text, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.scrabble_write_state_if_open(text, uuid, jsonb, uuid) to service_role;
