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
       or (p_series->>'points') !~ '^[0-9]{1,9}$'
       or not exists (
         select 1 from public.uno_player_hands h where h.game_id = v_id and h.player_id::text = p_series->>'winner_id'
       ) then
      return jsonb_build_object('status', 'invalid', 'reason', 'series', 'games_flipped', false);
    end if;
  end if;

  -- A NULL element matches no player, so it is rejected by the same test.
  if p_spectator_ids is not null and exists (
       select 1 from unnest(p_spectator_ids) sid
       where not exists (select 1 from public.players p where p.id = sid and p.game_id = v_id)
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
    v_winner := p_series->>'winner_id';
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
  if p_spectator_ids is not null and array_position(p_spectator_ids, null) is not null then
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
