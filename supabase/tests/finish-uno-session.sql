-- Repeatable test for public.finish_uno_session() (supabase/migrations/20261204000000_finish_uno_session.sql).
--
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/finish-uno-session.sql
-- One transaction, rolled back at the end. Any failed assertion raises and exits non-zero. Run against a fully
-- migrated database (supabase db reset, or every migration applied in order).
--
-- Cases: a normal finish applies the whole payload atomically; a repeat is `already_finished`, awards nothing
-- again and only completes the games flip; a stale version is `lost` and changes nothing; malformed payloads are
-- `invalid` and change nothing; NULL arguments raise; privileges (anon / authenticated denied, service_role
-- allowed). The concurrent double finish is in finish-session-locks.sh.

begin;

create function pg_temp.assert_eq(label text, got anyelement, want anyelement) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL %: got %, want %', label, got, want;
  end if;
end $$;

create function pg_temp.pid(n int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-000000000' || lpad(n::text, 3, '0'))::uuid $$;

-- A live Uno game GU<n>: players 1..3 (ids pid(n*10+1..3)), a session at version t0, three one-card hands.
create function pg_temp.mk(gid text, n int, series boolean default false) returns timestamptz language plpgsql as $$
declare
  t0 timestamptz := '2026-01-01T00:00:00.123456Z';
begin
  insert into public.games (id, title, host_token, game_type, status, uno_series_scoring, uno_series_target)
    values (gid, 'finish test', 'tok-' || gid, 'uno', 'active', series, 100);
  insert into public.players (id, game_id, name) values
    (pg_temp.pid(n * 10 + 1), gid, 'A'), (pg_temp.pid(n * 10 + 2), gid, 'B'), (pg_temp.pid(n * 10 + 3), gid, 'C');
  insert into public.uno_sessions (game_id, turn_order, phase, draw_pile, status_message, updated_at)
    values (gid, array[pg_temp.pid(n * 10 + 1), pg_temp.pid(n * 10 + 2), pg_temp.pid(n * 10 + 3)], 'playing',
            '[{"id":"w1"}]'::jsonb, 'playing', t0);
  insert into public.uno_player_hands (game_id, player_id, cards, player_order) values
    (gid, pg_temp.pid(n * 10 + 1), '[{"id":"a1"}]', 0), (gid, pg_temp.pid(n * 10 + 2), '[{"id":"b1"}]', 1),
    (gid, pg_temp.pid(n * 10 + 3), '[{"id":"c1"}]', 2);
  -- the version trigger strictly advances updated_at on every update; read back the stored value
  return (select updated_at from public.uno_sessions where game_id = gid);
end $$;

create function pg_temp.sess(gid text) returns public.uno_sessions language sql as $$ select * from public.uno_sessions where game_id = gid $$;
create function pg_temp.g(gid text) returns public.games language sql as $$ select * from public.games where id = gid $$;
create function pg_temp.hand(gid text, n int, k int) returns jsonb language sql as $$
  select cards from public.uno_player_hands where game_id = gid and player_id = pg_temp.pid(n * 10 + k) $$;

-- 1. Normal finish: everything lands in one go.
do $$
declare
  v_v timestamptz := pg_temp.mk('GU1', 1, true);
  v_out jsonb;
begin
  v_out := public.finish_uno_session(
    'GU1', v_v,
    jsonb_build_object('winner_player_id', pg_temp.pid(11), 'status_message', 'A wins', 'draw_pile', '[]'::jsonb),
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(11), 'cards', '[{"id":"w1"},{"id":"a1"}]'::jsonb,
                                         'stats', '{"uno_uno_calls":1}'::jsonb)),
    jsonb_build_object('winner_id', pg_temp.pid(11)::text, 'points', 40),
    array[pg_temp.pid(12)], null);
  perform pg_temp.assert_eq('1 status', v_out->>'status', 'finished');
  perform pg_temp.assert_eq('1 flipped', v_out->>'games_flipped', 'true');
  perform pg_temp.assert_eq('1 phase', (pg_temp.sess('GU1')).phase, 'finished');
  perform pg_temp.assert_eq('1 winner', (pg_temp.sess('GU1')).winner_player_id, pg_temp.pid(11));
  perform pg_temp.assert_eq('1 pile patched', (pg_temp.sess('GU1')).draw_pile, '[]'::jsonb);
  perform pg_temp.assert_eq('1 deadline cleared', (pg_temp.sess('GU1')).turn_deadline_at is null, true);
  perform pg_temp.assert_eq('1 hand written', pg_temp.hand('GU1', 1, 1), '[{"id":"w1"},{"id":"a1"}]'::jsonb);
  perform pg_temp.assert_eq('1 stats written', (select stats from public.uno_player_hands where game_id = 'GU1' and player_id = pg_temp.pid(11)), '{"uno_uno_calls":1}'::jsonb);
  perform pg_temp.assert_eq('1 other hand untouched', pg_temp.hand('GU1', 1, 2), '[{"id":"b1"}]'::jsonb);
  perform pg_temp.assert_eq('1 series points', (pg_temp.g('GU1')).uno_series_scores, jsonb_build_object(pg_temp.pid(11)::text, 40));
  perform pg_temp.assert_eq('1 series winner not yet (40 < 100)', (pg_temp.g('GU1')).uno_series_winner_id, null::text);
  perform pg_temp.assert_eq('1 spectator flag', (select spectator from public.players where id = pg_temp.pid(12)), true);
  perform pg_temp.assert_eq('1 game finished', (pg_temp.g('GU1')).status, 'finished');
  perform pg_temp.assert_eq('1 finished_at', (pg_temp.g('GU1')).finished_at is not null, true);
  perform pg_temp.assert_eq('1 bookkeeping marker owed by this finish', ((pg_temp.g('GU1')).finish_bookkeeping->>'finished_at')::timestamptz, (pg_temp.g('GU1')).finished_at);
end $$;

-- 2. A second call is already_finished: no re-award, no rewrite, flip completed idempotently.
do $$
declare
  v_v timestamptz := (pg_temp.sess('GU1')).updated_at;
  v_out jsonb;
  v_scores jsonb := (pg_temp.g('GU1')).uno_series_scores;
  v_hand jsonb := pg_temp.hand('GU1', 1, 1);
begin
  v_out := public.finish_uno_session('GU1', v_v, '{"status_message":"second"}'::jsonb,
    '[{"player_id":"00000000-0000-0000-0000-000000000011","cards":[]}]'::jsonb,
    jsonb_build_object('winner_id', pg_temp.pid(11)::text, 'points', 40), null, null);
  perform pg_temp.assert_eq('2 status', v_out->>'status', 'already_finished');
  perform pg_temp.assert_eq('2 nothing to flip', v_out->>'games_flipped', 'false');
  perform pg_temp.assert_eq('2 points awarded exactly once', (pg_temp.g('GU1')).uno_series_scores, v_scores);
  perform pg_temp.assert_eq('2 hand not rewritten', pg_temp.hand('GU1', 1, 1), v_hand);
  perform pg_temp.assert_eq('2 session not rewritten', (pg_temp.sess('GU1')).status_message, 'A wins');
end $$;

-- 3. Session finished but the games row still active (a flip that failed): already_finished completes the flip.
do $$
declare
  v_v timestamptz := pg_temp.mk('GU3', 3, true);
  v_out jsonb;
begin
  update public.uno_sessions set phase = 'finished' where game_id = 'GU3';
  v_out := public.finish_uno_session('GU3', v_v, '{}'::jsonb, '[]'::jsonb, jsonb_build_object('winner_id', pg_temp.pid(31)::text, 'points', 500), null, null);
  perform pg_temp.assert_eq('3 status', v_out->>'status', 'already_finished');
  perform pg_temp.assert_eq('3 flip completed', v_out->>'games_flipped', 'true');
  perform pg_temp.assert_eq('3 game finished', (pg_temp.g('GU3')).status, 'finished');
  perform pg_temp.assert_eq('3 no points awarded on already_finished', (pg_temp.g('GU3')).uno_series_scores, '{}'::jsonb);
  perform pg_temp.assert_eq('3 marker written', (pg_temp.g('GU3')).finish_bookkeeping is not null, true);
  -- and a repeat flips nothing
  perform pg_temp.assert_eq('3 repeat', public.finish_uno_session('GU3', v_v, '{}'::jsonb, '[]'::jsonb)->>'games_flipped', 'false');
end $$;

-- 4. Stale version: lost, nothing written.
do $$
declare
  v_v timestamptz := pg_temp.mk('GU4', 4, true);
  v_out jsonb;
begin
  v_out := public.finish_uno_session('GU4', v_v - interval '1 microsecond', '{"status_message":"stale"}'::jsonb,
    '[{"player_id":"00000000-0000-0000-0000-000000000041","cards":[]}]'::jsonb,
    jsonb_build_object('winner_id', pg_temp.pid(41)::text, 'points', 10), array[pg_temp.pid(42)], pg_temp.pid(43));
  perform pg_temp.assert_eq('4 status', v_out->>'status', 'lost');
  perform pg_temp.assert_eq('4 phase', (pg_temp.sess('GU4')).phase, 'playing');
  perform pg_temp.assert_eq('4 message', (pg_temp.sess('GU4')).status_message, 'playing');
  perform pg_temp.assert_eq('4 hand', pg_temp.hand('GU4', 4, 1), '[{"id":"a1"}]'::jsonb);
  perform pg_temp.assert_eq('4 points', (pg_temp.g('GU4')).uno_series_scores, '{}'::jsonb);
  perform pg_temp.assert_eq('4 spectator', (select spectator from public.players where id = pg_temp.pid(42)), false);
  perform pg_temp.assert_eq('4 leaver kept', (select count(*) from public.players where id = pg_temp.pid(43)), 1::bigint);
  perform pg_temp.assert_eq('4 game active', (pg_temp.g('GU4')).status, 'active');
end $$;

-- 5. Malformed payloads: invalid, nothing written (not even the valid parts).
do $$
declare
  v_v timestamptz := pg_temp.mk('GU5', 5, true);
  v_ok_hand jsonb := '[{"player_id":"00000000-0000-0000-0000-000000000051","cards":[]}]';
  v_out jsonb;
begin
  v_out := public.finish_uno_session('GU5', v_v, '{"game_id":"X"}'::jsonb, '[]'::jsonb);
  perform pg_temp.assert_eq('5a protected column', v_out->>'status', 'invalid');
  v_out := public.finish_uno_session('GU5', v_v, '{"phase":"playing"}'::jsonb, '[]'::jsonb);
  perform pg_temp.assert_eq('5b phase is not patchable', v_out->>'status', 'invalid');
  v_out := public.finish_uno_session('GU5', v_v, '{"updated_at":"2020-01-01"}'::jsonb, '[]'::jsonb);
  perform pg_temp.assert_eq('5c version is not patchable', v_out->>'status', 'invalid');
  v_out := public.finish_uno_session('GU5', v_v, '{"no_such_column":1}'::jsonb, '[]'::jsonb);
  perform pg_temp.assert_eq('5d unknown column', v_out->>'status', 'invalid');
  v_out := public.finish_uno_session('GU5', v_v, '[]'::jsonb, '[]'::jsonb);
  perform pg_temp.assert_eq('5e patch not an object', v_out->>'status', 'invalid');
  v_out := public.finish_uno_session('GU5', v_v, '{}'::jsonb, '{}'::jsonb);
  perform pg_temp.assert_eq('5f hands not an array', v_out->>'status', 'invalid');
  v_out := public.finish_uno_session('GU5', v_v, '{"status_message":"x"}'::jsonb, '[{"player_id":"nope"}]'::jsonb);
  perform pg_temp.assert_eq('5g bad player id', v_out->>'status', 'invalid');
  v_out := public.finish_uno_session('GU5', v_v, '{}'::jsonb, '[{"player_id":"00000000-0000-0000-0000-000000000051","owner":"x"}]'::jsonb);
  perform pg_temp.assert_eq('5h unknown hand key', v_out->>'status', 'invalid');
  v_out := public.finish_uno_session('GU5', v_v, '{}'::jsonb, '[{"player_id":"00000000-0000-0000-0000-000000000051","cards":"x"}]'::jsonb);
  perform pg_temp.assert_eq('5i cards not an array', v_out->>'status', 'invalid');
  v_out := public.finish_uno_session('GU5', v_v, '{}'::jsonb, v_ok_hand, '{"winner_id":"","points":1}'::jsonb);
  perform pg_temp.assert_eq('5j series winner', v_out->>'status', 'invalid');
  v_out := public.finish_uno_session('GU5', v_v, '{}'::jsonb, v_ok_hand, '{"winner_id":"w","points":-3}'::jsonb);
  perform pg_temp.assert_eq('5k series points', v_out->>'status', 'invalid');
  perform pg_temp.assert_eq('5 nothing written', (pg_temp.sess('GU5')).phase, 'playing');
  perform pg_temp.assert_eq('5 still active', (pg_temp.g('GU5')).status, 'active');
  perform pg_temp.assert_eq('5 session version unchanged', (pg_temp.sess('GU5')).updated_at, v_v);
  -- a missing game / session is reported, not raised
  perform pg_temp.assert_eq('5l missing game', public.finish_uno_session('NOPE', v_v, '{}'::jsonb, '[]'::jsonb)->>'status', 'invalid');
end $$;

-- 6. Reaching the series target records the series winner; a leaver's rows are removed in the same step.
do $$
declare
  v_v timestamptz := pg_temp.mk('GU6', 6, true);
  v_out jsonb;
begin
  update public.games set uno_series_scores = jsonb_build_object(pg_temp.pid(61)::text, 80) where id = 'GU6';
  v_out := public.finish_uno_session('GU6', v_v, '{"status_message":"B left"}'::jsonb, '[]'::jsonb,
    jsonb_build_object('winner_id', pg_temp.pid(61)::text, 'points', 30), null, pg_temp.pid(62));
  perform pg_temp.assert_eq('6 status', v_out->>'status', 'finished');
  perform pg_temp.assert_eq('6 total', (pg_temp.g('GU6')).uno_series_scores->>(pg_temp.pid(61)::text), '110');
  perform pg_temp.assert_eq('6 series winner', (pg_temp.g('GU6')).uno_series_winner_id, pg_temp.pid(61)::text);
  perform pg_temp.assert_eq('6 leaver player removed', (select count(*) from public.players where id = pg_temp.pid(62)), 0::bigint);
  perform pg_temp.assert_eq('6 leaver hand removed', (select count(*) from public.uno_player_hands where player_id = pg_temp.pid(62)), 0::bigint);
  -- a series that is already won is not extended
  perform pg_temp.mk('GU7', 7, true);
  update public.games set uno_series_winner_id = 'someone', uno_series_scores = '{"x":5}' where id = 'GU7';
  perform public.finish_uno_session('GU7', (pg_temp.sess('GU7')).updated_at, '{}'::jsonb, '[]'::jsonb, jsonb_build_object('winner_id', pg_temp.pid(71)::text, 'points', 50));
  perform pg_temp.assert_eq('7 series already won: untouched', (pg_temp.g('GU7')).uno_series_scores, '{"x":5}'::jsonb);
  -- series scoring off: no points
  perform pg_temp.mk('GU8', 8, false);
  perform public.finish_uno_session('GU8', (pg_temp.sess('GU8')).updated_at, '{}'::jsonb, '[]'::jsonb, jsonb_build_object('winner_id', pg_temp.pid(81)::text, 'points', 50));
  perform pg_temp.assert_eq('8 scoring off: no points', (pg_temp.g('GU8')).uno_series_scores, '{}'::jsonb);
end $$;

-- 6b. An already finished round never removes anyone from the published result, and re-awards nothing.
do $$
declare
  v_v timestamptz := pg_temp.mk('GUA', 0, true);
  v_out jsonb;
begin
  update public.uno_sessions set phase = 'finished' where game_id = 'GUA';
  v_out := public.finish_uno_session('GUA', v_v, '{}'::jsonb, '[]'::jsonb,
    jsonb_build_object('winner_id', pg_temp.pid(1)::text, 'points', 500), null, pg_temp.pid(2));
  perform pg_temp.assert_eq('6b status', v_out->>'status', 'already_finished');
  perform pg_temp.assert_eq('6b leaver kept in the published result', (select count(*) from public.players where id = pg_temp.pid(2)), 1::bigint);
  perform pg_temp.assert_eq('6b leaver hand kept', (select count(*) from public.uno_player_hands where player_id = pg_temp.pid(2)), 1::bigint);
  perform pg_temp.assert_eq('6b no points', (pg_temp.g('GUA')).uno_series_scores, '{}'::jsonb);
end $$;

-- 6c. Payload identity hardening: a JSON null / non-string / duplicated / foreign player id is invalid and writes nothing.
do $$
declare
  v_v timestamptz := pg_temp.mk('GUB', 12, true);
  v_other timestamptz := pg_temp.mk('GUC', 11, false);
begin
  perform pg_temp.assert_eq('6c null player id', public.finish_uno_session('GUB', v_v, '{}'::jsonb, '[{"player_id":null,"cards":[]}]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6c numeric player id', public.finish_uno_session('GUB', v_v, '{}'::jsonb, '[{"player_id":5,"cards":[]}]'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6c duplicate player id', public.finish_uno_session('GUB', v_v, '{}'::jsonb,
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(121), 'cards', '[]'::jsonb), jsonb_build_object('player_id', pg_temp.pid(121), 'stats', '{}'::jsonb)))->>'status', 'invalid');
  perform pg_temp.assert_eq('6c player of another game', public.finish_uno_session('GUB', v_v, '{}'::jsonb,
    jsonb_build_array(jsonb_build_object('player_id', pg_temp.pid(111), 'cards', '[]'::jsonb)))->>'status', 'invalid');
  perform pg_temp.assert_eq('6c series winner of another game', public.finish_uno_session('GUB', v_v, '{}'::jsonb, '[]'::jsonb,
    jsonb_build_object('winner_id', pg_temp.pid(111)::text, 'points', 1))->>'status', 'invalid');
  perform pg_temp.assert_eq('6c series winner not a string', public.finish_uno_session('GUB', v_v, '{}'::jsonb, '[]'::jsonb, '{"winner_id":7,"points":1}'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6c series points not a number', public.finish_uno_session('GUB', v_v, '{}'::jsonb, '[]'::jsonb,
    jsonb_build_object('winner_id', pg_temp.pid(121)::text, 'points', '5'))->>'status', 'invalid');
  perform pg_temp.assert_eq('6c null spectator', public.finish_uno_session('GUB', v_v, '{}'::jsonb, '[]'::jsonb, null, array[null]::uuid[])->>'status', 'invalid');
  perform pg_temp.assert_eq('6c spectator of another game', public.finish_uno_session('GUB', v_v, '{}'::jsonb, '[]'::jsonb, null, array[pg_temp.pid(111)])->>'status', 'invalid');
  perform pg_temp.assert_eq('6c removal of another game player', public.finish_uno_session('GUB', v_v, '{}'::jsonb, '[]'::jsonb, null, null, pg_temp.pid(111))->>'status', 'invalid');
  perform pg_temp.assert_eq('6c nothing written', (pg_temp.sess('GUB')).phase, 'playing');
  perform pg_temp.assert_eq('6c game still active', (pg_temp.g('GUB')).status, 'active');
  perform pg_temp.assert_eq('6c other game untouched', (pg_temp.sess('GUC')).phase, 'playing');
end $$;

-- 6d. Round identity: a finish decided about another round is lost; a replayed (waiting) game is never re-finished.
do $$
declare
  v_v timestamptz := pg_temp.mk('GUD', 13, true);
begin
  update public.games set session_started_at = '2026-02-01T00:00:00Z', sessions_played = 3 where id = 'GUD';
  perform pg_temp.assert_eq('6d other round (started_at)', public.finish_uno_session('GUD', v_v, '{}'::jsonb, '[]'::jsonb, null, null, null,
    '{"session_started_at":"2026-01-01T00:00:00Z"}'::jsonb)->>'status', 'lost');
  perform pg_temp.assert_eq('6d other round (sessions_played)', public.finish_uno_session('GUD', v_v, '{}'::jsonb, '[]'::jsonb, null, null, null,
    '{"sessions_played":2}'::jsonb)->>'status', 'lost');
  perform pg_temp.assert_eq('6d round shape', public.finish_uno_session('GUD', v_v, '{}'::jsonb, '[]'::jsonb, null, null, null, '{"x":1}'::jsonb)->>'status', 'invalid');
  perform pg_temp.assert_eq('6d nothing written', (pg_temp.sess('GUD')).phase, 'playing');
  -- the round check also guards the already-finished branch
  update public.uno_sessions set phase = 'finished' where game_id = 'GUD';
  perform pg_temp.assert_eq('6d already finished but another round', public.finish_uno_session('GUD', v_v, '{}'::jsonb, '[]'::jsonb, null, null, null,
    '{"sessions_played":2}'::jsonb)->>'status', 'lost');
  perform pg_temp.assert_eq('6d game untouched', (pg_temp.g('GUD')).status, 'active');
  -- matching round: finishes (here: repairs the flip)
  perform pg_temp.assert_eq('6d matching round', public.finish_uno_session('GUD', v_v, '{}'::jsonb, '[]'::jsonb, null, null, null,
    '{"sessions_played":3,"session_started_at":"2026-02-01T00:00:00Z"}'::jsonb)->>'status', 'already_finished');
  perform pg_temp.assert_eq('6d flipped', (pg_temp.g('GUD')).status, 'finished');
  -- a replayed game (waiting) with the finished session row left over is NOT flipped again
  update public.games set status = 'waiting', finished_at = null, finish_bookkeeping = null where id = 'GUD';
  perform pg_temp.assert_eq('6d replay: no flip', public.finish_uno_session('GUD', v_v, '{}'::jsonb, '[]'::jsonb)->>'games_flipped', 'false');
  perform pg_temp.assert_eq('6d replay: still waiting', (pg_temp.g('GUD')).status, 'waiting');
end $$;

-- 6e. A game that was already ended otherwise (admin kill-switch) keeps its finished_at: the finish still lands on the
--     session but flips nothing.
do $$
declare
  v_v timestamptz := pg_temp.mk('GUE', 14, false);
  v_out jsonb;
begin
  update public.games set status = 'finished', finished_at = '2026-03-01T00:00:00Z' where id = 'GUE';
  v_out := public.finish_uno_session('GUE', v_v, '{}'::jsonb, '[]'::jsonb);
  perform pg_temp.assert_eq('6e status', v_out->>'status', 'finished');
  perform pg_temp.assert_eq('6e no flip', v_out->>'games_flipped', 'false');
  perform pg_temp.assert_eq('6e finished_at kept', (pg_temp.g('GUE')).finished_at, '2026-03-01T00:00:00Z'::timestamptz);
end $$;

-- 7. NULL arguments raise (the required ones).
do $$
declare
  v_v timestamptz := pg_temp.mk('GU9', 9);
begin
  begin perform public.finish_uno_session(null, v_v, '{}'::jsonb, '[]'::jsonb); raise exception 'FAIL 9a: null game id accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.finish_uno_session('GU9', null, '{}'::jsonb, '[]'::jsonb); raise exception 'FAIL 9b: null version accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.finish_uno_session('GU9', v_v, null, '[]'::jsonb); raise exception 'FAIL 9c: null patch accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.finish_uno_session('GU9', v_v, '{}'::jsonb, null); raise exception 'FAIL 9d: null hands accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform pg_temp.assert_eq('9 nothing written', (pg_temp.sess('GU9')).phase, 'playing');
end $$;

-- 8. Privileges: anon / authenticated denied, service_role allowed.
select pg_temp.assert_eq('priv anon', has_function_privilege('anon', 'public.finish_uno_session(text, timestamptz, jsonb, jsonb, jsonb, uuid[], uuid, jsonb)', 'execute'), false);
select pg_temp.assert_eq('priv authenticated', has_function_privilege('authenticated', 'public.finish_uno_session(text, timestamptz, jsonb, jsonb, jsonb, uuid[], uuid, jsonb)', 'execute'), false);
select pg_temp.assert_eq('priv public', has_function_privilege('public', 'public.finish_uno_session(text, timestamptz, jsonb, jsonb, jsonb, uuid[], uuid, jsonb)', 'execute'), false);
select pg_temp.assert_eq('priv service_role', has_function_privilege('service_role', 'public.finish_uno_session(text, timestamptz, jsonb, jsonb, jsonb, uuid[], uuid, jsonb)', 'execute'), true);

rollback;
