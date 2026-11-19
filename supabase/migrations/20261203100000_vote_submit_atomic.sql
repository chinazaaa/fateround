-- Votes: check the round and save the vote in ONE transaction, serialised with end-round.
--
-- POST /api/votes read the round's status in one request and upserted the vote in another, while
-- POST /api/games/[code]/end-round flipped the round to finished in a third. A vote that read the
-- round as active and wrote after end-round committed was counted as if the round were still open:
-- it could overwrite a vote already tallied (a Who Said This resend replaced the stored points, the
-- first-correct flag and the speed bonus after the answer was revealed) or land after results were
-- computed. This function locks the round row FOR SHARE, so any number of votes run together but the
-- UPDATE that finishes the round waits for them, and a vote that arrives while the round is being
-- finished waits for that UPDATE and then sees the round as finished.
--
-- Rules once the round is not active (decided under the lock, with the caller's clock p_now so the
-- comparison uses the same clock that stamped rounds.ended_at):
--   * p_grace_ms is null (the game type gets no grace, e.g. Who Said This): the vote is refused.
--   * finished within p_grace_ms of ended_at: a MISSING vote is saved (timer auto-vote racing the
--     host); an existing vote is kept untouched and 'kept_existing' is returned.
--   * anything else: refused with 'round_not_active'.
-- While the round is active the vote replaces the player's earlier one, as before.
create or replace function public.submit_vote_atomic(
  p_game_id text,
  p_round_id uuid,
  p_player_id uuid,
  p_row jsonb,
  p_grace_ms integer,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_game_id text := upper(p_game_id);
  v_game_status text;
  v_round_status text;
  v_ended_at timestamptz;
  v_closed boolean := false;
  v_inserted integer;
begin
  -- FOR SHARE conflicts with the UPDATE that finishes a game, so a vote and game completion serialise.
  select status into v_game_status from public.games where id = v_game_id for share;
  if v_game_status is distinct from 'active' then
    return jsonb_build_object('status', 'game_not_active');
  end if;

  select status, ended_at into v_round_status, v_ended_at
  from public.rounds
  where id = p_round_id and game_id = v_game_id
  for share;
  if not found then
    return jsonb_build_object('status', 'round_not_found');
  end if;

  if v_round_status is distinct from 'active' then
    if p_grace_ms is null
       or v_round_status is distinct from 'finished'
       or v_ended_at is null
       or p_now - v_ended_at > make_interval(secs => p_grace_ms / 1000.0) then
      return jsonb_build_object('status', 'round_not_active');
    end if;
    v_closed := true;
  end if;

  if v_closed then
    insert into public.votes (
      player_id, round_id, game_id,
      kiss_participant_id, marry_participant_id, kill_participant_id,
      pair_assignments, wyr_choice, target_player_id, target_participant_id,
      anime_choice, response_ms, points, picked_number
    ) values (
      p_player_id, p_round_id, v_game_id,
      nullif(p_row->>'kiss_participant_id', '')::uuid,
      nullif(p_row->>'marry_participant_id', '')::uuid,
      nullif(p_row->>'kill_participant_id', '')::uuid,
      case when jsonb_typeof(p_row->'pair_assignments') = 'object' then p_row->'pair_assignments' end,
      nullif(p_row->>'wyr_choice', ''),
      nullif(p_row->>'target_player_id', '')::uuid,
      nullif(p_row->>'target_participant_id', '')::uuid,
      nullif(p_row->>'anime_choice', ''),
      nullif(p_row->>'response_ms', '')::integer,
      nullif(p_row->>'points', '')::integer,
      nullif(p_row->>'picked_number', '')::integer
    )
    on conflict (player_id, round_id) do nothing;
    get diagnostics v_inserted = row_count;
    return jsonb_build_object('status', case when v_inserted = 1 then 'ok' else 'kept_existing' end, 'closed', true);
  end if;

  insert into public.votes (
    player_id, round_id, game_id,
    kiss_participant_id, marry_participant_id, kill_participant_id,
    pair_assignments, wyr_choice, target_player_id, target_participant_id,
    anime_choice, response_ms, points, picked_number
  ) values (
    p_player_id, p_round_id, v_game_id,
    nullif(p_row->>'kiss_participant_id', '')::uuid,
    nullif(p_row->>'marry_participant_id', '')::uuid,
    nullif(p_row->>'kill_participant_id', '')::uuid,
    case when jsonb_typeof(p_row->'pair_assignments') = 'object' then p_row->'pair_assignments' end,
    nullif(p_row->>'wyr_choice', ''),
    nullif(p_row->>'target_player_id', '')::uuid,
    nullif(p_row->>'target_participant_id', '')::uuid,
    nullif(p_row->>'anime_choice', ''),
    nullif(p_row->>'response_ms', '')::integer,
    nullif(p_row->>'points', '')::integer,
    nullif(p_row->>'picked_number', '')::integer
  )
  on conflict (player_id, round_id) do update set
    kiss_participant_id = excluded.kiss_participant_id,
    marry_participant_id = excluded.marry_participant_id,
    kill_participant_id = excluded.kill_participant_id,
    pair_assignments = excluded.pair_assignments,
    wyr_choice = excluded.wyr_choice,
    target_player_id = excluded.target_player_id,
    target_participant_id = excluded.target_participant_id,
    anime_choice = excluded.anime_choice,
    response_ms = excluded.response_ms,
    points = excluded.points,
    picked_number = excluded.picked_number;

  return jsonb_build_object('status', 'ok', 'closed', false);
end;
$$;

-- SECURITY DEFINER functions in `public` are callable by PUBLIC by default (inherited by anon and
-- authenticated). This writes votes for any player, so only the service role may call it.
revoke execute on function public.submit_vote_atomic(text, uuid, uuid, jsonb, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.submit_vote_atomic(text, uuid, uuid, jsonb, integer, timestamptz) to service_role;
