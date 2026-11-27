-- Player joins: repeatable test for the players_enforce_join_rules BEFORE INSERT trigger
-- (supabase/migrations/20261203700000_players_join_rules_trigger.sql).
--
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/players-join-rules.sql
-- One transaction, rolled back at the end. Any failed assertion raises and exits non-zero.
--
-- Covers the rules in a single session: seat cap (non-spectators only, clamped by game_player_limits, per
-- status), name uniqueness (case-insensitive, spectators and bots count) and the team-game exception.
-- Serialization under concurrent joins needs several sessions: supabase/tests/players-join-rules-lock.sh.

begin;

-- Fixture games. max_players 4 everywhere unless noted.
insert into public.games (id, title, host_token, game_type, status, max_players) values
  ('PJUNO',  'pj uno',          'h', 'uno',        'waiting', 4),
  ('PJUTM',  'pj uno team',     'h', 'uno',        'waiting', 4),
  ('PJTTL',  'pj two truths',   'h', 'two_truths', 'waiting', 4),
  ('PJSCR',  'pj scrabble',     'h', 'scrabble',   'waiting', 4),
  ('PJCW',   'pj codewords',    'h', 'codewords',  'waiting', 4),
  ('PJDIT',  'pj describe it',  'h', 'describe_it','waiting', 4),
  ('PJDII',  'pj describe ind', 'h', 'describe_it','waiting', 4),
  ('PJWRT',  'pj word rush t',  'h', 'word_rush',  'waiting', 4),
  ('PJWRI',  'pj word rush i',  'h', 'word_rush',  'waiting', 4),
  ('PJQDG',  'pj quick draw g', 'h', 'quick_draw', 'waiting', 4),
  ('PJQDL',  'pj quick draw l', 'h', 'quick_draw', 'waiting', 4),
  ('PJQDI',  'pj quick draw i', 'h', 'quick_draw', 'waiting', 4),
  ('PJACT',  'pj uno active',   'h', 'uno',        'active',  4),
  ('PJWRA',  'pj word rush act','h', 'word_rush',  'active',  4),
  ('PJCWA',  'pj codewords act','h', 'codewords',  'active',  4),
  ('PJNOL',  'pj no limit type','h', 'smash_marry_kill', 'waiting', 2),
  ('PJNUL',  'pj null max',     'h', 'uno',        'waiting', null),
  ('PJCLP',  'pj clamp',        'h', 'chess',      'waiting', 50);
update public.games set uno_team_mode = true where id = 'PJUTM';
update public.games set describe_it_mode = 'team'       where id = 'PJDIT';
update public.games set describe_it_mode = 'individual' where id = 'PJDII';
update public.games set word_rush_mode = 'team'         where id = 'PJWRT';
update public.games set word_rush_mode = 'individual'   where id = 'PJWRI';
update public.games set quick_draw_variant = 'guess', quick_draw_play_mode = 'team'       where id = 'PJQDG';
update public.games set quick_draw_variant = 'lie',   quick_draw_play_mode = 'team'       where id = 'PJQDL';
update public.games set quick_draw_variant = 'guess', quick_draw_play_mode = 'individual' where id = 'PJQDI';

-- Run an insert, return 'ok' or the SQLSTATE it failed with (each call is its own savepoint).
create function pg_temp.try_join(p_game text, p_name text, p_spectator boolean default false, p_bot boolean default false)
returns text language plpgsql as $$
begin
  insert into public.players (game_id, name, spectator, is_bot) values (p_game, p_name, p_spectator, p_bot);
  return 'ok';
exception when others then
  return sqlstate;
end $$;

create function pg_temp.seated(p_game text) returns int language sql as $$
  select count(*)::int from public.players where game_id = p_game and spectator = false
$$;

do $$
declare
  i int;
begin
  ---------------------------------------------------------------- seat cap
  for i in 1..4 loop
    assert pg_temp.try_join('PJUNO', 'P' || i) = 'ok', 'seat ' || i || ' of 4 is admitted';
  end loop;
  assert pg_temp.try_join('PJUNO', 'P5') = 'PJ001', 'the 5th seat in a max_players=4 lobby is refused';
  assert pg_temp.seated('PJUNO') = 4, 'a refused join inserts nothing';
  assert pg_temp.try_join('PJUNO', 'Watcher', true) = 'ok', 'a spectator takes no seat, so a full lobby still admits one';
  assert pg_temp.try_join('PJUNO', 'Bot9', false, true) = 'PJ001', 'a bot is a seat like any other non-spectator';
  assert pg_temp.seated('PJUNO') = 4;
  delete from public.players where game_id = 'PJUNO' and name = 'P4';
  assert pg_temp.try_join('PJUNO', 'P6') = 'ok', 'a freed seat can be taken again';
  assert pg_temp.try_join('PJUNO', 'P7') = 'PJ001';

  -- Cap is read per game, clamped down to game_player_limits (chess allows 2 whatever games.max_players says).
  assert pg_temp.try_join('PJCLP', 'A') = 'ok';
  assert pg_temp.try_join('PJCLP', 'B') = 'ok';
  assert pg_temp.try_join('PJCLP', 'C') = 'PJ001', 'games.max_players above the type limit is clamped to it';

  -- No cap for a game type without a game_player_limits row, nor when max_players is null.
  assert pg_temp.try_join('PJNOL', 'A') = 'ok';
  assert pg_temp.try_join('PJNOL', 'B') = 'ok';
  assert pg_temp.try_join('PJNOL', 'C') = 'ok', 'a type with no lobby limit is never capped by the trigger';
  for i in 1..12 loop
    assert pg_temp.try_join('PJNUL', 'N' || i) = 'ok', 'null max_players: the route falls back to a code default; the trigger does not cap';
  end loop;

  -- Status: late joins into an active game are capped only for codewords / describe_it / word_rush.
  for i in 1..4 loop
    insert into public.players (game_id, name) values ('PJACT', 'A' || i);
    insert into public.players (game_id, name) values ('PJWRA', 'A' || i);
    insert into public.players (game_id, name) values ('PJCWA', 'A' || i);
  end loop;
  assert pg_temp.try_join('PJACT', 'Late') = 'ok', 'an active uno game does not cap late players here (unchanged behaviour)';
  assert pg_temp.try_join('PJWRA', 'Late') = 'PJ001', 'an active word_rush game rejects a full late join, as the route does';
  assert pg_temp.try_join('PJCWA', 'Late') = 'PJ001', 'an active codewords game rejects a full late join, as the route does';
  assert pg_temp.try_join('PJWRA', 'Watcher', true) = 'ok';

  ---------------------------------------------------------------- name uniqueness
  assert pg_temp.try_join('PJTTL', 'Same') = 'ok';
  assert pg_temp.try_join('PJTTL', 'Same') = 'PJ002', 'exact duplicate refused outside team games';
  assert pg_temp.try_join('PJTTL', 'sAME') = 'PJ002', 'case-insensitive, like the route nameTaken ilike';
  assert pg_temp.try_join('PJTTL', 'Same', true) = 'PJ002', 'a spectator may not reuse a seated name either';
  assert pg_temp.try_join('PJTTL', 'Other') = 'ok';
  assert pg_temp.try_join('PJTTL', 'Watch', true) = 'ok';
  assert pg_temp.try_join('PJTTL', 'watch', false, true) = 'PJ002', 'a bot may not reuse a spectator name';
  assert pg_temp.try_join('PJSCR', 'Same') = 'ok';
  assert pg_temp.try_join('PJSCR', 'Same') = 'PJ002';
  assert pg_temp.try_join('PJUNO', 'p1') = 'PJ002', 'name rule applies in uno without team mode (and wins over the full check)';
  assert pg_temp.try_join('PJSCR', 'Sa_e') = 'ok', 'underscore is a literal here, not an ilike wildcard';
  assert pg_temp.try_join('PJSCR', 'S%') = 'ok', 'percent is a literal here, not an ilike wildcard';
  assert (select count(*) from public.players where game_id = 'PJSCR' and lower(name) = 'same') = 1;

  -- Same name in a different game is fine.
  assert pg_temp.try_join('PJTTL', 'P1') = 'ok';

  -- A freed name can be reused.
  delete from public.players where game_id = 'PJTTL' and name = 'Other';
  assert pg_temp.try_join('PJTTL', 'other') = 'ok';

  ---------------------------------------------------------------- team games may repeat names
  assert pg_temp.try_join('PJUTM', 'Same') = 'ok';
  assert pg_temp.try_join('PJUTM', 'Same') = 'ok', 'uno Team-Up allows duplicate names';
  assert pg_temp.try_join('PJCW', 'Same') = 'ok';
  assert pg_temp.try_join('PJCW', 'Same') = 'ok', 'codewords (always teams) allows duplicate names';
  assert pg_temp.try_join('PJDIT', 'Same') = 'ok';
  assert pg_temp.try_join('PJDIT', 'Same') = 'ok', 'describe_it team mode allows duplicate names';
  assert pg_temp.try_join('PJWRT', 'Same') = 'ok';
  assert pg_temp.try_join('PJWRT', 'Same') = 'ok', 'word_rush team mode allows duplicate names';
  assert pg_temp.try_join('PJQDG', 'Same') = 'ok';
  assert pg_temp.try_join('PJQDG', 'Same') = 'ok', 'quick_draw guess + team allows duplicate names';

  -- ...but the seat cap still holds in team games.
  assert pg_temp.try_join('PJUTM', 'Same') = 'ok';
  assert pg_temp.try_join('PJUTM', 'Same') = 'ok';
  assert pg_temp.try_join('PJUTM', 'Same') = 'PJ001', 'a team game is still capped at max_players';

  ---------------------------------------------------------------- non-team modes of team-capable games
  assert pg_temp.try_join('PJDII', 'Same') = 'ok';
  assert pg_temp.try_join('PJDII', 'Same') = 'PJ002', 'describe_it individual mode: unique names';
  assert pg_temp.try_join('PJWRI', 'Same') = 'ok';
  assert pg_temp.try_join('PJWRI', 'Same') = 'PJ002', 'word_rush individual mode: unique names';
  assert pg_temp.try_join('PJQDL', 'Same') = 'ok';
  assert pg_temp.try_join('PJQDL', 'Same') = 'PJ002', 'quick_draw lie variant ignores play_mode (default team): unique names';
  assert pg_temp.try_join('PJQDI', 'Same') = 'ok';
  assert pg_temp.try_join('PJQDI', 'Same') = 'PJ002', 'quick_draw guess + individual: unique names';

  ---------------------------------------------------------------- unknown game
  assert pg_temp.try_join('NOSUCHGAME', 'X') = '23503', 'an unknown game still fails on the foreign key, not in the trigger';
end $$;

rollback;
