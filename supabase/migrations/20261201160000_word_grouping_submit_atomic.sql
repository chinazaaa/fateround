-- Word Grouping: admit a guess (check the limits, then store it) in ONE transaction.
--
-- The route used to read the player's guesses, insert the new one, then re-rank and delete the
-- insert if it landed past the mistake limit. Concurrent wrong guesses could still both rank
-- inside the limit (submitted_at follows transaction start, not commit order), the rank query and
-- the cleanup delete ignored their errors, and the "player is done" check used the pre-insert
-- count, so the last admitted guess might never finish the game.
--
-- This function serialises one player's guesses on an advisory lock, counts, inserts and returns
-- the post-insert counts, so a rejected guess is never stored and completion is derived from the
-- committed result.
create or replace function public.word_grouping_submit(
  p_game_id text,
  p_round_id uuid,
  p_player_id uuid,
  p_group_index integer,
  p_difficulty integer,
  p_guess_words jsonb,
  p_is_correct boolean,
  p_max_mistakes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_game_status text;
  v_correct integer;
  v_mistakes integer;
begin
  -- FOR SHARE conflicts with the UPDATE that finishes a game, so a guess and game completion
  -- serialise: either the game is already finished here, or completion waits for this guess.
  select status into v_game_status from public.games where id = upper(p_game_id) for share;
  if v_game_status is distinct from 'active' then
    return jsonb_build_object('status', 'game_not_active');
  end if;

  -- One player's guesses in one round go through here one at a time. Different players do not
  -- block each other.
  perform pg_advisory_xact_lock(hashtextextended('word_grouping_submit:' || p_round_id::text || ':' || p_player_id::text, 0));

  select
    count(*) filter (where is_correct),
    count(*) filter (where not is_correct)
  into v_correct, v_mistakes
  from public.word_grouping_submissions
  where round_id = p_round_id and player_id = p_player_id;

  if v_mistakes >= p_max_mistakes then
    return jsonb_build_object('status', 'out_of_guesses', 'correct_count', v_correct, 'mistake_count', v_mistakes);
  end if;

  if p_is_correct and exists (
    select 1 from public.word_grouping_submissions
    where round_id = p_round_id and player_id = p_player_id and is_correct and group_index = p_group_index
  ) then
    return jsonb_build_object('status', 'already_solved', 'correct_count', v_correct, 'mistake_count', v_mistakes);
  end if;

  if p_is_correct then
    v_correct := v_correct + 1;
  else
    v_mistakes := v_mistakes + 1;
  end if;

  insert into public.word_grouping_submissions (
    game_id, round_id, player_id, group_index, difficulty, guess_words, is_correct, mistakes_at_time
  ) values (
    upper(p_game_id), p_round_id, p_player_id, p_group_index, p_difficulty, p_guess_words, p_is_correct, v_mistakes
  );

  return jsonb_build_object('status', 'ok', 'correct_count', v_correct, 'mistake_count', v_mistakes);
end;
$$;

-- SECURITY DEFINER functions in `public` are callable by PUBLIC by default (inherited by anon and
-- authenticated). This writes word_grouping_submissions, so only the service role may call it.
revoke execute on function public.word_grouping_submit(text, uuid, uuid, integer, integer, jsonb, boolean, integer) from public, anon, authenticated;
grant execute on function public.word_grouping_submit(text, uuid, uuid, integer, integer, jsonb, boolean, integer) to service_role;
