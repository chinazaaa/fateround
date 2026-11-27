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
--   * session already `finished` -> `already_finished`. Nothing is re-tallied or rewritten; only the games-row flip
--     is completed (idempotent: it only moves a game that is still waiting/active), plus the leaver's row removal
--     when one was requested. This is the repair path for a finish whose games flip failed.
--   * `updated_at` differs from the caller's expected value -> `lost` (the compare-and-swap, now inside the
--     function). The caller can tell "someone else finished it" (a re-read shows finished) from "a play moved the
--     session and the round is still running".
--   * otherwise, atomically: the session patch (+ phase finished, turn_deadline_at / turn_started_at null), the
--     player state writes (final scores, the mover's rack / clock / stats), the optional removal of a leaver's
--     state + player rows, and the games-row flip (status finished, finished_at, and the durable
--     finish_bookkeeping marker owed by exactly this finish) -> `finished`.
--   * a malformed payload -> `invalid` with a `reason`, nothing written.
-- jsonb outcome: { status: finished | already_finished | lost | invalid, games_flipped: bool, finished_at?, reason? }
--
-- Execute is revoked from public / anon / authenticated and granted to service_role only. NULL arguments for the
-- required parameters raise.
--
-- Additive: one new function, nothing existing is altered.

create or replace function public.finish_scrabble_session(
  p_game_id text,
  p_expected_updated_at timestamptz,
  p_session_patch jsonb,
  p_state_writes jsonb,
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

  -- Already finished: never re-tally / rewrite. Only complete the games flip (and the leaver's removal).
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

  for v_elem in select * from jsonb_array_elements(p_state_writes) loop
    if jsonb_typeof(v_elem) <> 'object'
       or not (v_elem ? 'player_id')
       or (v_elem->>'player_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or exists (
         select 1 from jsonb_object_keys(v_elem) k
         where k not in ('player_id', 'score', 'rack', 'clock_ms_remaining', 'timed_out', 'stats')
       )
       or (v_elem ? 'score' and (jsonb_typeof(v_elem->'score') <> 'number'))
       or (v_elem ? 'rack' and jsonb_typeof(v_elem->'rack') <> 'array')
       or (v_elem ? 'clock_ms_remaining' and jsonb_typeof(v_elem->'clock_ms_remaining') not in ('number', 'null'))
       or (v_elem ? 'timed_out' and jsonb_typeof(v_elem->'timed_out') <> 'boolean')
       or (v_elem ? 'stats' and jsonb_typeof(v_elem->'stats') <> 'object') then
      return jsonb_build_object('status', 'invalid', 'reason', 'state_write', 'games_flipped', false);
    end if;
  end loop;

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

revoke execute on function public.finish_scrabble_session(text, timestamptz, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.finish_scrabble_session(text, timestamptz, jsonb, jsonb, uuid) to service_role;
