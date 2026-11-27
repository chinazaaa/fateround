-- Serialize player joins per game and enforce the seat cap + name uniqueness in the database.
--
-- POST /api/players read the seated count / checked nameTaken and then inserted, with no lock and no
-- constraint, so concurrent joins all passed the check: 9 simultaneous joins into a max_players=4 lobby
-- seated 6-9 players, and 4 simultaneous joins with the same name created 4 rows. Sequential joins were fine.
--
-- This BEFORE INSERT trigger closes both races. It first takes a row lock on the game (games row first,
-- the repo's lock order), so every join into one game runs one at a time; the count and the name look-up
-- that follow then see every earlier join, because READ COMMITTED takes a fresh snapshot per statement.
--
--   1. Name uniqueness. A new player may not reuse a name (case-insensitive, same as the route's
--      nameTaken ilike) already in the game, spectators and bots included -- except in a TEAM game,
--      where duplicates are allowed. A game is a team game when:
--        codewords                                  always (every player is on the red or blue team)
--        uno           and uno_team_mode            Team-Up 2v2
--        describe_it   and describe_it_mode='team'
--        word_rush     and word_rush_mode='team'
--        quick_draw    and variant 'guess' and quick_draw_play_mode='team'
--      (quick_draw_play_mode defaults to 'team' but only the 'guess' variant uses it.)
--   2. Seat cap. A non-spectator may not take a seat beyond the game's max_players (clamped down to
--      game_player_limits, as the route does). Spectators consume no seat. Enforced while the lobby is
--      'waiting', and also while 'active' for codewords / describe_it / word_rush, the three games whose
--      route rejects a full late join; other games admit late players beyond the cap today and still do.
--      Only game types with a game_player_limits row are capped, matching isLobbyLimitGameType.
--
-- Rejections use custom SQLSTATEs the route maps back to its existing 400 messages:
--   PJ001  lobby full        PJ002  name already taken
-- (Not P0001: add_extra_bot's `when raise_exception` handler must not swallow them.)
--
-- Scope: INSERT only. Renames (PATCH) and spectator -> player promotion are unchanged.
-- SECURITY DEFINER: it must read games columns and lock the games row regardless of which role inserts,
-- and must see every player row regardless of RLS. A trigger function cannot be called directly, so no
-- EXECUTE privilege change is needed.

create or replace function public.players_enforce_join_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  g          record;
  v_is_team  boolean;
  v_limit    integer;
  v_cap      integer;
  v_seated   bigint;
begin
  select id, game_type, status, max_players, uno_team_mode, describe_it_mode,
         word_rush_mode, quick_draw_variant, quick_draw_play_mode
    into g
    from public.games
   where id = new.game_id
     for no key update;

  -- No such game: leave it to the foreign key to reject the row.
  if not found then
    return new;
  end if;

  v_is_team := case g.game_type
    when 'codewords'   then true
    when 'uno'         then coalesce(g.uno_team_mode, false)
    when 'describe_it' then g.describe_it_mode = 'team'
    when 'word_rush'   then g.word_rush_mode = 'team'
    when 'quick_draw'  then g.quick_draw_variant = 'guess' and g.quick_draw_play_mode = 'team'
    else false
  end;

  if not coalesce(v_is_team, false) and exists (
    select 1 from public.players p
     where p.game_id = new.game_id
       and lower(p.name) = lower(new.name)
  ) then
    raise exception using
      errcode = 'PJ002',
      message = 'players_join_name_taken',
      detail  = 'A player with this name is already in the game.';
  end if;

  if new.spectator is not true
     and g.max_players is not null
     and (g.status = 'waiting'
          or (g.status = 'active' and g.game_type in ('codewords', 'describe_it', 'word_rush')))
  then
    select l.max_players into v_limit
      from public.game_player_limits l
     where l.game_type = g.game_type;

    if found then
      v_cap := least(g.max_players, v_limit);
      select count(*) into v_seated
        from public.players p
       where p.game_id = new.game_id
         and p.spectator = false;
      if v_seated >= v_cap then
        raise exception using
          errcode = 'PJ001',
          message = 'players_join_lobby_full',
          detail  = format('The game is full (%s seats).', v_cap);
      end if;
    end if;
  end if;

  return new;
end
$$;

comment on function public.players_enforce_join_rules() is
  'BEFORE INSERT on players: serializes joins per game (games row lock), enforces the seat cap and, outside team games, case-insensitive name uniqueness. Raises PJ001 (full) / PJ002 (name taken).';

drop trigger if exists players_enforce_join_rules on public.players;
create trigger players_enforce_join_rules
  before insert on public.players
  for each row
  execute function public.players_enforce_join_rules();
