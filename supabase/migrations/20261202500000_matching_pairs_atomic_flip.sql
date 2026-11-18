-- Matching Pairs: make recording a flip atomic against round close and against duplicate pairs.
--
-- 1. The flip route checked rounds.status, awaited several queries and only then inserted, while
--    the expiry route closes a round (progress rows finished, then rounds.status = 'finished')
--    without the route's per-player lock. A late flip could land after the round closed.
--    matching_pairs_record_flip() takes FOR SHARE on the round row (an UPDATE of the round to
--    'finished' conflicts with it) and on the player's progress row (the expiry's progress UPDATE
--    conflicts with it), re-checks both, and inserts in the same transaction.
-- 2. The duplicate-pair lookup in the route and the insert were not atomic, and the route's
--    in-memory lock only covers one server instance. A partial unique index makes a second
--    successful insert for the same pair impossible.

-- Remove duplicate successful rows first so the index can be built. The earliest row of each
-- (round_id, player_id, pair_index) is kept; later ones were double-scored pairs. Idempotent: a
-- no-op once the index exists, since no duplicates can exist then.
delete from public.memory_match_submissions s
using (
  select id,
         row_number() over (
           partition by round_id, player_id, pair_index
           order by submitted_at, id
         ) as rn
  from public.memory_match_submissions
  where is_match
) d
where s.id = d.id and d.rn > 1;

create unique index if not exists uq_memory_match_submissions_matched_pair
  on public.memory_match_submissions (round_id, player_id, pair_index)
  where is_match;

create or replace function public.matching_pairs_record_flip(
  p_game_id text,
  p_round_id uuid,
  p_player_id uuid,
  p_pair_index integer,
  p_is_match boolean,
  p_streak_at_time integer,
  p_streak_bonus integer,
  p_points_after integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round_status text;
  v_finished boolean;
begin
  select status into v_round_status from public.rounds where id = p_round_id for share;
  if v_round_status is distinct from 'active' then
    return jsonb_build_object('status', 'round_not_active');
  end if;

  select finished into v_finished
  from public.memory_match_progress
  where round_id = p_round_id and player_id = p_player_id
  for share;
  if coalesce(v_finished, false) then
    return jsonb_build_object('status', 'round_not_active');
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

revoke execute on function public.matching_pairs_record_flip(text, uuid, uuid, integer, boolean, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.matching_pairs_record_flip(text, uuid, uuid, integer, boolean, integer, integer, integer) to service_role;
