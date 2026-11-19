-- Matching Pairs: repeatable test for the duplicate cleanup in
-- supabase/migrations/20261202500000_matching_pairs_atomic_flip.sql.
--
-- Run from the REPOSITORY ROOT against a fully migrated local database (the \i below is relative):
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/matching-pairs-dedupe.sql
-- Everything happens in one transaction that is ROLLED BACK at the end, so the database is left
-- as it was found. Exit code 0 = pass; any failed assertion raises and exits non-zero.
--
-- The migration adds a unique index that makes a duplicate matched pair impossible, so the test
-- first drops that index (inside the transaction) to be able to build histories that contain
-- duplicates, then re-applies the migration file itself and asserts what it did.
--
-- Cases (grid size 4):
--   P1  active round, A, A-duplicate, B, miss, C: finished only because the duplicate was counted
--       -> counters recounted, REOPENED (finished/rank/finished_at cleared), score replay correct
--   P2  active round, clean history, finished        -> completely untouched
--   P3  FINISHED round, duplicate                    -> counters recounted, finish state + rank KEPT
--   P4  active round, STALE stored pairs_matched (3) that equals the retained count but the grid is 4
--       -> still incomplete -> REOPENED
--   P5  active round, 5 matches incl. a duplicate that still covers all 4 pairs
--       -> completed grid -> stays finished, rank kept
-- A rerun of the migration must change nothing.

begin;

drop index if exists public.uq_memory_match_submissions_matched_pair;

insert into public.games (id, title, host_token, game_type, status)
values ('MPDEDUP', 'matching pairs dedupe test', 'host-mpdedup', 'matching_pairs', 'active');

insert into public.players (id, game_id, name) values
  ('00000000-0000-0000-0000-00000000d001', 'MPDEDUP', 'P1'),
  ('00000000-0000-0000-0000-00000000d002', 'MPDEDUP', 'P2'),
  ('00000000-0000-0000-0000-00000000d003', 'MPDEDUP', 'P3'),
  ('00000000-0000-0000-0000-00000000d004', 'MPDEDUP', 'P4'),
  ('00000000-0000-0000-0000-00000000d005', 'MPDEDUP', 'P5');

insert into public.rounds (id, game_id, round_number, status, memory_match_metadata) values
  ('00000000-0000-0000-0000-00000000e001', 'MPDEDUP', 1, 'active',   '{"gridSizePairs":4,"pairs":[],"playerBoards":[]}'),
  ('00000000-0000-0000-0000-00000000e002', 'MPDEDUP', 2, 'finished', '{"gridSizePairs":4,"pairs":[],"playerBoards":[]}');

create function pg_temp.flip(p int, r int, pair int, m boolean, t int) returns void language sql as $$
  insert into public.memory_match_submissions (game_id, round_id, player_id, pair_index, is_match, submitted_at)
  values ('MPDEDUP',
          ('00000000-0000-0000-0000-00000000e00' || r)::uuid,
          ('00000000-0000-0000-0000-00000000d00' || p)::uuid,
          pair, m, timestamptz '2026-01-01 00:00:00+00' + t * interval '1 second')
$$;

create function pg_temp.prog(p int, r int, pm int, wa int, fin boolean, rk int) returns void language sql as $$
  insert into public.memory_match_progress (game_id, round_id, player_id, pairs_matched, wrong_attempts, finished, finish_rank, finished_at)
  values ('MPDEDUP',
          ('00000000-0000-0000-0000-00000000e00' || r)::uuid,
          ('00000000-0000-0000-0000-00000000d00' || p)::uuid,
          pm, wa, fin, rk, case when fin then timestamptz '2026-01-01 01:00:00+00' end)
$$;

-- P1
select pg_temp.flip(1,1,0,true,1), pg_temp.flip(1,1,0,true,2), pg_temp.flip(1,1,1,true,3),
       pg_temp.flip(1,1,2,false,4), pg_temp.flip(1,1,2,true,5);
select pg_temp.prog(1,1,4,1,true,1);
-- P2
select pg_temp.flip(2,1,0,true,1), pg_temp.flip(2,1,1,true,2), pg_temp.flip(2,1,2,true,3), pg_temp.flip(2,1,3,true,4);
select pg_temp.prog(2,1,4,0,true,2);
-- P3 (finished round)
select pg_temp.flip(3,2,0,true,1), pg_temp.flip(3,2,0,true,2), pg_temp.flip(3,2,1,true,3), pg_temp.flip(3,2,2,true,4);
select pg_temp.prog(3,2,4,0,true,1);
-- P4 (stale stored count 3 == retained 3, grid 4)
select pg_temp.flip(4,1,0,true,1), pg_temp.flip(4,1,0,true,2), pg_temp.flip(4,1,1,true,3), pg_temp.flip(4,1,2,true,4);
select pg_temp.prog(4,1,3,0,true,3);
-- P5 (duplicate that still covers every grid pair)
select pg_temp.flip(5,1,0,true,1), pg_temp.flip(5,1,1,true,2), pg_temp.flip(5,1,2,true,3),
       pg_temp.flip(5,1,3,true,4), pg_temp.flip(5,1,3,true,5);
select pg_temp.prog(5,1,5,0,true,4);

-- Apply the real migration file.
\i supabase/migrations/20261202500000_matching_pairs_atomic_flip.sql

create function pg_temp.progress_is(p int, pm int, wa int, fin boolean, rk int) returns void language plpgsql as $$
declare v record;
begin
  select * into v from public.memory_match_progress
   where game_id = 'MPDEDUP' and player_id = ('00000000-0000-0000-0000-00000000d00' || p)::uuid;
  if v.pairs_matched is distinct from pm or v.wrong_attempts is distinct from wa
     or v.finished is distinct from fin or v.finish_rank is distinct from rk
     or (fin and v.finished_at is null) or (not fin and v.finished_at is not null) then
    raise exception 'P%: expected pairs_matched=% wrong_attempts=% finished=% finish_rank=% (finished_at set iff finished), got % % % % (finished_at=%)',
      p, pm, wa, fin, rk, v.pairs_matched, v.wrong_attempts, v.finished, v.finish_rank, v.finished_at;
  end if;
end $$;

create function pg_temp.assert_state() returns void language plpgsql as $$
declare v_replay text;
begin
  -- P1 reopened, P2 untouched, P3 finish kept, P4 reopened (stale count), P5 stays finished
  perform pg_temp.progress_is(1, 3, 1, false, null);
  perform pg_temp.progress_is(2, 4, 0, true, 2);
  perform pg_temp.progress_is(3, 3, 0, true, 1);
  perform pg_temp.progress_is(4, 3, 0, false, null);
  perform pg_temp.progress_is(5, 4, 0, true, 4);

  -- no duplicate matched pair is left anywhere in the fixture game
  if exists (
    select 1 from public.memory_match_submissions
     where game_id = 'MPDEDUP' and is_match
     group by round_id, player_id, pair_index having count(*) > 1
  ) then
    raise exception 'duplicate matched pairs remain after the migration';
  end if;

  -- P1's score replay: streak|bonus|points per retained row, in submitted_at order
  select string_agg(streak_at_time || '|' || streak_bonus || '|' || points_after, ' ' order by submitted_at, id)
    into v_replay
    from public.memory_match_submissions
   where game_id = 'MPDEDUP' and player_id = '00000000-0000-0000-0000-00000000d001';
  if v_replay is distinct from '1|0|1000 2|0|2000 0|0|1900 1|0|2900' then
    raise exception 'P1 score replay wrong: %', v_replay;
  end if;

  -- P2 (clean history) kept the default zero stored scores it was inserted with
  if exists (
    select 1 from public.memory_match_submissions
     where game_id = 'MPDEDUP' and player_id = '00000000-0000-0000-0000-00000000d002'
       and (streak_at_time <> 0 or streak_bonus <> 0 or points_after <> 0)
  ) then
    raise exception 'P2 (no duplicate) scores were changed';
  end if;

  -- the unique index exists again
  if not exists (select 1 from pg_indexes where schemaname = 'public'
                  and indexname = 'uq_memory_match_submissions_matched_pair') then
    raise exception 'unique index uq_memory_match_submissions_matched_pair is missing';
  end if;
end $$;

select pg_temp.assert_state();

-- The migration must be a no-op when run again.
\i supabase/migrations/20261202500000_matching_pairs_atomic_flip.sql
select pg_temp.assert_state();

\echo 'matching-pairs-dedupe: OK'
rollback;
