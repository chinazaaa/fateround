-- School (School Whot) tournament format: a casual progression ladder rather
-- than an elimination bracket. Everyone starts in the lowest class (e.g. Primary
-- 1). Each round players are paired 1-v-1 by class; the winner of a match climbs
-- to the next class, the loser repeats the same class (nobody is eliminated). The
-- first player to graduate past the top class wins.
--
-- Reuses tournament_games' 1-v-1 bracket columns (player_a_id / player_b_id /
-- winner_player_id / round_number) — the only new state is each player's current
-- class, tracked as an integer level on tournament_players. game_config stores the
-- ladder length (schoolClassCount) plus the Whot house rules / timers, captured at
-- creation and reused every round.

alter table tournaments drop constraint if exists tournaments_format_check;
alter table tournaments
  add constraint tournaments_format_check
  check (format in ('round-robin', 'head-to-head', 'knockout', 'school'));

-- 0-based index of the class a player is currently in (0 = the lowest class).
-- Only meaningful for the school format; defaults to 0 and is left untouched by
-- every other format. A player who reaches schoolClassCount has graduated.
alter table tournament_players
  add column if not exists school_level integer not null default 0;
