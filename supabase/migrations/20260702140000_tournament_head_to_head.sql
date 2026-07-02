-- Head-to-head (1v1 bracket) tournament format.
-- A new tournament `format` distinguishes the existing all-vs-all round-robin
-- from head-to-head brackets, where players are matched 1-v-1 and advance
-- through rounds until one champion remains.

alter table tournaments
  add column if not exists format text not null default 'round-robin';

alter table tournaments
  drop constraint if exists tournaments_format_check;
alter table tournaments
  add constraint tournaments_format_check
  check (format in ('round-robin', 'head-to-head'));

-- For head-to-head, tournament_games doubles as the bracket match table: one
-- row per match, grouped into rounds. All columns are nullable / defaulted so
-- existing round-robin rows (one free-for-all game per game_order) are
-- unaffected. game_order stays globally unique per tournament (matches keep
-- getting the next order value), while round_number/match_index locate a match
-- within the bracket.
alter table tournament_games
  add column if not exists round_number integer,
  add column if not exists match_index integer,
  add column if not exists player_a_id uuid references tournament_players(id) on delete set null,
  add column if not exists player_b_id uuid references tournament_players(id) on delete set null,
  add column if not exists winner_player_id uuid references tournament_players(id) on delete set null,
  add column if not exists is_bye boolean not null default false;

create index if not exists idx_tournament_games_round
  on tournament_games(tournament_id, round_number);
