-- Make the tournament player code short and readable (was a UUID), so it doubles as a
-- typeable "player code" the owner can read out or enter to continue on another device
-- — matching a normal game's resume code. Only future codes change; existing UUID
-- codes still verify (exact match), so tournaments in progress keep working and nobody
-- loses the code already saved on their device.

-- Unique per tournament so a (tournament, code) lookup resolves to exactly one player.
create unique index if not exists idx_tournament_player_tokens_unique
  on tournament_player_tokens (tournament_id, token);

-- Generate a short, readable code unique within a tournament. Charset drops the
-- confusable I/O/0/1 (same as the per-game resume_token); 8 chars keeps it easy to
-- read aloud while giving ~40 bits — plenty for a casual tournament seat.
create or replace function gen_tournament_player_token(p_tournament_id text)
returns text language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  attempts int := 0;
begin
  loop
    candidate := '';
    for i in 1..8 loop
      candidate := candidate || substr(chars, floor(random() * length(chars))::int + 1, 1);
    end loop;
    if not exists (
      select 1 from tournament_player_tokens
      where tournament_id = p_tournament_id and token = candidate
    ) then
      return candidate;
    end if;
    attempts := attempts + 1;
    if attempts > 30 then raise exception 'Could not generate tournament player token'; end if;
  end loop;
end; $$;

-- Re-declare the join so it mints the short code via the generator (was inline UUID).
create or replace function join_tournament(p_tournament_id text, p_player_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_max integer;
  v_elim jsonb;
  v_count integer;
  v_existing tournament_players%rowtype;
  v_lives integer;
  v_player tournament_players%rowtype;
  v_token text;
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

  v_token := gen_tournament_player_token(p_tournament_id);
  insert into tournament_player_tokens (player_id, tournament_id, token)
    values (v_player.id, p_tournament_id, v_token);

  return jsonb_build_object('player', to_jsonb(v_player), 'token', v_token);
end; $$;

grant execute on function join_tournament(text, text) to anon, authenticated, service_role;
