-- Matching Pairs: record a flip only if the history its score was computed from is still the history.
--
-- The flip route reads a player's submissions, derives streak / streak_bonus / points_after from them in
-- application code and then inserts. Anything that changes that history in between makes the stored score
-- stale: the duplicate cleanup in 20261202500000 deletes rows and replays the scores of the histories it
-- touched, and a flip of the same player on another server instance appends a row. The first one is the
-- "known residual risk" PR #1295 left open; the second is the cross-instance race it listed as not fixed.
--
-- matching_pairs_record_flip_checked() makes the insert conditional on a fingerprint of the history the caller
-- scored: the number of the player's rows in the round and the id of the latest one. If the fingerprint no
-- longer matches it inserts nothing and answers 'stale'; the route re-reads and recomputes.
--
-- Locking. The check and the insert must see one consistent history, and must not read a state that the
-- cleanup is about to replace:
--   1. ROW EXCLUSIVE on memory_match_submissions first. A plain insert takes it anyway, flips do not block
--      each other on it, and it conflicts with the cleanup's SHARE ROW EXCLUSIVE, so a flip queues behind a
--      running cleanup and reads the cleaned history afterwards (READ COMMITTED: each statement sees what has
--      committed by then). It is taken BEFORE any row lock so it cannot deadlock with the cleanup, which holds
--      the table locks first and only then updates progress rows.
--   2. The round row FOR SHARE (the expiry route's UPDATE to 'finished' conflicts with it).
--   3. A transaction-level advisory lock on (round, player): one player's flips are serialised across server
--      instances, so the fingerprint cannot change between the check and the insert. It is the serialisation
--      point because it always exists, whereas the player's progress row does not for a player who joined or was
--      promoted mid-round (the start / next-round routes seed progress rows only for the roster at that moment),
--      and a FOR UPDATE on a missing row locks nothing. The cleanup takes no advisory locks, so the order
--      table lock -> advisory lock -> row locks cannot deadlock with it.
--   4. The player's progress row FOR UPDATE (when there is one), so the finish / expiry paths that update it
--      cannot interleave with this check.
--
-- The old matching_pairs_record_flip() is left in place so a server still running the previous route code keeps
-- working during a rolling deploy; nothing in the app calls it after this release and it can be dropped later.
-- No existing object is dropped or altered. The new function is revoked from public/anon/authenticated and
-- granted to service_role like the old one, so this migration contains a `revoke` (needs MOBILE_ROLLOUT_ACK).

create or replace function public.matching_pairs_record_flip_checked(
  p_game_id text,
  p_round_id uuid,
  p_player_id uuid,
  p_pair_index integer,
  p_is_match boolean,
  p_streak_at_time integer,
  p_streak_bonus integer,
  p_points_after integer,
  p_expected_count integer,
  p_expected_last_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round_status text;
  v_finished boolean;
  v_count integer;
  v_last_id uuid;
begin
  lock table public.memory_match_submissions in row exclusive mode;
  perform pg_advisory_xact_lock(hashtextextended('matching_pairs_flip:' || p_round_id::text || ':' || p_player_id::text, 0));

  select status into v_round_status from public.rounds where id = p_round_id for share;
  if v_round_status is distinct from 'active' then
    return jsonb_build_object('status', 'round_not_active');
  end if;

  select finished into v_finished
  from public.memory_match_progress
  where round_id = p_round_id and player_id = p_player_id
  for update;
  if coalesce(v_finished, false) then
    return jsonb_build_object('status', 'round_not_active');
  end if;

  select count(*) into v_count
  from public.memory_match_submissions
  where round_id = p_round_id and player_id = p_player_id;
  select id into v_last_id
  from public.memory_match_submissions
  where round_id = p_round_id and player_id = p_player_id
  order by submitted_at desc, id desc
  limit 1;
  if v_count is distinct from p_expected_count or v_last_id is distinct from p_expected_last_id then
    return jsonb_build_object('status', 'stale');
  end if;

  insert into public.memory_match_submissions (
    game_id, round_id, player_id, pair_index, is_match, streak_at_time, streak_bonus, points_after
  ) values (
    p_game_id, p_round_id, p_player_id, p_pair_index, p_is_match, p_streak_at_time, p_streak_bonus, p_points_after
  );

  return jsonb_build_object('status', 'ok');
exception
  when unique_violation then
    return jsonb_build_object('status', 'already_matched');
end;
$$;

revoke execute on function public.matching_pairs_record_flip_checked(text, uuid, uuid, integer, boolean, integer, integer, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.matching_pairs_record_flip_checked(text, uuid, uuid, integer, boolean, integer, integer, integer, integer, uuid) to service_role;
