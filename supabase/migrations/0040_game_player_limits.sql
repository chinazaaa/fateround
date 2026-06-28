-- Admin-editable max player caps per lobby game type.
create table if not exists game_player_limits (
  game_type text primary key check (
    game_type in ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths')
  ),
  max_players integer not null check (max_players >= 2 and max_players <= 100),
  updated_at timestamptz not null default now()
);

alter table game_player_limits enable row level security;
drop policy if exists "public_game_player_limits_select" on game_player_limits;
create policy "public_game_player_limits_select" on game_player_limits
  for select to anon, authenticated using (true);

insert into game_player_limits (game_type, max_players) values
  ('anonymous_messages', 20),
  ('bingo', 30),
  ('codewords', 20),
  ('trivia', 40),
  ('two_truths', 40)
on conflict (game_type) do nothing;

-- Raise global games.max_players ceiling; per-game caps enforced in app.
alter table games drop constraint if exists games_max_players_check;
alter table games add constraint games_max_players_check
  check (max_players is null or max_players between 2 and 100);
