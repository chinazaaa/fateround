-- Play Again reset fence: repeatable test for public.begin_play_again_reset() / public.abort_play_again_reset() and
-- the reset-awareness of public.end_game_if_host_alone() / public.settle_host_leave()
-- (supabase/migrations/20261204200000_play_again_reset_fence.sql).
--
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/play-again-reset-fence.sql
-- One transaction, rolled back at the end. Any failed assertion raises and exits non-zero.

begin;

insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111') on conflict (id) do nothing;

create function pg_temp.assert_eq(label text, got anyelement, want anyelement) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL %: got %, want %', label, got, want;
  end if;
end $$;

create function pg_temp.mk(gid text, status text) returns void language plpgsql as $$
begin
  insert into public.games (id, title, host_token, game_type, status, sessions_played)
    values (gid, 'reset test', 'tok-' || gid, 'uno', status, 3);
end $$;
create function pg_temp.g(gid text) returns public.games language sql as $$ select * from public.games where id = gid $$;
create function pg_temp.begin_reset(gid text, st text default 'finished', ss timestamptz default null, sp integer default 3) returns jsonb language sql as $$
  select public.begin_play_again_reset(gid, st, ss, sp)
$$;

-- 1. A matching snapshot starts the reset and returns its token.
select pg_temp.mk('PR1', 'finished');
select pg_temp.assert_eq('1 started', pg_temp.begin_reset('PR1')->>'status', 'started');
select pg_temp.assert_eq('1 marker set', (pg_temp.g('PR1')).reset_started_at is not null, true);
select pg_temp.assert_eq('1 the visible state did not change', (pg_temp.g('PR1')).status, 'finished');

-- 2. A second reset is refused while the first runs.
select pg_temp.assert_eq('2 in progress', pg_temp.begin_reset('PR1')->>'status', 'in_progress');

-- 3. abort releases only its own token.
select public.abort_play_again_reset('PR1', now() - interval '1 day');
select pg_temp.assert_eq('3 wrong token: marker kept', (pg_temp.g('PR1')).reset_started_at is not null, true);
select public.abort_play_again_reset('PR1', (pg_temp.g('PR1')).reset_started_at);
select pg_temp.assert_eq('3 right token: released', (pg_temp.g('PR1')).reset_started_at is null, true);
select pg_temp.assert_eq('3 can start again', pg_temp.begin_reset('PR1')->>'status', 'started');

-- 4. The snapshot must still be the game: status, session start and sessions_played are each compared.
select pg_temp.mk('PR2', 'finished');
select pg_temp.assert_eq('4 other status', pg_temp.begin_reset('PR2', 'active')->>'status', 'changed');
select pg_temp.assert_eq('4 other session start', pg_temp.begin_reset('PR2', 'finished', now())->>'status', 'changed');
select pg_temp.assert_eq('4 other sessions_played', pg_temp.begin_reset('PR2', 'finished', null, 9)->>'status', 'changed');
select pg_temp.assert_eq('4 nothing was marked', (pg_temp.g('PR2')).reset_started_at is null, true);
-- A start changes session_started_at (sessions_played stays), a reset changes sessions_played: both are detected.
update public.games set session_started_at = now() where id = 'PR2';
select pg_temp.assert_eq('4 a start since the read', pg_temp.begin_reset('PR2')->>'status', 'changed');
update public.games set session_started_at = null, sessions_played = 4 where id = 'PR2';
select pg_temp.assert_eq('4 a reset since the read', pg_temp.begin_reset('PR2')->>'status', 'changed');

-- 5. Owed bookkeeping blocks the reset (its rows are kept until the bookkeeping settles).
select pg_temp.mk('PR3', 'finished');
update public.games set finish_bookkeeping = jsonb_build_object('finished_at', now(), 'attempts', 0) where id = 'PR3';
select pg_temp.assert_eq('5 owed', pg_temp.begin_reset('PR3')->>'status', 'bookkeeping_owed');
select pg_temp.assert_eq('5 nothing marked', (pg_temp.g('PR3')).reset_started_at is null, true);

-- 6. A crashed reset's marker expires.
select pg_temp.mk('PR4', 'finished');
update public.games set reset_started_at = now() - interval '2 minutes' where id = 'PR4';
select pg_temp.assert_eq('6 stale marker: can start', pg_temp.begin_reset('PR4')->>'status', 'started');

-- 7. A host-left finish cannot commit against a reset in progress ...
select pg_temp.mk('PR5', 'active');
insert into public.players (id, game_id, name) values ('00000000-0000-0000-0000-0000000005a1', 'PR5', 'Host');
update public.games set host_player_id = '00000000-0000-0000-0000-0000000005a1' where id = 'PR5';
select pg_temp.assert_eq('7 reset started', pg_temp.begin_reset('PR5', 'active')->>'status', 'started');
select pg_temp.assert_eq('7 end refused during a reset',
  public.end_game_if_host_alone('PR5', '00000000-0000-0000-0000-0000000005a1', null, 3, true)->>'status', 'continue');
select pg_temp.assert_eq('7 the game was not finished', (pg_temp.g('PR5')).status, 'active');
select public.abort_play_again_reset('PR5', (pg_temp.g('PR5')).reset_started_at);
select pg_temp.assert_eq('7 after the reset it can end',
  public.end_game_if_host_alone('PR5', '00000000-0000-0000-0000-0000000005a1', null, 3, true)->>'status', 'finished');

-- 8. ... and a finish that committed FIRST leaves its marker, so the reset is refused and its rows are kept.
select pg_temp.assert_eq('8 owed after the finish', pg_temp.begin_reset('PR5', 'finished')->>'status', 'bookkeeping_owed');

-- 9. settle_host_leave: a fresh finish waits out a reset; a nomination does not.
select pg_temp.mk('PR6', 'active');
select pg_temp.assert_eq('9 reset started', pg_temp.begin_reset('PR6', 'active')->>'status', 'started');
select pg_temp.assert_eq('9 no successor: refused to finish',
  public.settle_host_leave('PR6', '00000000-0000-0000-0000-0000000006a1', null, null, 3, true)->>'reset_in_progress', 'true');
select pg_temp.assert_eq('9 the game was not finished', (pg_temp.g('PR6')).status, 'active');
insert into public.players (id, game_id, name, joined_at) values ('00000000-0000-0000-0000-0000000006b1', 'PR6', 'Other', now());
select pg_temp.assert_eq('9 with a successor it still nominates',
  public.settle_host_leave('PR6', '00000000-0000-0000-0000-0000000006a1', null, null, 3, true)->>'status', 'nominated');

-- 10. NULL arguments.
do $$ begin
  perform public.begin_play_again_reset(null, 'finished', null, 1);
  raise exception 'FAIL: NULL game id accepted';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
do $$ begin
  perform public.begin_play_again_reset('PR1', null, null, 1);
  raise exception 'FAIL: NULL status accepted';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
do $$ begin
  perform public.abort_play_again_reset('PR1', null);
  raise exception 'FAIL: NULL token accepted';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;

rollback;
