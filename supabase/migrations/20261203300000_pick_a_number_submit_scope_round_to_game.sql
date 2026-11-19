-- Pick a Number: bind the round lock to the game the caller named.
--
-- pick_a_number_submit checked that game p_game_id is active, then locked and updated the round
-- by p_round_id alone. Nothing required that round to belong to that game, so a request that named
-- an active game and a round of ANOTHER game would reveal that other round's question and write a
-- vote for it. Scope the round lookup to the game so a mismatched pair is rejected before any write.
--
-- CREATE OR REPLACE keeps the function's existing privileges (service_role only), so no grant
-- changes are made here. Additive and idempotent; no drops.
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

  select id, status into v_locked, v_status
  from public.rounds
  where id = p_round_id and game_id = upper(p_game_id)
  for update;
  if v_locked is null then
    raise exception 'pick_a_number_submit: round % not found in game %', p_round_id, p_game_id;
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
    p_player_id, p_round_id, upper(p_game_id),
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
