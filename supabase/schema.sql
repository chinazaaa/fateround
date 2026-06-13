-- KissMarryKill Schema
-- Run this in your Supabase SQL editor

-- Games
create table if not exists games (
  id text primary key,
  title text not null,
  host_token text not null,
  rounds_count integer not null default 3,
  timer_seconds integer not null default 30,
  anonymous boolean not null default false,
  auto_reveal boolean not null default true,
  auto_submit_behavior text not null default 'random',
  participant_mode text not null default 'import' check (participant_mode in ('import', 'joiners')),
  pair_vote_mode text not null default 'any' check (pair_vote_mode in ('any', 'one_each')),
  game_type text not null default 'smash_marry_kill' check (game_type in ('smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'would_you_rather', 'most_likely_to')),
  status text not null default 'waiting',
  current_round_number integer not null default 0,
  created_at timestamptz not null default now()
);

-- If upgrading an existing database, run:
-- alter table games add column if not exists game_type text not null default 'smash_marry_kill' check (game_type in ('smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass'));
-- To allow smash_or_pass on an existing DB, drop and recreate the check:
-- alter table games drop constraint if exists games_game_type_check;
-- alter table games add constraint games_game_type_check check (game_type in ('smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'would_you_rather', 'most_likely_to'));

-- alter table games add column if not exists pair_vote_mode text not null default 'any' check (pair_vote_mode in ('any', 'one_each'));

-- Participants (people being voted on)
create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games(id) on delete cascade,
  name text not null,
  gender text not null default 'female' check (gender in ('male', 'female')),
  photo_url text,
  description text,
  display_order integer not null default 0,
  in_mlt_poll boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_participants_game_id on participants(game_id);

-- If upgrading an existing database, run:
-- alter table participants add column if not exists gender text not null default 'female' check (gender in ('male', 'female'));

-- Players (people playing)
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games(id) on delete cascade,
  name text not null,
  gender text not null default 'female' check (gender in ('male', 'female', 'both')),
  identity_gender text check (identity_gender in ('male', 'female')),
  participant_id uuid references participants(id) on delete set null,
  joined_at timestamptz not null default now()
);
create index if not exists idx_players_game_id on players(game_id);
create unique index if not exists idx_players_participant_claim on players(game_id, participant_id) where participant_id is not null;

-- If upgrading an existing database, run:
-- alter table players drop constraint if exists players_gender_check;
-- alter table players add constraint players_gender_check check (gender in ('male', 'female', 'both'));
-- alter table players add column if not exists identity_gender text check (identity_gender in ('male', 'female'));
-- alter table players add column if not exists participant_id uuid references participants(id) on delete set null;
-- create unique index if not exists idx_players_participant_claim on players(game_id, participant_id) where participant_id is not null;

-- Rounds
create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games(id) on delete cascade,
  round_number integer not null,
  participant_ids uuid[] not null default '{}',
  wyr_option_a text,
  wyr_option_b text,
  mlt_question text,
  status text not null default 'pending',
  started_at timestamptz,
  ended_at timestamptz
);
create index if not exists idx_rounds_game_id on rounds(game_id);
create index if not exists idx_rounds_game_status on rounds(game_id, status);

-- Votes
create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  game_id text not null references games(id) on delete cascade,
  kiss_participant_id uuid references participants(id),
  marry_participant_id uuid references participants(id),
  kill_participant_id uuid references participants(id),
  /** Pair games: { "participant-id": "kiss"|"kill" } — one flag per person, can match. */
  pair_assignments jsonb,
  wyr_choice text check (wyr_choice in ('a', 'b')),
  target_player_id uuid references players(id),
  target_participant_id uuid references participants(id),
  created_at timestamptz not null default now(),
  unique(player_id, round_id)
);
create index if not exists idx_votes_game_id on votes(game_id);
create index if not exists idx_votes_round_id on votes(round_id);

-- If upgrading: alter table votes add column if not exists pair_assignments jsonb;
-- alter table rounds add column if not exists wyr_option_a text;
-- alter table rounds add column if not exists wyr_option_b text;
-- alter table votes add column if not exists wyr_choice text check (wyr_choice in ('a', 'b'));
-- alter table rounds add column if not exists mlt_question text;
-- alter table votes add column if not exists target_player_id uuid references players(id);
-- alter table participants add column if not exists in_mlt_poll boolean not null default false;
-- alter table votes add column if not exists target_participant_id uuid references participants(id);

-- Confessions (anonymous post-round messages)
create table if not exists confessions (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games(id) on delete cascade,
  round_id uuid references rounds(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_confessions_game_id on confessions(game_id);

-- Row Level Security (permissive — no auth required for this game)
alter table games enable row level security;
alter table participants enable row level security;
alter table players enable row level security;
alter table rounds enable row level security;
alter table votes enable row level security;
alter table confessions enable row level security;

create policy "public_games"        on games        for all to anon using (true) with check (true);
create policy "public_participants" on participants  for all to anon using (true) with check (true);
create policy "public_players"      on players      for all to anon using (true) with check (true);
create policy "public_rounds"       on rounds       for all to anon using (true) with check (true);
create policy "public_votes"        on votes        for all to anon using (true) with check (true);
create policy "public_confessions"  on confessions  for all to anon using (true) with check (true);

-- Enable Realtime
alter publication supabase_realtime add table games;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table rounds;
alter publication supabase_realtime add table votes;
