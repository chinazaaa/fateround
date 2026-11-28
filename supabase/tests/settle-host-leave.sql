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
  insert into public.games (id, title, host_token, game_type, status) values (gid, 'settle test', 'tok-' || gid, 'uno', case when status = 'finished' then 'waiting' else status end);
  insert into public.players (id, game_id, name, joined_at, is_bot, spectator) values
    (('00000000-0000-0000-0000-0000000001' || lpad(ascii(substr(gid, 3))::text, 2, '0'))::uuid, gid, 'Late', now() - interval '1 minute', false, false),
    (('00000000-0000-0000-0000-0000000002' || lpad(ascii(substr(gid, 3))::text, 2, '0'))::uuid, gid, 'Early', now() - interval '10 minutes', false, false),
    (('00000000-0000-0000-0000-0000000003' || lpad(ascii(substr(gid, 3))::text, 2, '0'))::uuid, gid, 'Bot', now() - interval '20 minutes', true, false);
  if status = 'finished' then
    update public.games set status = 'finished' where id = gid;
  end if;
end $$;

-- Fixed ids per game: late = ...01<n>, early = ...02<n>, bot = ...03<n>, host = ...09<n>.
create function pg_temp.late(gid text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-0000000001' || lpad(ascii(substr(gid, 3))::text, 2, '0'))::uuid $$;
create function pg_temp.early(gid text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-0000000002' || lpad(ascii(substr(gid, 3))::text, 2, '0'))::uuid $$;
create function pg_temp.hostid(gid text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-0000000009' || lpad(ascii(substr(gid, 3))::text, 2, '0'))::uuid $$;
create function pg_temp.settle(gid text, with_user boolean default true, sp integer default 1, track boolean default false) returns jsonb language sql as $$
  select public.settle_host_leave(gid, pg_temp.hostid(gid), case when with_user then '11111111-1111-1111-1111-111111111111'::uuid end, null, sp, track)
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
create temp table st3_first as select pg_temp.settle('ST3', true, 1, true) as r;
select pg_temp.assert_eq('3 status (the call that finishes)', (select r->>'status' from st3_first), 'finished');
select pg_temp.assert_eq('3 finished_now on the call that wins (the route owes the bookkeeping for it)', (select r->>'finished_now' from st3_first), 'true');
select pg_temp.assert_eq('3 finished_now on the repeat', pg_temp.settle('ST3', true, 1, true)->>'finished_now', 'false');
select pg_temp.assert_eq('3 the observed finish is not a replay', pg_temp.settle('ST3', true, 1, true)->>'replayed', 'false');
select pg_temp.assert_eq('3 an observed finish seen from ANOTHER generation is a replay', pg_temp.settle('ST3', true, 2, true)->>'replayed', 'true');
select pg_temp.assert_eq('3 game finished', (pg_temp.g('ST3')).status, 'finished');
select pg_temp.assert_eq('3 reason', (pg_temp.g('ST3')).result_reason, 'host_ended');
select pg_temp.assert_eq('3 finished_at set', (pg_temp.g('ST3')).finished_at is not null, true);
select pg_temp.assert_eq('3 tracked finish: marker owed by this exact finish', (pg_temp.g('ST3')).finish_bookkeeping->>'attempts', '0');
select pg_temp.assert_eq('3 marker bound to finished_at', ((pg_temp.g('ST3')).finish_bookkeeping->>'finished_at')::timestamptz, (pg_temp.g('ST3')).finished_at);
select pg_temp.assert_eq('3 host_user_id cleared', (pg_temp.g('ST3')).host_user_id, null::uuid);

-- 4. A waiting game ends the same way, and an untracked finish writes no bookkeeping marker.
select pg_temp.mk('ST4', 'waiting');
delete from public.players where id in (pg_temp.early('ST4'), pg_temp.late('ST4'));
select pg_temp.assert_eq('4 finished_now', pg_temp.settle('ST4', false)->>'finished_now', 'true');
select pg_temp.assert_eq('4 untracked finish writes no marker (the game owns no durable bookkeeping)', (pg_temp.g('ST4')).finish_bookkeeping is null, true);

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
create temp table st9_first as select pg_temp.settle('ST9', true, 1) as r;
select pg_temp.assert_eq('9 status (the call that nominates)', (select r->>'status' from st9_first), 'nominated');
select pg_temp.assert_eq('9 changed flag (the call that nominates)', (select r->>'session_changed' from st9_first), 'true');
create temp table st9_repeat as select pg_temp.settle('ST9', true, 1) as r;
select pg_temp.assert_eq('9 the repeat settles', (select r->>'status' from st9_repeat), 'settled');
select pg_temp.assert_eq('9 ...and still reports the change', (select r->>'session_changed' from st9_repeat), 'true');
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

-- 9d. A REPLAYED session (sessions_played differs) is never finished by an older leave, even with nobody left to hand it
--     to; a game that merely STARTED (same sessions_played) still is.
select pg_temp.mk('STT', 'active');
delete from public.players where id in (pg_temp.early('STT'), pg_temp.late('STT'));
update public.games set sessions_played = 5 where id = 'STT';
select pg_temp.assert_eq('9d replay: settled, not finished', pg_temp.settle('STT', true, 1)->>'status', 'settled');
select pg_temp.assert_eq('9d replay: still active', (pg_temp.g('STT')).status, 'active');
select pg_temp.assert_eq('9d the same session (sessions_played equal) is finished', pg_temp.settle('STT', true, 5)->>'status', 'finished');

-- 10. A game that is gone, and NULL arguments.
select pg_temp.assert_eq('10 missing', public.settle_host_leave('NOPE1', pg_temp.hostid('ST1'), null, null, 1, false)->>'status', 'game_missing');
do $$ begin
  perform public.settle_host_leave(null, '00000000-0000-0000-0000-000000000001', null, null, 1, false);
  raise exception 'FAIL: NULL game id accepted';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
do $$ begin
  perform public.settle_host_leave('ST1', null, null, null, 1, false);
  raise exception 'FAIL: NULL player id accepted';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
do $$ begin
  perform public.settle_host_leave('ST1', '00000000-0000-0000-0000-000000000001', null, null, 1, null);
  raise exception 'FAIL: NULL track flag accepted';
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
create function pg_temp.alone(gid text, sp integer default 1, track boolean default true) returns jsonb language sql as $$
  select public.end_game_if_host_alone(gid, pg_temp.hostid(gid), null, sp, track)
$$;
select pg_temp.mk('STE', 'active');
insert into public.players (id, game_id, name, joined_at) values (pg_temp.hostid('STE'), 'STE', 'Host', now());
update public.games set host_player_id = pg_temp.hostid('STE') where id = 'STE';
select pg_temp.assert_eq('12 eligible players: continue', pg_temp.alone('STE')->>'status', 'continue');
select pg_temp.assert_eq('12 untouched', (pg_temp.g('STE')).status, 'active');
delete from public.players where id in (pg_temp.early('STE'), pg_temp.late('STE'));
insert into public.players (id, game_id, name, joined_at, is_bot, spectator) values ('00000000-0000-0000-0000-0000000005ff', 'STE', 'Spec', now(), false, true);
select pg_temp.assert_eq('12 session changed: continue', pg_temp.alone('STE', 2)->>'status', 'continue');
create temp table ste_first as select pg_temp.alone('STE') as r;
select pg_temp.assert_eq('12 only bot/spectator: finished', (select r->>'status' from ste_first), 'finished');
select pg_temp.assert_eq('12 the winning call owns the finish (the route owes the bookkeeping for it)', (select r->>'finished_now' from ste_first), 'true');
select pg_temp.assert_eq('12 ...and reports the finish it wrote', ((select r->>'finished_at' from ste_first))::timestamptz, (pg_temp.g('STE')).finished_at);
select pg_temp.assert_eq('12 finished_now on the repeat', pg_temp.alone('STE')->>'finished_now', 'false');
select pg_temp.assert_eq('12 reason', (pg_temp.g('STE')).result_reason, 'host_ended');
select pg_temp.assert_eq('12 seat kept', (select count(*) from public.players where id = pg_temp.hostid('STE')), 1::bigint);
select pg_temp.assert_eq('12 host reference kept', (pg_temp.g('STE')).host_player_id, pg_temp.hostid('STE'));
select pg_temp.assert_eq('12 tracked: marker', (pg_temp.g('STE')).finish_bookkeeping->>'attempts', '0');
select pg_temp.mk('STF', 'finished');
update public.games set result_reason = 'admin_ended' where id = 'STF';
select pg_temp.assert_eq('12 finished for another reason: continue', pg_temp.alone('STF')->>'status', 'continue');
select pg_temp.assert_eq('12 ... and says the game is finished (the seat must be kept)', pg_temp.alone('STF')->>'game_status', 'finished');
select pg_temp.assert_eq('12 live continue reports the live status', pg_temp.alone('ST1')->>'game_status', 'active');
do $$ begin
  perform public.end_game_if_host_alone(null, '00000000-0000-0000-0000-000000000001', null, 1, true);
  raise exception 'FAIL: NULL game id accepted';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;

-- 12b. An untracked end writes no marker.
select pg_temp.mk('STL', 'active');
insert into public.players (id, game_id, name, joined_at) values (pg_temp.hostid('STL'), 'STL', 'Host', now());
update public.games set host_player_id = pg_temp.hostid('STL') where id = 'STL';
delete from public.players where id in (pg_temp.early('STL'), pg_temp.late('STL'));
select pg_temp.assert_eq('12b untracked end: finished', pg_temp.alone('STL', 1, false)->>'finished_now', 'true');
select pg_temp.assert_eq('12b untracked end: no marker', (pg_temp.g('STL')).finish_bookkeeping is null, true);

-- 12c. A nominee that stopped being ELIGIBLE (spectator / bot) does not count: the election replaces it.
select pg_temp.mk('STK', 'active');
update public.players set spectator = true where id = pg_temp.late('STK');
update public.games set pending_host_player_id = pg_temp.late('STK') where id = 'STK';
select pg_temp.assert_eq('12c spectator nominee: re-elected', pg_temp.settle('STK')->>'status', 'nominated');
select pg_temp.assert_eq('12c the eligible player replaces it', (pg_temp.g('STK')).pending_host_player_id, pg_temp.early('STK'));
select pg_temp.mk('STM', 'active');
update public.games set pending_host_player_id = ('00000000-0000-0000-0000-0000000003' || lpad(ascii('M')::text, 2, '0'))::uuid where id = 'STM';
select pg_temp.assert_eq('12c bot nominee: re-elected', pg_temp.settle('STM')->>'status', 'nominated');
select pg_temp.assert_eq('12c bot replaced by the eligible player', (pg_temp.g('STM')).pending_host_player_id, pg_temp.early('STM'));

-- 12d. end_game_if_host_alone: a pending nominee blocks the end only while ELIGIBLE (same rule as the settlement).
select pg_temp.mk('STV', 'active');
delete from public.players where id in (pg_temp.early('STV'), pg_temp.late('STV'));
insert into public.players (id, game_id, name, joined_at, spectator) values (pg_temp.hostid('STV'), 'STV', 'Host', now(), false);
insert into public.players (id, game_id, name, joined_at, spectator) values (pg_temp.late('STV'), 'STV', 'Nominee', now(), true);
update public.games set host_player_id = pg_temp.hostid('STV'), pending_host_player_id = pg_temp.late('STV') where id = 'STV';
select pg_temp.assert_eq('12d spectator nominee: the host leaving alone still ends the game', public.end_game_if_host_alone('STV', pg_temp.hostid('STV'), null, 1, false)->>'status', 'finished');
select pg_temp.assert_eq('12d the game is finished with its reason', (pg_temp.g('STV')).result_reason, 'host_ended');
select pg_temp.assert_eq('12d the dead nomination is cleared', (pg_temp.g('STV')).pending_host_player_id, null::uuid);
select pg_temp.assert_eq('12d the host keeps the seat', (select count(*) from public.players where id = pg_temp.hostid('STV')), 1::bigint);
select pg_temp.mk('STW', 'active');
delete from public.players where id = pg_temp.late('STW');
update public.players set spectator = true where id = pg_temp.early('STW');
insert into public.players (id, game_id, name, joined_at) values (pg_temp.hostid('STW'), 'STW', 'Host', now());
update public.players set spectator = false where id = pg_temp.early('STW');
update public.games set host_player_id = pg_temp.hostid('STW'), pending_host_player_id = pg_temp.early('STW') where id = 'STW';
select pg_temp.assert_eq('12d eligible nominee: continue (the handoff path)', public.end_game_if_host_alone('STW', pg_temp.hostid('STW'), null, 1, false)->>'status', 'continue');

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

-- 14e. The host leaving ALONE is finished under the same lock that would delete the seat: the seat is kept, nothing deleted.
select pg_temp.mk('ST(', 'active');
update public.games set host_player_id = pg_temp.late('ST('), pending_host_player_id = pg_temp.early('ST(') where id = 'ST(';
update public.players set spectator = true where id = pg_temp.early('ST(');
select pg_temp.assert_eq('14e host alone: finished instead of deleted', public.remove_player_if_game_open('ST(', pg_temp.late('ST('), p_host_leave => true, p_sessions_played => (pg_temp.g('ST(')).sessions_played)->>'status', 'host_ended');
select pg_temp.assert_eq('14e the game is finished with its reason', (pg_temp.g('ST(')).result_reason, 'host_ended');
select pg_temp.assert_eq('14e the host keeps the seat (and their results)', (select count(*) from public.players where id = pg_temp.late('ST(')), 1::bigint);
select pg_temp.assert_eq('14e the dead nomination is cleared', (pg_temp.g('ST(')).pending_host_player_id, null::uuid);
-- With an eligible successor the host seat is deleted as usual; a non-host never triggers it; a replayed session is left to settle.
select pg_temp.mk('ST)', 'active');
update public.games set host_player_id = pg_temp.late('ST)') where id = 'ST)';
select pg_temp.assert_eq('14e an eligible successor exists: the seat is deleted', public.remove_player_if_game_open('ST)', pg_temp.late('ST)'), p_host_leave => true, p_sessions_played => (pg_temp.g('ST)')).sessions_played)->>'status', 'deleted');
select pg_temp.mk('ST*', 'active');
update public.games set host_player_id = pg_temp.early('ST*') where id = 'ST*';
select pg_temp.assert_eq('14e a NON-host leaving is never turned into a finish', public.remove_player_if_game_open('ST*', pg_temp.late('ST*'), p_host_leave => true, p_sessions_played => (pg_temp.g('ST*')).sessions_played)->>'status', 'deleted');
select pg_temp.assert_eq('14e ...and the game stays live', (pg_temp.g('ST*')).status, 'active');
select pg_temp.mk('ST+', 'active');
delete from public.players where id in (pg_temp.early('ST+'));
update public.games set host_player_id = pg_temp.late('ST+'), sessions_played = 9 where id = 'ST+';
select pg_temp.assert_eq('14e a replayed session is not finished by an older leave', public.remove_player_if_game_open('ST+', pg_temp.late('ST+'), p_host_leave => true, p_sessions_played => 1)->>'status', 'deleted');
select pg_temp.assert_eq('14e the tracked marker is written only when asked', (select finish_bookkeeping is not null from public.games where id = 'ST(') , false);


-- 14c. Joiners mode: the participant row goes with the seat in ONE transaction, and a finish keeps BOTH.
select pg_temp.mk('STR', 'active');
insert into public.participants (game_id, name) values ('STR', 'Late'), ('STR', 'Early');
-- The seat's OWN participant row goes (by participant_id), never a same-named participant of someone else.
create temp table pt_ids as select (select id from public.participants where game_id = 'STR' and name = 'Late') as linked, gen_random_uuid() as other;
insert into public.participants (id, game_id, name) select other, 'STR', 'Late' from pt_ids;
update public.players set participant_id = (select linked from pt_ids) where id = pg_temp.late('STR');
select pg_temp.assert_eq('14c deleted', public.remove_player_if_game_open('STR', pg_temp.late('STR'), p_participant_name => 'Late')->>'status', 'deleted');
select pg_temp.assert_eq('14c the seat own (linked) participant is gone', (select count(*) from public.participants where id = (select linked from pt_ids)), 0::bigint);
select pg_temp.assert_eq('14c the same-named OTHER participant survives', (select count(*) from public.participants where id = (select other from pt_ids)), 1::bigint);
-- A call for an ABSENT seat removes no participant at all.
select pg_temp.assert_eq('14c absent seat: deleted answer', public.remove_player_if_game_open('STR', pg_temp.late('STR'), p_participant_name => 'Late')->>'status', 'deleted');
select pg_temp.assert_eq('14c absent seat: no participant removed', (select count(*) from public.participants where id = (select other from pt_ids)), 1::bigint);
select pg_temp.assert_eq('14c other participant kept', (select count(*) from public.participants where game_id = 'STR' and name = 'Early'), 1::bigint);
select pg_temp.assert_eq('14c seat gone', (select count(*) from public.players where id = pg_temp.late('STR')), 0::bigint);
update public.games set status = 'finished' where id = 'STR';
select pg_temp.assert_eq('14c finished: refused', public.remove_player_if_game_open('STR', pg_temp.early('STR'), p_participant_name => 'Early')->>'status', 'game_finished');
-- An UNLINKED seat whose name matches TWO participants: refused, nothing deleted (the seat stays too).
select pg_temp.mk('ST;', 'active');
insert into public.participants (game_id, name) values ('ST;', 'Late'), ('ST;', 'Late'), ('ST;', 'Early');
select pg_temp.assert_eq('14c ambiguous name: refused', public.remove_player_if_game_open('ST;', pg_temp.late('ST;'), p_participant_name => 'Late')->>'status', 'participant_ambiguous');
select pg_temp.assert_eq('14c ambiguous name: both participants kept', (select count(*) from public.participants where game_id = 'ST;' and name = 'Late'), 2::bigint);
select pg_temp.assert_eq('14c ambiguous name: the seat is not deleted either', (select count(*) from public.players where id = pg_temp.late('ST;')), 1::bigint);
-- An unambiguous unlinked name still goes with the seat; an unlinked seat with NO matching participant just goes.
select pg_temp.assert_eq('14c unambiguous unlinked name: deleted', public.remove_player_if_game_open('ST;', pg_temp.early('ST;'), p_participant_name => 'Early')->>'status', 'deleted');
select pg_temp.assert_eq('14c ...with its one participant', (select count(*) from public.participants where game_id = 'ST;' and name = 'Early'), 0::bigint);
select pg_temp.assert_eq('14c finished: participant kept', (select count(*) from public.participants where game_id = 'STR' and name = 'Early'), 1::bigint);
select pg_temp.assert_eq('14c finished: seat kept', (select count(*) from public.players where id = pg_temp.early('STR')), 1::bigint);

do $$ begin
  perform public.remove_player_if_game_open(null, '00000000-0000-0000-0000-000000000001');
  raise exception 'FAIL: NULL game id accepted';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;

-- 15. Lock modes (the two-session behaviour is in settle-host-leave-locks.sh): the election locks the candidate FOR NO KEY
--     UPDATE, the nominee eligibility check locks the nominee the same way, and a removal locks the game row FOR NO KEY
--     UPDATE (FOR SHARE let two concurrent removals deadlock).
select pg_temp.assert_eq('15 election lock', pg_get_functiondef('public.settle_host_leave(text, uuid, uuid, timestamptz, integer, boolean)'::regprocedure) ~* 'for no key update;', true);
select pg_temp.assert_eq('15 nominee check lock', pg_get_functiondef('public.settle_host_leave(text, uuid, uuid, timestamptz, integer, boolean)'::regprocedure) ~* 'spectator = false\s+(--[^\n]*\n\s*)*and not exists \(select 1 from public.word_rush_sessions s where s.game_id = v_id and players.id = any \(s.leavers\)\)\s+(--[^\n]*\n\s*)*for no key update\s+\)\)', true);
select pg_temp.assert_eq('15 removal lock', pg_get_functiondef('public.remove_player_if_game_open(text, uuid, text, boolean, integer, boolean)'::regprocedure) ~* 'upper\(p_game_id\) for no key update', true);
select pg_temp.assert_eq('15 removal does not take FOR SHARE', pg_get_functiondef('public.remove_player_if_game_open(text, uuid, text, boolean, integer, boolean)'::regprocedure) ~* 'for share', false);

-- 16. start_two_truths_game: ONE transaction under the games row lock. It checks the lobby and the submitted seats
--     BEFORE writing anything (a rejected start writes nothing: no rounds, no keys, no flags), then creates the rounds
--     and keys, applies the spectator flags and activates the game.
create function pg_temp.rounds_for(gid text, variadic ids uuid[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object(
    'game_id', gid, 'round_number', n, 'participant_ids', '[]'::jsonb, 'submitter_player_id', ids[n],
    'status', case when n = 1 then 'active' else 'pending' end, 'ttl_metadata', '{"statements":["a","b","c"],"lie_index":null}'::jsonb))
  from generate_series(1, array_length(ids, 1)) n
$$;
create function pg_temp.lies_for(n integer) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('round_number', i, 'lie_index', 1)) from generate_series(1, n) i
$$;
create function pg_temp.start_tt(gid text, submitted uuid[], min_sub integer default 3) returns jsonb language sql as $$
  select public.start_two_truths_game(gid, submitted, '2026-01-01T00:00:00Z',
    pg_temp.rounds_for(gid, variadic submitted), pg_temp.lies_for(array_length(submitted, 1)), min_sub,
    (select sessions_played from public.games where id = gid))
$$;
select pg_temp.mk('STP', 'waiting');
-- Submitters: late (starts as a SPECTATOR) and the bot seat. Early is NOT a submitter and starts as a player. Both
-- spectator updates are needed to reach the final flags: the first makes everyone watch, the second lets submitters play.
update public.players set spectator = true where id = pg_temp.late('STP');
select pg_temp.assert_eq('16 starts', pg_temp.start_tt('STP', array[pg_temp.late('STP'), ('00000000-0000-0000-0000-0000000003' || lpad(ascii('P')::text, 2, '0'))::uuid], 2)->>'status', 'started');
select pg_temp.assert_eq('16 active', (pg_temp.g('STP')).status, 'active');
select pg_temp.assert_eq('16 round count', (pg_temp.g('STP')).rounds_count, 2);
select pg_temp.assert_eq('16 rounds created', (select count(*) from public.rounds where game_id = 'STP'), 2::bigint);
select pg_temp.assert_eq('16 answer keys created', (select count(*) from public.ttl_round_lies l join public.rounds r on r.id = l.round_id where r.game_id = 'STP'), 2::bigint);
select pg_temp.assert_eq('16 the spectator submitter now plays', (select spectator from public.players where id = pg_temp.late('STP')), false);
select pg_temp.assert_eq('16 the bot submitter plays', (select spectator from public.players where id = ('00000000-0000-0000-0000-0000000003' || lpad(ascii('P')::text, 2, '0'))::uuid), false);
select pg_temp.assert_eq('16 the player who did not submit watches', (select spectator from public.players where id = pg_temp.early('STP')), true);
select pg_temp.assert_eq('16 second start is lost', pg_temp.start_tt('STP', array[pg_temp.late('STP'), pg_temp.early('STP'), pg_temp.hostid('STP')])->>'status', 'lost');
select pg_temp.assert_eq('16 lost writes no more rounds', (select count(*) from public.rounds where game_id = 'STP'), 2::bigint);

-- A Play Again between the caller's read and the start leaves the game `waiting` with the same seats: the lobby GENERATION
-- the caller read is what tells the lobbies apart.
select pg_temp.mk('ST,', 'waiting');
select pg_temp.assert_eq('16 an earlier lobby generation is lost', public.start_two_truths_game('ST,', array[pg_temp.late('ST,'), pg_temp.early('ST,'), ('00000000-0000-0000-0000-0000000003' || lpad(ascii(',')::text, 2, '0'))::uuid], '2026-01-01T00:00:00Z', pg_temp.rounds_for('ST,', pg_temp.late('ST,'), pg_temp.early('ST,'), ('00000000-0000-0000-0000-0000000003' || lpad(ascii(',')::text, 2, '0'))::uuid), pg_temp.lies_for(3), 3, (pg_temp.g('ST,')).sessions_played - 1)->>'status', 'lost');
select pg_temp.assert_eq('16 ...and wrote nothing', (select count(*) from public.rounds where game_id = 'ST,'), 0::bigint);
select pg_temp.assert_eq('16 ...the lobby is still waiting', (pg_temp.g('ST,')).status, 'waiting');
-- (create_ttl_rounds' scratch table lives until the end of the transaction: one start per transaction in production)
drop table if exists pg_temp._new_rounds;
select pg_temp.assert_eq('16 the unchanged lobby starts', pg_temp.start_tt('ST,', array[pg_temp.late('ST,'), pg_temp.early('ST,'), ('00000000-0000-0000-0000-0000000003' || lpad(ascii(',')::text, 2, '0'))::uuid])->>'status', 'started');

-- A game that is no longer waiting is never re-activated, and gets NO round data at all.
select pg_temp.mk('STQ', 'waiting');
update public.games set status = 'finished' where id = 'STQ';
select pg_temp.assert_eq('16 finished game: lost', pg_temp.start_tt('STQ', array[pg_temp.late('STQ'), pg_temp.early('STQ'), ('00000000-0000-0000-0000-0000000003' || lpad(ascii('Q')::text, 2, '0'))::uuid])->>'status', 'lost');
select pg_temp.assert_eq('16 still finished', (pg_temp.g('STQ')).status, 'finished');
select pg_temp.assert_eq('16 finished game: no rounds', (select count(*) from public.rounds where game_id = 'STQ'), 0::bigint);
select pg_temp.assert_eq('16 finished game: roster untouched', (select count(*) from public.players where game_id = 'STQ' and spectator = false), 3::bigint);

-- A submitter whose seat is gone (left since the route counted): rejected, nothing written.
select pg_temp.mk('STS', 'waiting');
select pg_temp.assert_eq('16 missing submitter seat', pg_temp.start_tt('STS', array[pg_temp.late('STS'), pg_temp.early('STS'), pg_temp.hostid('STS')])->>'status', 'submitters_changed');
select pg_temp.assert_eq('16 rejected: still waiting', (pg_temp.g('STS')).status, 'waiting');
select pg_temp.assert_eq('16 rejected: no rounds', (select count(*) from public.rounds where game_id = 'STS'), 0::bigint);
select pg_temp.assert_eq('16 rejected: flags untouched', (select count(*) from public.players where game_id = 'STS' and spectator = false), 3::bigint);
-- Too few submitters remain (every seat exists but the minimum is higher).
select pg_temp.assert_eq('16 below the minimum', pg_temp.start_tt('STS', array[pg_temp.late('STS'), pg_temp.early('STS'), ('00000000-0000-0000-0000-0000000003' || lpad(ascii('S')::text, 2, '0'))::uuid], 4)->>'status', 'submitters_changed');
select pg_temp.assert_eq('16 below the minimum: nothing written', (select count(*) from public.rounds where game_id = 'STS'), 0::bigint);
select pg_temp.assert_eq('16 missing game', pg_temp.start_tt('NOPE2', array[pg_temp.late('STS'), pg_temp.early('STS'), pg_temp.late('STQ')])->>'status', 'game_missing');
do $$ begin
  perform public.start_two_truths_game('STS', array[]::uuid[], now(),
    pg_temp.rounds_for('STS', pg_temp.late('STS')), pg_temp.lies_for(1), 3, 1);
  raise exception 'FAIL: empty submitter list accepted';
exception when raise_exception then
  if sqlerrm not like 'start_two_truths_game: game id, submitters%' then raise exception 'FAIL: wrong error for empty submitters: %', sqlerrm; end if;
end $$;
do $$ begin
  perform public.start_two_truths_game('STS', null, now(),
    pg_temp.rounds_for('STS', pg_temp.late('STS')), pg_temp.lies_for(1), 3, 1);
  raise exception 'FAIL: NULL submitters accepted';
exception when raise_exception then
  if sqlerrm not like 'start_two_truths_game: game id, submitters%' then raise exception 'FAIL: wrong error for NULL submitters: %', sqlerrm; end if;
end $$;
-- The explicit lock matters INSIDE the function (check, then write, under one lock); no outside session can tell it
-- apart from the row lock of its own final UPDATE, hence the definition check (the lock script covers the ordering).
select pg_temp.assert_eq('16 start locks the game first', pg_get_functiondef('public.start_two_truths_game(text, uuid[], timestamptz, jsonb, jsonb, integer, integer)'::regprocedure) ~* 'where id = v_id for update;', true);
-- EFFECTIVE privileges (inherited PUBLIC grants included), not just direct grants.
select pg_temp.assert_eq('16 anon cannot execute', has_function_privilege('anon', 'public.start_two_truths_game(text, uuid[], timestamptz, jsonb, jsonb, integer, integer)', 'execute'), false);
select pg_temp.assert_eq('16 authenticated cannot execute', has_function_privilege('authenticated', 'public.start_two_truths_game(text, uuid[], timestamptz, jsonb, jsonb, integer, integer)', 'execute'), false);
select pg_temp.assert_eq('16 service_role can execute', has_function_privilege('service_role', 'public.start_two_truths_game(text, uuid[], timestamptz, jsonb, jsonb, integer, integer)', 'execute'), true);

-- 16b. finish_rounds_of_finished_session: bound to the FINISHED session under the games row lock.
select pg_temp.mk('STX', 'finished');
update public.games set finished_at = '2026-01-01T00:00:00Z' where id = 'STX';
insert into public.rounds (game_id, round_number, status, started_at, participant_ids)
  values ('STX', 1, 'active', '2025-12-31T23:59:00Z', '{}'), ('STX', 2, 'active', '2026-01-02T00:00:00Z', '{}');
-- A PENDING round of the game (never started) is not part of the finished session's confirmed rounds.
insert into public.rounds (game_id, round_number, status, participant_ids) values ('STX', 3, 'pending', '{}');
select pg_temp.assert_eq('16b a different finished_at is not this session', public.finish_rounds_of_finished_session('STX', '2026-01-01T00:00:01Z')->>'status', 'not_current_session');
select pg_temp.assert_eq('16b nothing finished for it', (select count(*) from public.rounds where game_id = 'STX' and status = 'active'), 2::bigint);
create temp table stx_first as select public.finish_rounds_of_finished_session('STX', '2026-01-01T00:00:00Z') as r;
select pg_temp.assert_eq('16b the session', (select r->>'status' from stx_first), 'finished_session');
select pg_temp.assert_eq('16b the FIRST successful call returns exactly the ids of the two played rounds (not the pending one)', (select array_agg(x order by x) from stx_first, jsonb_array_elements_text(r->'round_ids') x), (select array_agg(id::text order by id::text) from public.rounds where game_id = 'STX' and round_number < 3));
select pg_temp.assert_eq('16b a repeat returns exactly the same ids (idempotent)', (select array_agg(x order by x) from jsonb_array_elements_text(public.finish_rounds_of_finished_session('STX', '2026-01-01T00:00:00Z')->'round_ids') x), (select array_agg(x order by x) from stx_first, jsonb_array_elements_text(r->'round_ids') x));
select pg_temp.assert_eq('16b the round of that session is finished', (select status from public.rounds where game_id = 'STX' and round_number = 1), 'finished');
select pg_temp.assert_eq('16b a round stamped AFTER the finish by a skewed app clock is finished too (no clock comparison)', (select status from public.rounds where game_id = 'STX' and round_number = 2), 'finished');
update public.games set status = 'active' where id = 'STX';
select pg_temp.assert_eq('16b a replayed (live) game is not this session', public.finish_rounds_of_finished_session('STX', '2026-01-01T00:00:00Z')->>'status', 'not_current_session');
select pg_temp.assert_eq('16b service role only', has_function_privilege('anon', 'public.finish_rounds_of_finished_session(text, timestamptz)', 'execute') or has_function_privilege('authenticated', 'public.finish_rounds_of_finished_session(text, timestamptz)', 'execute'), false);

-- 16c. activate_ttl_round: only while the game is ACTIVE, under the games row lock; it moves the pointer with the round.
select pg_temp.mk('ST-', 'active');
insert into public.rounds (id, game_id, round_number, status, participant_ids) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'ST-', 1, 'finished', '{}'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'ST-', 2, 'pending', '{}'),
  ('eeeeeeee-0000-4000-8000-000000000003', 'ST-', 3, 'pending', '{}');
select pg_temp.assert_eq('16c activates a pending round of an active game', public.activate_ttl_round('ST-', 'eeeeeeee-0000-4000-8000-000000000002', 2)->>'status', 'activated');
select pg_temp.assert_eq('16c ...and moves the pointer in the same step', (pg_temp.g('ST-')).current_round_number, 2);
select pg_temp.assert_eq('16c the active round is not activated again (one round is active at a time)', public.activate_ttl_round('ST-', 'eeeeeeee-0000-4000-8000-000000000002', 2)->>'status', 'round_active');
update public.rounds set status = 'finished' where id = 'eeeeeeee-0000-4000-8000-000000000002';
select pg_temp.assert_eq('16c a round that is not pending is not activated again', public.activate_ttl_round('ST-', 'eeeeeeee-0000-4000-8000-000000000002', 2)->>'status', 'not_pending');
update public.games set status = 'finished', finished_at = now() where id = 'ST-';
select pg_temp.assert_eq('16c a FINISHED game activates nothing', public.activate_ttl_round('ST-', 'eeeeeeee-0000-4000-8000-000000000003', 3)->>'status', 'not_active');
select pg_temp.assert_eq('16c ...the round stays pending', (select status from public.rounds where id = 'eeeeeeee-0000-4000-8000-000000000003'), 'pending');
select pg_temp.assert_eq('16c ...and the pointer is untouched', (pg_temp.g('ST-')).current_round_number, 2);
select pg_temp.assert_eq('16c a round of ANOTHER game is never activated through this game', public.activate_ttl_round('STX', 'eeeeeeee-0000-4000-8000-000000000003', 3)->>'status', 'not_pending');
-- 16d. One round is active at a time and the pointer only moves forward (a stale advance picked an earlier pending round).
select pg_temp.mk('ST/', 'active');
insert into public.rounds (id, game_id, round_number, status, participant_ids) values
  ('eeeeeeee-0000-4000-8000-0000000000a1', 'ST/', 1, 'pending', '{}'),
  ('eeeeeeee-0000-4000-8000-0000000000a2', 'ST/', 2, 'pending', '{}'),
  ('eeeeeeee-0000-4000-8000-0000000000a3', 'ST/', 3, 'pending', '{}');
select pg_temp.assert_eq('16d the first round activates', public.activate_ttl_round('ST/', 'eeeeeeee-0000-4000-8000-0000000000a1', 1)->>'status', 'activated');
select pg_temp.assert_eq('16d another round is refused while one is active', public.activate_ttl_round('ST/', 'eeeeeeee-0000-4000-8000-0000000000a2', 2)->>'status', 'round_active');
select pg_temp.assert_eq('16d ...nothing was opened and the pointer did not move', (select count(*) from public.rounds where game_id = 'ST/' and status = 'active')::int || ':' || (pg_temp.g('ST/')).current_round_number, '1:1');
update public.rounds set status = 'finished' where id = 'eeeeeeee-0000-4000-8000-0000000000a1';
select pg_temp.assert_eq('16d after the active round finished the next one activates', public.activate_ttl_round('ST/', 'eeeeeeee-0000-4000-8000-0000000000a3', 3)->>'status', 'activated');
update public.rounds set status = 'finished' where id = 'eeeeeeee-0000-4000-8000-0000000000a3';
-- A round read in another generation (a Play Again replaced the session since) is never activated.
select pg_temp.assert_eq('16d an advance that evaluated another generation activates nothing', public.activate_ttl_round('ST/', 'eeeeeeee-0000-4000-8000-0000000000a2', 2, (pg_temp.g('ST/')).sessions_played + 1)->>'status', 'session_changed');
select pg_temp.assert_eq('16d a stale advance cannot move the pointer back to a skipped pending round', public.activate_ttl_round('ST/', 'eeeeeeee-0000-4000-8000-0000000000a2', 2)->>'status', 'stale_round');
select pg_temp.assert_eq('16d ...the skipped round stays pending and the pointer stays', (select status from public.rounds where id = 'eeeeeeee-0000-4000-8000-0000000000a2') || ':' || (pg_temp.g('ST/')).current_round_number, 'pending:3');
select pg_temp.assert_eq('16d activation takes a WRITE lock on the game row (two share locks would deadlock on the pointer write)',
  pg_get_functiondef('public.activate_ttl_round(text, uuid, integer, integer)'::regprocedure) ~* 'from public.games where id = upper\(p_game_id\) for no key update;', true);
select pg_temp.assert_eq('16c service role only', has_function_privilege('anon', 'public.activate_ttl_round(text, uuid, integer, integer)', 'execute') or has_function_privilege('authenticated', 'public.activate_ttl_round(text, uuid, integer, integer)', 'execute'), false);

-- 9e. A Start in the SAME replay generation (session_started_at set, sessions_played equal) is the same session: the departed
--     host's linkage is still this leave's to release; a REPLAY (sessions_played differs) keeps it.
select pg_temp.mk('ST.', 'active');
update public.games set host_user_id = '11111111-1111-1111-1111-111111111111', session_started_at = now() where id = 'ST.';
select pg_temp.assert_eq('9e start in the same generation: nominated', pg_temp.settle('ST.')->>'status', 'nominated');
select pg_temp.assert_eq('9e ...and the departed host linkage is released', (pg_temp.g('ST.')).host_user_id, null::uuid);

-- 18. A seat deleted by ANY path never leaves a reference in the session (the BEFORE DELETE trigger).
select pg_temp.mk('STZ', 'active');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, roster, leavers)
  values ('c1c1c1c1-0000-4000-8000-0000000000c1', 'STZ', 'individual', 'automatic', 1, 3, 60, array[pg_temp.late('STZ'), pg_temp.early('STZ')], array[pg_temp.late('STZ')]);
delete from public.players where id = pg_temp.late('STZ');
select pg_temp.assert_eq('18 the entry leaves the roster with the seat', (select roster from public.word_rush_sessions where game_id = 'STZ'), array[pg_temp.early('STZ')]);
select pg_temp.assert_eq('18 ...and the leavers list', (select leavers from public.word_rush_sessions where game_id = 'STZ'), '{}'::uuid[]);
select pg_temp.assert_eq('18 nobody else is touched', (select count(*) from public.players where game_id = 'STZ' and id = pg_temp.early('STZ')), 1::bigint);

-- 17c. The prompt setter of a round that still awaits its prompt is reassigned BEFORE its seat goes (the foreign key would
--      null it and nobody could enter the letters), by whatever path deletes the seat.
select pg_temp.mk('ST<', 'active');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, phase, roster, prompt_setter_player_id, turn_index)
  values ('17c17c17-0000-4000-8000-0000000017c1', 'ST<', 'individual', 'manual', 1, 3, 60, 'awaiting_prompt',
          array[pg_temp.late('ST<'), pg_temp.early('ST<')], pg_temp.late('ST<'), 0);
select pg_temp.assert_eq('17c the setter leaves through the one function (stage leave)', public.word_rush_remove_player('ST<', pg_temp.late('ST<'))->>'status', 'left');
select pg_temp.assert_eq('17c ...the setter is the remaining player, never NULL', (select prompt_setter_player_id from public.word_rush_sessions where game_id = 'ST<'), pg_temp.early('ST<'));
select pg_temp.assert_eq('17c ...and the roster no longer lists the leaver', (select roster from public.word_rush_sessions where game_id = 'ST<'), array[pg_temp.early('ST<')]);
-- The same through a plain seat DELETE (any other removal path), with a roster that ALREADY lacks the leaver.
select pg_temp.mk('ST>', 'active');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, phase, roster, prompt_setter_player_id, turn_index)
  values ('17c17c17-0000-4000-8000-0000000017c2', 'ST>', 'individual', 'manual', 1, 3, 60, 'awaiting_prompt',
          array[pg_temp.early('ST>')], pg_temp.late('ST>'), 3);
delete from public.players where id = pg_temp.late('ST>');
select pg_temp.assert_eq('17c a plain DELETE of an already off-roster setter still picks a replacement', (select prompt_setter_player_id from public.word_rush_sessions where game_id = 'ST>'), pg_temp.early('ST>'));
-- Only a setter who awaits the prompt in a manual session is replaced.
select pg_temp.mk('ST?', 'active');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, phase, roster, prompt_setter_player_id)
  values ('17c17c17-0000-4000-8000-0000000017c3', 'ST?', 'individual', 'manual', 1, 3, 60, 'playing',
          array[pg_temp.late('ST?'), pg_temp.early('ST?')], pg_temp.late('ST?'));
delete from public.players where id = pg_temp.late('ST?');
select pg_temp.assert_eq('17c a round already playing is left to the existing foreign key', (select prompt_setter_player_id from public.word_rush_sessions where game_id = 'ST?'), null::uuid);
select pg_temp.mk('ST[', 'active');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, phase, roster, prompt_setter_player_id)
  values ('17c17c17-0000-4000-8000-0000000017c4', 'ST[', 'individual', 'manual', 1, 3, 60, 'awaiting_prompt',
          array[pg_temp.late('ST[')], pg_temp.late('ST['));
delete from public.players where id = pg_temp.late('ST[');
select pg_temp.assert_eq('17c nobody left to set the prompt: NULL (the application ends the round)', (select prompt_setter_player_id from public.word_rush_sessions where game_id = 'ST['), null::uuid);
-- Team mode: the sorted members of the active team without the leaver, indexed by the round index.
select pg_temp.mk('ST]', 'active');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, phase, roster, prompt_setter_player_id, active_team, turn_index)
  values ('17c17c17-0000-4000-8000-0000000017c5', 'ST]', 'team', 'manual', 2, 3, 60, 'awaiting_prompt',
          array[pg_temp.late('ST]'), pg_temp.early('ST]')], pg_temp.late('ST]'), 1, 2);
insert into public.word_rush_players (game_id, player_id, team, score)
  values ('ST]', pg_temp.late('ST]'), 1, 0), ('ST]', pg_temp.early('ST]'), 1, 0), ('ST]', ('00000000-0000-0000-0000-0000000003' || lpad(ascii(']')::text, 2, '0'))::uuid, 2, 0);
delete from public.players where id = pg_temp.late('ST]');
-- Round index 1 (turn 2 of 2 teams): over the active team's members [early] -> early; a member of ANOTHER team (the bot, team 2)
-- must not be a candidate (index 1 over [early, bot] would pick the bot).
select pg_temp.assert_eq('17c team mode: a member of the active team takes over', (select prompt_setter_player_id from public.word_rush_sessions where game_id = 'ST]'), pg_temp.early('ST]'));
select pg_temp.assert_eq('17c the trigger function is not callable by clients', has_function_privilege('anon', 'public.word_rush_detach_seat_before_delete()', 'execute') or has_function_privilege('authenticated', 'public.word_rush_detach_seat_before_delete()', 'execute'), false);

-- 17e. A seat is never inserted into a game its host ENDED (decided under the games row lock); other games are unaffected.
select pg_temp.mk('ST=', 'finished');
update public.games set result_reason = 'host_ended' where id = 'ST=';
do $$ begin
  begin
    insert into public.players (id, game_id, name) values ('00000000-0000-0000-0000-0000000005aa', 'ST=', 'LateJoiner');
    raise exception 'FAIL 17e: a seat was inserted into a finished game';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm not like 'game_finished:%' then raise exception 'FAIL 17e: unexpected error %', sqlerrm; end if;
  end;
end $$;
select pg_temp.assert_eq('17e ...nothing was seated', (select count(*) from public.players where id = '00000000-0000-0000-0000-0000000005aa'), 0::bigint);
-- A game that finished any OTHER way keeps taking late joiners exactly as before.
select pg_temp.mk('ST^', 'finished');
update public.games set result_reason = 'admin_ended' where id = 'ST^';
insert into public.players (id, game_id, name) values ('00000000-0000-0000-0000-0000000005ac', 'ST^', 'ResultsViewer');
select pg_temp.assert_eq('17e a game finished another way still seats a late joiner', (select count(*) from public.players where id = '00000000-0000-0000-0000-0000000005ac'), 1::bigint);
select pg_temp.mk('ST:', 'active');
insert into public.players (id, game_id, name) values ('00000000-0000-0000-0000-0000000005ab', 'ST:', 'Joiner');
select pg_temp.assert_eq('17e an active game still takes a seat', (select count(*) from public.players where id = '00000000-0000-0000-0000-0000000005ab'), 1::bigint);
select pg_temp.assert_eq('17e the guard locks the games row FOR NO KEY UPDATE (the level the lobby trigger already takes)',
  pg_get_functiondef('public.players_require_unfinished_game()'::regprocedure) ~* 'from public.games where id = new.game_id for no key update', true);
select pg_temp.assert_eq('17e not callable by clients', has_function_privilege('anon', 'public.players_require_unfinished_game()', 'execute') or has_function_privilege('authenticated', 'public.players_require_unfinished_game()', 'execute'), false);

-- 17d. The host-leave path takes the games row FOR UPDATE (a join's KEY SHARE conflicts with it), the other removals do not;
--      event times taken after a lock wait are clock_timestamp(), not the transaction start.
select pg_temp.assert_eq('17d host-leave removal locks FOR UPDATE',
  pg_get_functiondef('public.remove_player_if_game_open(text, uuid, text, boolean, integer, boolean)'::regprocedure) ~* 'if p_host_leave or p_participant_name is not null then\s+select \* into v_game from public.games where id = upper\(p_game_id\) for update;', true);
select pg_temp.assert_eq('17d the Word Rush removal locks the games row FOR UPDATE at every stage (host-alone finish; joiners participant delete)',
  pg_get_functiondef('public.word_rush_remove_player(text, uuid, text, boolean, integer, boolean, timestamptz)'::regprocedure) ~* 'select \* into v_game from public.games where id = upper\(p_game_id\) for update;\s+if not found', true);
select pg_temp.assert_eq('17d the Word Rush function takes the session row lock AFTER the games row (the established order)',
  position('word_rush_sessions where game_id = v_game.id for update' in pg_get_functiondef('public.word_rush_remove_player(text, uuid, text, boolean, integer, boolean, timestamptz)'::regprocedure))
    > position('from public.games where id = upper(p_game_id) for update' in pg_get_functiondef('public.word_rush_remove_player(text, uuid, text, boolean, integer, boolean, timestamptz)'::regprocedure))
  and position('from public.games where id = upper(p_game_id) for update' in pg_get_functiondef('public.word_rush_remove_player(text, uuid, text, boolean, integer, boolean, timestamptz)'::regprocedure)) > 0, true);
select pg_temp.assert_eq('19 service role only', has_function_privilege('anon', 'public.word_rush_remove_player(text, uuid, text, boolean, integer, boolean, timestamptz)', 'execute') or has_function_privilege('authenticated', 'public.word_rush_remove_player(text, uuid, text, boolean, integer, boolean, timestamptz)', 'execute'), false);
select pg_temp.assert_eq('17d activation stamps started_at with clock_timestamp()',
  pg_get_functiondef('public.activate_ttl_round(text, uuid, integer, integer)'::regprocedure) ~* 'started_at = clock_timestamp\(\)', true);
select pg_temp.assert_eq('17d no function of this change takes the transaction-start time for an event',
  (select count(*) from pg_proc where proname in ('settle_host_leave', 'end_game_if_host_alone', 'remove_player_if_game_open', 'activate_ttl_round')
     and pronamespace = 'public'::regnamespace and pg_get_functiondef(oid) ~* 'v_now := now\(\)|started_at = now\(\)'), 0::bigint);

-- 19. word_rush_remove_player: ONE function, two stages, under the games lock first and then the session lock.
select pg_temp.mk('ST!', 'active');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, phase, roster, prompt_setter_player_id, turn_index)
  values ('19191919-0000-4000-8000-000000001901', 'ST!', 'individual', 'manual', 1, 3, 60, 'awaiting_prompt',
          array[pg_temp.late('ST!'), pg_temp.early('ST!')], pg_temp.late('ST!'), 0);
do $$ begin
  perform public.word_rush_remove_player('ST!', pg_temp.late('ST!'), 'sideways');
  raise exception 'FAIL: an unknown stage was accepted';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
do $$ begin
  perform public.word_rush_remove_player(null, '00000000-0000-0000-0000-000000000001');
  raise exception 'FAIL: NULL game id accepted';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select pg_temp.assert_eq('19 missing game', public.word_rush_remove_player('NOPE1', pg_temp.late('ST!'))->>'status', 'game_missing');
-- The delete stage of a player who has NOT left a live session does nothing.
select pg_temp.assert_eq('19 delete stage without a recorded leave: not_left', public.word_rush_remove_player('ST!', pg_temp.late('ST!'), 'delete')->>'status', 'not_left');
select pg_temp.assert_eq('19 ...the seat is untouched', (select count(*) from public.players where id = pg_temp.late('ST!')), 1::bigint);
-- The leave stage is durable and keeps the seat.
select pg_temp.assert_eq('19 leave stage', public.word_rush_remove_player('ST!', pg_temp.late('ST!'))->>'status', 'left');
select pg_temp.assert_eq('19 ...off the roster', (select roster from public.word_rush_sessions where game_id = 'ST!'), array[pg_temp.early('ST!')]);
select pg_temp.assert_eq('19 ...recorded as a leaver', (select leavers from public.word_rush_sessions where game_id = 'ST!'), array[pg_temp.late('ST!')]);
select pg_temp.assert_eq('19 ...the setter was replaced in the SAME step', (select prompt_setter_player_id from public.word_rush_sessions where game_id = 'ST!'), pg_temp.early('ST!'));
select pg_temp.assert_eq('19 ...the seat is kept until the round decision is made', (select count(*) from public.players where id = pg_temp.late('ST!')), 1::bigint);
select public.word_rush_remove_player('ST!', pg_temp.late('ST!'));
select pg_temp.assert_eq('19 a repeat records the leaver once', (select cardinality(leavers) from public.word_rush_sessions where game_id = 'ST!'), 1);
-- The delete stage waits for the effects the round owes (the round_finalize marker), then completes.
update public.word_rush_sessions set round_finalize = jsonb_build_object('session_id', id, 'turn_index', 0, 'round', 1, 'is_last', false, 'turn_seconds', 60) where game_id = 'ST!';
select pg_temp.assert_eq('19 delete stage while the round effects are owed: finalizing', public.word_rush_remove_player('ST!', pg_temp.late('ST!'), 'delete')->>'status', 'finalizing');
select pg_temp.assert_eq('19 ...nothing deleted', (select count(*) from public.players where id = pg_temp.late('ST!')), 1::bigint);
update public.word_rush_sessions set round_finalize = null where game_id = 'ST!';
select pg_temp.assert_eq('19 delete stage once nothing is owed', public.word_rush_remove_player('ST!', pg_temp.late('ST!'), 'delete')->>'status', 'deleted');
select pg_temp.assert_eq('19 ...the seat is gone', (select count(*) from public.players where id = pg_temp.late('ST!')), 0::bigint);
select pg_temp.assert_eq('19 ...and the leaver is no longer recorded', (select leavers from public.word_rush_sessions where game_id = 'ST!'), '{}'::uuid[]);
select pg_temp.assert_eq('19 ...the other player is untouched', (select count(*) from public.players where id = pg_temp.early('ST!')), 1::bigint);

-- An ambiguity that APPEARS between the leave and the delete stage still refuses the delete (the seat stays, recorded).
select pg_temp.mk('STO', 'active');
update public.games set participant_mode = 'joiners' where id = 'STO';
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, phase, roster)
  values ('19191919-0000-4000-8000-000000001907', 'STO', 'individual', 'automatic', 1, 3, 60, 'playing', array[pg_temp.late('STO'), pg_temp.early('STO')]);
insert into public.participants (game_id, name) values ('STO', 'Late');
select pg_temp.assert_eq('19 leave with one matching participant', public.word_rush_remove_player('STO', pg_temp.late('STO'))->>'status', 'left');
insert into public.participants (game_id, name) values ('STO', 'Late');
select pg_temp.assert_eq('19 an ambiguity that appeared since: the delete stage refuses', public.word_rush_remove_player('STO', pg_temp.late('STO'), 'delete')->>'status', 'participant_ambiguous');
select pg_temp.assert_eq('19 ...seat and both participants kept', (select count(*) from public.players where id = pg_temp.late('STO'))::int + (select count(*)::int from public.participants where game_id = 'STO'), 3);
delete from public.players where id = pg_temp.late('STO');
delete from public.word_rush_sessions where game_id = 'STO';
delete from public.participants where game_id = 'STO';
update public.games set status = 'waiting' where id = 'STO';

-- A setter is replaced only for a MANUAL round that still awaits its prompt.
select pg_temp.mk('ST#', 'active');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, phase, roster, prompt_setter_player_id)
  values ('19191919-0000-4000-8000-000000001902', 'ST#', 'individual', 'manual', 1, 3, 60, 'playing',
          array[pg_temp.late('ST#'), pg_temp.early('ST#')], pg_temp.late('ST#'));
select public.word_rush_remove_player('ST#', pg_temp.late('ST#'));
select pg_temp.assert_eq('19 a round already playing keeps its setter field untouched (the application ends or continues it)', (select prompt_setter_player_id from public.word_rush_sessions where game_id = 'ST#'), pg_temp.late('ST#'));
-- Team mode: the leavers are not candidates (their seats are still there).
select pg_temp.mk('ST%', 'active');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, phase, roster, prompt_setter_player_id, active_team, turn_index)
  values ('19191919-0000-4000-8000-000000001903', 'ST%', 'team', 'manual', 2, 3, 60, 'awaiting_prompt',
          array[pg_temp.late('ST%'), pg_temp.early('ST%')], pg_temp.late('ST%'), 1, 0);
insert into public.word_rush_players (game_id, player_id, team, score)
  values ('ST%', pg_temp.late('ST%'), 1, 0), ('ST%', pg_temp.early('ST%'), 1, 0);
update public.word_rush_sessions set leavers = array[pg_temp.early('ST%')] where game_id = 'ST%';
select public.word_rush_remove_player('ST%', pg_temp.late('ST%'));
select pg_temp.assert_eq('19 team mode: nobody who has not left is on the team: NULL setter', (select prompt_setter_player_id from public.word_rush_sessions where game_id = 'ST%'), null::uuid);

-- A finished game: only a player who LEFT a naturally finished game is deleted, and only once the bookkeeping is done.
select pg_temp.mk('ST&', 'active');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, phase, status, roster, leavers)
  values ('19191919-0000-4000-8000-000000001904', 'ST&', 'individual', 'automatic', 1, 3, 60, 'finished', 'finished',
          array[pg_temp.early('ST&')], array[pg_temp.late('ST&')]);
update public.games set status = 'finished', finished_at = now(), finish_bookkeeping = jsonb_build_object('finished_at', now(), 'attempts', 0) where id = 'ST&';
select pg_temp.assert_eq('19 finished, a recorded leaver, bookkeeping owed', public.word_rush_remove_player('ST&', pg_temp.late('ST&'), 'delete')->>'status', 'bookkeeping_owed');
select pg_temp.assert_eq('19 ...the seat stays (the bookkeeping reads the leaver rows)', (select count(*) from public.players where id = pg_temp.late('ST&')), 1::bigint);
select pg_temp.assert_eq('19 finished: a player who never left keeps the seat (part of the result)', public.word_rush_remove_player('ST&', pg_temp.early('ST&'), 'delete')->>'status', 'game_finished');
select pg_temp.assert_eq('19 finished: the LEAVE stage of someone else is refused too', public.word_rush_remove_player('ST&', pg_temp.early('ST&'))->>'status', 'game_finished');
update public.games set finish_bookkeeping = null where id = 'ST&';
select pg_temp.assert_eq('19 finished, bookkeeping completed: the recorded leaver is deleted', public.word_rush_remove_player('ST&', pg_temp.late('ST&'), 'delete')->>'status', 'deleted');
select pg_temp.assert_eq('19 ...seat gone', (select count(*) from public.players where id = pg_temp.late('ST&')), 0::bigint);
-- An admin / host / idle finish keeps every seat, a recorded leaver included.
select pg_temp.mk('ST$', 'active');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, phase, status, roster, leavers)
  values ('19191919-0000-4000-8000-000000001905', 'ST$', 'individual', 'automatic', 1, 3, 60, 'finished', 'finished',
          array[pg_temp.early('ST$')], array[pg_temp.late('ST$')]);
update public.games set status = 'finished', finished_at = now(), result_reason = 'admin_ended' where id = 'ST$';
select pg_temp.assert_eq('19 a finish with a reason keeps the seat even of a recorded leaver', public.word_rush_remove_player('ST$', pg_temp.late('ST$'), 'delete')->>'status', 'game_finished');
select pg_temp.assert_eq('19 ...seat kept', (select count(*) from public.players where id = pg_temp.late('ST$')), 1::bigint);

-- Joiners mode: the seat's own participant goes with it; an ambiguous unlinked name is refused BEFORE anything changes.
select pg_temp.mk('ST0', 'active');
update public.games set participant_mode = 'joiners' where id = 'ST0';
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, phase, roster)
  values ('19191919-0000-4000-8000-000000001906', 'ST0', 'individual', 'automatic', 1, 3, 60, 'playing',
          array[pg_temp.late('ST0'), pg_temp.early('ST0')]);
insert into public.participants (game_id, name) values ('ST0', 'Late'), ('ST0', 'Late'), ('ST0', 'Early');
create temp table pt0 as select (array_agg(id order by id))[1] as linked, (array_agg(id order by id))[2] as other from public.participants where game_id = 'ST0' and name = 'Late';
select pg_temp.assert_eq('19 ambiguous unlinked name: refused', public.word_rush_remove_player('ST0', pg_temp.late('ST0'))->>'status', 'participant_ambiguous');
select pg_temp.assert_eq('19 ...nothing changed: still on the roster', (select roster from public.word_rush_sessions where game_id = 'ST0'), array[pg_temp.late('ST0'), pg_temp.early('ST0')]);
select pg_temp.assert_eq('19 ...not recorded as a leaver', (select cardinality(leavers) from public.word_rush_sessions where game_id = 'ST0'), 0);
select pg_temp.assert_eq('19 ...seat and both participants kept', (select count(*) from public.players where id = pg_temp.late('ST0'))::int + (select count(*)::int from public.participants where game_id = 'ST0' and name = 'Late'), 3);
select pg_temp.assert_eq('19 an unambiguous unlinked name leaves and its participant goes with the deleted seat', public.word_rush_remove_player('ST0', pg_temp.early('ST0'))->>'status', 'left');
select pg_temp.assert_eq('19 ...delete stage', public.word_rush_remove_player('ST0', pg_temp.early('ST0'), 'delete')->>'status', 'deleted');
select pg_temp.assert_eq('19 ...its participant is gone', (select count(*) from public.participants where game_id = 'ST0' and name = 'Early'), 0::bigint);
-- A LINKED seat takes precedence over the name.
update public.players set participant_id = (select linked from pt0) where id = pg_temp.late('ST0');
select pg_temp.assert_eq('19 a linked seat leaves', public.word_rush_remove_player('ST0', pg_temp.late('ST0'))->>'status', 'left');
select pg_temp.assert_eq('19 ...and is deleted with only ITS participant', public.word_rush_remove_player('ST0', pg_temp.late('ST0'), 'delete')->>'status', 'deleted');
select pg_temp.assert_eq('19 ...the linked participant is the one that went', (select count(*) from public.participants where id = (select linked from pt0)), 0::bigint);
select pg_temp.assert_eq('19 ...the same-named other participant stays', (select count(*) from public.participants where id = (select other from pt0)), 1::bigint);

-- The delete stage with NO session (a lobby that was reopened) never deletes a seat: nothing was recorded for it.
select pg_temp.mk('STU', 'waiting');
select pg_temp.assert_eq('19 delete stage on a reopened lobby: not_left', public.word_rush_remove_player('STU', pg_temp.late('STU'), 'delete')->>'status', 'not_left');
select pg_temp.assert_eq('19 ...the seat of a non-leaver remains', (select count(*) from public.players where id = pg_temp.late('STU')), 1::bigint);

-- A naturally finished game whose round effects are still owed: a recorded leaver's seat waits (the effects read its rows).
select pg_temp.mk('STY', 'active');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, phase, status, roster, leavers)
  values ('19191919-0000-4000-8000-000000001908', 'STY', 'individual', 'automatic', 1, 3, 60, 'finished', 'finished',
          array[pg_temp.early('STY')], array[pg_temp.late('STY')]);
update public.games set status = 'finished', finished_at = now() where id = 'STY';
update public.word_rush_sessions set round_finalize = jsonb_build_object('session_id', id, 'turn_index', 0, 'round', 1, 'is_last', true, 'turn_seconds', 60) where game_id = 'STY';
select pg_temp.assert_eq('19 finished, a recorded leaver, round effects owed: finalizing', public.word_rush_remove_player('STY', pg_temp.late('STY'), 'delete')->>'status', 'finalizing');
select pg_temp.assert_eq('19 ...the seat stays', (select count(*) from public.players where id = pg_temp.late('STY')), 1::bigint);
update public.word_rush_sessions set round_finalize = null where game_id = 'STY';
select pg_temp.assert_eq('19 ...and goes once nothing is owed', public.word_rush_remove_player('STY', pg_temp.late('STY'), 'delete')->>'status', 'deleted');

-- A player who has LEFT (recorded, seat awaiting its delete) is not a successor of a host who leaves.
select pg_temp.mk('ST_', 'active');
update public.games set host_player_id = pg_temp.late('ST_') where id = 'ST_';
update public.players set spectator = false where id = pg_temp.early('ST_');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, phase, roster, leavers)
  values ('19191919-0000-4000-8000-000000001909', 'ST_', 'individual', 'automatic', 1, 3, 60, 'playing', array[pg_temp.late('ST_')], array[pg_temp.early('ST_')]);
select pg_temp.assert_eq('19 the only other human has already left: the host leaving alone ends the game',
  public.word_rush_remove_player('ST_', pg_temp.late('ST_'), p_host_leave => true, p_sessions_played => (pg_temp.g('ST_')).sessions_played)->>'status', 'host_ended');

-- A departing HOST's handoff is recorded with the leave and settled in the SAME transaction that deletes the seat.
select pg_temp.mk('ST\', 'active');
update public.games set host_player_id = pg_temp.late('ST\'), host_user_id = '11111111-1111-1111-1111-111111111111' where id = 'ST\';
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, phase, roster)
  values ('19191919-0000-4000-8000-000000001910', 'ST\', 'individual', 'automatic', 1, 3, 60, 'playing', array[pg_temp.late('ST\'), pg_temp.early('ST\')]);
select pg_temp.assert_eq('19 host leave with a successor is recorded', public.word_rush_remove_player('ST\', pg_temp.late('ST\'), p_host_leave => true, p_sessions_played => (pg_temp.g('ST\')).sessions_played)->>'status', 'left');
select pg_temp.assert_eq('19 ...the handoff is recorded with the leave (no user id in the publicly readable row)',
  (select leaver_handoffs from public.word_rush_sessions where game_id = 'ST\') ? pg_temp.late('ST\')::text
  and not ((select leaver_handoffs::text from public.word_rush_sessions where game_id = 'ST\') like '%11111111%'), true);
select pg_temp.assert_eq('19 ...the host is not settled while the seat stays', (pg_temp.g('ST\')).host_player_id, pg_temp.late('ST\'));
create temp table w_settle as select public.word_rush_remove_player('ST\', pg_temp.late('ST\'), 'delete') as r;
select pg_temp.assert_eq('19 delete stage deletes the seat', (select r->>'status' from w_settle), 'deleted');
select pg_temp.assert_eq('19 ...and settles the handoff in the same call', (select r->'settled'->>'status' from w_settle), 'nominated');
select pg_temp.assert_eq('19 ...the oldest eligible player is nominated', (pg_temp.g('ST\')).pending_host_player_id, pg_temp.early('ST\'));
select pg_temp.assert_eq('19 ...the departed host user linkage is released', (pg_temp.g('ST\')).host_user_id, null::uuid);
select pg_temp.assert_eq('19 ...the handoff record is consumed', (select leaver_handoffs from public.word_rush_sessions where game_id = 'ST\'), '{}'::jsonb);

-- A game finished with a reason keeps a leaver's seat as part of the result and drops the leave record (so it is not swept again).
select public.word_rush_remove_player('ST$', pg_temp.late('ST$'), 'delete');
select pg_temp.assert_eq('19 ...a finish with a reason drops the leave record of the retained seat', (select cardinality(leavers) from public.word_rush_sessions where game_id = 'ST$'), 0);

-- Re-use of a game id whose 3rd character the fixtures above already took: delete it (everything cascades) and make it again.
create function pg_temp.remk(gid text, status text) returns void language plpgsql as $$
begin
  -- (the session first: the seat-delete trigger rewrites the session row while the cascade removes the seats)
  delete from public.word_rush_sessions where game_id = gid;
  delete from public.games where id = gid;
  perform pg_temp.mk(gid, status);
end $$;

-- 16. A recorded leaver (seat awaiting its delete) is not a successor: neither as the pending nominee nor in the election.
select pg_temp.remk('STU', 'active');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, phase, roster, leavers)
  values ('19191919-0000-4000-8000-000000001911', 'STU', 'individual', 'automatic', 1, 3, 60, 'playing', array[pg_temp.late('STU')], array[pg_temp.early('STU')]);
select pg_temp.assert_eq('16 the election skips the older player who has left', pg_temp.settle('STU', false)->>'nominee', pg_temp.late('STU')::text);
update public.games set pending_host_player_id = pg_temp.early('STU') where id = 'STU';
select pg_temp.assert_eq('16 a pending nominee who has left is replaced', pg_temp.settle('STU', false)->>'nominee', pg_temp.late('STU')::text);
select pg_temp.assert_eq('16 ...a nominee who has NOT left is retained', pg_temp.settle('STU', false)->>'status', 'settled');
update public.games set host_player_id = pg_temp.late('STU'), pending_host_player_id = null where id = 'STU';
select pg_temp.assert_eq('16 end_game_if_host_alone: the only other human has left, so the host is alone and the game ends',
  public.end_game_if_host_alone('STU', pg_temp.late('STU'), (pg_temp.g('STU')).session_started_at, (pg_temp.g('STU')).sessions_played, false)->>'status', 'finished');

-- 10. A prompt setter who leaves during the INTERMISSION before a manual round is replaced in the leave itself.
select pg_temp.remk('STU', 'active');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, phase, roster, prompt_setter_player_id, turn_index)
  values ('19191919-0000-4000-8000-000000001912', 'STU', 'individual', 'manual', 1, 3, 60, 'intermission',
          array[pg_temp.late('STU'), pg_temp.early('STU')], pg_temp.late('STU'), 1);
select public.word_rush_remove_player('STU', pg_temp.late('STU'));
select pg_temp.assert_eq('10 intermission: the departed setter is replaced', (select prompt_setter_player_id from public.word_rush_sessions where game_id = 'STU'), pg_temp.early('STU'));

-- 19. A departed host who would be ALONE at the deferred delete ends the game and keeps the seat (as the leave stage does).
select pg_temp.remk('STY', 'active');
update public.games set host_player_id = pg_temp.late('STY') where id = 'STY';
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, phase, roster, leavers, leaver_handoffs)
  values ('19191919-0000-4000-8000-000000001913', 'STY', 'individual', 'automatic', 1, 3, 60, 'playing', array[]::uuid[],
          array[pg_temp.late('STY'), pg_temp.early('STY')],
          jsonb_build_object(pg_temp.late('STY')::text, jsonb_build_object('session_started_at', null, 'sessions_played', (pg_temp.g('STY')).sessions_played)));
create temp table w_alone2 as select public.word_rush_remove_player('STY', pg_temp.late('STY'), 'delete') as r;
select pg_temp.assert_eq('19 host alone at the deferred delete: host_ended', (select r->>'status' from w_alone2), 'host_ended');
select pg_temp.assert_eq('19 ...the seat is KEPT', (select count(*) from public.players where id = pg_temp.late('STY')), 1::bigint);
select pg_temp.assert_eq('19 ...the game is finished with its reason and marker', (pg_temp.g('STY')).result_reason || ':' || ((pg_temp.g('STY')).finish_bookkeeping is not null)::text, 'host_ended:true');
select pg_temp.assert_eq('19 ...the handoff record is consumed', (select leaver_handoffs from public.word_rush_sessions where game_id = 'STY'), '{}'::jsonb);

-- 17. The same-name participants a removal counts are LOCKED by that statement and are the rows deleted.
select pg_temp.assert_eq('17 remove_player_if_game_open locks the counted participants',
  pg_get_functiondef('public.remove_player_if_game_open(text, uuid, text, boolean, integer, boolean)'::regprocedure) ~* 'name = p_participant_name for update', true);
select pg_temp.assert_eq('17 both delete exactly the locked rows, never by name again',
  (select count(*) from pg_proc where proname in ('remove_player_if_game_open', 'word_rush_remove_player') and pronamespace = 'public'::regnamespace
     and pg_get_functiondef(oid) ~* 'delete from public.participants where id = any \(coalesce\(v_name_ids'
     and pg_get_functiondef(oid) !~* 'delete from public.participants where game_id = [^;]* and name = '), 2::bigint);
select pg_temp.assert_eq('17 word_rush_remove_player locks the counted participants',
  pg_get_functiondef('public.word_rush_remove_player(text, uuid, text, boolean, integer, boolean, timestamptz)'::regprocedure) ~* 'name = v_name for update', true);

-- The finish transaction records the bookkeeping marker, bound to its own finished_at, for EVERY finish path (the route resumes
-- it on the first answer and on a retry whose answer reports finished_now = false), and a repeat never rewrites it.
select pg_temp.remk('STU', 'active');
update public.games set host_player_id = pg_temp.late('STU') where id = 'STU';
delete from public.players where id = pg_temp.early('STU');
select pg_temp.assert_eq('M the removal-path finish when asked: host_ended', public.remove_player_if_game_open('STU', pg_temp.late('STU'), p_host_leave => true, p_sessions_played => (pg_temp.g('STU')).sessions_played, p_track_bookkeeping => true)->>'status', 'host_ended');
select pg_temp.assert_eq('M ...records the marker bound to its finished_at', ((pg_temp.g('STU')).finish_bookkeeping->>'finished_at')::timestamptz, (pg_temp.g('STU')).finished_at);
select pg_temp.assert_eq('M ...with no attempt made yet', (pg_temp.g('STU')).finish_bookkeeping->>'attempts', '0');
update public.games set finish_bookkeeping = jsonb_set(finish_bookkeeping, '{attempts}', '2') where id = 'STU';
select pg_temp.assert_eq('M a repeat of the leave is a finished game: refused, marker untouched', public.remove_player_if_game_open('STU', pg_temp.late('STU'), p_host_leave => true, p_sessions_played => (pg_temp.g('STU')).sessions_played, p_track_bookkeeping => true)->>'status', 'game_finished');
select pg_temp.assert_eq('M ...the progress already recorded is kept', (pg_temp.g('STU')).finish_bookkeeping->>'attempts', '2');
select pg_temp.assert_eq('M the end check repeat reports finished_now = false and keeps the marker (a lost first answer is resumed from it)',
  public.end_game_if_host_alone('STU', pg_temp.late('STU'), (pg_temp.g('STU')).session_started_at, (pg_temp.g('STU')).sessions_played, true)->>'finished_now', 'false');
select pg_temp.assert_eq('M ...marker still names the same finish', ((pg_temp.g('STU')).finish_bookkeeping->>'finished_at')::timestamptz, (pg_temp.g('STU')).finished_at);
select pg_temp.assert_eq('M ...and its progress', (pg_temp.g('STU')).finish_bookkeeping->>'attempts', '2');
select pg_temp.assert_eq('M the settlement repeat reports finished_now = false with the reason and keeps the marker',
  pg_temp.settle('STU', false, (pg_temp.g('STU')).sessions_played, true)->>'finished_now' || ':' || (pg_temp.settle('STU', false, (pg_temp.g('STU')).sessions_played, true)->>'result_reason') || ':' || ((pg_temp.g('STU')).finish_bookkeeping->>'attempts'), 'false:host_ended:2');

-- No session (a lobby): the seat goes right away.
select pg_temp.mk('ST"', 'waiting');
select pg_temp.assert_eq('19 lobby (no session): deleted at once', public.word_rush_remove_player('ST"', pg_temp.late('ST"'))->>'status', 'deleted');
select pg_temp.assert_eq('19 ...seat gone', (select count(*) from public.players where id = pg_temp.late('ST"')), 0::bigint);

-- The host leaving ALONE finishes the game (the seat stays, the marker is written when asked); an eligible successor, a
-- non-host, or another generation does not.
select pg_temp.mk('ST`', 'active');
update public.games set host_player_id = pg_temp.late('ST`') where id = 'ST`';
update public.players set spectator = true where id = pg_temp.early('ST`');
create temp table w_alone as select public.word_rush_remove_player('ST`', pg_temp.late('ST`'), p_host_leave => true, p_sessions_played => (pg_temp.g('ST`')).sessions_played) as r;
select pg_temp.assert_eq('19 host alone: the game is finished by the one function', (select r->>'status' from w_alone), 'host_ended');
select pg_temp.assert_eq('19 ...with its reason and the owed bookkeeping marker', (pg_temp.g('ST`')).result_reason || ':' || ((pg_temp.g('ST`')).finish_bookkeeping is not null)::text, 'host_ended:true');
select pg_temp.assert_eq('19 ...and the response carries the finish it wrote', ((select r->>'finished_at' from w_alone))::timestamptz, (pg_temp.g('ST`')).finished_at);
select pg_temp.assert_eq('19 ...the host keeps the seat', (select count(*) from public.players where id = pg_temp.late('ST`')), 1::bigint);
select pg_temp.mk('ST@', 'active');
update public.games set host_player_id = pg_temp.late('ST@') where id = 'ST@';
update public.players set spectator = true where id in (pg_temp.early('ST@'));
select pg_temp.assert_eq('19 a replayed generation is not finished by an older leave', public.word_rush_remove_player('ST@', pg_temp.late('ST@'), p_host_leave => true, p_sessions_played => (pg_temp.g('ST@')).sessions_played + 1)->>'status', 'deleted');
select pg_temp.mk('STN', 'active');
update public.games set host_player_id = pg_temp.late('STN') where id = 'STN';
select pg_temp.assert_eq('19 an eligible successor exists: the leave is a leave', public.word_rush_remove_player('STN', pg_temp.late('STN'), p_host_leave => true, p_sessions_played => (pg_temp.g('STN')).sessions_played)->>'status', 'deleted');

rollback;
