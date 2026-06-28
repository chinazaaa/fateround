-- Hot Seat game mode
-- One player is "in the hot seat" each round. Everyone else anonymously
-- submits one thing about them (compliment, roast, or observation).

-- Required by game create/update (import mode: all list vs joined-only)
alter table games
  add column if not exists participant_filter text not null default 'all'
  check (participant_filter in ('all', 'joined'));

-- Update game_type check constraint to include 'hot_seat'
alter table games drop constraint if exists games_game_type_check;
alter table games add constraint games_game_type_check check (game_type in ('smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'would_you_rather', 'most_likely_to', 'who_said_this', 'hot_seat'));

-- Hot Seat submissions
create table if not exists hot_seat_submissions (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  text text not null,
  submission_type text not null default 'observation' check (submission_type in ('compliment', 'roast', 'observation')),
  created_at timestamptz not null default now(),
  unique(round_id, player_id)
);
create index if not exists idx_hot_seat_submissions_round on hot_seat_submissions(round_id);
alter table hot_seat_submissions enable row level security;
drop policy if exists "public_hot_seat_submissions" on hot_seat_submissions;
create policy "public_hot_seat_submissions" on hot_seat_submissions for all to anon using (true) with check (true);
