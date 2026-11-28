-- Finishing an Uno round in ONE transaction.
--
-- A finish used to be several separate statements issued by the app (claim the session row, write the final
-- hand rows, add the round's series points, flip games.status, delete a leaver's rows), each of which could be
-- overtaken between two of them: a hand written before a claim that then lost (a duplicated card), series points
-- awarded twice by two expiries, a round published before its hands landed, a ranking computed from rows that
-- another request had already changed. None of those windows exists when the whole finish is one transaction
-- under a lock, so this function is that transaction. The app still computes the ranking, hands and points in
-- memory exactly as before and passes the result as a payload; the function only VALIDATES and APPLIES it.
--
-- finish_uno_session() takes FOR UPDATE on the games row and then the uno_sessions row, and decides against the
-- CURRENT rows:
--   * `p_round` (optional) names the round the caller decided about ({session_started_at, sessions_played}); a
--     mismatch with the games row under the lock -> `lost` (reason `round`), so an expiry decided from a snapshot can never finish a
--     LATER round after a rematch.
--   * session already `finished`  -> `already_finished`. Nothing is re-ranked, no hand is rewritten, no series
--     points are awarded, and NO player is removed from the published result; the only thing completed is the
--     games-row flip, and only for a game that is still `active` (a replayed game is back to `waiting`). This is
--     the repair path for a finish whose games flip failed.
--   * `updated_at` differs from the caller's expected value -> `lost` (the compare-and-swap, now inside the
--     function: a stale caller changes nothing).
--   * otherwise, atomically: the session patch (+ phase finished, turn_deadline_at null), the final hand rows /
--     stats, the series points (added in SQL, only while scoring is on and no series winner exists), the
--     spectator flags, the optional removal of a leaver's hand + player rows, and the games-row flip (status
--     finished, finished_at, and the durable finish_bookkeeping marker owed by exactly this finish, the same
--     tracked mechanism game-finish.ts / settle_host_leave use) -> `finished`.
--   * a malformed payload (non-object patch, unknown / protected column, a hand / series / spectator / removal entry
--     that is null, mistyped, duplicated or not part of THIS game) -> `invalid` with a `reason`, nothing written.
-- jsonb outcome: { status: finished | already_finished | lost | invalid, games_flipped: bool, finished_at?, reason? }
--
-- Execute is revoked from public / anon / authenticated and granted to service_role only (the API routes call it
-- with the service role). NULL arguments for the required parameters raise.
--
-- A NON-finishing move is the same shape in miniature, and so the same atomicity applies: apply_uno_move() claims the
-- session by version, applies the session patch AND the move's hand / stats rows AND the out player's spectator flag in
-- ONE transaction. Without it a move was a session claim followed by separate hand writes, and another request (a finish
-- computing its award, a leave, the next player's move) could act on the new session version while the hands still held
-- the old cards. Outcome: applied | lost (stale version, or the round is already finished) | invalid (malformed payload,
-- unknown / protected column, a move that tries to set phase `finished` -- only finish_uno_session ends a round).
-- A hand write for a player who has since left matches no row and is ignored (the move is not rejected for it);
-- null / mistyped / duplicated ids are rejected exactly as in the finish function.
--
-- Additive: two new functions, nothing existing is altered.

create or replace function public.finish_uno_session(
  p_game_id text,
  p_expected_updated_at timestamptz,
  p_session_patch jsonb,
  p_hand_writes jsonb,
  p_series jsonb default null,
  p_spectator_ids uuid[] default null,
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
  v_session public.uno_sessions%rowtype;
  v_now timestamptz;
  v_bad text;
  v_cols text;
  v_elem jsonb;
  v_winner text;
  v_winner_uuid uuid;
  v_points integer;
  v_totals jsonb;
  v_total integer;
  v_flipped boolean;
begin
  if p_game_id is null or p_expected_updated_at is null or p_session_patch is null or p_hand_writes is null then
    raise exception 'finish_uno_session: game id, expected version, session patch and hand writes are required';
  end if;
  v_id := upper(p_game_id);

  select * into v_game from public.games where id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'invalid', 'reason', 'game_missing', 'games_flipped', false);
  end if;
  select * into v_session from public.uno_sessions where game_id = v_id for update;
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

  -- Already finished: never re-rank / re-award / rewrite, and never remove a player from a published result.
  -- Only complete the flip of a game that is still ACTIVE (a replayed game is back to `waiting` and keeps this
  -- finished session row until it is re-dealt: a stale request must not finish it again).
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

  -- A round that has not been published as started cannot be finished: a `waiting` game has no live round (the start
  -- deals and activates in one transaction), so a finish here would publish a winner before the game began.
  if v_game.status = 'waiting' then
    return jsonb_build_object('status', 'invalid', 'reason', 'game_waiting', 'games_flipped', false);
  end if;

  -- ---- validation (nothing is written until all of it passes) ----
  if jsonb_typeof(p_session_patch) <> 'object' or jsonb_typeof(p_hand_writes) <> 'array' then
    return jsonb_build_object('status', 'invalid', 'reason', 'payload_shape', 'games_flipped', false);
  end if;

  select string_agg(k, ',') into v_bad
    from jsonb_object_keys(p_session_patch) as k
    where k in ('id', 'game_id', 'created_at', 'updated_at', 'phase')
       or not exists (
         select 1 from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = 'uno_sessions' and c.column_name = k
       );
  if v_bad is not null then
    return jsonb_build_object('status', 'invalid', 'reason', 'patch_column: ' || v_bad, 'games_flipped', false);
  end if;
  -- A value that cannot be converted to its column type (a malformed uuid, ...) is `invalid`, never a raised error.
  begin
    perform jsonb_populate_record(null::public.uno_sessions, p_session_patch);
  exception when others then
    return jsonb_build_object('status', 'invalid', 'reason', 'patch_value', 'games_flipped', false);
  end;
  -- an array column must be one-dimensional (array_remove and the turn logic assume it)
  if p_session_patch ? 'turn_order'
     and array_ndims((jsonb_populate_record(null::public.uno_sessions, p_session_patch)).turn_order) > 1 then
    return jsonb_build_object('status', 'invalid', 'reason', 'patch_value', 'games_flipped', false);
  end if;

  -- Every hand write: an object, a non-null uuid-shaped player_id that holds a hand row in THIS game, only known keys,
  -- and no player twice.
  for v_elem in select * from jsonb_array_elements(p_hand_writes) loop
    if jsonb_typeof(v_elem) <> 'object'
       or (v_elem->>'player_id') is null
       or jsonb_typeof(v_elem->'player_id') <> 'string'
       or (v_elem->>'player_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or exists (select 1 from jsonb_object_keys(v_elem) k where k not in ('player_id', 'cards', 'stats'))
       or (v_elem ? 'cards' and jsonb_typeof(v_elem->'cards') <> 'array')
       or (v_elem ? 'stats' and jsonb_typeof(v_elem->'stats') <> 'object')
       or not exists (
         select 1 from public.uno_player_hands h where h.game_id = v_id and h.player_id = (v_elem->>'player_id')::uuid
       ) then
      return jsonb_build_object('status', 'invalid', 'reason', 'hand_write', 'games_flipped', false);
    end if;
  end loop;
  if (select count(distinct (e->>'player_id')::uuid) from jsonb_array_elements(p_hand_writes) e) <> jsonb_array_length(p_hand_writes) then
    return jsonb_build_object('status', 'invalid', 'reason', 'hand_write_duplicate', 'games_flipped', false);
  end if;

  if p_series is not null then
    -- IS DISTINCT FROM: a missing key makes jsonb_typeof() NULL, and a plain `<>` would let that through.
    if jsonb_typeof(p_series) is distinct from 'object'
       or jsonb_typeof(p_series->'winner_id') is distinct from 'string'
       or coalesce(p_series->>'winner_id', '') = ''
       or jsonb_typeof(p_series->'points') is distinct from 'number'
       or (p_series->>'points') !~ '^[0-9]{1,9}$' then
      return jsonb_build_object('status', 'invalid', 'reason', 'series', 'games_flipped', false);
    end if;
    -- The winner is parsed ONCE: membership is compared as a uuid and the canonical text is the score key, so two
    -- spellings of one player (upper / lower case) can neither be rejected nor accumulate under two keys.
    begin
      v_winner_uuid := (p_series->>'winner_id')::uuid;
    exception when others then
      return jsonb_build_object('status', 'invalid', 'reason', 'series', 'games_flipped', false);
    end;
    if not exists (select 1 from public.uno_player_hands h where h.game_id = v_id and h.player_id = v_winner_uuid) then
      return jsonb_build_object('status', 'invalid', 'reason', 'series', 'games_flipped', false);
    end if;
  end if;

  -- A NULL element matches no player, so it is rejected by the same test.
  if p_spectator_ids is not null and (
       array_ndims(p_spectator_ids) > 1
       or (select count(distinct sid) from unnest(p_spectator_ids) sid) <> cardinality(p_spectator_ids)
       or exists (
         select 1 from unnest(p_spectator_ids) sid
         where not exists (select 1 from public.players p where p.id = sid and p.game_id = v_id)
       )
     ) then
    return jsonb_build_object('status', 'invalid', 'reason', 'spectators', 'games_flipped', false);
  end if;
  if p_remove_player_id is not null
     and not exists (select 1 from public.players p where p.id = p_remove_player_id and p.game_id = v_id) then
    return jsonb_build_object('status', 'invalid', 'reason', 'remove_player', 'games_flipped', false);
  end if;

  -- ---- apply, atomically ----
  select string_agg(quote_ident(k), ', ') into v_cols from jsonb_object_keys(p_session_patch) as k;
  if v_cols is not null then
    execute format(
      'update public.uno_sessions s set (%1$s) = (select %1$s from jsonb_populate_record(null::public.uno_sessions, $1)) where s.game_id = $2',
      v_cols
    ) using p_session_patch, v_id;
  end if;
  update public.uno_sessions set phase = 'finished', turn_deadline_at = null where game_id = v_id;

  for v_elem in select * from jsonb_array_elements(p_hand_writes) loop
    update public.uno_player_hands
      set cards = coalesce(v_elem->'cards', cards),
          stats = coalesce(v_elem->'stats', stats)
      where game_id = v_id and player_id = (v_elem->>'player_id')::uuid;
  end loop;

  -- Series points: added here, against the CURRENT totals, only while scoring is on and no series winner exists.
  if p_series is not null and v_game.uno_series_scoring = true and v_game.uno_series_winner_id is null then
    v_winner := v_winner_uuid::text;
    v_points := (p_series->>'points')::integer;
    v_totals := coalesce(v_game.uno_series_scores, '{}'::jsonb);
    v_total := coalesce((v_totals->>v_winner)::integer, 0) + v_points;
    v_totals := jsonb_set(v_totals, array[v_winner], to_jsonb(v_total));
    update public.games
      set uno_series_scores = v_totals,
          uno_series_winner_id = case when v_total >= v_game.uno_series_target then v_winner else uno_series_winner_id end
      where id = v_id;
  end if;

  if p_spectator_ids is not null then
    update public.players set spectator = true where game_id = v_id and id = any (p_spectator_ids);
  end if;

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

revoke execute on function public.finish_uno_session(text, timestamptz, jsonb, jsonb, jsonb, uuid[], uuid, jsonb) from public, anon, authenticated;
grant execute on function public.finish_uno_session(text, timestamptz, jsonb, jsonb, jsonb, uuid[], uuid, jsonb) to service_role;

create or replace function public.apply_uno_move(
  p_game_id text,
  p_expected_updated_at timestamptz,
  p_session_patch jsonb,
  p_hand_writes jsonb,
  p_spectator_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text;
  v_session public.uno_sessions%rowtype;
  v_bad text;
  v_cols text;
  v_elem jsonb;
begin
  if p_game_id is null or p_expected_updated_at is null or p_session_patch is null or p_hand_writes is null then
    raise exception 'apply_uno_move: game id, expected version, session patch and hand writes are required';
  end if;
  v_id := upper(p_game_id);

  select * into v_session from public.uno_sessions where game_id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'invalid', 'reason', 'session_missing');
  end if;
  if v_session.phase = 'finished' or v_session.updated_at <> p_expected_updated_at then
    return jsonb_build_object('status', 'lost');
  end if;

  if jsonb_typeof(p_session_patch) is distinct from 'object' or jsonb_typeof(p_hand_writes) is distinct from 'array' then
    return jsonb_build_object('status', 'invalid', 'reason', 'payload_shape');
  end if;
  select string_agg(k, ',') into v_bad
    from jsonb_object_keys(p_session_patch) as k
    where k in ('id', 'game_id', 'created_at', 'updated_at')
       or not exists (
         select 1 from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = 'uno_sessions' and c.column_name = k
       );
  if v_bad is not null then
    return jsonb_build_object('status', 'invalid', 'reason', 'patch_column: ' || v_bad);
  end if;
  -- A value that cannot be converted to its column type (a malformed uuid, ...) is `invalid`, never a raised error.
  begin
    perform jsonb_populate_record(null::public.uno_sessions, p_session_patch);
  exception when others then
    return jsonb_build_object('status', 'invalid', 'reason', 'patch_value');
  end;
  -- an array column must be one-dimensional (array_remove and the turn logic assume it)
  if p_session_patch ? 'turn_order'
     and array_ndims((jsonb_populate_record(null::public.uno_sessions, p_session_patch)).turn_order) > 1 then
    return jsonb_build_object('status', 'invalid', 'reason', 'patch_value');
  end if;
  if p_session_patch->>'phase' = 'finished' then
    return jsonb_build_object('status', 'invalid', 'reason', 'phase_finished');
  end if;

  for v_elem in select * from jsonb_array_elements(p_hand_writes) loop
    if jsonb_typeof(v_elem) <> 'object'
       or (v_elem->>'player_id') is null
       or jsonb_typeof(v_elem->'player_id') <> 'string'
       or (v_elem->>'player_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or exists (select 1 from jsonb_object_keys(v_elem) k where k not in ('player_id', 'cards', 'stats'))
       or (v_elem ? 'cards' and jsonb_typeof(v_elem->'cards') <> 'array')
       or (v_elem ? 'stats' and jsonb_typeof(v_elem->'stats') <> 'object') then
      return jsonb_build_object('status', 'invalid', 'reason', 'hand_write');
    end if;
  end loop;
  if (select count(distinct (e->>'player_id')::uuid) from jsonb_array_elements(p_hand_writes) e) <> jsonb_array_length(p_hand_writes) then
    return jsonb_build_object('status', 'invalid', 'reason', 'hand_write_duplicate');
  end if;
  if p_spectator_ids is not null
     and (array_ndims(p_spectator_ids) > 1
          or (select count(distinct sid) from unnest(p_spectator_ids) sid) <> cardinality(p_spectator_ids)
          or exists (select 1 from unnest(p_spectator_ids) sid where sid is null)) then
    return jsonb_build_object('status', 'invalid', 'reason', 'spectators');
  end if;

  select string_agg(quote_ident(k), ', ') into v_cols from jsonb_object_keys(p_session_patch) as k;
  if v_cols is not null then
    execute format(
      'update public.uno_sessions s set (%1$s) = (select %1$s from jsonb_populate_record(null::public.uno_sessions, $1)) where s.game_id = $2',
      v_cols
    ) using p_session_patch, v_id;
  else
    -- an empty patch still advances the version (the move happened)
    update public.uno_sessions set updated_at = updated_at where game_id = v_id;
  end if;

  for v_elem in select * from jsonb_array_elements(p_hand_writes) loop
    update public.uno_player_hands
      set cards = coalesce(v_elem->'cards', cards),
          stats = coalesce(v_elem->'stats', stats)
      where game_id = v_id and player_id = (v_elem->>'player_id')::uuid;
  end loop;

  if p_spectator_ids is not null then
    update public.players set spectator = true where game_id = v_id and id = any (p_spectator_ids);
  end if;

  return jsonb_build_object('status', 'applied');
end;
$$;

revoke execute on function public.apply_uno_move(text, timestamptz, jsonb, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.apply_uno_move(text, timestamptz, jsonb, jsonb, uuid[]) to service_role;

-- A Team-Up leave commits the departure (membership in left_player_ids) BEFORE it deletes the leaver's rows. If that
-- cleanup failed, a repeat leave on the finished round completes it here, in ONE transaction that checks, under the
-- same games / session locks, that the marked departure still belongs to the finished round it validated: a rematch
-- replaces the session (the marker is gone), so cleanup never deletes a new round's hand or seat. Unmarked players
-- (finishers, winners) are never touched.
create or replace function public.complete_uno_departure(
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
  v_session public.uno_sessions%rowtype;
begin
  if p_game_id is null or p_player_id is null then
    raise exception 'complete_uno_departure: game id and player id are required';
  end if;
  v_id := upper(p_game_id);

  perform 1 from public.games where id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'none', 'reason', 'game_missing');
  end if;
  select * into v_session from public.uno_sessions where game_id = v_id for update;
  if not found or jsonb_typeof(v_session.left_player_ids) is distinct from 'array'
     or not (v_session.left_player_ids ? p_player_id::text) then
    return jsonb_build_object('status', 'none');
  end if;
  if not exists (select 1 from public.players p where p.id = p_player_id and p.game_id = v_id) then
    return jsonb_build_object('status', 'none');
  end if;

  delete from public.uno_player_hands where game_id = v_id and player_id = p_player_id;
  delete from public.players where id = p_player_id and game_id = v_id;
  return jsonb_build_object('status', 'completed');
end;
$$;

revoke execute on function public.complete_uno_departure(text, uuid) from public, anon, authenticated;
grant execute on function public.complete_uno_departure(text, uuid) to service_role;

-- A non-finishing leave (ordinary or Team-Up): the session claim, the patch AND the leaver's hand / seat rows are ONE
-- transaction under the games + session locks. The old shape committed the turn_order change first and deleted the rows
-- afterwards with unconditional deletes, so a rematch that dealt the same (not yet deleted) player in between lost its new
-- hand and seat to the delayed deletes.
create or replace function public.leave_uno_seat(
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
  v_session public.uno_sessions%rowtype;
  v_next public.uno_sessions%rowtype;
  v_bad text;
  v_cols text;
begin
  if p_game_id is null or p_player_id is null or p_expected_updated_at is null or p_session_patch is null then
    raise exception 'leave_uno_seat: game id, player id, expected version and session patch are required';
  end if;
  v_id := upper(p_game_id);

  perform 1 from public.games where id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'invalid', 'reason', 'game_missing');
  end if;
  select * into v_session from public.uno_sessions where game_id = v_id for update;
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
         where c.table_schema = 'public' and c.table_name = 'uno_sessions' and c.column_name = k
       );
  if v_bad is not null then
    return jsonb_build_object('status', 'invalid', 'reason', 'patch_column: ' || v_bad);
  end if;
  if p_session_patch->>'phase' = 'finished' then
    return jsonb_build_object('status', 'invalid', 'reason', 'phase_finished');
  end if;
  begin
    perform jsonb_populate_record(null::public.uno_sessions, p_session_patch);
  exception when others then
    return jsonb_build_object('status', 'invalid', 'reason', 'patch_value');
  end;
  -- an array column must be one-dimensional (array_remove and the turn logic assume it)
  if p_session_patch ? 'turn_order'
     and array_ndims((jsonb_populate_record(null::public.uno_sessions, p_session_patch)).turn_order) > 1 then
    return jsonb_build_object('status', 'invalid', 'reason', 'patch_value');
  end if;

  -- The resulting session must NOT keep the deleted player in the rotation: an ordinary leave removes the seat from
  -- turn_order; a Team-Up leave keeps it there (seat parity) but MARKS it in left_player_ids in the same patch.
  v_next := jsonb_populate_record(v_session, p_session_patch);
  if p_player_id = any (v_next.turn_order)
     and not (jsonb_typeof(v_next.left_player_ids) = 'array' and v_next.left_player_ids ? p_player_id::text) then
    return jsonb_build_object('status', 'invalid', 'reason', 'seat_not_removed');
  end if;

  select string_agg(quote_ident(k), ', ') into v_cols from jsonb_object_keys(p_session_patch) as k;
  if v_cols is not null then
    execute format(
      'update public.uno_sessions s set (%1$s) = (select %1$s from jsonb_populate_record(null::public.uno_sessions, $1)) where s.game_id = $2',
      v_cols
    ) using p_session_patch, v_id;
  else
    update public.uno_sessions set updated_at = updated_at where game_id = v_id;
  end if;

  delete from public.uno_player_hands where game_id = v_id and player_id = p_player_id;
  delete from public.players where id = p_player_id and game_id = v_id;
  return jsonb_build_object('status', 'left');
end;
$$;

revoke execute on function public.leave_uno_seat(text, uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.leave_uno_seat(text, uuid, timestamptz, jsonb) to service_role;

-- A leave that is NOT a live-round leave (no session yet, a spectator, a seat that is not in the turn order, a reopened
-- lobby): the rows go, and a reopened lobby's stale turn_order entry with them, in ONE transaction under the games lock.
-- `live`: a round that is not finished still lists the player (nothing is deleted; the caller takes the live path).
-- `retained`: a PUBLISHED result (finished, game not `waiting`) keeps its seats, unless the departure is marked; so does a
-- player who already went out (finish_order) of a round that is still running. Retention is decided HERE, from the locked
-- games row and session row together, never by the caller from two earlier reads.
create or replace function public.remove_uno_lobby_seat(
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
  v_session public.uno_sessions%rowtype;
  v_exists boolean;
  v_listed boolean;
begin
  if p_game_id is null or p_player_id is null then
    raise exception 'remove_uno_lobby_seat: game id and player id are required';
  end if;
  v_id := upper(p_game_id);

  select status into v_status from public.games where id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'invalid', 'reason', 'game_missing');
  end if;
  select * into v_session from public.uno_sessions where game_id = v_id for update;
  v_exists := found;
  v_listed := v_exists and p_player_id = any (v_session.turn_order);
  -- A player who already went out keeps the placement locked in finish_order (published game only).
  if v_exists and p_player_id = any (v_session.finish_order) and v_status is distinct from 'waiting' then
    return jsonb_build_object('status', 'retained');
  end if;
  if v_listed and v_session.phase <> 'finished' then
    return jsonb_build_object('status', 'live');
  end if;
  if v_listed and v_status is distinct from 'waiting'
     and not (jsonb_typeof(v_session.left_player_ids) = 'array' and v_session.left_player_ids ? p_player_id::text) then
    return jsonb_build_object('status', 'retained');
  end if;

  if v_listed and v_status = 'waiting' then
    update public.uno_sessions set turn_order = array_remove(turn_order, p_player_id) where game_id = v_id;
  end if;
  delete from public.uno_player_hands where game_id = v_id and player_id = p_player_id;
  delete from public.players where id = p_player_id and game_id = v_id;
  return jsonb_build_object('status', 'removed');
end;
$$;

revoke execute on function public.remove_uno_lobby_seat(text, uuid) from public, anon, authenticated;
grant execute on function public.remove_uno_lobby_seat(text, uuid) to service_role;

-- STARTING a round (a first start or a rematch) is ONE transaction under the games row lock: any previous deal's hands
-- and session are replaced, the new session and every hand are inserted, AND the games row is flipped to `active`,
-- together. There is no half-started room: a failed start changes nothing (the next start simply deals again), so a
-- start never needs a "resume" and a stale-deal cleanup can never delete a deal another start just made; a flip can
-- never be applied late to a round it did not deal. A start that reaches the lock when the game is no longer `waiting`
-- (another start won, or the game is over) answers `not_waiting` and writes nothing. A seat whose player row is gone is
-- `invalid` before anything is written.
create or replace function public.start_uno_game(
  p_game_id text,
  p_session_row jsonb,
  p_hand_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text;
  v_status text;
  v_bad text;
  v_cols text;
  v_elem jsonb;
  v_turn uuid[];
  v_dealt uuid[];
begin
  if p_game_id is null or p_session_row is null or p_hand_rows is null then
    raise exception 'start_uno_game: game id, session row and hand rows are required';
  end if;
  v_id := upper(p_game_id);

  select status into v_status from public.games where id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'invalid', 'reason', 'game_missing');
  end if;
  if v_status is distinct from 'waiting' then
    return jsonb_build_object('status', 'not_waiting');
  end if;

  if jsonb_typeof(p_session_row) <> 'object' or jsonb_typeof(p_hand_rows) <> 'array'
     or jsonb_array_length(p_hand_rows) = 0 or p_session_row->>'phase' is distinct from 'playing' then
    return jsonb_build_object('status', 'invalid', 'reason', 'payload_shape');
  end if;
  select string_agg(k, ',') into v_bad
    from jsonb_object_keys(p_session_row) as k
    where k in ('id', 'game_id', 'created_at', 'updated_at')
       or not exists (
         select 1 from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = 'uno_sessions' and c.column_name = k
       );
  if v_bad is not null then
    return jsonb_build_object('status', 'invalid', 'reason', 'session_column: ' || v_bad);
  end if;
  begin
    perform jsonb_populate_record(null::public.uno_sessions, p_session_row);
  exception when others then
    return jsonb_build_object('status', 'invalid', 'reason', 'session_value');
  end;

  for v_elem in select * from jsonb_array_elements(p_hand_rows) loop
    if jsonb_typeof(v_elem) <> 'object'
       or jsonb_typeof(v_elem->'player_id') is distinct from 'string'
       or (v_elem->>'player_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or exists (select 1 from jsonb_object_keys(v_elem) k where k not in ('player_id', 'cards', 'player_order'))
       or jsonb_typeof(v_elem->'cards') is distinct from 'array'
       or jsonb_typeof(v_elem->'player_order') is distinct from 'number'
       or (v_elem->>'player_order') !~ '^[0-9]{1,9}$'
       or not exists (
         select 1 from public.players p where p.id = (v_elem->>'player_id')::uuid and p.game_id = v_id
       ) then
      return jsonb_build_object('status', 'invalid', 'reason', 'hand_row');
    end if;
  end loop;
  if (select count(distinct (e->>'player_id')::uuid) from jsonb_array_elements(p_hand_rows) e) <> jsonb_array_length(p_hand_rows) then
    return jsonb_build_object('status', 'invalid', 'reason', 'hand_row_duplicate');
  end if;

  -- Every seat in turn_order is dealt a hand and vice versa, each exactly once (a round must never start on a seat with
  -- no hand, nor deal a hand to a seat that has no turn).
  if array_ndims((jsonb_populate_record(null::public.uno_sessions, p_session_row)).turn_order) > 1 then
    return jsonb_build_object('status', 'invalid', 'reason', 'turn_order_dimensions');
  end if;
  select array_agg(t order by t) into v_turn
    from unnest((jsonb_populate_record(null::public.uno_sessions, p_session_row)).turn_order) t;
  select array_agg(sid order by sid) into v_dealt
    from (select (e->>'player_id')::uuid as sid from jsonb_array_elements(p_hand_rows) e) d;
  if v_turn is null or v_turn is distinct from v_dealt then
    return jsonb_build_object('status', 'invalid', 'reason', 'turn_order_mismatch');
  end if;

  -- the previous deal (a finished result of a reopened lobby, or an orphan) goes; the games lock is held, so no start
  -- or leave can interleave with this replacement.
  delete from public.uno_player_hands where game_id = v_id;
  delete from public.uno_sessions where game_id = v_id;

  select string_agg(quote_ident(k), ', ') into v_cols from jsonb_object_keys(p_session_row) as k;
  execute format(
    'insert into public.uno_sessions (game_id, %1$s) select $2, %1$s from jsonb_populate_record(null::public.uno_sessions, $1)',
    v_cols
  ) using p_session_row, v_id;
  insert into public.uno_player_hands (game_id, player_id, cards, player_order)
    select v_id, (e->>'player_id')::uuid, e->'cards', (e->>'player_order')::integer
    from jsonb_array_elements(p_hand_rows) e;

  update public.games
    set status = 'active',
        session_started_at = now(),
        current_round_number = 1,
        rounds_count = 1,
        replay_pending = false
    where id = v_id and status = 'waiting';
  if not found then
    raise exception 'start_uno_game: game % could not be activated', v_id;
  end if;

  return jsonb_build_object('status', 'started');
end;
$$;

revoke execute on function public.start_uno_game(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.start_uno_game(text, jsonb, jsonb) to service_role;
