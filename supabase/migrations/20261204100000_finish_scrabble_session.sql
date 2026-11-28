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
-- Additive: two new functions (the finish and the non-finishing move), nothing existing is altered.

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
    -- Every supplied field is validated BEFORE it is cast or compared (a malformed value is `invalid`, never a cast
    -- error); an omitted key is not compared, an explicit null is compared as NULL.
    if jsonb_typeof(p_round) <> 'object'
       or exists (
         select 1 from jsonb_object_keys(p_round) k
         where k not in ('session_started_at', 'sessions_played', 'game_duration_seconds')
       )
       or (p_round ? 'sessions_played' and not (
            jsonb_typeof(p_round->'sessions_played') = 'null'
            or (jsonb_typeof(p_round->'sessions_played') = 'number' and (p_round->>'sessions_played') ~ '^-?[0-9]{1,9}$')))
       or (p_round ? 'game_duration_seconds' and not (
            jsonb_typeof(p_round->'game_duration_seconds') = 'null'
            or (jsonb_typeof(p_round->'game_duration_seconds') = 'number' and (p_round->>'game_duration_seconds') ~ '^-?[0-9]{1,9}$')))
       or (p_round ? 'session_started_at' and jsonb_typeof(p_round->'session_started_at') not in ('null', 'string')) then
      return jsonb_build_object('status', 'invalid', 'reason', 'round', 'games_flipped', false);
    end if;
    if p_round ? 'session_started_at' and jsonb_typeof(p_round->'session_started_at') = 'string' then
      begin
        perform (p_round->>'session_started_at')::timestamptz;
      exception when others then
        return jsonb_build_object('status', 'invalid', 'reason', 'round', 'games_flipped', false);
      end;
    end if;
    -- The round identity (a rematch changes it) AND the time limit the expiry was decided with (a host extension
    -- changes it): a decision made about another round / an older limit must not finish this one.
    if (p_round ? 'sessions_played' and v_game.sessions_played is distinct from (p_round->>'sessions_played')::integer)
       or (p_round ? 'session_started_at' and v_game.session_started_at is distinct from (p_round->>'session_started_at')::timestamptz)
       or (p_round ? 'game_duration_seconds' and v_game.game_duration_seconds is distinct from (p_round->>'game_duration_seconds')::integer) then
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
  -- A value that cannot be converted to its column type (a malformed uuid, ...) is `invalid`, never a raised error.
  begin
    perform jsonb_populate_record(null::public.scrabble_sessions, p_session_patch);
  exception when others then
    return jsonb_build_object('status', 'invalid', 'reason', 'patch_value', 'games_flipped', false);
  end;
  -- an array column must be one-dimensional (array_remove and the turn logic assume it)
  if p_session_patch ? 'turn_order'
     and array_ndims((jsonb_populate_record(null::public.scrabble_sessions, p_session_patch)).turn_order) > 1 then
    return jsonb_build_object('status', 'invalid', 'reason', 'patch_value', 'games_flipped', false);
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
       or (v_elem ? 'score' and (jsonb_typeof(v_elem->'score') <> 'number' or (v_elem->>'score') !~ '^-?[0-9]{1,9}$'))
       or (v_elem ? 'rack' and jsonb_typeof(v_elem->'rack') <> 'array')
       or (v_elem ? 'clock_ms_remaining' and (
            jsonb_typeof(v_elem->'clock_ms_remaining') not in ('number', 'null')
            or (jsonb_typeof(v_elem->'clock_ms_remaining') = 'number' and (v_elem->>'clock_ms_remaining') !~ '^-?[0-9]{1,9}$')))
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

-- A NON-finishing move is the same shape in miniature, and so the same atomicity applies: apply_scrabble_move() claims
-- the session by version and applies the session patch (bag, board, turn, ...) AND the mover's state row (rack, score,
-- clock) in ONE transaction. Without it a move was a session claim followed by a separate mover write, so a finish or
-- another move could act on the new session version while the player states still held the old rack / score (a round
-- published from pre-move scores, an exchange that committed the bag but not the rack, a delayed write landing on a
-- rematch). Outcome: applied | lost (stale version, or the round is already finished) | invalid (malformed payload,
-- unknown / protected column, a move that tries to set phase `finished` -- only finish_scrabble_session ends a round).
-- A state write for a player who has since left matches no row and is ignored. NULL required arguments raise.
create or replace function public.apply_scrabble_move(
  p_game_id text,
  p_expected_updated_at timestamptz,
  p_session_patch jsonb,
  p_state_writes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text;
  v_session public.scrabble_sessions%rowtype;
  v_bad text;
  v_cols text;
  v_elem jsonb;
begin
  if p_game_id is null or p_expected_updated_at is null or p_session_patch is null or p_state_writes is null then
    raise exception 'apply_scrabble_move: game id, expected version, session patch and state writes are required';
  end if;
  v_id := upper(p_game_id);

  select * into v_session from public.scrabble_sessions where game_id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'invalid', 'reason', 'session_missing');
  end if;
  if v_session.phase = 'finished' or v_session.updated_at <> p_expected_updated_at then
    return jsonb_build_object('status', 'lost');
  end if;

  if jsonb_typeof(p_session_patch) is distinct from 'object' or jsonb_typeof(p_state_writes) is distinct from 'array' then
    return jsonb_build_object('status', 'invalid', 'reason', 'payload_shape');
  end if;
  select string_agg(k, ',') into v_bad
    from jsonb_object_keys(p_session_patch) as k
    where k in ('id', 'game_id', 'created_at', 'updated_at')
       or not exists (
         select 1 from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = 'scrabble_sessions' and c.column_name = k
       );
  if v_bad is not null then
    return jsonb_build_object('status', 'invalid', 'reason', 'patch_column: ' || v_bad);
  end if;
  -- A value that cannot be converted to its column type (a malformed uuid, ...) is `invalid`, never a raised error.
  begin
    perform jsonb_populate_record(null::public.scrabble_sessions, p_session_patch);
  exception when others then
    return jsonb_build_object('status', 'invalid', 'reason', 'patch_value');
  end;
  -- an array column must be one-dimensional (array_remove and the turn logic assume it)
  if p_session_patch ? 'turn_order'
     and array_ndims((jsonb_populate_record(null::public.scrabble_sessions, p_session_patch)).turn_order) > 1 then
    return jsonb_build_object('status', 'invalid', 'reason', 'patch_value');
  end if;
  if p_session_patch->>'phase' = 'finished' then
    return jsonb_build_object('status', 'invalid', 'reason', 'phase_finished');
  end if;

  for v_elem in select * from jsonb_array_elements(p_state_writes) loop
    if jsonb_typeof(v_elem) <> 'object'
       or (v_elem->>'player_id') is null
       or jsonb_typeof(v_elem->'player_id') <> 'string'
       or (v_elem->>'player_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or exists (
         select 1 from jsonb_object_keys(v_elem) k
         where k not in ('player_id', 'score', 'rack', 'clock_ms_remaining', 'timed_out', 'stats')
       )
       or (v_elem ? 'score' and (jsonb_typeof(v_elem->'score') <> 'number' or (v_elem->>'score') !~ '^-?[0-9]{1,9}$'))
       or (v_elem ? 'rack' and jsonb_typeof(v_elem->'rack') <> 'array')
       or (v_elem ? 'clock_ms_remaining' and (
            jsonb_typeof(v_elem->'clock_ms_remaining') not in ('number', 'null')
            or (jsonb_typeof(v_elem->'clock_ms_remaining') = 'number' and (v_elem->>'clock_ms_remaining') !~ '^-?[0-9]{1,9}$')))
       or (v_elem ? 'timed_out' and jsonb_typeof(v_elem->'timed_out') <> 'boolean')
       or (v_elem ? 'stats' and jsonb_typeof(v_elem->'stats') <> 'object') then
      return jsonb_build_object('status', 'invalid', 'reason', 'state_write');
    end if;
  end loop;
  if (select count(distinct (e->>'player_id')::uuid) from jsonb_array_elements(p_state_writes) e) <> jsonb_array_length(p_state_writes) then
    return jsonb_build_object('status', 'invalid', 'reason', 'state_write_duplicate');
  end if;

  select string_agg(quote_ident(k), ', ') into v_cols from jsonb_object_keys(p_session_patch) as k;
  if v_cols is not null then
    execute format(
      'update public.scrabble_sessions s set (%1$s) = (select %1$s from jsonb_populate_record(null::public.scrabble_sessions, $1)) where s.game_id = $2',
      v_cols
    ) using p_session_patch, v_id;
  else
    update public.scrabble_sessions set updated_at = updated_at where game_id = v_id;
  end if;

  for v_elem in select * from jsonb_array_elements(p_state_writes) loop
    update public.scrabble_player_state
      set score = coalesce((v_elem->>'score')::integer, score),
          rack = coalesce(v_elem->'rack', rack),
          clock_ms_remaining = case when v_elem ? 'clock_ms_remaining' then (v_elem->>'clock_ms_remaining')::integer else clock_ms_remaining end,
          timed_out = coalesce((v_elem->>'timed_out')::boolean, timed_out),
          stats = coalesce(v_elem->'stats', stats)
      where game_id = v_id and player_id = (v_elem->>'player_id')::uuid;
  end loop;

  return jsonb_build_object('status', 'applied');
end;
$$;

revoke execute on function public.apply_scrabble_move(text, timestamptz, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_scrabble_move(text, timestamptz, jsonb, jsonb) to service_role;

-- Dealing a round (a start or a rematch) is ONE transaction under the games row lock: the previous racks and the
-- session are replaced together (a failed deal leaves the previous result intact), a second overlapping deal finds the
-- round already `playing` and answers `in_progress` instead of interleaving its racks and bag with the first, and a
-- seat whose player row is gone (a leave cleaning up a reopened lobby) is `invalid` before anything is written.
create or replace function public.deal_scrabble_session(
  p_game_id text,
  p_session_row jsonb,
  p_state_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text;
  v_status text;
  v_session public.scrabble_sessions%rowtype;
  v_exists boolean;
  v_bad text;
  v_cols text;
  v_elem jsonb;
  v_turn uuid[];
  v_dealt uuid[];
begin
  if p_game_id is null or p_session_row is null or p_state_rows is null then
    raise exception 'deal_scrabble_session: game id, session row and state rows are required';
  end if;
  v_id := upper(p_game_id);

  select status into v_status from public.games where id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'invalid', 'reason', 'game_missing');
  end if;
  select * into v_session from public.scrabble_sessions where game_id = v_id for update;
  v_exists := found;
  -- Never re-deal a round in progress (it would reset every score).
  if v_exists and v_session.phase = 'playing' then
    return jsonb_build_object('status', 'in_progress');
  end if;
  -- PERMITTED GAME STATE: a deal is only allowed while the game is `waiting` (a first start, or a rematch: Play Again puts
  -- the game back to `waiting` and keeps the finished session row until it is re-dealt). Every start deals BEFORE it
  -- flips the game to `active`. A stale start that read `waiting` earlier, and reaches this lock after another start
  -- finished the round (the game is `active` / `finished`), is refused here instead of re-dealing a finished round.
  if v_status is distinct from 'waiting' then
    return jsonb_build_object('status', 'not_waiting');
  end if;

  if jsonb_typeof(p_session_row) <> 'object' or jsonb_typeof(p_state_rows) <> 'array'
     or jsonb_array_length(p_state_rows) = 0 or p_session_row->>'phase' is distinct from 'playing' then
    return jsonb_build_object('status', 'invalid', 'reason', 'payload_shape');
  end if;
  select string_agg(k, ',') into v_bad
    from jsonb_object_keys(p_session_row) as k
    where k in ('id', 'game_id', 'created_at', 'updated_at')
       or not exists (
         select 1 from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = 'scrabble_sessions' and c.column_name = k
       );
  if v_bad is not null then
    return jsonb_build_object('status', 'invalid', 'reason', 'session_column: ' || v_bad);
  end if;
  begin
    perform jsonb_populate_record(null::public.scrabble_sessions, p_session_row);
  exception when others then
    return jsonb_build_object('status', 'invalid', 'reason', 'session_value');
  end;

  for v_elem in select * from jsonb_array_elements(p_state_rows) loop
    if jsonb_typeof(v_elem) <> 'object'
       or jsonb_typeof(v_elem->'player_id') is distinct from 'string'
       or (v_elem->>'player_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or exists (
         select 1 from jsonb_object_keys(v_elem) k
         where k not in ('player_id', 'rack', 'score', 'player_order', 'clock_ms_remaining', 'timed_out')
       )
       or (v_elem ? 'rack' and jsonb_typeof(v_elem->'rack') <> 'array')
       or (v_elem ? 'score' and (jsonb_typeof(v_elem->'score') <> 'number' or (v_elem->>'score') !~ '^-?[0-9]{1,9}$'))
       or (v_elem ? 'player_order' and (jsonb_typeof(v_elem->'player_order') <> 'number' or (v_elem->>'player_order') !~ '^-?[0-9]{1,9}$'))
       or (v_elem ? 'clock_ms_remaining' and (
            jsonb_typeof(v_elem->'clock_ms_remaining') not in ('number', 'null')
            or (jsonb_typeof(v_elem->'clock_ms_remaining') = 'number' and (v_elem->>'clock_ms_remaining') !~ '^-?[0-9]{1,9}$')))
       or (v_elem ? 'timed_out' and jsonb_typeof(v_elem->'timed_out') <> 'boolean')
       or not exists (
         select 1 from public.players p where p.id = (v_elem->>'player_id')::uuid and p.game_id = v_id
       ) then
      return jsonb_build_object('status', 'invalid', 'reason', 'state_row');
    end if;
  end loop;
  if (select count(distinct (e->>'player_id')::uuid) from jsonb_array_elements(p_state_rows) e) <> jsonb_array_length(p_state_rows) then
    return jsonb_build_object('status', 'invalid', 'reason', 'state_row_duplicate');
  end if;

  -- Every seat in turn_order must be dealt a state row and vice versa (a round must never start on a seat with no rack).
  if array_ndims((jsonb_populate_record(null::public.scrabble_sessions, p_session_row)).turn_order) > 1 then
    return jsonb_build_object('status', 'invalid', 'reason', 'turn_order_dimensions');
  end if;
  select array_agg(t order by t) into v_turn
    from unnest((jsonb_populate_record(null::public.scrabble_sessions, p_session_row)).turn_order) t;
  select array_agg(sid order by sid) into v_dealt
    from (select (e->>'player_id')::uuid as sid from jsonb_array_elements(p_state_rows) e) d;
  if v_turn is null or v_turn is distinct from v_dealt then
    return jsonb_build_object('status', 'invalid', 'reason', 'turn_order_mismatch');
  end if;

  delete from public.scrabble_player_state where game_id = v_id;
  insert into public.scrabble_player_state (game_id, player_id, rack, score, player_order, clock_ms_remaining, timed_out)
    select v_id, (e->>'player_id')::uuid, coalesce(e->'rack', '[]'::jsonb), coalesce((e->>'score')::integer, 0),
           coalesce((e->>'player_order')::integer, 0), (e->>'clock_ms_remaining')::integer,
           coalesce((e->>'timed_out')::boolean, false)
    from jsonb_array_elements(p_state_rows) e;

  select string_agg(quote_ident(k), ', ') into v_cols from jsonb_object_keys(p_session_row) as k;
  if v_exists then
    execute format(
      'update public.scrabble_sessions s set (%1$s) = (select %1$s from jsonb_populate_record(null::public.scrabble_sessions, $1)) where s.game_id = $2',
      v_cols
    ) using p_session_row, v_id;
  else
    execute format(
      'insert into public.scrabble_sessions (game_id, %1$s) select $2, %1$s from jsonb_populate_record(null::public.scrabble_sessions, $1)',
      v_cols
    ) using p_session_row, v_id;
  end if;

  return jsonb_build_object('status', 'dealt');
end;
$$;

revoke execute on function public.deal_scrabble_session(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.deal_scrabble_session(text, jsonb, jsonb) to service_role;

-- A leave in a lobby (no session yet, a reopened lobby whose finished session row is still around, a spectator): the
-- seat's rows and its turn_order entry go in ONE transaction under the games lock (the same lock a deal takes), so a
-- start can never list a seat whose rows are being deleted, and a deleted row is never left in a turn order. A round that
-- is `playing` and still lists the player is a LIVE leave: nothing is deleted and the caller takes the live path.
create or replace function public.remove_scrabble_lobby_seat(
  p_game_id text,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text;
  v_status text;
  v_session public.scrabble_sessions%rowtype;
  v_exists boolean;
begin
  if p_game_id is null or p_player_id is null then
    raise exception 'remove_scrabble_lobby_seat: game id and player id are required';
  end if;
  v_id := upper(p_game_id);

  select status into v_status from public.games where id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'invalid', 'reason', 'game_missing');
  end if;
  select * into v_session from public.scrabble_sessions where game_id = v_id for update;
  v_exists := found;
  if v_exists and v_session.phase = 'playing' and p_player_id = any (v_session.turn_order) then
    return jsonb_build_object('status', 'live');
  end if;
  -- A PUBLISHED result (finished round, game not `waiting`) keeps its seats and rows; only a reopened lobby
  -- (game `waiting`) drops the seat of a finished session.
  if v_exists and v_session.phase = 'finished' and p_player_id = any (v_session.turn_order)
     and v_status is distinct from 'waiting' then
    return jsonb_build_object('status', 'retained');
  end if;

  -- the seat first (a finished session of a reopened lobby still lists it), then the rows
  if v_exists and p_player_id = any (v_session.turn_order) then
    update public.scrabble_sessions
      set turn_order = array_remove(turn_order, p_player_id)
      where game_id = v_id;
  end if;
  delete from public.scrabble_player_state where game_id = v_id and player_id = p_player_id;
  delete from public.players where id = p_player_id and game_id = v_id;
  return jsonb_build_object('status', 'removed');
end;
$$;

revoke execute on function public.remove_scrabble_lobby_seat(text, uuid) from public, anon, authenticated;
grant execute on function public.remove_scrabble_lobby_seat(text, uuid) to service_role;

-- A live (non-finishing) leave: the session claim, the patch (new turn order / turn) AND the leaver's state / seat rows are
-- ONE transaction under the games + session locks. The old shape committed the turn_order change first and deleted the rows
-- afterwards with unconditional deletes, so a rematch that dealt the same (not yet deleted) player in between lost its new
-- rack and seat to the delayed deletes.
create or replace function public.leave_scrabble_seat(
  p_game_id text,
  p_player_id uuid,
  p_expected_updated_at timestamptz,
  p_session_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text;
  v_session public.scrabble_sessions%rowtype;
  v_bad text;
  v_cols text;
begin
  if p_game_id is null or p_player_id is null or p_expected_updated_at is null or p_session_patch is null then
    raise exception 'leave_scrabble_seat: game id, player id, expected version and session patch are required';
  end if;
  v_id := upper(p_game_id);

  perform 1 from public.games where id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'invalid', 'reason', 'game_missing');
  end if;
  select * into v_session from public.scrabble_sessions where game_id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'invalid', 'reason', 'session_missing');
  end if;
  if v_session.phase = 'finished' or v_session.updated_at <> p_expected_updated_at then
    return jsonb_build_object('status', 'lost');
  end if;

  if jsonb_typeof(p_session_patch) is distinct from 'object' then
    return jsonb_build_object('status', 'invalid', 'reason', 'payload_shape');
  end if;
  select string_agg(k, ',') into v_bad
    from jsonb_object_keys(p_session_patch) as k
    where k in ('id', 'game_id', 'created_at', 'updated_at')
       or not exists (
         select 1 from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = 'scrabble_sessions' and c.column_name = k
       );
  if v_bad is not null then
    return jsonb_build_object('status', 'invalid', 'reason', 'patch_column: ' || v_bad);
  end if;
  if p_session_patch->>'phase' = 'finished' then
    return jsonb_build_object('status', 'invalid', 'reason', 'phase_finished');
  end if;
  begin
    perform jsonb_populate_record(null::public.scrabble_sessions, p_session_patch);
  exception when others then
    return jsonb_build_object('status', 'invalid', 'reason', 'patch_value');
  end;
  -- an array column must be one-dimensional (array_remove and the turn logic assume it)
  if p_session_patch ? 'turn_order'
     and array_ndims((jsonb_populate_record(null::public.scrabble_sessions, p_session_patch)).turn_order) > 1 then
    return jsonb_build_object('status', 'invalid', 'reason', 'patch_value');
  end if;

  select string_agg(quote_ident(k), ', ') into v_cols from jsonb_object_keys(p_session_patch) as k;
  if v_cols is not null then
    execute format(
      'update public.scrabble_sessions s set (%1$s) = (select %1$s from jsonb_populate_record(null::public.scrabble_sessions, $1)) where s.game_id = $2',
      v_cols
    ) using p_session_patch, v_id;
  else
    update public.scrabble_sessions set updated_at = updated_at where game_id = v_id;
  end if;

  delete from public.scrabble_player_state where game_id = v_id and player_id = p_player_id;
  delete from public.players where id = p_player_id and game_id = v_id;
  return jsonb_build_object('status', 'left');
end;
$$;

revoke execute on function public.leave_scrabble_seat(text, uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.leave_scrabble_seat(text, uuid, timestamptz, jsonb) to service_role;
