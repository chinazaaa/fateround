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
--   * session already `finished`  -> `already_finished`. Nothing is re-ranked, no hand is rewritten, no series
--     points are awarded; the only thing completed is the games-row flip (idempotent: it only moves a game that
--     is still waiting/active), plus the leaver's row removal when one was requested. This is the repair path for
--     a finish whose games flip failed.
--   * `updated_at` differs from the caller's expected value -> `lost` (the compare-and-swap, now inside the
--     function: a stale caller changes nothing).
--   * otherwise, atomically: the session patch (+ phase finished, turn_deadline_at null), the final hand rows /
--     stats, the series points (added in SQL, only while scoring is on and no series winner exists), the
--     spectator flags, the optional removal of a leaver's hand + player rows, and the games-row flip (status
--     finished, finished_at, and the durable finish_bookkeeping marker owed by exactly this finish, the same
--     tracked mechanism game-finish.ts / settle_host_leave use) -> `finished`.
--   * a malformed payload (non-object patch, unknown / protected column, malformed hand or series entry) ->
--     `invalid` with a `reason`, nothing written.
-- jsonb outcome: { status: finished | already_finished | lost | invalid, games_flipped: bool, finished_at?, reason? }
--
-- Execute is revoked from public / anon / authenticated and granted to service_role only (the API routes call it
-- with the service role). NULL arguments for the required parameters raise.
--
-- Additive: one new function, nothing existing is altered.

create or replace function public.finish_uno_session(
  p_game_id text,
  p_expected_updated_at timestamptz,
  p_session_patch jsonb,
  p_hand_writes jsonb,
  p_series jsonb default null,
  p_spectator_ids uuid[] default null,
  p_remove_player_id uuid default null
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

  -- Already finished: never re-rank / re-award / rewrite. Only complete the games flip (and the leaver's removal).
  if v_session.phase = 'finished' then
    update public.games
      set status = 'finished',
          finished_at = v_now,
          finish_bookkeeping = jsonb_build_object('finished_at', v_now, 'attempts', 0)
      where id = v_id and status in ('waiting', 'active');
    v_flipped := found;
    if p_remove_player_id is not null then
      delete from public.players where id = p_remove_player_id and game_id = v_id;
    end if;
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

  for v_elem in select * from jsonb_array_elements(p_hand_writes) loop
    if jsonb_typeof(v_elem) <> 'object'
       or not (v_elem ? 'player_id')
       or (v_elem->>'player_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or exists (select 1 from jsonb_object_keys(v_elem) k where k not in ('player_id', 'cards', 'stats'))
       or (v_elem ? 'cards' and jsonb_typeof(v_elem->'cards') <> 'array')
       or (v_elem ? 'stats' and jsonb_typeof(v_elem->'stats') <> 'object') then
      return jsonb_build_object('status', 'invalid', 'reason', 'hand_write', 'games_flipped', false);
    end if;
  end loop;

  if p_series is not null then
    if jsonb_typeof(p_series) <> 'object'
       or coalesce(p_series->>'winner_id', '') = ''
       or (p_series->>'points') is null
       or (p_series->>'points') !~ '^[0-9]+$' then
      return jsonb_build_object('status', 'invalid', 'reason', 'series', 'games_flipped', false);
    end if;
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

revoke execute on function public.finish_uno_session(text, timestamptz, jsonb, jsonb, jsonb, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.finish_uno_session(text, timestamptz, jsonb, jsonb, jsonb, uuid[], uuid) to service_role;
