-- Pick a Number: reveal the question and save the picker's vote in ONE transaction.
--
-- The route used to read the existing pick, update rounds.mlt_question, then upsert the votes row,
-- with a best-effort rollback if the upsert failed. That rollback could itself fail, and two
-- concurrent requests could both pass the existing-pick check so a loser's restore cleared the
-- winner's question. This function locks the round row (concurrent picks serialise on it), checks
-- the picker's existing pick, and only then reveals + saves, all inside one implicit transaction.
create or replace function public.pick_a_number_submit(
  p_game_id text,
  p_round_id uuid,
  p_player_id uuid,
  p_picked_number integer,
  p_question text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_locked uuid;
  v_status text;
  v_game_status text;
  v_existing integer;
begin
  -- FOR SHARE conflicts with the UPDATE that finishes a game, so a pick and game completion
  -- serialise: either the game is already finished here, or completion waits for this pick.
  select status into v_game_status from public.games where id = upper(p_game_id) for share;
  if v_game_status is distinct from 'active' then
    return jsonb_build_object('status', 'game_not_active');
  end if;

  select id, status into v_locked, v_status from public.rounds where id = p_round_id for update;
  if v_locked is null then
    raise exception 'pick_a_number_submit: round % not found', p_round_id;
  end if;

  -- The route checks this too, but the round can end between that check and this lock.
  if v_status is distinct from 'active' then
    return jsonb_build_object('status', 'round_not_active');
  end if;

  select picked_number into v_existing
  from public.votes
  where round_id = p_round_id and player_id = p_player_id;

  if v_existing is not null then
    return jsonb_build_object('status', 'already_picked', 'picked_number', v_existing);
  end if;

  update public.rounds set mlt_question = p_question where id = p_round_id;

  insert into public.votes (
    player_id, round_id, game_id,
    kiss_participant_id, marry_participant_id, kill_participant_id,
    pair_assignments, wyr_choice, target_player_id, target_participant_id, picked_number
  ) values (
    p_player_id, p_round_id, p_game_id,
    null, null, null,
    null, null, null, null, p_picked_number
  )
  on conflict (player_id, round_id) do update set
    kiss_participant_id = null,
    marry_participant_id = null,
    kill_participant_id = null,
    pair_assignments = null,
    wyr_choice = null,
    target_player_id = null,
    target_participant_id = null,
    picked_number = excluded.picked_number;

  return jsonb_build_object('status', 'ok', 'picked_number', p_picked_number);
end;
$$;

-- SECURITY DEFINER functions in `public` are callable by PUBLIC by default (inherited by anon and
-- authenticated). This writes rounds and votes, so only the service role may call it.
revoke execute on function public.pick_a_number_submit(text, uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.pick_a_number_submit(text, uuid, uuid, integer, text) to service_role;
