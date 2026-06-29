-- Lock the tournament roster once it starts: players can only join while the
-- tournament is still 'waiting'. After the host starts the first game (status
-- 'active') or it finishes, new joins are rejected. Keeps the field fair —
-- everyone plays from game 1 on equal footing (and, in lives mode, nobody joins
-- mid-run with full lives while others are depleted).
create or replace function join_tournament(p_tournament_id text, p_player_name text)
returns jsonb language plpgsql as $$
declare
  v_status text;
  v_max integer;
  v_elim jsonb;
  v_count integer;
  v_existing tournament_players%rowtype;
  v_lives integer;
  v_player tournament_players%rowtype;
begin
  select status, max_players, elimination_config into v_status, v_max, v_elim
    from tournaments where id = p_tournament_id for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if v_status <> 'waiting' then
    return jsonb_build_object('error', case when v_status = 'finished' then 'ended' else 'started' end);
  end if;

  select * into v_existing from tournament_players
    where tournament_id = p_tournament_id and lower(player_name) = lower(p_player_name) limit 1;
  if found then
    if v_existing.is_eliminated then return jsonb_build_object('error', 'eliminated'); end if;
    return jsonb_build_object('error', 'name_taken');
  end if;

  if v_max is not null then
    select count(*) into v_count from tournament_players where tournament_id = p_tournament_id;
    if v_count >= v_max then return jsonb_build_object('error', 'full'); end if;
  end if;

  v_lives := case when v_elim ->> 'mode' = 'lives' then (v_elim ->> 'startingLives')::int else null end;

  insert into tournament_players (tournament_id, player_name, lives_remaining)
    values (p_tournament_id, p_player_name, v_lives) returning * into v_player;

  return jsonb_build_object('player', to_jsonb(v_player));
end; $$;

grant execute on function join_tournament(text, text) to anon, authenticated, service_role;
