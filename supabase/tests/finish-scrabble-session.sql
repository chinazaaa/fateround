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
  update public.games set session_started_at = '2026-02-01T00:00:00Z', sessions_played = 3, game_duration_seconds = 120 where id = 'GSD';
  perform pg_temp.assert_eq('6d other round (started_at)', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null,
    '{"session_started_at":"2026-01-01T00:00:00Z"}'::jsonb)->>'status', 'lost');
  perform pg_temp.assert_eq('6d other round (sessions_played)', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null, '{"sessions_played":2}'::jsonb)->>'status', 'lost');
  perform pg_temp.assert_eq('6d round mismatch is flagged as such', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null, '{"sessions_played":2}'::jsonb)->>'reason', 'round');
  perform pg_temp.assert_eq('6d stale version has no round reason', public.finish_scrabble_session('GSD', v_v - interval '1 microsecond', '{}'::jsonb, '[]'::jsonb)->>'reason', null);
  perform pg_temp.assert_eq('6d round shape', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null, '{"x":1}'::jsonb)->>'status', 'invalid');
  -- malformed fields are `invalid` (never a cast error); a valid value naming another round / limit stays `lost`
  perform pg_temp.assert_eq('6d text sessions_played', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null, '{"sessions_played":"bad"}'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6d fractional sessions_played', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null, '{"sessions_played":1.5}'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6d huge sessions_played', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null, '{"sessions_played":99999999999}'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6d unparsable started_at', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null, '{"session_started_at":"not a date"}'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6d numeric started_at', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null, '{"session_started_at":5}'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6d text duration', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null, '{"game_duration_seconds":"x"}'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6d explicit null is compared (game has a value)', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null, '{"sessions_played":null}'::jsonb)->>'status', 'lost');
  perform pg_temp.assert_eq('6d older time limit (extension happened)', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null, '{"game_duration_seconds":60}'::jsonb)->>'status', 'lost');
  perform pg_temp.assert_eq('6d older time limit reason', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null, '{"game_duration_seconds":60}'::jsonb)->>'reason', 'round');
  perform pg_temp.assert_eq('6d finish: fractional score', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(131), 'score', 1.5)))->>'status', 'invalid');
  perform pg_temp.assert_eq('6d finish: huge clock', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(131), 'clock_ms_remaining', 99999999999)))->>'status', 'invalid');
  perform pg_temp.assert_eq('6d finish: bad patch value', public.finish_scrabble_session('GSD', v_v, '{"winner_player_id":"not-a-uuid"}'::jsonb, '[]'::jsonb, null,
    '{"sessions_played":3,"session_started_at":"2026-02-01T00:00:00Z","game_duration_seconds":120}'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6d nothing written', (pg_temp.sess('GSD')).phase, 'playing');
  update public.scrabble_sessions set phase = 'finished' where game_id = 'GSD';
  perform pg_temp.assert_eq('6d already finished but another round', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null, '{"sessions_played":2}'::jsonb)->>'status', 'lost');
  perform pg_temp.assert_eq('6d game untouched', (pg_temp.g('GSD')).status, 'active');
  perform pg_temp.assert_eq('6d matching round', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb, null,
    '{"sessions_played":3,"session_started_at":"2026-02-01T00:00:00Z","game_duration_seconds":120}'::jsonb)->>'status', 'already_finished');
  perform pg_temp.assert_eq('6d flipped', (pg_temp.g('GSD')).status, 'finished');
  update public.games set status = 'waiting', finished_at = null, finish_bookkeeping = null where id = 'GSD';
  perform pg_temp.assert_eq('6d replay: no flip', public.finish_scrabble_session('GSD', v_v, '{}'::jsonb, '[]'::jsonb)->>'games_flipped', 'false');
  perform pg_temp.assert_eq('6d replay: still waiting', (pg_temp.g('GSD')).status, 'waiting');
end $$;

-- 6e. apply_scrabble_move: the session claim and the mover's state commit together.
do $$
declare
  v_v timestamptz := pg_temp.mk('GSE', 14);
  v_v2 timestamptz;
  v_out jsonb;
begin
  v_out := public.apply_scrabble_move('GSE', v_v, '{"status_message":"moved","current_turn_index":1,"bag":["Z"]}'::jsonb,
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(141), 'score', 77, 'rack', '["Q"]'::jsonb, 'clock_ms_remaining', 5, 'timed_out', true)));
  perform pg_temp.assert_eq('6e applied', v_out->>'status', 'applied');
  perform pg_temp.assert_eq('6e session patched', (pg_temp.sess('GSE')).status_message, 'moved');
  perform pg_temp.assert_eq('6e turn', (pg_temp.sess('GSE')).current_turn_index, 1);
  perform pg_temp.assert_eq('6e version advanced', (pg_temp.sess('GSE')).updated_at > v_v, true);
  perform pg_temp.assert_eq('6e still playing', (pg_temp.sess('GSE')).phase, 'playing');
  perform pg_temp.assert_eq('6e state', ((pg_temp.st('GSE', 14, 1)).score, (pg_temp.st('GSE', 14, 1)).rack, (pg_temp.st('GSE', 14, 1)).clock_ms_remaining, (pg_temp.st('GSE', 14, 1)).timed_out)::text, '(77,"[""Q""]",5,t)');
  -- an empty patch still advances the version
  -- integer columns are validated before the cast: fractional / out-of-range is `invalid`; negative scores and a null clock stay valid
  perform pg_temp.assert_eq('6e fractional score', public.apply_scrabble_move('GSE', (pg_temp.sess('GSE')).updated_at, '{}'::jsonb, jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(141), 'score', 1.5)))->>'status', 'invalid');
  perform pg_temp.assert_eq('6e huge score', public.apply_scrabble_move('GSE', (pg_temp.sess('GSE')).updated_at, '{}'::jsonb, jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(141), 'score', 99999999999)))->>'status', 'invalid');
  perform pg_temp.assert_eq('6e fractional clock', public.apply_scrabble_move('GSE', (pg_temp.sess('GSE')).updated_at, '{}'::jsonb, jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(141), 'clock_ms_remaining', 2.5)))->>'status', 'invalid');
  perform pg_temp.assert_eq('6e negative score and null clock are valid', public.apply_scrabble_move('GSE', (pg_temp.sess('GSE')).updated_at, '{}'::jsonb, jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(141), 'score', -3, 'clock_ms_remaining', null)))->>'status', 'applied');
  perform pg_temp.assert_eq('6e negative score stored', (pg_temp.st('GSE', 14, 1)).score, -3);
  perform pg_temp.assert_eq('6e explicit null clears the stored clock', (pg_temp.st('GSE', 14, 1)).clock_ms_remaining is null, true);
  -- a patch value that cannot be converted is `invalid`, not a raised error; valid uuids stay accepted
  perform pg_temp.assert_eq('6e bad patch value', public.apply_scrabble_move('GSE', (pg_temp.sess('GSE')).updated_at, '{"winner_player_id":"not-a-uuid"}'::jsonb, '[]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6e valid uuid patch value', public.apply_scrabble_move('GSE', (pg_temp.sess('GSE')).updated_at, jsonb_build_object('winner_player_id', pg_temp.pid(141)), '[]'::jsonb)->>'status', 'applied');
  update public.scrabble_player_state set score = 77 where game_id = 'GSE' and player_id = pg_temp.pid(141);
  v_v2 := (pg_temp.sess('GSE')).updated_at;
  perform pg_temp.assert_eq('6e empty patch', public.apply_scrabble_move('GSE', v_v2, '{}'::jsonb, '[]'::jsonb)->>'status', 'applied');
  perform pg_temp.assert_eq('6e empty patch advances the version', (pg_temp.sess('GSE')).updated_at > v_v2, true);
  -- stale version: lost, nothing written
  v_out := public.apply_scrabble_move('GSE', v_v, '{"status_message":"stale"}'::jsonb, jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(141), 'score', 1)));
  perform pg_temp.assert_eq('6e stale', v_out->>'status', 'lost');
  perform pg_temp.assert_eq('6e stale: nothing written', (pg_temp.st('GSE', 14, 1)).score, 77);
  -- malformed
  perform pg_temp.assert_eq('6e phase finished', public.apply_scrabble_move('GSE', (pg_temp.sess('GSE')).updated_at, '{"phase":"finished"}'::jsonb, '[]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6e protected column', public.apply_scrabble_move('GSE', (pg_temp.sess('GSE')).updated_at, '{"game_id":"X"}'::jsonb, '[]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6e unknown column', public.apply_scrabble_move('GSE', (pg_temp.sess('GSE')).updated_at, '{"nope":1}'::jsonb, '[]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6e null player id', public.apply_scrabble_move('GSE', (pg_temp.sess('GSE')).updated_at, '{}'::jsonb, '[{"player_id":null,"score":1}]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6e bad key', public.apply_scrabble_move('GSE', (pg_temp.sess('GSE')).updated_at, '{}'::jsonb, jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(141), 'id', 'x')))->>'status', 'invalid');
  perform pg_temp.assert_eq('6e bad type', public.apply_scrabble_move('GSE', (pg_temp.sess('GSE')).updated_at, '{}'::jsonb, jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(141), 'score', '1')))->>'status', 'invalid');
  perform pg_temp.assert_eq('6e duplicate', public.apply_scrabble_move('GSE', (pg_temp.sess('GSE')).updated_at, '{}'::jsonb,
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(141), 'score', 1), jsonb_build_object('player_id', pg_temp.pid(141), 'score', 2)))->>'status', 'invalid');
  perform pg_temp.assert_eq('6e malformed: nothing written', (pg_temp.st('GSE', 14, 1)).score, 77);
  -- a write for a player who left is ignored, not rejected
  perform pg_temp.assert_eq('6e departed player ignored', public.apply_scrabble_move('GSE', (pg_temp.sess('GSE')).updated_at, '{}'::jsonb,
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(111), 'score', 5)))->>'status', 'applied');
  perform pg_temp.assert_eq('6e departed player: the other game''s score is untouched', (pg_temp.st('GSC', 11, 1)).score, 10);
  -- a finished round accepts no move
  update public.scrabble_sessions set phase = 'finished' where game_id = 'GSE';
  perform pg_temp.assert_eq('6e finished round', public.apply_scrabble_move('GSE', (pg_temp.sess('GSE')).updated_at, '{}'::jsonb, '[]'::jsonb)->>'status', 'lost');
  perform pg_temp.assert_eq('6e unknown game', public.apply_scrabble_move('NOPE', v_v, '{}'::jsonb, '[]'::jsonb)->>'status', 'invalid');
  begin perform public.apply_scrabble_move(null, v_v, '{}'::jsonb, '[]'::jsonb); raise exception 'FAIL 6e: null game id accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.apply_scrabble_move('GSE', null, '{}'::jsonb, '[]'::jsonb); raise exception 'FAIL 6e: null version accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.apply_scrabble_move('GSE', v_v, null, '[]'::jsonb); raise exception 'FAIL 6e: null patch accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.apply_scrabble_move('GSE', v_v, '{}'::jsonb, null); raise exception 'FAIL 6e: null states accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
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

select pg_temp.assert_eq('priv move anon', has_function_privilege('anon', 'public.apply_scrabble_move(text, timestamptz, jsonb, jsonb)', 'execute'), false);
select pg_temp.assert_eq('priv move authenticated', has_function_privilege('authenticated', 'public.apply_scrabble_move(text, timestamptz, jsonb, jsonb)', 'execute'), false);
select pg_temp.assert_eq('priv move service_role', has_function_privilege('service_role', 'public.apply_scrabble_move(text, timestamptz, jsonb, jsonb)', 'execute'), true);

-- 6g. start_scrabble_game: one transaction under the games lock.
do $$
declare
  v_v timestamptz := pg_temp.mk('GSG', 17);
  v_row jsonb;
  v_states jsonb;
  v_out jsonb;
begin
  v_row := jsonb_build_object('turn_order', jsonb_build_array(pg_temp.pid(171), pg_temp.pid(172)), 'current_turn_index', 0,
    'board', '[]'::jsonb, 'bag', '["Z","Y"]'::jsonb, 'phase', 'playing', 'consecutive_passes', 0, 'status_message', 'dealt', 'clock_mode', 'chess');
  update public.games set scrabble_clock_mode = 'chess', scrabble_clock_seconds = 9 where id = 'GSG';
  v_states := jsonb_build_array(
    jsonb_build_object('player_id', pg_temp.pid(171), 'rack', '["A"]'::jsonb, 'score', 0, 'player_order', 0, 'clock_ms_remaining', 9000, 'timed_out', false),
    jsonb_build_object('player_id', pg_temp.pid(172), 'rack', '["B"]'::jsonb, 'score', 0, 'player_order', 1, 'clock_ms_remaining', 9000, 'timed_out', false));
  -- a round in progress is never re-dealt (this is also what serializes two overlapping starts): the game is `active`
  perform pg_temp.assert_eq('6g in progress', public.start_scrabble_game('GSG', v_row, v_states)->>'status', 'not_waiting');
  perform pg_temp.assert_eq('6g in progress: scores untouched', (pg_temp.st('GSG', 17, 1)).score, 10);
  update public.games set status = 'active' where id = 'GSG';
  update public.scrabble_sessions set phase = 'finished' where game_id = 'GSG';
  -- a deal is only allowed while the game is `waiting`: a stale start that reaches the lock after another start already
  -- ran the round (the game is active / finished) must not re-deal the finished round
  perform pg_temp.assert_eq('6g game active: refused', public.start_scrabble_game('GSG', v_row, v_states)->>'status', 'not_waiting');
  update public.games set status = 'finished' where id = 'GSG';
  perform pg_temp.assert_eq('6g game finished: refused', public.start_scrabble_game('GSG', v_row, v_states)->>'status', 'not_waiting');
  perform pg_temp.assert_eq('6g refused: previous result intact', ((pg_temp.st('GSG', 17, 1)).score, (pg_temp.sess('GSG')).phase)::text, '(10,finished)');
  update public.games set status = 'waiting' where id = 'GSG';
  -- a deal built from SETTINGS THAT CHANGED after they were read (the lobby switched clock mode / bank) never activates
  perform pg_temp.assert_eq('6g stale settings: standard deal in a chess lobby', public.start_scrabble_game('GSG', v_row || '{"clock_mode":"standard"}'::jsonb, v_states)->>'status', 'settings_changed');
  perform pg_temp.assert_eq('6g stale settings: other bank', public.start_scrabble_game('GSG', v_row, jsonb_build_array(
    jsonb_build_object('player_id', pg_temp.pid(171), 'clock_ms_remaining', 5000), jsonb_build_object('player_id', pg_temp.pid(172), 'clock_ms_remaining', 5000)))->>'status', 'settings_changed');
  update public.games set scrabble_clock_mode = 'standard' where id = 'GSG';
  perform pg_temp.assert_eq('6g stale settings: chess deal in a standard lobby', public.start_scrabble_game('GSG', v_row, v_states)->>'status', 'settings_changed');
  update public.games set scrabble_clock_mode = 'chess' where id = 'GSG';
  perform pg_temp.assert_eq('6g stale settings: nothing written, still waiting', ((pg_temp.g('GSG')).status, (pg_temp.sess('GSG')).phase)::text, '(waiting,finished)');
  -- malformed deals change nothing (the previous result stays intact)
  perform pg_temp.assert_eq('6g turn_order seat without a state row', public.start_scrabble_game('GSG',
    v_row || jsonb_build_object('turn_order', jsonb_build_array(pg_temp.pid(171), pg_temp.pid(172), pg_temp.pid(173))), v_states)->>'status', 'invalid');
  perform pg_temp.assert_eq('6g state row without a turn_order seat', public.start_scrabble_game('GSG',
    v_row || jsonb_build_object('turn_order', jsonb_build_array(pg_temp.pid(171))), v_states)->>'status', 'invalid');
  perform pg_temp.assert_eq('6g duplicate turn_order seat (both distinct seats kept)', public.start_scrabble_game('GSG',
    v_row || jsonb_build_object('turn_order', jsonb_build_array(pg_temp.pid(171), pg_temp.pid(172), pg_temp.pid(171))), v_states)->>'reason', 'turn_order_mismatch');
  -- a foreign seat is in BOTH turn_order and the state rows, so only the game-membership check (players.game_id) can reject it
  v_out := public.start_scrabble_game('GSG',
    v_row || jsonb_build_object('turn_order', jsonb_build_array(pg_temp.pid(171), pg_temp.pid(172), pg_temp.pid(111))),
    v_states || jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(111), 'rack', '[]'::jsonb)));
  perform pg_temp.assert_eq('6g unknown seat', (v_out->>'status', v_out->>'reason')::text, '(invalid,state_row)');
  v_out := public.start_scrabble_game('GSG',
    v_row || jsonb_build_object('turn_order', jsonb_build_array(pg_temp.pid(111))),
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(111))));
  perform pg_temp.assert_eq('6g seat of another game', (v_out->>'status', v_out->>'reason')::text, '(invalid,state_row)');
  perform pg_temp.assert_eq('6g duplicate state rows fail the duplicate check', public.start_scrabble_game('GSG', v_row,
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(171)), jsonb_build_object('player_id', pg_temp.pid(171))))->>'reason', 'state_row_duplicate');
  perform pg_temp.assert_eq('6g no seats', public.start_scrabble_game('GSG', v_row, '[]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6g phase must be playing', public.start_scrabble_game('GSG', v_row || '{"phase":"finished"}'::jsonb, v_states)->>'status', 'invalid');
  perform pg_temp.assert_eq('6g protected column', public.start_scrabble_game('GSG', v_row || '{"id":"x"}'::jsonb, v_states)->>'status', 'invalid');
  perform pg_temp.assert_eq('6g unknown column', public.start_scrabble_game('GSG', v_row || '{"nope":1}'::jsonb, v_states)->>'status', 'invalid');
  perform pg_temp.assert_eq('6g unconvertible value', public.start_scrabble_game('GSG', v_row || '{"winner_player_id":"not-a-uuid"}'::jsonb, v_states)->>'status', 'invalid');
  -- both seats are dealt, only ONE score is fractional: the score check (not a seat mismatch) must be what rejects it
  v_out := public.start_scrabble_game('GSG', v_row, jsonb_build_array(
    jsonb_build_object('player_id', pg_temp.pid(171), 'score', 1.5), jsonb_build_object('player_id', pg_temp.pid(172))));
  perform pg_temp.assert_eq('6g fractional score', (v_out->>'status', v_out->>'reason')::text, '(invalid,state_row)');
  perform pg_temp.assert_eq('6g 2-d turn_order', public.start_scrabble_game('GSG',
    v_row || jsonb_build_object('turn_order', jsonb_build_array(jsonb_build_array(pg_temp.pid(171), pg_temp.pid(172)))), v_states)->>'reason', 'turn_order_dimensions');
  perform pg_temp.assert_eq('6g failed deals: previous result intact', ((pg_temp.st('GSG', 17, 1)).score, (pg_temp.sess('GSG')).phase)::text, '(10,finished)');
  perform pg_temp.assert_eq('6g failed deals: all previous seats intact', (select count(*) from public.scrabble_player_state where game_id = 'GSG'), 3::bigint);
  update public.games set replay_pending = true where id = 'GSG';
  -- a valid deal replaces the racks and the session together
  v_out := public.start_scrabble_game('GSG', v_row, v_states);
  perform pg_temp.assert_eq('6g started', v_out->>'status', 'started');
  -- the activation is part of the SAME transaction: the game is `active` the moment the deal exists
  perform pg_temp.assert_eq('6g activated with the deal', (select (status, session_started_at is not null, current_round_number, rounds_count, replay_pending)::text
    from public.games where id = 'GSG'), '(active,t,1,1,f)');
  perform pg_temp.assert_eq('6g session republished', ((pg_temp.sess('GSG')).phase, (pg_temp.sess('GSG')).status_message, (pg_temp.sess('GSG')).bag)::text, '(playing,dealt,"[""Z"", ""Y""]")');
  perform pg_temp.assert_eq('6g seats replaced', (select count(*) from public.scrabble_player_state where game_id = 'GSG'), 2::bigint);
  perform pg_temp.assert_eq('6g new racks', ((pg_temp.st('GSG', 17, 1)).rack, (pg_temp.st('GSG', 17, 1)).score, (pg_temp.st('GSG', 17, 2)).clock_ms_remaining)::text, '("[""A""]",0,9000)');
  perform pg_temp.assert_eq('6g other game untouched', (pg_temp.st('GSC', 11, 1)).score, 10);
  perform pg_temp.assert_eq('6g other game session untouched', ((pg_temp.sess('GSC')).phase, (pg_temp.sess('GSC')).status_message)::text, '(playing,playing)');
  -- a second start finds the game no longer `waiting`: refused, nothing is re-dealt, nothing is flipped again
  perform pg_temp.assert_eq('6g second start once active', public.start_scrabble_game('GSG', v_row, v_states)->>'status', 'not_waiting');
  perform pg_temp.assert_eq('6g second start: nothing re-dealt', (pg_temp.sess('GSG')).status_message, 'dealt');
  -- a `waiting` game never has a live round (the start is atomic): a session row left under it is an orphan and is replaced
  update public.games set status = 'waiting' where id = 'GSG';
  update public.scrabble_player_state set score = 77 where game_id = 'GSG';
  perform pg_temp.assert_eq('6g orphan session under a waiting game is replaced', public.start_scrabble_game('GSG', v_row || '{"status_message":"redealt"}'::jsonb, v_states)->>'status', 'started');
  perform pg_temp.assert_eq('6g orphan replaced', ((pg_temp.st('GSG', 17, 1)).score, (pg_temp.sess('GSG')).status_message)::text, '(0,redealt)');
  -- a game with no session yet: the session row is created
  insert into public.games (id, title, host_token, game_type, status) values ('GSH', 'deal test', 'tok-GSH', 'scrabble', 'waiting');
  insert into public.players (id, game_id, name) values (pg_temp.pid(181), 'GSH', 'A'), (pg_temp.pid(182), 'GSH', 'B');
  perform pg_temp.assert_eq('6g fresh start', public.start_scrabble_game('GSH',
    jsonb_build_object('turn_order', jsonb_build_array(pg_temp.pid(181), pg_temp.pid(182)), 'phase', 'playing', 'status_message', 'fresh'),
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(181)), jsonb_build_object('player_id', pg_temp.pid(182))))->>'status', 'started');
  perform pg_temp.assert_eq('6g fresh session', ((pg_temp.sess('GSH')).phase, (pg_temp.sess('GSH')).status_message)::text, '(playing,fresh)');
  perform pg_temp.assert_eq('6g unknown game', public.start_scrabble_game('NOPE', v_row, v_states)->>'status', 'invalid');
  begin perform public.start_scrabble_game(null, v_row, v_states); raise exception 'FAIL 6g: null game id accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.start_scrabble_game('GSG', null, v_states); raise exception 'FAIL 6g: null session row accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.start_scrabble_game('GSG', v_row, null); raise exception 'FAIL 6g: null state rows accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

select pg_temp.assert_eq('priv deal anon', has_function_privilege('anon', 'public.start_scrabble_game(text, jsonb, jsonb)', 'execute'), false);
select pg_temp.assert_eq('priv deal authenticated', has_function_privilege('authenticated', 'public.start_scrabble_game(text, jsonb, jsonb)', 'execute'), false);
select pg_temp.assert_eq('priv is_int4 anon', has_function_privilege('anon', 'public.scrabble_is_int4(text)', 'execute'), false);
select pg_temp.assert_eq('priv deal service_role', has_function_privilege('service_role', 'public.start_scrabble_game(text, jsonb, jsonb)', 'execute'), true);

-- 6i. remove_scrabble_lobby_seat: rows and turn_order entry in one transaction; a live round is never touched.
do $$
declare
  v_v timestamptz := pg_temp.mk('GSI', 19);
begin
  -- a LIVE round that lists the player: nothing is deleted
  perform pg_temp.assert_eq('6i live', public.remove_scrabble_lobby_seat('GSI', pg_temp.pid(191))->>'status', 'live');
  perform pg_temp.assert_eq('6i live: rows and seat intact', ((select count(*) from public.players where game_id = 'GSI'),
    (select count(*) from public.scrabble_player_state where game_id = 'GSI'), array_length((pg_temp.sess('GSI')).turn_order, 1))::text, '(3,3,3)');
  -- the same round, finished (a reopened lobby): the seat leaves turn_order, the rows go
  update public.scrabble_sessions set phase = 'finished' where game_id = 'GSI';
  update public.games set status = 'waiting' where id = 'GSI';
  perform pg_temp.assert_eq('6i reopened lobby', public.remove_scrabble_lobby_seat('GSI', pg_temp.pid(191))->>'status', 'removed');
  perform pg_temp.assert_eq('6i seat removed everywhere', ((select count(*) from public.players where id = pg_temp.pid(191)),
    (select count(*) from public.scrabble_player_state where player_id = pg_temp.pid(191)), array_length((pg_temp.sess('GSI')).turn_order, 1))::text, '(0,0,2)');
  perform pg_temp.assert_eq('6i other seats intact', (select count(*) from public.scrabble_player_state where game_id = 'GSI'), 2::bigint);
  perform pg_temp.assert_eq('6i repeat is fine', public.remove_scrabble_lobby_seat('GSI', pg_temp.pid(191))->>'status', 'removed');
  -- another game's player id never matches this game's rows
  perform pg_temp.assert_eq('6i other game untouched', public.remove_scrabble_lobby_seat('GSI', pg_temp.pid(111))->>'status', 'removed');
  perform pg_temp.assert_eq('6i other game rows intact', (select count(*) from public.players where id = pg_temp.pid(111)), 1::bigint);
  -- an ORPHAN playing session under a `waiting` game (an old deal that never activated): its listed seat is a lobby seat
  insert into public.games (id, title, host_token, game_type, status) values ('GSO', 'orphan', 'tok-GSO', 'scrabble', 'waiting');
  insert into public.players (id, game_id, name) values (pg_temp.pid(221), 'GSO', 'A'), (pg_temp.pid(222), 'GSO', 'B');
  insert into public.scrabble_sessions (game_id, turn_order, phase) values ('GSO', array[pg_temp.pid(221), pg_temp.pid(222)], 'playing');
  insert into public.scrabble_player_state (game_id, player_id) values ('GSO', pg_temp.pid(221)), ('GSO', pg_temp.pid(222));
  perform pg_temp.assert_eq('6i orphan under a waiting game', public.remove_scrabble_lobby_seat('GSO', pg_temp.pid(222))->>'status', 'removed');
  perform pg_temp.assert_eq('6i orphan: seat, rack and rotation gone', ((select count(*) from public.players where id = pg_temp.pid(222)),
    (select count(*) from public.scrabble_player_state where player_id = pg_temp.pid(222)), (select turn_order = array[pg_temp.pid(221)] from public.scrabble_sessions where game_id = 'GSO'))::text, '(0,0,t)');
  -- a PUBLISHED result (finished round, game not waiting) keeps its seat and rows
  insert into public.games (id, title, host_token, game_type, status) values ('GSK', 'published', 'tok-GSK', 'scrabble', 'finished');
  insert into public.players (id, game_id, name) values (pg_temp.pid(211), 'GSK', 'A'), (pg_temp.pid(212), 'GSK', 'B');
  insert into public.scrabble_sessions (game_id, turn_order, phase) values ('GSK', array[pg_temp.pid(211), pg_temp.pid(212)], 'finished');
  insert into public.scrabble_player_state (game_id, player_id) values ('GSK', pg_temp.pid(211)), ('GSK', pg_temp.pid(212));
  perform pg_temp.assert_eq('6i published result', public.remove_scrabble_lobby_seat('GSK', pg_temp.pid(211))->>'status', 'retained');
  perform pg_temp.assert_eq('6i published: rows and seat intact', ((select count(*) from public.players where game_id = 'GSK'),
    (select count(*) from public.scrabble_player_state where game_id = 'GSK'), array_length((select turn_order from public.scrabble_sessions where game_id = 'GSK'), 1))::text, '(2,2,2)');
  update public.games set status = 'waiting' where id = 'GSK';
  perform pg_temp.assert_eq('6i same session, reopened lobby', public.remove_scrabble_lobby_seat('GSK', pg_temp.pid(211))->>'status', 'removed');
  -- no session at all
  insert into public.games (id, title, host_token, game_type, status) values ('GSJ', 'lobby', 'tok-GSJ', 'scrabble', 'waiting');
  insert into public.players (id, game_id, name) values (pg_temp.pid(201), 'GSJ', 'A');
  perform pg_temp.assert_eq('6i no session', public.remove_scrabble_lobby_seat('GSJ', pg_temp.pid(201))->>'status', 'removed');
  perform pg_temp.assert_eq('6i no session: row gone', (select count(*) from public.players where id = pg_temp.pid(201)), 0::bigint);
  perform pg_temp.assert_eq('6i unknown game', public.remove_scrabble_lobby_seat('NOPE', pg_temp.pid(201))->>'status', 'invalid');
  begin perform public.remove_scrabble_lobby_seat(null, pg_temp.pid(201)); raise exception 'FAIL 6i: null game id accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.remove_scrabble_lobby_seat('GSI', null); raise exception 'FAIL 6i: null player id accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

select pg_temp.assert_eq('priv lobby seat anon', has_function_privilege('anon', 'public.remove_scrabble_lobby_seat(text, uuid)', 'execute'), false);
select pg_temp.assert_eq('priv lobby seat authenticated', has_function_privilege('authenticated', 'public.remove_scrabble_lobby_seat(text, uuid)', 'execute'), false);
select pg_temp.assert_eq('priv lobby seat service_role', has_function_privilege('service_role', 'public.remove_scrabble_lobby_seat(text, uuid)', 'execute'), true);

-- 6j. leave_scrabble_seat: claim + patch + the leaver's rows in ONE step.
do $$
declare
  v_v timestamptz := pg_temp.mk('GSL', 23);
begin
  perform pg_temp.assert_eq('6j stale version', public.leave_scrabble_seat('GSL', pg_temp.pid(231), v_v - interval '1 second', '{"status_message":"x"}'::jsonb)->>'status', 'lost');
  perform pg_temp.assert_eq('6j stale: nothing deleted', (select count(*) from public.players where game_id = 'GSL'), 3::bigint);
  perform pg_temp.assert_eq('6j phase finished', public.leave_scrabble_seat('GSL', pg_temp.pid(231), v_v, '{"phase":"finished"}'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6j protected column', public.leave_scrabble_seat('GSL', pg_temp.pid(231), v_v, '{"game_id":"X"}'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6j unconvertible value', public.leave_scrabble_seat('GSL', pg_temp.pid(231), v_v, '{"winner_player_id":"not-a-uuid"}'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6j 2-d turn_order', public.leave_scrabble_seat('GSL', pg_temp.pid(231), v_v, jsonb_build_object('turn_order', jsonb_build_array(jsonb_build_array(pg_temp.pid(232), pg_temp.pid(233)))))->>'status', 'invalid');
  perform pg_temp.assert_eq('6j empty patch keeps the leaver in turn_order', (public.leave_scrabble_seat('GSL', pg_temp.pid(231), v_v, '{}'::jsonb))::text, '{"reason": "seat_not_removed", "status": "invalid"}');
  perform pg_temp.assert_eq('6j a patch that keeps the leaver', public.leave_scrabble_seat('GSL', pg_temp.pid(231), v_v, jsonb_build_object('status_message', 'x'))->>'reason', 'seat_not_removed');
  perform pg_temp.assert_eq('6j rejected: nothing changed', ((select count(*) from public.players where game_id = 'GSL'), (pg_temp.sess('GSL')).updated_at = v_v)::text, '(3,t)');
  perform pg_temp.assert_eq('6j left', public.leave_scrabble_seat('GSL', pg_temp.pid(231), v_v,
    jsonb_build_object('turn_order', jsonb_build_array(pg_temp.pid(232), pg_temp.pid(233)), 'status_message', 'A left'))->>'status', 'left');
  perform pg_temp.assert_eq('6j patch applied, rows gone, version advanced', ((pg_temp.sess('GSL')).status_message,
    (pg_temp.sess('GSL')).turn_order = array[pg_temp.pid(232), pg_temp.pid(233)], (select count(*) from public.players where id = pg_temp.pid(231)),
    (select count(*) from public.scrabble_player_state where player_id = pg_temp.pid(231)), (pg_temp.sess('GSL')).updated_at > v_v)::text, '("A left",t,0,0,t)');
  perform pg_temp.assert_eq('6j other seats intact', (select count(*) from public.scrabble_player_state where game_id = 'GSL'), 2::bigint);
  perform pg_temp.assert_eq('6j other game intact', (select count(*) from public.players where id = pg_temp.pid(111)), 1::bigint);
  begin perform public.leave_scrabble_seat(null, pg_temp.pid(232), v_v, '{}'::jsonb); raise exception 'FAIL 6j: null game id accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

select pg_temp.assert_eq('priv leave anon', has_function_privilege('anon', 'public.leave_scrabble_seat(text, uuid, timestamptz, jsonb)', 'execute'), false);
select pg_temp.assert_eq('priv leave authenticated', has_function_privilege('authenticated', 'public.leave_scrabble_seat(text, uuid, timestamptz, jsonb)', 'execute'), false);
select pg_temp.assert_eq('priv leave service_role', has_function_privilege('service_role', 'public.leave_scrabble_seat(text, uuid, timestamptz, jsonb)', 'execute'), true);

-- 6k. State integers are validated against the database type's full signed 32-bit range (not a nine-digit text length),
--     in all three RPCs; negative scores and explicit null clocks stay valid.
do $$
declare
  v_v timestamptz := pg_temp.mk('GSQ', 26);
  v_w jsonb;
begin
  perform pg_temp.assert_eq('6k is_int4 boundary values', (public.scrabble_is_int4('2147483647'), public.scrabble_is_int4('-2147483648'),
    public.scrabble_is_int4('1000000000'), public.scrabble_is_int4('2147483648'), public.scrabble_is_int4('-2147483649'),
    public.scrabble_is_int4('99999999999'), public.scrabble_is_int4('1.5'), public.scrabble_is_int4('1e3'), public.scrabble_is_int4(''))::text,
    '(t,t,t,f,f,f,f,f,f)');
  -- move: a 10-digit clock that fits an integer is applied, one past the range is invalid and changes nothing
  perform pg_temp.assert_eq('6k move: 2147483647 clock', public.apply_scrabble_move('GSQ', v_v, '{"status_message":"m"}'::jsonb,
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(261), 'clock_ms_remaining', 2147483647, 'score', -5)))->>'status', 'applied');
  perform pg_temp.assert_eq('6k move: stored', ((pg_temp.st('GSQ', 26, 1)).clock_ms_remaining, (pg_temp.st('GSQ', 26, 1)).score)::text, '(2147483647,-5)');
  v_v := (pg_temp.sess('GSQ')).updated_at;
  perform pg_temp.assert_eq('6k move: 2147483648 clock', public.apply_scrabble_move('GSQ', v_v, '{"status_message":"m2"}'::jsonb,
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(261), 'clock_ms_remaining', 2147483648)))->>'status', 'invalid');
  perform pg_temp.assert_eq('6k move: 2147483648 score', public.apply_scrabble_move('GSQ', v_v, '{"status_message":"m2"}'::jsonb,
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(261), 'score', 2147483648)))->>'status', 'invalid');
  perform pg_temp.assert_eq('6k move: explicit null clock', public.apply_scrabble_move('GSQ', v_v, '{"status_message":"m3"}'::jsonb,
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(261), 'clock_ms_remaining', null)))->>'status', 'applied');
  v_v := (pg_temp.sess('GSQ')).updated_at;
  -- finish
  v_w := jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(262), 'score', 1000000000, 'clock_ms_remaining', 1000000000));
  perform pg_temp.assert_eq('6k finish: past range', public.finish_scrabble_session('GSQ', v_v, '{}'::jsonb,
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(262), 'score', -2147483649)))->>'status', 'invalid');
  perform pg_temp.assert_eq('6k finish: nothing written', (pg_temp.sess('GSQ')).phase, 'playing');
  perform pg_temp.assert_eq('6k finish: 1000000000 fits', public.finish_scrabble_session('GSQ', v_v, '{}'::jsonb, v_w)->>'status', 'finished');
  perform pg_temp.assert_eq('6k finish: stored', ((pg_temp.st('GSQ', 26, 2)).score, (pg_temp.st('GSQ', 26, 2)).clock_ms_remaining)::text, '(1000000000,1000000000)');
  -- start
  insert into public.games (id, title, host_token, game_type, status, scrabble_clock_mode, scrabble_clock_seconds)
    values ('GSY', 'range test', 'tok-GSY', 'scrabble', 'waiting', 'chess', 1000000);
  insert into public.players (id, game_id, name) values (pg_temp.pid(291), 'GSY', 'A'), (pg_temp.pid(292), 'GSY', 'B');
  v_w := jsonb_build_object('turn_order', jsonb_build_array(pg_temp.pid(291), pg_temp.pid(292)), 'phase', 'playing', 'clock_mode', 'chess');
  perform pg_temp.assert_eq('6k start: past range', public.start_scrabble_game('GSY', v_w, jsonb_build_array(
    jsonb_build_object('player_id', pg_temp.pid(291), 'score', 2147483648), jsonb_build_object('player_id', pg_temp.pid(292))))->>'reason', 'state_row');
  perform pg_temp.assert_eq('6k start: nothing written', (select count(*) from public.scrabble_sessions where game_id = 'GSY'), 0::bigint);
  perform pg_temp.assert_eq('6k start: 1000000000 order and clock fit', public.start_scrabble_game('GSY', v_w, jsonb_build_array(
    jsonb_build_object('player_id', pg_temp.pid(291), 'player_order', 1000000000, 'clock_ms_remaining', 1000000000, 'score', -3),
    jsonb_build_object('player_id', pg_temp.pid(292), 'clock_ms_remaining', 1000000000)))->>'status', 'started');
end $$;

-- 6k2. A JSON null aimed at a NOT NULL column is `invalid` (never a raised error) in every function that writes a patch.
do $$
declare
  v_v timestamptz := pg_temp.mk('GSN', 28);
  v_w jsonb := jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(281), 'score', 1));
begin
  perform pg_temp.assert_eq('6k2 finish', public.finish_scrabble_session('GSN', v_v, '{"current_turn_index":null}'::jsonb, v_w)->>'reason', 'null_required_column');
  perform pg_temp.assert_eq('6k2 move', public.apply_scrabble_move('GSN', v_v, '{"current_turn_index":null}'::jsonb, v_w)->>'reason', 'null_required_column');
  perform pg_temp.assert_eq('6k2 leave', public.leave_scrabble_seat('GSN', pg_temp.pid(281), v_v, '{"current_turn_index":null}'::jsonb)->>'reason', 'null_required_column');
  update public.games set status = 'waiting' where id = 'GSN';
  perform pg_temp.assert_eq('6k2 start', public.start_scrabble_game('GSN', '{"phase":"playing","turn_order":[],"current_turn_index":null}'::jsonb, v_w)->>'reason', 'null_required_column');
  perform pg_temp.assert_eq('6k2 a null on a NULLABLE column is fine', public.apply_scrabble_move('GSN', v_v, '{"winner_player_id":null}'::jsonb, v_w)->>'status', 'applied');
  perform pg_temp.assert_eq('6k2 nothing else written', (select count(*) from public.players where game_id = 'GSN'), 3::bigint);
end $$;

-- 6l. A `waiting` game has no live round: a finish (a leave of a two-seat room whose start never flipped) cannot publish a
--     winner for it, and nothing is written. A finished session of a reopened lobby is still `already_finished`.
do $$
declare
  v_v timestamptz := pg_temp.mk('GSX', 27);
  v_out jsonb;
begin
  update public.games set status = 'waiting' where id = 'GSX';
  v_out := public.finish_scrabble_session('GSX', v_v, '{"status_message":"w"}'::jsonb,
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(271), 'score', 99)));
  perform pg_temp.assert_eq('6l waiting game refused', (v_out->>'status', v_out->>'reason')::text, '(invalid,game_waiting)');
  perform pg_temp.assert_eq('6l nothing written', ((pg_temp.sess('GSX')).phase, (pg_temp.st('GSX', 27, 1)).score, (pg_temp.g('GSX')).status)::text, '(playing,10,waiting)');
  update public.games set status = 'active' where id = 'GSX';
  perform pg_temp.assert_eq('6l the same finish on an active game works', public.finish_scrabble_session('GSX', v_v, '{"status_message":"w"}'::jsonb,
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(271), 'score', 99)))->>'status', 'finished');
  -- a finished session under a waiting game (reopened lobby) is still the idempotent repair answer, not `invalid`
  update public.games set status = 'waiting' where id = 'GSX';
  perform pg_temp.assert_eq('6l reopened lobby: already_finished', public.finish_scrabble_session('GSX', v_v, '{}'::jsonb, '[]'::jsonb)->>'status', 'already_finished');
end $$;

rollback;
