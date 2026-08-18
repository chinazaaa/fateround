alter table public.games
  add column if not exists monopoly_board_size integer not null default 40;

alter table public.games
  drop constraint if exists games_monopoly_board_size_check;
alter table public.games
  add constraint games_monopoly_board_size_check check (monopoly_board_size in (40, 48));

alter table public.monopoly_boards
  add column if not exists board_size integer not null default 40;

alter table public.monopoly_boards
  drop constraint if exists monopoly_boards_board_size_check;
alter table public.monopoly_boards
  add constraint monopoly_boards_board_size_check check (board_size in (40, 48));

alter table public.monopoly_player_state
  drop constraint if exists monopoly_player_state_position_check;
alter table public.monopoly_player_state
  add constraint monopoly_player_state_position_check check (position >= 0 and position <= 47);

grant select (monopoly_board_size) on public.games to anon, authenticated;
grant select (board_size) on public.monopoly_boards to anon, authenticated;
