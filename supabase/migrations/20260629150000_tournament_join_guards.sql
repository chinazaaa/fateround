-- Enforce the same 2..100 cap range the app validates, at the DB level, so
-- direct writes can't persist 0, negatives, or oversized values.
alter table tournaments
  drop constraint if exists tournaments_max_players_range;
alter table tournaments
  add constraint tournaments_max_players_range
  check (max_players is null or (max_players between 2 and 100));

-- Atomic join: lock the tournament row, then check name + capacity and insert in
-- a single transaction so concurrent joins cannot exceed max_players. Returns a
-- jsonb result with either { error } or { player }.
create or replace function join_tournament(p_tournament_id text, p_player_name text)
returns jsonb
language plpgsql
as $$
declare
  v_status text;
  v_max integer;
  v_elim jsonb;
  v_count integer;
  v_existing tournament_players%rowtype;
  v_lives integer;
  v_player tournament_players%rowtype;
begin
  -- Lock the tournament row for the duration of the transaction.
  select status, max_players, elimination_config
    into v_status, v_max, v_elim
    from tournaments
    where id = p_tournament_id
    for update;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_status = 'finished' then
    return jsonb_build_object('error', 'ended');
  end if;

  select * into v_existing
    from tournament_players
    where tournament_id = p_tournament_id and lower(player_name) = lower(p_player_name)
    limit 1;
  if found then
    if v_existing.is_eliminated then
      return jsonb_build_object('error', 'eliminated');
    end if;
    return jsonb_build_object('error', 'name_taken');
  end if;

  if v_max is not null then
    select count(*) into v_count from tournament_players where tournament_id = p_tournament_id;
    if v_count >= v_max then
      return jsonb_build_object('error', 'full');
    end if;
  end if;

  v_lives := case when v_elim ->> 'mode' = 'lives' then (v_elim ->> 'startingLives')::int else null end;

  insert into tournament_players (tournament_id, player_name, lives_remaining)
    values (p_tournament_id, p_player_name, v_lives)
    returning * into v_player;

  return jsonb_build_object('player', to_jsonb(v_player));
end;
$$;

grant execute on function join_tournament(text, text) to anon, authenticated, service_role;
