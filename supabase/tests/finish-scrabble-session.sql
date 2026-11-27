-- Repeatable test for public.finish_scrabble_session() (supabase/migrations/20261204100000_finish_scrabble_session.sql).
--
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/finish-scrabble-session.sql
-- One transaction, rolled back at the end. Any failed assertion raises and exits non-zero. Run against a fully
-- migrated database.
--
-- Cases: a normal finish applies the session patch, the final scores / mover state and the games flip atomically;
-- a repeat is `already_finished`, rewrites nothing and only completes the games flip; a stale version is `lost`
-- and changes nothing; malformed payloads are `invalid` and change nothing; NULL arguments raise; privileges
-- (anon / authenticated denied, service_role allowed). The concurrent double finish is in finish-session-locks.sh.

begin;

create function pg_temp.assert_eq(label text, got anyelement, want anyelement) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL %: got %, want %', label, got, want;
  end if;
end $$;

create function pg_temp.pid(n int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-000000000' || lpad(n::text, 3, '0'))::uuid $$;

-- A live Scrabble game GS<n>: players n*10+1..3, a session, three player-state rows (scores 10 / 20 / 30).
create function pg_temp.mk(gid text, n int) returns timestamptz language plpgsql as $$
begin
  insert into public.games (id, title, host_token, game_type, status) values (gid, 'finish test', 'tok-' || gid, 'scrabble', 'active');
  insert into public.players (id, game_id, name) values
    (pg_temp.pid(n * 10 + 1), gid, 'A'), (pg_temp.pid(n * 10 + 2), gid, 'B'), (pg_temp.pid(n * 10 + 3), gid, 'C');
  insert into public.scrabble_sessions (game_id, turn_order, phase, status_message, turn_deadline_at, turn_started_at)
    values (gid, array[pg_temp.pid(n * 10 + 1), pg_temp.pid(n * 10 + 2), pg_temp.pid(n * 10 + 3)], 'playing', 'playing', now(), now());
  insert into public.scrabble_player_state (game_id, player_id, rack, score, player_order) values
    (gid, pg_temp.pid(n * 10 + 1), '["A","B"]', 10, 0), (gid, pg_temp.pid(n * 10 + 2), '["C"]', 20, 1),
    (gid, pg_temp.pid(n * 10 + 3), '[]', 30, 2);
  return (select updated_at from public.scrabble_sessions where game_id = gid);
end $$;

create function pg_temp.sid(gid text, n int, k int) returns uuid language sql as $$
  select id from public.scrabble_player_state where game_id = gid and player_id = pg_temp.pid(n * 10 + k) $$;

create function pg_temp.sess(gid text) returns public.scrabble_sessions language sql as $$ select * from public.scrabble_sessions where game_id = gid $$;
create function pg_temp.g(gid text) returns public.games language sql as $$ select * from public.games where id = gid $$;
create function pg_temp.st(gid text, n int, k int) returns public.scrabble_player_state language sql as $$
  select * from public.scrabble_player_state where game_id = gid and player_id = pg_temp.pid(n * 10 + k) $$;

-- 1. Normal finish.
do $$
declare
  v_v timestamptz := pg_temp.mk('GS1', 1);
  v_out jsonb;
begin
  v_out := public.finish_scrabble_session(
    'GS1', v_v,
    jsonb_build_object('winner_player_id', pg_temp.pid(13), 'is_tie', false, 'status_message', 'C wins', 'consecutive_passes', 6),
    jsonb_build_array(
      jsonb_build_object('player_id', pg_temp.pid(11), 'score', 5),
      jsonb_build_object('player_id', pg_temp.pid(12), 'score', 18, 'rack', '[]'::jsonb, 'clock_ms_remaining', 0, 'timed_out', true),
      jsonb_build_object('player_id', pg_temp.pid(13), 'score', 40)));
  perform pg_temp.assert_eq('1 status', v_out->>'status', 'finished');
  perform pg_temp.assert_eq('1 flipped', v_out->>'games_flipped', 'true');
  perform pg_temp.assert_eq('1 phase', (pg_temp.sess('GS1')).phase, 'finished');
  perform pg_temp.assert_eq('1 winner', (pg_temp.sess('GS1')).winner_player_id, pg_temp.pid(13));
  perform pg_temp.assert_eq('1 tie false', (pg_temp.sess('GS1')).is_tie, false);
  perform pg_temp.assert_eq('1 deadline cleared', (pg_temp.sess('GS1')).turn_deadline_at is null, true);
  perform pg_temp.assert_eq('1 turn start cleared', (pg_temp.sess('GS1')).turn_started_at is null, true);
  perform pg_temp.assert_eq('1 score A', (pg_temp.st('GS1', 1, 1)).score, 5);
  perform pg_temp.assert_eq('1 rack A untouched', (pg_temp.st('GS1', 1, 1)).rack, '["A","B"]'::jsonb);
  perform pg_temp.assert_eq('1 B state', ((pg_temp.st('GS1', 1, 2)).score, (pg_temp.st('GS1', 1, 2)).rack, (pg_temp.st('GS1', 1, 2)).clock_ms_remaining, (pg_temp.st('GS1', 1, 2)).timed_out)::text, '(18,[],0,t)');
  perform pg_temp.assert_eq('1 score C', (pg_temp.st('GS1', 1, 3)).score, 40);
  perform pg_temp.assert_eq('1 game finished', (pg_temp.g('GS1')).status, 'finished');
  perform pg_temp.assert_eq('1 finished_at', (pg_temp.g('GS1')).finished_at is not null, true);
  perform pg_temp.assert_eq('1 marker', ((pg_temp.g('GS1')).finish_bookkeeping->>'finished_at')::timestamptz, (pg_temp.g('GS1')).finished_at);
end $$;

-- 2. Second call: already_finished, nothing re-tallied.
do $$
declare
  v_out jsonb;
begin
  v_out := public.finish_scrabble_session('GS1', (pg_temp.sess('GS1')).updated_at, '{"status_message":"again"}'::jsonb,
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(11), 'score', -999)));
  perform pg_temp.assert_eq('2 status', v_out->>'status', 'already_finished');
  perform pg_temp.assert_eq('2 nothing to flip', v_out->>'games_flipped', 'false');
  perform pg_temp.assert_eq('2 score kept', (pg_temp.st('GS1', 1, 1)).score, 5);
  perform pg_temp.assert_eq('2 message kept', (pg_temp.sess('GS1')).status_message, 'C wins');
end $$;

-- 3. Session finished, games row still active: already_finished completes the flip, without touching scores.
do $$
declare
  v_v timestamptz := pg_temp.mk('GS3', 3);
  v_out jsonb;
begin
  update public.scrabble_sessions set phase = 'finished' where game_id = 'GS3';
  v_out := public.finish_scrabble_session('GS3', v_v, '{}'::jsonb, jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(31), 'score', -1)));
  perform pg_temp.assert_eq('3 status', v_out->>'status', 'already_finished');
  perform pg_temp.assert_eq('3 flip completed', v_out->>'games_flipped', 'true');
  perform pg_temp.assert_eq('3 game finished', (pg_temp.g('GS3')).status, 'finished');
  perform pg_temp.assert_eq('3 scores untouched', (pg_temp.st('GS3', 3, 1)).score, 10);
end $$;

-- 4. Stale version: lost, nothing written.
do $$
declare
  v_v timestamptz := pg_temp.mk('GS4', 4);
  v_out jsonb;
begin
  v_out := public.finish_scrabble_session('GS4', v_v - interval '1 microsecond', '{"status_message":"stale"}'::jsonb,
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(41), 'score', 99)), pg_temp.pid(43));
  perform pg_temp.assert_eq('4 status', v_out->>'status', 'lost');
  perform pg_temp.assert_eq('4 phase', (pg_temp.sess('GS4')).phase, 'playing');
  perform pg_temp.assert_eq('4 score', (pg_temp.st('GS4', 4, 1)).score, 10);
  perform pg_temp.assert_eq('4 leaver kept', (select count(*) from public.players where id = pg_temp.pid(43)), 1::bigint);
  perform pg_temp.assert_eq('4 game active', (pg_temp.g('GS4')).status, 'active');
end $$;

-- 5. Malformed payloads: invalid, nothing written.
do $$
declare
  v_v timestamptz := pg_temp.mk('GS5', 5);
  v_out jsonb;
begin
  perform pg_temp.assert_eq('5a protected column', public.finish_scrabble_session('GS5', v_v, '{"game_id":"X"}'::jsonb, '[]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('5b phase', public.finish_scrabble_session('GS5', v_v, '{"phase":"playing"}'::jsonb, '[]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('5c version', public.finish_scrabble_session('GS5', v_v, '{"updated_at":"2020-01-01"}'::jsonb, '[]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('5d unknown column', public.finish_scrabble_session('GS5', v_v, '{"nope":1}'::jsonb, '[]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('5e patch shape', public.finish_scrabble_session('GS5', v_v, '[]'::jsonb, '[]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('5f states shape', public.finish_scrabble_session('GS5', v_v, '{}'::jsonb, '{}'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('5g bad player id', public.finish_scrabble_session('GS5', v_v, '{}'::jsonb, '[{"player_id":"x","score":1}]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('5h unknown state key', public.finish_scrabble_session('GS5', v_v, '{}'::jsonb, '[{"player_id":"00000000-0000-0000-0000-000000000051","id":"x"}]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('5i score type', public.finish_scrabble_session('GS5', v_v, '{}'::jsonb, '[{"player_id":"00000000-0000-0000-0000-000000000051","score":"9"}]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('5j rack type', public.finish_scrabble_session('GS5', v_v, '{}'::jsonb, '[{"player_id":"00000000-0000-0000-0000-000000000051","rack":"A"}]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('5k timed_out type', public.finish_scrabble_session('GS5', v_v, '{}'::jsonb, '[{"player_id":"00000000-0000-0000-0000-000000000051","timed_out":1}]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('5 nothing written', (pg_temp.sess('GS5')).phase, 'playing');
  perform pg_temp.assert_eq('5 still active', (pg_temp.g('GS5')).status, 'active');
  perform pg_temp.assert_eq('5 version unchanged', (pg_temp.sess('GS5')).updated_at, v_v);
  perform pg_temp.assert_eq('5l missing game', public.finish_scrabble_session('NOPE', v_v, '{}'::jsonb, '[]'::jsonb)->>'status', 'invalid');
end $$;

-- 6. A leaver's state + player rows are removed in the same step.
do $$
declare
  v_v timestamptz := pg_temp.mk('GS6', 6);
begin
  perform public.finish_scrabble_session('GS6', v_v, '{"status_message":"C left"}'::jsonb, '[]'::jsonb, pg_temp.pid(63));
  perform pg_temp.assert_eq('6 player removed', (select count(*) from public.players where id = pg_temp.pid(63)), 0::bigint);
  perform pg_temp.assert_eq('6 state removed', (select count(*) from public.scrabble_player_state where player_id = pg_temp.pid(63)), 0::bigint);
  perform pg_temp.assert_eq('6 finished', (pg_temp.g('GS6')).status, 'finished');
end $$;

-- 6b. An already finished round never removes anyone from the published result and rewrites no scores.
do $$
declare
  v_v timestamptz := pg_temp.mk('GSA', 0);
  v_out jsonb;
begin
  update public.scrabble_sessions set phase = 'finished' where game_id = 'GSA';
  v_out := public.finish_scrabble_session('GSA', v_v, '{}'::jsonb,
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(1), 'score', -5)), pg_temp.pid(3));
  perform pg_temp.assert_eq('6b status', v_out->>'status', 'already_finished');
  perform pg_temp.assert_eq('6b player kept', (select count(*) from public.players where id = pg_temp.pid(3)), 1::bigint);
  perform pg_temp.assert_eq('6b state kept', (select count(*) from public.scrabble_player_state where player_id = pg_temp.pid(3)), 1::bigint);
  perform pg_temp.assert_eq('6b score untouched', (pg_temp.st('GSA', 0, 1)).score, 10);
end $$;

-- 6c. Payload identity hardening: a JSON null / non-string / duplicated / foreign player id is invalid, nothing is written.
do $$
declare
  v_v timestamptz := pg_temp.mk('GSB', 12);
  v_other timestamptz := pg_temp.mk('GSC', 11);
begin
  perform pg_temp.assert_eq('6c null player id', public.finish_scrabble_session('GSB', v_v, '{}'::jsonb, '[{"player_id":null,"score":99}]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6c numeric player id', public.finish_scrabble_session('GSB', v_v, '{}'::jsonb, '[{"player_id":5,"score":99}]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6c duplicate player id', public.finish_scrabble_session('GSB', v_v, '{}'::jsonb,
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(121), 'score', 1), jsonb_build_object('player_id', pg_temp.pid(121), 'score', 2)))->>'status', 'invalid');
  -- a player id with hex letters, so its lower- and upper-case spellings really differ as text
  insert into public.players (id, game_id, name) values ('abcdef00-0000-0000-0000-00000000abcd', 'GSB', 'Hex');
  insert into public.scrabble_player_state (game_id, player_id, rack, score, player_order) values ('GSB', 'abcdef00-0000-0000-0000-00000000abcd', '[]', 0, 9);
  perform pg_temp.assert_eq('6c duplicate player id, mixed case', public.finish_scrabble_session('GSB', v_v, '{}'::jsonb,
    '[{"player_id":"abcdef00-0000-0000-0000-00000000abcd","score":1},{"player_id":"ABCDEF00-0000-0000-0000-00000000ABCD","score":2}]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6c player of another game', public.finish_scrabble_session('GSB', v_v, '{}'::jsonb,
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(111), 'score', 1)))->>'status', 'invalid');
  perform pg_temp.assert_eq('6c removal of another game player', public.finish_scrabble_session('GSB', v_v, '{}'::jsonb, '[]'::jsonb, pg_temp.pid(111))->>'status', 'invalid');
  perform pg_temp.assert_eq('6c nothing written', (pg_temp.sess('GSB')).phase, 'playing');
  perform pg_temp.assert_eq('6c game active', (pg_temp.g('GSB')).status, 'active');
  perform pg_temp.assert_eq('6c other game untouched', (pg_temp.sess('GSC')).phase, 'playing');
end $$;

-- 6d. Round identity: a finish decided about another round is lost; a replayed (waiting) game is never re-finished.
do $$
declare
  v_v timestamptz := pg_temp.mk('GSD', 13);
begin
  update public.games set session_started_at = '2026-02-01T00:00:00Z', sessions_played = 3 where id = 'GSD';
  perform pg_temp.assert_eq('6d other round (started_at)', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null,
    '{"session_started_at":"2026-01-01T00:00:00Z"}'::jsonb)->>'status', 'lost');
  perform pg_temp.assert_eq('6d other round (sessions_played)', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null, '{"sessions_played":2}'::jsonb)->>'status', 'lost');
  perform pg_temp.assert_eq('6d round mismatch is flagged as such', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null, '{"sessions_played":2}'::jsonb)->>'reason', 'round');
  perform pg_temp.assert_eq('6d stale version has no round reason', public.finish_scrabble_session('GSD', v_v - interval '1 microsecond', '{}'::jsonb, '[]'::jsonb)->>'reason', null);
  perform pg_temp.assert_eq('6d round shape', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null, '{"x":1}'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6d nothing written', (pg_temp.sess('GSD')).phase, 'playing');
  update public.scrabble_sessions set phase = 'finished' where game_id = 'GSD';
  perform pg_temp.assert_eq('6d already finished but another round', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null, '{"sessions_played":2}'::jsonb)->>'status', 'lost');
  perform pg_temp.assert_eq('6d game untouched', (pg_temp.g('GSD')).status, 'active');
  perform pg_temp.assert_eq('6d matching round', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null,
    '{"sessions_played":3,"session_started_at":"2026-02-01T00:00:00Z"}'::jsonb)->>'status', 'already_finished');
  perform pg_temp.assert_eq('6d flipped', (pg_temp.g('GSD')).status, 'finished');
  update public.games set status = 'waiting', finished_at = null, finish_bookkeeping = null where id = 'GSD';
  perform pg_temp.assert_eq('6d replay: no flip', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb)->>'games_flipped', 'false');
  perform pg_temp.assert_eq('6d replay: still waiting', (pg_temp.g('GSD')).status, 'waiting');
end $$;

-- 6e. scrabble_write_state_if_open: writes while the round is open, refuses once it is finished, validates its patch.
do $$
declare
  v_v timestamptz := pg_temp.mk('GSE', 14);
begin
  perform pg_temp.assert_eq('6e written', public.scrabble_write_state_if_open('GSE', pg_temp.pid(141), '{"score":77,"rack":["Z"],"clock_ms_remaining":5,"timed_out":true}'::jsonb, pg_temp.sid('GSE', 14, 1))->>'status', 'written');
  perform pg_temp.assert_eq('6e score', (pg_temp.st('GSE', 14, 1)).score, 77);
  perform pg_temp.assert_eq('6e rack', (pg_temp.st('GSE', 14, 1)).rack, '["Z"]'::jsonb);
  perform pg_temp.assert_eq('6e clock cleared to null', public.scrabble_write_state_if_open('GSE', pg_temp.pid(141), '{"clock_ms_remaining":null}'::jsonb, pg_temp.sid('GSE', 14, 1))->>'status', 'written');
  perform pg_temp.assert_eq('6e clock null', (pg_temp.st('GSE', 14, 1)).clock_ms_remaining is null, true);
  perform pg_temp.assert_eq('6e invalid key', public.scrabble_write_state_if_open('GSE', pg_temp.pid(141), '{"id":"x"}'::jsonb, pg_temp.sid('GSE', 14, 1))->>'status', 'invalid');
  perform pg_temp.assert_eq('6e invalid type', public.scrabble_write_state_if_open('GSE', pg_temp.pid(141), '{"score":"1"}'::jsonb, pg_temp.sid('GSE', 14, 1))->>'status', 'invalid');
  perform pg_temp.assert_eq('6e player of another game', public.scrabble_write_state_if_open('GSE', pg_temp.pid(111), '{"score":1}'::jsonb, pg_temp.sid('GSE', 14, 1))->>'status', 'stale');
  perform pg_temp.assert_eq('6e unknown game', public.scrabble_write_state_if_open('NOPE', pg_temp.pid(141), '{"score":1}'::jsonb, pg_temp.sid('GSE', 14, 1))->>'status', 'invalid');
  perform public.finish_scrabble_session('GSE', (pg_temp.sess('GSE')).updated_at, '{}'::jsonb, jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(141), 'score', 12)));
  perform pg_temp.assert_eq('6e refused after the finish', public.scrabble_write_state_if_open('GSE', pg_temp.pid(141), '{"score":999}'::jsonb, pg_temp.sid('GSE', 14, 1))->>'status', 'finished');
  perform pg_temp.assert_eq('6e published score kept', (pg_temp.st('GSE', 14, 1)).score, 12);
  begin perform public.scrabble_write_state_if_open(null, pg_temp.pid(141), '{}'::jsonb, gen_random_uuid()); raise exception 'FAIL 6e: null game id accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.scrabble_write_state_if_open('GSE', null, '{}'::jsonb, gen_random_uuid()); raise exception 'FAIL 6e: null player id accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.scrabble_write_state_if_open('GSE', pg_temp.pid(141), null, gen_random_uuid()); raise exception 'FAIL 6e: null patch accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.scrabble_write_state_if_open('GSE', pg_temp.pid(141), '{}'::jsonb, null); raise exception 'FAIL 6e: null state id accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- 6e2. Bound to the state row the move loaded: a rematch re-deals the rows (new ids), so a delayed write is stale.
do $$
declare
  v_old uuid;
begin
  perform pg_temp.mk('GSG', 16);
  v_old := pg_temp.sid('GSG', 16, 1);
  -- the rematch: the same player gets a NEW state row
  delete from public.scrabble_player_state where id = v_old;
  insert into public.scrabble_player_state (game_id, player_id, rack, score, player_order) values ('GSG', pg_temp.pid(161), '[]', 5, 0);
  perform pg_temp.assert_eq('6e2 stale', public.scrabble_write_state_if_open('GSG', pg_temp.pid(161), '{"score":999}'::jsonb, v_old)->>'status', 'stale');
  perform pg_temp.assert_eq('6e2 new round untouched', (select score from public.scrabble_player_state where game_id = 'GSG' and player_id = pg_temp.pid(161)), 5);
  perform pg_temp.assert_eq('6e2 state of another player', public.scrabble_write_state_if_open('GSG', pg_temp.pid(162), '{"score":1}'::jsonb, v_old)->>'status', 'stale');
end $$;

-- 6f. A game that was already ended otherwise keeps its finished_at: the finish still lands on the session, flips nothing.
do $$
declare
  v_v timestamptz := pg_temp.mk('GSF', 15);
  v_out jsonb;
begin
  update public.games set status = 'finished', finished_at = '2026-03-01T00:00:00Z' where id = 'GSF';
  v_out := public.finish_scrabble_session('GSF', v_v, '{}'::jsonb, '[]'::jsonb);
  perform pg_temp.assert_eq('6f status', v_out->>'status', 'finished');
  perform pg_temp.assert_eq('6f no flip', v_out->>'games_flipped', 'false');
  perform pg_temp.assert_eq('6f finished_at kept', (pg_temp.g('GSF')).finished_at, '2026-03-01T00:00:00Z'::timestamptz);
end $$;

-- 7. NULL arguments raise.
do $$
declare
  v_v timestamptz := pg_temp.mk('GS9', 9);
begin
  begin perform public.finish_scrabble_session(null, v_v, '{}'::jsonb, '[]'::jsonb); raise exception 'FAIL 9a: null game id accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.finish_scrabble_session('GS9', null, '{}'::jsonb, '[]'::jsonb); raise exception 'FAIL 9b: null version accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.finish_scrabble_session('GS9', v_v, null, '[]'::jsonb); raise exception 'FAIL 9c: null patch accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.finish_scrabble_session('GS9', v_v, '{}'::jsonb, null); raise exception 'FAIL 9d: null states accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform pg_temp.assert_eq('9 nothing written', (pg_temp.sess('GS9')).phase, 'playing');
end $$;

-- 8. Privileges.
select pg_temp.assert_eq('priv anon', has_function_privilege('anon', 'public.finish_scrabble_session(text, timestamptz, jsonb, jsonb, uuid, jsonb)', 'execute'), false);
select pg_temp.assert_eq('priv authenticated', has_function_privilege('authenticated', 'public.finish_scrabble_session(text, timestamptz, jsonb, jsonb, uuid, jsonb)', 'execute'), false);
select pg_temp.assert_eq('priv public', has_function_privilege('public', 'public.finish_scrabble_session(text, timestamptz, jsonb, jsonb, uuid, jsonb)', 'execute'), false);
select pg_temp.assert_eq('priv service_role', has_function_privilege('service_role', 'public.finish_scrabble_session(text, timestamptz, jsonb, jsonb, uuid, jsonb)', 'execute'), true);

select pg_temp.assert_eq('priv write anon', has_function_privilege('anon', 'public.scrabble_write_state_if_open(text, uuid, jsonb, uuid)', 'execute'), false);
select pg_temp.assert_eq('priv write authenticated', has_function_privilege('authenticated', 'public.scrabble_write_state_if_open(text, uuid, jsonb, uuid)', 'execute'), false);
select pg_temp.assert_eq('priv write service_role', has_function_privilege('service_role', 'public.scrabble_write_state_if_open(text, uuid, jsonb, uuid)', 'execute'), true);

rollback;
