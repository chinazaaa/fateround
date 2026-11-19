-- Word Rush individual mode: admit a correct answer and award its points in ONE transaction.
--
-- The route used to (1) read the session, (2) write the answer row, (3) call word_rush_add_score
-- and ignore its error. Two problems:
--   * A request that read a playing round could pause while the expiry path closed the round, then
--     still record a correct answer (the write checked answer identity, not that the turn was open).
--   * If the answer committed but the score increment failed, the player got success without the
--     points and a retry could not recover (the stored answer was already correct).
--
-- This function locks the session row FOR SHARE (it conflicts with the UPDATE that closes the
-- round, so admission and closure serialise; concurrent submits do not block each other), checks
-- the turn is still open, writes the answer and adds the score. An error in the score step rolls
-- the answer back, so the caller can retry.
--
-- Returns 'recorded', 'round_closed' (turn/phase no longer open: nothing written) or
-- 'already_correct' (the player already has a correct answer this round: nothing written).
create or replace function public.word_rush_record_individual_answer(
  p_game_id text,
  p_player_id uuid,
  p_turn_index integer,
  p_prompt_index integer,
  p_round integer,
  p_team integer,
  p_start_letter text,
  p_end_letter text,
  p_text text,
  p_points integer
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phase text;
  v_status text;
  v_turn integer;
  v_prompt integer;
  v_rows integer;
begin
  select phase, status, turn_index, prompt_index into v_phase, v_status, v_turn, v_prompt
  from public.word_rush_sessions
  where game_id = p_game_id
  for share;

  if not found or v_status = 'finished' or v_phase is distinct from 'playing'
     or v_turn is distinct from p_turn_index or v_prompt is distinct from p_prompt_index then
    return 'round_closed';
  end if;

  -- Upgrade a previously stored wrong answer, otherwise insert; the unique index admits one row.
  update public.word_rush_answers
  set round = p_round, team = p_team, team_turn_index = null, prompt_index = p_prompt_index,
      start_letter = p_start_letter, end_letter = p_end_letter, text = p_text, correct = true
  where game_id = p_game_id and turn_index = p_turn_index and player_id = p_player_id
    and prompt_index = p_prompt_index and correct = false;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    insert into public.word_rush_answers (
      game_id, turn_index, round, team, team_turn_index, prompt_index,
      start_letter, end_letter, player_id, text, correct
    ) values (
      p_game_id, p_turn_index, p_round, p_team, null, p_prompt_index,
      p_start_letter, p_end_letter, p_player_id, p_text, true
    )
    on conflict (game_id, turn_index, player_id, prompt_index) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      return 'already_correct';
    end if;
  end if;

  -- Same transaction: if this fails the answer above is rolled back.
  update public.word_rush_players
  set score = score + p_points
  where game_id = p_game_id and player_id = p_player_id;

  return 'recorded';
end;
$$;

-- Writes answers and scores, so only the service role may call it.
revoke execute on function public.word_rush_record_individual_answer(text, uuid, integer, integer, integer, integer, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.word_rush_record_individual_answer(text, uuid, integer, integer, integer, integer, text, text, text, integer) to service_role;
