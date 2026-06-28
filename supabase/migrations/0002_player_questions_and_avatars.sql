-- Migration: Player questions + Avatar storage
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- 1. Player-submitted questions (WYR/MLT lobby phase)
create table if not exists player_questions (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  question_type text not null check (question_type in ('wyr', 'mlt')),
  option_a text,
  option_b text,
  question_text text,
  created_at timestamptz not null default now()
);
create index if not exists idx_player_questions_game_id on player_questions(game_id);

alter table player_questions enable row level security;
drop policy if exists "public_player_questions" on player_questions;
create policy "public_player_questions" on player_questions for all to anon using (true) with check (true);
do $$ begin alter publication supabase_realtime add table player_questions; exception when duplicate_object then null; end $$;

-- 2. Avatars storage bucket (for participant photos)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "public_avatars" on storage.objects;
create policy "public_avatars"
  on storage.objects for all to anon
  using (bucket_id = 'avatars')
  with check (bucket_id = 'avatars');
