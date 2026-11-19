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

-- Remove duplicate successful rows first so the index can be built, then rebuild the running score
-- of every history that lost a row. The earliest row of each (round_id, player_id, pair_index) is
-- kept; later ones were double-scored pairs. Everything below is ONE DO block, so it is a single
-- atomic unit whatever the migration runner does about transactions:
--   * the table is locked (SHARE ROW EXCLUSIVE: blocks writes, allows reads) before the cleanup and
--     held through the index build, so a flip cannot slip a new duplicate in between;
--   * a history that lost a row has its streak_at_time / streak_bonus / points_after replayed over
--     the retained rows in (submitted_at, id) order, with the same rules as the flip route
--     (src/app/api/matching-pairs/flip/route.ts): a match advances the streak and earns
--     MATCHING_PAIRS_POINTS_PER_PAIR (1000) plus MATCHING_PAIRS_STREAK_BONUS (500) when the new
--     streak is a multiple of 3; a miss resets the streak and costs MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY
--     (100); points never go below 0. Histories without a deleted row are left untouched;
--   * the player's memory_match_progress row is reconciled too. The flip route derives pairs_matched from
--     a COUNT of is_match rows (duplicates included) and marks a player finished once it reaches the grid
--     size, so a player who finished by counting a duplicate would otherwise stay finished with a pair
--     missing and get 409 on every later flip. pairs_matched / wrong_attempts are recounted from the
--     retained rows; if the player had been marked finished because of the removed row (their stored
--     pairs_matched exceeds the retained matches) and the round is still active, finished, finish_rank
--     and finished_at are cleared so they can continue and re-finish normally. Other players' ranks are
--     left as they are (policy: no re-ranking; the player is ranked again by matching_pairs_finish_player
--     when they finish). In a round that has already finished only the counters are recounted;
--   * locks are taken progress-first, then submissions: matching_pairs_record_flip() locks the progress row
--     and then inserts a submission, so taking them in the same order cannot deadlock with a flip.
-- Idempotent: once the index exists no duplicates can exist, so a rerun deletes and replays nothing.
do $$
declare
  v_hist record;
  v_row record;
  v_streak integer;
  v_bonus integer;
  v_points integer;
  v_matches integer;
  v_wrong integer;
begin
  lock table public.memory_match_progress in share row exclusive mode;
  lock table public.memory_match_submissions in share row exclusive mode;

  drop table if exists _mm_dedup_affected;
  create temp table _mm_dedup_affected on commit drop as
  with dup as (
    select id,
           row_number() over (
             partition by round_id, player_id, pair_index
             order by submitted_at, id
           ) as rn
    from public.memory_match_submissions
    where is_match
  ),
  removed as (
    delete from public.memory_match_submissions s
    using dup d
    where s.id = d.id and d.rn > 1
    returning s.round_id, s.player_id
  )
  select distinct round_id, player_id from removed;

  for v_hist in select round_id, player_id from _mm_dedup_affected loop
    v_streak := 0;
    v_points := 0;
    for v_row in
      select id, is_match
      from public.memory_match_submissions
      where round_id = v_hist.round_id and player_id = v_hist.player_id
      order by submitted_at, id
    loop
      if v_row.is_match then
        v_bonus := case when (v_streak + 1) % 3 = 0 then 500 else 0 end;
        v_streak := v_streak + 1;
        v_points := greatest(0, v_points + 1000 + v_bonus);
      else
        v_bonus := 0;
        v_streak := 0;
        v_points := greatest(0, v_points - 100);
      end if;
      update public.memory_match_submissions
         set streak_at_time = v_streak, streak_bonus = v_bonus, points_after = v_points
       where id = v_row.id;
    end loop;

    select count(*) filter (where is_match), count(*) filter (where not is_match)
      into v_matches, v_wrong
      from public.memory_match_submissions
     where round_id = v_hist.round_id and player_id = v_hist.player_id;

    -- Every right-hand side below reads the OLD row, so the "was finished because of a removed row"
    -- test sees the stored pairs_matched, not the recounted one.
    update public.memory_match_progress p
       set pairs_matched  = v_matches,
           wrong_attempts = v_wrong,
           finished       = case when p.finished and p.pairs_matched > v_matches
                                      and exists (select 1 from public.rounds r where r.id = p.round_id and r.status = 'active')
                                 then false else p.finished end,
           finish_rank    = case when p.finished and p.pairs_matched > v_matches
                                      and exists (select 1 from public.rounds r where r.id = p.round_id and r.status = 'active')
                                 then null else p.finish_rank end,
           finished_at    = case when p.finished and p.pairs_matched > v_matches
                                      and exists (select 1 from public.rounds r where r.id = p.round_id and r.status = 'active')
                                 then null else p.finished_at end,
           updated_at     = now()
     where p.round_id = v_hist.round_id and p.player_id = v_hist.player_id;
  end loop;

  create unique index if not exists uq_memory_match_submissions_matched_pair
    on public.memory_match_submissions (round_id, player_id, pair_index)
    where is_match;
end;
$$;

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
