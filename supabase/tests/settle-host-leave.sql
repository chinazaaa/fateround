-- Host leave handoff: repeatable test for public.settle_host_leave()
-- (supabase/migrations/20261203900000_settle_host_leave.sql) and the NULL guards of the session-bound message
-- functions (supabase/migrations/20261203800000_session_bound_message_writes.sql).
--
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/settle-host-leave.sql
-- One transaction, rolled back at the end. Any failed assertion raises and exits non-zero.
--
-- The function runs under `FOR UPDATE` on the games row and decides against the CURRENT row and roster, so the
-- cases below are the interleavings the app used to race: a retained seat, a replay, a landed nominee, a claimed
-- host, a nominee who left, no eligible successor.

begin;

-- games.host_user_id references auth.users: the users the cases below link as hosts.
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222')
  on conflict (id) do nothing;

create function pg_temp.assert_eq(label text, got anyelement, want anyelement) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL %: got %, want %', label, got, want;
  end if;
end $$;

create function pg_temp.mk(gid text, status text, extra jsonb default '{}') returns void language plpgsql as $$
begin
  insert into public.games (id, title, host_token, game_type, status) values (gid, 'settle test', 'tok-' || gid, 'uno', status);
  insert into public.players (id, game_id, name, joined_at, is_bot, spectator) values
    (('00000000-0000-0000-0000-0000000001' || lpad(ascii(substr(gid, 3))::text, 2, '0'))::uuid, gid, 'Late', now() - interval '1 minute', false, false),
    (('00000000-0000-0000-0000-0000000002' || lpad(ascii(substr(gid, 3))::text, 2, '0'))::uuid, gid, 'Early', now() - interval '10 minutes', false, false),
    (('00000000-0000-0000-0000-0000000003' || lpad(ascii(substr(gid, 3))::text, 2, '0'))::uuid, gid, 'Bot', now() - interval '20 minutes', true, false);
end $$;

-- Fixed ids per game: late = ...01<n>, early = ...02<n>, bot = ...03<n>, host = ...09<n>.
create function pg_temp.late(gid text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-0000000001' || lpad(ascii(substr(gid, 3))::text, 2, '0'))::uuid $$;
create function pg_temp.early(gid text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-0000000002' || lpad(ascii(substr(gid, 3))::text, 2, '0'))::uuid $$;
create function pg_temp.hostid(gid text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-0000000009' || lpad(ascii(substr(gid, 3))::text, 2, '0'))::uuid $$;
create function pg_temp.settle(gid text, with_user boolean default true, sp integer default 1) returns jsonb language sql as $$
  select public.settle_host_leave(gid, pg_temp.hostid(gid), case when with_user then '11111111-1111-1111-1111-111111111111'::uuid end, null, sp)
$$;
create function pg_temp.g(gid text) returns public.games language sql as $$ select * from public.games where id = gid $$;

-- 1. Hostless live game: the OLDEST non-bot player is nominated; the user linkage is cleared.
select pg_temp.mk('ST1', 'active');
update public.games set host_user_id = '11111111-1111-1111-1111-111111111111' where id = 'ST1';
select pg_temp.assert_eq('1 status', pg_temp.settle('ST1')->>'status', 'nominated');
select pg_temp.assert_eq('1 nominee is the oldest eligible', (pg_temp.g('ST1')).pending_host_player_id, pg_temp.early('ST1'));
select pg_temp.assert_eq('1 host_user_id cleared', (pg_temp.g('ST1')).host_user_id, null::uuid);
select pg_temp.assert_eq('1 stays live', (pg_temp.g('ST1')).status, 'active');
-- Idempotent: the nominee now exists, so a repeat settles and changes nothing.
select pg_temp.assert_eq('1 repeat', pg_temp.settle('ST1')->>'status', 'settled');
select pg_temp.assert_eq('1 repeat keeps nominee', (pg_temp.g('ST1')).pending_host_player_id, pg_temp.early('ST1'));

-- 2. The first pick left: the successor is chosen from the CURRENT roster (no FK violation on a departed nominee).
select pg_temp.mk('ST2', 'active');
delete from public.players where id = pg_temp.early('ST2');
select pg_temp.assert_eq('2 status', pg_temp.settle('ST2')->>'status', 'nominated');
select pg_temp.assert_eq('2 nominee', (pg_temp.g('ST2')).pending_host_player_id, pg_temp.late('ST2'));

-- 3. Nobody eligible (only a bot and a spectator left): the game ends, reason + finished_at in the same update.
select pg_temp.mk('ST3', 'active');
delete from public.players where id in (pg_temp.early('ST3'), pg_temp.late('ST3'));
-- A non-bot SPECTATOR stays: the game still ends only because spectators are not eligible.
insert into public.players (id, game_id, name, joined_at, is_bot, spectator) values ('00000000-0000-0000-0000-0000000004ff', 'ST3', 'Spec', now() - interval '30 minutes', false, true);
update public.games set host_user_id = '11111111-1111-1111-1111-111111111111' where id = 'ST3';
select pg_temp.assert_eq('3 status', pg_temp.settle('ST3', true, 1)->>'status', 'finished');
select pg_temp.assert_eq('3 finished_now', pg_temp.settle('ST3', true, 1)->>'finished_now', 'false'); -- the repeat
select pg_temp.assert_eq('3 game finished', (pg_temp.g('ST3')).status, 'finished');
select pg_temp.assert_eq('3 reason', (pg_temp.g('ST3')).result_reason, 'host_ended');
select pg_temp.assert_eq('3 finished_at set', (pg_temp.g('ST3')).finished_at is not null, true);
select pg_temp.assert_eq('3 bookkeeping marker owed by this exact finish', (pg_temp.g('ST3')).finish_bookkeeping->>'attempts', '0');
select pg_temp.assert_eq('3 marker bound to finished_at', ((pg_temp.g('ST3')).finish_bookkeeping->>'finished_at')::timestamptz, (pg_temp.g('ST3')).finished_at);
select pg_temp.assert_eq('3 host_user_id cleared', (pg_temp.g('ST3')).host_user_id, null::uuid);

-- 4. A waiting game ends the same way, and an untracked finish writes no bookkeeping marker.
select pg_temp.mk('ST4', 'waiting');
delete from public.players where id in (pg_temp.early('ST4'), pg_temp.late('ST4'));
select pg_temp.assert_eq('4 finished_now', pg_temp.settle('ST4', false)->>'finished_now', 'true');
select pg_temp.assert_eq('4 marker written for every game type', (pg_temp.g('ST4')).finish_bookkeeping is not null, true);

-- 5. The leaver's seat still exists: no handoff at all.
select pg_temp.mk('ST5', 'active');
insert into public.players (id, game_id, name, joined_at) values (pg_temp.hostid('ST5'), 'ST5', 'Host', now());
select pg_temp.assert_eq('5 status', pg_temp.settle('ST5')->>'status', 'seat_retained');
select pg_temp.assert_eq('5 game status reported', pg_temp.settle('ST5')->>'game_status', 'active');
select pg_temp.assert_eq('5 no nominee', (pg_temp.g('ST5')).pending_host_player_id, null::uuid);

-- 6. A valid nominee already exists (manual transfer landed): settled, nothing overwritten, linkage cleared.
select pg_temp.mk('ST6', 'active');
update public.games set pending_host_player_id = pg_temp.late('ST6'), host_user_id = '11111111-1111-1111-1111-111111111111' where id = 'ST6';
select pg_temp.assert_eq('6 status', pg_temp.settle('ST6')->>'status', 'settled');
select pg_temp.assert_eq('6 nominee kept', (pg_temp.g('ST6')).pending_host_player_id, pg_temp.late('ST6'));
select pg_temp.assert_eq('6 linkage cleared', (pg_temp.g('ST6')).host_user_id, null::uuid);

-- 7. Another existing player already claimed host: settled, and THEIR linkage survives.
select pg_temp.mk('ST7', 'active');
update public.games set host_player_id = pg_temp.late('ST7'), host_user_id = '22222222-2222-2222-2222-222222222222' where id = 'ST7';
select pg_temp.assert_eq('7 status', pg_temp.settle('ST7')->>'status', 'settled');
select pg_temp.assert_eq('7 host kept', (pg_temp.g('ST7')).host_player_id, pg_temp.late('ST7'));
select pg_temp.assert_eq('7 claimant linkage kept', (pg_temp.g('ST7')).host_user_id, '22222222-2222-2222-2222-222222222222'::uuid);
select pg_temp.assert_eq('7 no nomination', (pg_temp.g('ST7')).pending_host_player_id, null::uuid);

-- 7b. Another player hosts but the user linkage still equals the captured value: it belongs to the new host's
--     seat reference, so the clear (conditional on the game still referencing the outgoing host) must not apply.
select pg_temp.mk('STB', 'active');
update public.games set host_player_id = pg_temp.late('STB'), host_user_id = '11111111-1111-1111-1111-111111111111' where id = 'STB';
select pg_temp.assert_eq('7b status', pg_temp.settle('STB')->>'status', 'settled');
select pg_temp.assert_eq('7b linkage kept', (pg_temp.g('STB')).host_user_id, '11111111-1111-1111-1111-111111111111'::uuid);

-- 8. Already finished (by anyone): reported as finished (the caller runs the session-bound cleanup); the outgoing
--    linkage is cleared only while it still matches, and never for a different session.
select pg_temp.mk('ST8', 'finished');
update public.games set host_user_id = '11111111-1111-1111-1111-111111111111', finished_at = now(), result_reason = 'host_ended' where id = 'ST8';
select pg_temp.assert_eq('8 session changed: kept', pg_temp.settle('ST8', true, 2)->>'session_changed', 'true');
select pg_temp.assert_eq('8 linkage kept for another session', (pg_temp.g('ST8')).host_user_id, '11111111-1111-1111-1111-111111111111'::uuid);
select pg_temp.assert_eq('8 status', pg_temp.settle('ST8')->>'status', 'finished');
select pg_temp.assert_eq('8 not finished by this call', pg_temp.settle('ST8')->>'finished_now', 'false');
select pg_temp.assert_eq('8 linkage cleared', (pg_temp.g('ST8')).host_user_id, null::uuid);
select pg_temp.assert_eq('8 reason reported', pg_temp.settle('ST8')->>'result_reason', 'host_ended');

-- 9. A replay (session identity differs) is decided against the CURRENT row: a hostless replayed game still gets
--    a nominee, and the linkage (bound to the inspected session) is left alone.
select pg_temp.mk('ST9', 'active');
update public.games set sessions_played = 3, host_user_id = '11111111-1111-1111-1111-111111111111' where id = 'ST9';
select pg_temp.assert_eq('9 status', pg_temp.settle('ST9', true, 1)->>'status', 'nominated');
select pg_temp.assert_eq('9 changed flag', pg_temp.settle('ST9', true, 1)->>'session_changed', 'true');
-- The linkage belongs to the inspected session only: a replayed session keeps it, the nomination still happens.
select pg_temp.assert_eq('9 linkage of another session kept', (pg_temp.g('ST9')).host_user_id, '11111111-1111-1111-1111-111111111111'::uuid);

-- 9b. Hostless live game whose host_user_id belongs to a DIFFERENT user than the captured one: the nomination
--     happens and that user's linkage survives (the nomination no longer clears it unconditionally).
select pg_temp.mk('STC', 'active');
update public.games set host_user_id = '22222222-2222-2222-2222-222222222222' where id = 'STC';
select pg_temp.assert_eq('9b status', pg_temp.settle('STC')->>'status', 'nominated');
select pg_temp.assert_eq('9b other user linkage kept', (pg_temp.g('STC')).host_user_id, '22222222-2222-2222-2222-222222222222'::uuid);

-- 9c. Same for a fresh finish with nobody to hand it to.
select pg_temp.mk('STD', 'active');
delete from public.players where id in (pg_temp.early('STD'), pg_temp.late('STD'));
update public.games set host_user_id = '22222222-2222-2222-2222-222222222222' where id = 'STD';
select pg_temp.assert_eq('9c finished_now', pg_temp.settle('STD')->>'finished_now', 'true');
select pg_temp.assert_eq('9c other user linkage kept', (pg_temp.g('STD')).host_user_id, '22222222-2222-2222-2222-222222222222'::uuid);

-- 10. A game that is gone, and NULL arguments.
select pg_temp.assert_eq('10 missing', public.settle_host_leave('NOPE1', pg_temp.hostid('ST1'), null, null, 1)->>'status', 'game_missing');
do $$ begin
  perform public.settle_host_leave(null, '00000000-0000-0000-0000-000000000001', null, null, 1);
  raise exception 'FAIL: NULL game id accepted';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
do $$ begin
  perform public.settle_host_leave('ST1', null, null, null, 1);
  raise exception 'FAIL: NULL player id accepted';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
-- 11. wipe_finished_session_rows rejects a NULL kind BEFORE any delete (NOT IN is NULL for a NULL, so it would
--     otherwise skip the check), and deletes only for the finished session it was told about.
do $$ begin
  perform public.wipe_finished_session_rows('ST3', now(), null);
  raise exception 'FAIL: NULL kind accepted';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select pg_temp.mk('STA', 'finished');
update public.games set finished_at = '2026-01-01T00:00:00Z' where id = 'STA';
insert into public.codewords_messages (game_id, player_id, team, text) values ('STA', pg_temp.late('STA'), 'red', 'hi');
select pg_temp.assert_eq('11 other session: no wipe', public.wipe_finished_session_rows('STA', '2026-01-02T00:00:00Z', 'codewords')->>'status', 'not_current_session');
select pg_temp.assert_eq('11 still there', (select count(*) from public.codewords_messages where game_id = 'STA'), 1::bigint);
select pg_temp.assert_eq('11 same session: wiped', public.wipe_finished_session_rows('STA', '2026-01-01T00:00:00Z', 'codewords')->>'status', 'wiped');
select pg_temp.assert_eq('11 gone', (select count(*) from public.codewords_messages where game_id = 'STA'), 0::bigint);

-- 12. end_game_if_host_alone: ends the game while the host is still seated ONLY when nobody else is eligible.
create function pg_temp.alone(gid text, sp integer default 1) returns jsonb language sql as $$
  select public.end_game_if_host_alone(gid, pg_temp.hostid(gid), null, sp)
$$;
select pg_temp.mk('STE', 'active');
insert into public.players (id, game_id, name, joined_at) values (pg_temp.hostid('STE'), 'STE', 'Host', now());
update public.games set host_player_id = pg_temp.hostid('STE') where id = 'STE';
select pg_temp.assert_eq('12 eligible players: continue', pg_temp.alone('STE')->>'status', 'continue');
select pg_temp.assert_eq('12 untouched', (pg_temp.g('STE')).status, 'active');
delete from public.players where id in (pg_temp.early('STE'), pg_temp.late('STE'));
insert into public.players (id, game_id, name, joined_at, is_bot, spectator) values ('00000000-0000-0000-0000-0000000005ff', 'STE', 'Spec', now(), false, true);
select pg_temp.assert_eq('12 session changed: continue', pg_temp.alone('STE', 2)->>'status', 'continue');
update public.games set pending_host_player_id = '00000000-0000-0000-0000-0000000005ff' where id = 'STE';
select pg_temp.assert_eq('12 nominee: continue', pg_temp.alone('STE')->>'status', 'continue');
update public.games set pending_host_player_id = null where id = 'STE';
select pg_temp.assert_eq('12 only bot/spectator: finished', pg_temp.alone('STE')->>'status', 'finished');
select pg_temp.assert_eq('12 finished_now', pg_temp.alone('STE')->>'finished_now', 'false'); -- the repeat
select pg_temp.assert_eq('12 reason', (pg_temp.g('STE')).result_reason, 'host_ended');
select pg_temp.assert_eq('12 seat kept', (select count(*) from public.players where id = pg_temp.hostid('STE')), 1::bigint);
select pg_temp.assert_eq('12 host reference kept', (pg_temp.g('STE')).host_player_id, pg_temp.hostid('STE'));
select pg_temp.assert_eq('12 marker', (pg_temp.g('STE')).finish_bookkeeping->>'attempts', '0');
select pg_temp.mk('STF', 'finished');
update public.games set result_reason = 'admin_ended' where id = 'STF';
select pg_temp.assert_eq('12 finished for another reason: continue', pg_temp.alone('STF')->>'status', 'continue');
select pg_temp.assert_eq('12 ... and says the game is finished (the seat must be kept)', pg_temp.alone('STF')->>'game_status', 'finished');
select pg_temp.assert_eq('12 live continue reports the live status', pg_temp.alone('ST1')->>'game_status', 'active');
do $$ begin
  perform public.end_game_if_host_alone(null, '00000000-0000-0000-0000-000000000001', null, 1);
  raise exception 'FAIL: NULL game id accepted';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;

-- 13. FOR KEY SHARE with ORDER BY ... LIMIT 1 is accepted and still picks the oldest eligible player.
select pg_temp.mk('STG', 'active');
select pg_temp.assert_eq('13 oldest picked under the row lock', pg_temp.settle('STG')->>'nominee', pg_temp.early('STG')::text);

-- 14. remove_player_if_game_open: deletes the seat only while the game is open (the caller's status read can be stale).
select pg_temp.mk('STH', 'active');
select pg_temp.assert_eq('14 open: deleted', public.remove_player_if_game_open('STH', pg_temp.late('STH'))->>'status', 'deleted');
select pg_temp.assert_eq('14 open: gone', (select count(*) from public.players where id = pg_temp.late('STH')), 0::bigint);
update public.games set status = 'finished' where id = 'STH';
select pg_temp.assert_eq('14 finished: refused', public.remove_player_if_game_open('STH', pg_temp.early('STH'))->>'status', 'game_finished');
select pg_temp.assert_eq('14 finished: seat kept', (select count(*) from public.players where id = pg_temp.early('STH')), 1::bigint);
select pg_temp.assert_eq('14 missing game', public.remove_player_if_game_open('NOPE1', pg_temp.early('STH'))->>'status', 'game_missing');
select pg_temp.mk('STI', 'waiting');
select pg_temp.assert_eq('14 lobby: deleted', public.remove_player_if_game_open('STI', pg_temp.early('STI'))->>'status', 'deleted');
-- A player of ANOTHER game is never deleted through the wrong game id.
select pg_temp.mk('STJ', 'active');
select public.remove_player_if_game_open('STI', pg_temp.late('STJ'));
select pg_temp.assert_eq('14 wrong game id: the other game keeps its seat', (select count(*) from public.players where id = pg_temp.late('STJ')), 1::bigint);
do $$ begin
  perform public.remove_player_if_game_open(null, '00000000-0000-0000-0000-000000000001');
  raise exception 'FAIL: NULL game id accepted';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;

rollback;
