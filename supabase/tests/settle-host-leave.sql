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
update public.games set host_user_id = '11111111-1111-1111-1111-111111111111' where id = 'ST3';
select pg_temp.assert_eq('3 status', pg_temp.settle('ST3', true, 1, true)->>'status', 'finished');
select pg_temp.assert_eq('3 finished_now', pg_temp.settle('ST3', true, 1, true)->>'finished_now', 'false'); -- the repeat
select pg_temp.assert_eq('3 game finished', (pg_temp.g('ST3')).status, 'finished');
select pg_temp.assert_eq('3 reason', (pg_temp.g('ST3')).result_reason, 'host_ended');
select pg_temp.assert_eq('3 finished_at set', (pg_temp.g('ST3')).finished_at is not null, true);
select pg_temp.assert_eq('3 bookkeeping marker', (pg_temp.g('ST3')).finish_bookkeeping->>'attempts', '0');
select pg_temp.assert_eq('3 host_user_id cleared', (pg_temp.g('ST3')).host_user_id, null::uuid);

-- 4. A waiting game ends the same way, and an untracked finish writes no bookkeeping marker.
select pg_temp.mk('ST4', 'waiting');
delete from public.players where id in (pg_temp.early('ST4'), pg_temp.late('ST4'));
select pg_temp.assert_eq('4 finished_now', pg_temp.settle('ST4', false)->>'finished_now', 'true');
select pg_temp.assert_eq('4 no marker', (pg_temp.g('ST4')).finish_bookkeeping is null, true);

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

rollback;
