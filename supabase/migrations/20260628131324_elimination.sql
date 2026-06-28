-- Add elimination columns to players
alter table players add column if not exists is_eliminated boolean not null default false;
alter table players add column if not exists eliminated_at timestamptz;
alter table players add column if not exists lives_remaining integer;

-- Add elimination columns to tournament_players
alter table tournament_players add column if not exists is_eliminated boolean not null default false;
alter table tournament_players add column if not exists eliminated_at timestamptz;
alter table tournament_players add column if not exists lives_remaining integer;

-- Add elimination_config to games
alter table games add column if not exists elimination_config jsonb;

-- Add elimination_config to tournaments
alter table tournaments add column if not exists elimination_config jsonb;

-- Elimination events table
create table if not exists elimination_events (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  round_number integer,
  reason text not null,
  eliminated_at timestamptz default now()
);

create index if not exists idx_elimination_events_game_round
  on elimination_events(game_id, round_number);

-- RLS: fully permissive (same as all other tables)
alter table elimination_events enable row level security;

create policy "Allow all reads on elimination_events"
  on elimination_events for select using (true);

create policy "Allow all inserts on elimination_events"
  on elimination_events for insert with check (true);

create policy "Allow all updates on elimination_events"
  on elimination_events for update using (true);

create policy "Allow all deletes on elimination_events"
  on elimination_events for delete using (true);

-- Realtime
alter publication supabase_realtime add table elimination_events;
