-- Tournament mode tables

create table if not exists tournaments (
  id text primary key,
  host_token text not null,
  title text not null,
  status text not null default 'waiting',
  placement_points jsonb not null default '[10, 7, 5, 3, 2, 1]'::jsonb,
  target_game_count integer,
  created_at timestamptz default now()
);

create table if not exists tournament_players (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references tournaments(id) on delete cascade,
  player_name text not null,
  total_points integer not null default 0,
  games_played integer not null default 0,
  joined_at timestamptz default now(),
  unique (tournament_id, player_name)
);

create index if not exists idx_tournament_players_tournament
  on tournament_players(tournament_id);

create table if not exists tournament_games (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references tournaments(id) on delete cascade,
  game_id text not null references games(id) on delete cascade,
  game_order integer not null,
  status text not null default 'pending',
  placements jsonb,
  unique (tournament_id, game_order)
);

create index if not exists idx_tournament_games_tournament
  on tournament_games(tournament_id);

alter table games add column if not exists tournament_id text references tournaments(id);

-- RLS (fully permissive, matching existing pattern)
alter table tournaments enable row level security;
create policy "tournaments_all" on tournaments for all using (true) with check (true);

alter table tournament_players enable row level security;
create policy "tournament_players_all" on tournament_players for all using (true) with check (true);

alter table tournament_games enable row level security;
create policy "tournament_games_all" on tournament_games for all using (true) with check (true);

-- Realtime
alter publication supabase_realtime add table tournaments;
alter publication supabase_realtime add table tournament_players;
alter publication supabase_realtime add table tournament_games;

-- Atomic point increment
create or replace function increment_tournament_points(
  p_player_id uuid,
  p_points integer
) returns void as $$
begin
  update tournament_players
  set total_points = total_points + p_points,
      games_played = games_played + 1
  where id = p_player_id;
end;
$$ language plpgsql;
