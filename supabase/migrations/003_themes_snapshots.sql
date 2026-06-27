-- Migration 003: Custom themes + Game snapshots (rematch history)
-- Run in Supabase Dashboard > SQL Editor > New Query

-- 1. Theme column on games table
alter table games add column if not exists theme text not null default 'default'
  check (theme in ('default', 'neon', 'retro', 'elegant', 'tropical'));

-- 2. Game snapshots (saved before play-again reset for rematch history)
create table if not exists game_snapshots (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games(id) on delete cascade,
  session_number integer not null default 1,
  snapshot_data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_game_snapshots_game_id on game_snapshots(game_id);

alter table game_snapshots enable row level security;
drop policy if exists "public_game_snapshots" on game_snapshots;
create policy "public_game_snapshots" on game_snapshots for all to anon using (true) with check (true);
