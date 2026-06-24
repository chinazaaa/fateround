-- KissMarryKill Schema
-- Run this in your Supabase SQL editor

-- Games
create table if not exists games (
  id text primary key,
  title text not null,
  host_token text not null,
  rounds_count integer not null default 3,
  timer_seconds integer not null default 30,
  anonymous boolean not null default true,
  auto_reveal boolean not null default true,
  auto_submit_behavior text not null default 'no_answer',
  participant_mode text not null default 'import' check (participant_mode in ('import', 'joiners', 'voters')),
  participant_filter text not null default 'all' check (participant_filter in ('all', 'joined')),
  pair_vote_mode text not null default 'one_each' check (pair_vote_mode in ('any', 'one_each')),
  question_source text not null default 'platform' check (question_source in ('platform', 'custom')),
  custom_questions jsonb,
  game_type text not null default 'smash_marry_kill' check (game_type in ('smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'would_you_rather', 'most_likely_to', 'who_said_this', 'hot_seat')),
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
-- alter table games add column if not exists question_source text not null default 'platform' check (question_source in ('platform', 'custom'));
-- alter table games add column if not exists custom_questions jsonb;

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
  joined_at timestamptz not null default now(),
  resume_token text
);
create index if not exists idx_players_game_id on players(game_id);
create unique index if not exists idx_players_participant_claim on players(game_id, participant_id) where participant_id is not null;
create unique index if not exists idx_players_game_resume_token on players(game_id, resume_token) where resume_token is not null;

-- If upgrading an existing database, run:
-- alter table players add column if not exists resume_token text;
-- create unique index if not exists idx_players_game_resume_token on players(game_id, resume_token) where resume_token is not null;

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
  submitter_player_id uuid references players(id),
  quote_text text,
  quote_author_participant_id uuid references participants(id),
  quote_submitted_at timestamptz,
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
-- alter table rounds add column if not exists submitter_player_id uuid references players(id);
-- alter table rounds add column if not exists quote_text text;
-- alter table rounds add column if not exists quote_author_participant_id uuid references participants(id);
-- alter table rounds add column if not exists quote_submitted_at timestamptz;

-- Pre-game quote pool for Who Said This (lobby submissions before start)
create table if not exists wst_quote_pool (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  quote_text text not null,
  author_participant_id uuid not null references participants(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_wst_quote_pool_game_id on wst_quote_pool(game_id);

alter table wst_quote_pool enable row level security;
create policy "public_wst_quote_pool" on wst_quote_pool for all to anon using (true) with check (true);

-- If upgrading an existing database for Who Said This quote pool, run:
-- create table if not exists wst_quote_pool (...);  (see full definition above)
-- alter publication supabase_realtime add table wst_quote_pool;

-- Confessions (anonymous post-round messages)
create table if not exists confessions (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games(id) on delete cascade,
  round_id uuid references rounds(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_confessions_game_id on confessions(game_id);

-- App feedback (site-wide product feedback)
create table if not exists app_feedback (
  id uuid primary key default gen_random_uuid(),
  game_type text not null default 'general'
    check (game_type in (
      'general',
      'smash_marry_kill',
      'red_flag_green_flag',
      'smash_or_pass',
      'would_you_rather',
      'this_or_that',
      'most_likely_to',
      'who_said_this',
      'hot_seat',
      'custom'
    )),
  category text not null
    check (category in ('bug', 'feature', 'improvement', 'other')),
  message text not null,
  page_url text,
  created_at timestamptz not null default now()
);
create index if not exists idx_app_feedback_created_at on app_feedback(created_at desc);

-- Row Level Security (permissive — no auth required for this game)
alter table games enable row level security;
alter table participants enable row level security;
alter table players enable row level security;
alter table rounds enable row level security;
alter table votes enable row level security;
alter table confessions enable row level security;
alter table app_feedback enable row level security;

create policy "public_games"        on games        for all to anon using (true) with check (true);
create policy "public_participants" on participants  for all to anon using (true) with check (true);
create policy "public_players"      on players      for all to anon using (true) with check (true);
create policy "public_rounds"       on rounds       for all to anon using (true) with check (true);
create policy "public_votes"        on votes        for all to anon using (true) with check (true);
create policy "public_confessions"  on confessions  for all to anon using (true) with check (true);
create policy "public_app_feedback_insert" on app_feedback for insert to anon with check (true);

-- Player-submitted questions (lobby phase, WYR/MLT only)
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
create policy "public_player_questions" on player_questions for all to anon using (true) with check (true);

-- Enable Realtime
alter publication supabase_realtime add table games;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table rounds;
alter publication supabase_realtime add table votes;
alter publication supabase_realtime add table wst_quote_pool;
alter publication supabase_realtime add table player_questions;

-- ============================================================================
-- Anime Who Said This — schema additions
-- ============================================================================

-- Jikan API response cache (avoid redundant lookups)
CREATE TABLE jikan_search_cache (
  show_name text PRIMARY KEY,
  mal_id integer,
  cached_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE jikan_anime_cache (
  mal_id integer PRIMARY KEY,
  show_name text NOT NULL,
  characters jsonb NOT NULL,
  cached_at timestamptz NOT NULL DEFAULT now()
);

-- Anime quote pool (lobby phase, persists across refreshes)
CREATE TABLE anime_quote_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  quote_text text NOT NULL,
  anime_name text NOT NULL,
  correct_character text NOT NULL,
  choices jsonb NOT NULL,
  removed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE anime_quote_pool ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anime_quote_pool_public" ON anime_quote_pool FOR ALL USING (true) WITH CHECK (true);

-- New columns on existing tables
ALTER TABLE games ADD COLUMN wst_quote_source text NOT NULL DEFAULT 'player'
  CHECK (wst_quote_source IN ('player', 'anime', 'both'));

ALTER TABLE rounds ADD COLUMN anime_metadata jsonb;

ALTER TABLE votes ADD COLUMN anime_choice text;

-- ============================================================================
-- Hot Seat — schema additions
-- ============================================================================

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
create policy "public_hot_seat_submissions" on hot_seat_submissions for all to anon using (true) with check (true);

-- If upgrading:
-- alter table games add column if not exists participant_filter text not null default 'all' check (participant_filter in ('all', 'joined'));
-- alter table games drop constraint if exists games_game_type_check;
-- alter table games add constraint games_game_type_check check (game_type in ('smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'would_you_rather', 'most_likely_to', 'who_said_this', 'hot_seat'));

-- ============================================================================
-- Custom Game Modes — schema additions
-- ============================================================================

ALTER TABLE games ADD COLUMN IF NOT EXISTS custom_slots jsonb;

ALTER TABLE games ADD COLUMN IF NOT EXISTS gender_based boolean NOT NULL DEFAULT true;

-- If upgrading:
-- alter table games add column if not exists gender_based boolean not null default true;
-- alter table games drop constraint if exists games_game_type_check;
-- alter table games add constraint games_game_type_check check (game_type in ('smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'would_you_rather', 'most_likely_to', 'who_said_this', 'hot_seat', 'custom'));

-- ============================================================================
-- Game Rooms — schema additions
-- ============================================================================

-- Persistent friend group rooms
create table if not exists rooms (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

-- Room members with persistent identity (no auth — member_code is their key)
create table if not exists room_members (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references rooms(id) on delete cascade,
  member_code text not null unique,
  display_name text not null,
  joined_at timestamptz not null default now(),
  times_kissed integer not null default 0,
  times_married integer not null default 0,
  times_killed integer not null default 0,
  games_played integer not null default 0,
  room_points integer not null default 0
);
create index if not exists idx_room_members_room_id on room_members(room_id);
create unique index if not exists idx_room_members_code on room_members(member_code);

-- Links a game session to a room (for history + stat tracking)
create table if not exists room_games (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references rooms(id) on delete cascade,
  game_id text not null references games(id) on delete cascade,
  started_by_member_id uuid references room_members(id) on delete set null,
  created_at timestamptz not null default now(),
  points_awarded_at timestamptz
);
create index if not exists idx_room_games_room_id on room_games(room_id);
create unique index if not exists idx_room_games_game_id on room_games(game_id);

-- Room chat messages (last 50 shown; older rows can be pruned)
create table if not exists room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references rooms(id) on delete cascade,
  member_id uuid references room_members(id) on delete set null,
  display_name text not null,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_room_messages_room_id_created on room_messages(room_id, created_at desc);

-- Row Level Security
alter table rooms enable row level security;
alter table room_members enable row level security;
alter table room_games enable row level security;
alter table room_messages enable row level security;

create policy "public_rooms"         on rooms         for all to anon using (true) with check (true);
create policy "public_room_members"  on room_members  for all to anon using (true) with check (true);
create policy "public_room_games"    on room_games    for all to anon using (true) with check (true);
create policy "public_room_messages" on room_messages for all to anon using (true) with check (true);

-- Enable Realtime
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table room_members;
alter publication supabase_realtime add table room_games;
alter publication supabase_realtime add table room_messages;

-- If upgrading an existing database, run the following:
-- create table if not exists rooms ( id text primary key, name text not null, created_at timestamptz not null default now() );
-- create table if not exists room_members ( id uuid primary key default gen_random_uuid(), room_id text not null references rooms(id) on delete cascade, member_code text not null unique, display_name text not null, joined_at timestamptz not null default now(), times_kissed integer not null default 0, times_married integer not null default 0, times_killed integer not null default 0, games_played integer not null default 0, room_points integer not null default 0 );
-- alter table room_members add column if not exists room_points integer not null default 0;
-- alter table room_games add column if not exists points_awarded_at timestamptz;
-- alter table players add column if not exists room_member_id uuid references room_members(id) on delete set null;
-- create index if not exists idx_room_members_room_id on room_members(room_id);
-- create unique index if not exists idx_room_members_code on room_members(member_code);
-- create table if not exists room_games ( id uuid primary key default gen_random_uuid(), room_id text not null references rooms(id) on delete cascade, game_id text not null references games(id) on delete cascade, started_by_member_id uuid references room_members(id) on delete set null, created_at timestamptz not null default now() );
-- create index if not exists idx_room_games_room_id on room_games(room_id);
-- create unique index if not exists idx_room_games_game_id on room_games(game_id);
-- create table if not exists room_messages ( id uuid primary key default gen_random_uuid(), room_id text not null references rooms(id) on delete cascade, member_id uuid references room_members(id) on delete set null, display_name text not null, text text not null, created_at timestamptz not null default now() );
-- create index if not exists idx_room_messages_room_id_created on room_messages(room_id, created_at desc);
-- alter table rooms enable row level security;
-- alter table room_members enable row level security;
-- alter table room_games enable row level security;
-- alter table room_messages enable row level security;
-- create policy "public_rooms" on rooms for all to anon using (true) with check (true);
-- create policy "public_room_members" on room_members for all to anon using (true) with check (true);
-- create policy "public_room_games" on room_games for all to anon using (true) with check (true);
-- create policy "public_room_messages" on room_messages for all to anon using (true) with check (true);
-- alter publication supabase_realtime add table rooms;
-- alter publication supabase_realtime add table room_members;
-- alter publication supabase_realtime add table room_games;
-- alter publication supabase_realtime add table room_messages;
