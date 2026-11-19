-- Matching Pairs: repeatable test for public.matching_pairs_record_flip_checked()
-- (supabase/migrations/20261202900000_matching_pairs_record_flip_checked.sql).
--
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/matching-pairs-record-flip-checked.sql
-- One transaction, rolled back at the end. Any failed assertion raises and exits non-zero.
--
-- The function inserts a flip only if the caller's fingerprint of the player's history (row count + id of the
-- latest row) still matches, so a score computed before a cleanup / another instance's flip is never stored.
-- The blocking behaviour (a flip queues behind a running cleanup) needs two sessions and is covered by
-- src/app/api/matching-pairs/flip/route.stale-history.test.ts (route side) and by hand in the PR notes.

begin;

insert into public.games (id, title, host_token, game_type, status)
values ('MPCHK', 'matching pairs checked flip test', 'host-mpchk', 'matching_pairs', 'active');
insert into public.players (id, game_id, name)
values ('00000000-0000-0000-0000-00000000c001', 'MPCHK', 'P1');
insert into public.rounds (id, game_id, round_number, status, memory_match_metadata) values
  ('00000000-0000-0000-0000-00000000c0a1', 'MPCHK', 1, 'active',   '{"gridSizePairs":4,"pairs":[],"playerBoards":[]}'),
  ('00000000-0000-0000-0000-00000000c0a2', 'MPCHK', 2, 'finished', '{"gridSizePairs":4,"pairs":[],"playerBoards":[]}');
insert into public.memory_match_progress (game_id, round_id, player_id)
values ('MPCHK', '00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-00000000c001');

create function pg_temp.call(pair int, cnt int, last_id uuid, round_id uuid default '00000000-0000-0000-0000-00000000c0a1')
returns text language sql as $$
  select (public.matching_pairs_record_flip_checked(
    'MPCHK', round_id, '00000000-0000-0000-0000-00000000c001', pair, true, 1, 0, 1000, cnt, last_id
  ))->>'status'
$$;

create function pg_temp.last_id() returns uuid language sql as $$
  select id from public.memory_match_submissions
  where player_id = '00000000-0000-0000-0000-00000000c001' and round_id = '00000000-0000-0000-0000-00000000c0a1'
  order by submitted_at desc, id desc limit 1
$$;

create function pg_temp.cnt() returns int language sql as $$
  select count(*)::int from public.memory_match_submissions
  where player_id = '00000000-0000-0000-0000-00000000c001' and round_id = '00000000-0000-0000-0000-00000000c0a1'
$$;

do $$
declare
  v_old_id uuid;
begin
  -- Empty history: fingerprint (0, null).
  assert pg_temp.call(0, 1, null) = 'stale', 'wrong count must be stale';
  assert pg_temp.cnt() = 0, 'a stale call must not insert';
  assert pg_temp.call(0, 0, gen_random_uuid()) = 'stale', 'wrong last id must be stale';
  assert pg_temp.call(0, 0, null) = 'ok', 'matching empty fingerprint inserts';
  assert pg_temp.cnt() = 1;

  -- Fingerprint now (1, that row).
  v_old_id := pg_temp.last_id();
  assert pg_temp.call(1, 0, null) = 'stale', 'the old fingerprint is stale once a row was appended';
  assert pg_temp.call(0, 1, v_old_id) = 'already_matched', 'same pair again hits the unique index';
  assert pg_temp.call(1, 1, v_old_id) = 'ok';
  assert pg_temp.cnt() = 2;

  -- A cleanup that deletes a row changes the count: a caller that read before it is stale, even though the
  -- latest row is still the same.
  delete from public.memory_match_submissions where id = v_old_id;
  assert pg_temp.call(2, 2, pg_temp.last_id()) = 'stale', 'count changed by a delete must be stale';
  assert pg_temp.call(2, pg_temp.cnt(), pg_temp.last_id()) = 'ok';

  -- Closed round and finished player are rejected before the fingerprint is looked at.
  assert pg_temp.call(3, 0, null, '00000000-0000-0000-0000-00000000c0a2') = 'round_not_active';
  update public.memory_match_progress set finished = true
  where player_id = '00000000-0000-0000-0000-00000000c001';
  assert pg_temp.call(3, pg_temp.cnt(), pg_temp.last_id()) = 'round_not_active';
end
$$;

rollback;

\echo matching-pairs-record-flip-checked: OK
