-- Daily Challenge & Leaderboards — schema for solo daily puzzles.
--
-- See `docs/high-scores-leaderboards-plan.md`. Everyone gets the same puzzle per game per day
-- (seeded by date). One scored attempt. Leaderboard + personal bests.
--
-- Security posture mirrors trophies exactly: RLS on, no client-writable policies, all access
-- via getSupabaseAdmin() API routes. No public view (avoids C2 auto-updatable view bug).

-- ---------------------------------------------------------------------------
-- daily_challenges — one puzzle per game per day
-- ---------------------------------------------------------------------------
-- Lazy-created on first request. The UNIQUE constraint + INSERT ON CONFLICT DO NOTHING
-- handles concurrent first-requests without distributed locks.
create table if not exists daily_challenges (
  id              uuid primary key default gen_random_uuid(),
  game_type       text not null,
  challenge_date  date not null,
  seed            integer not null,
  -- Full puzzle including solution. The solution is NEVER sent to clients;
  -- API routes strip it via stripSolution() before responding.
  puzzle_data     jsonb not null,
  -- Difficulty, theme, timer config. Varies by game_type. Enables rotating
  -- themes/difficulties day-by-day without code changes.
  config          jsonb not null default '{}',
  created_at      timestamptz not null default now(),

  constraint daily_challenges_one_per_day unique (game_type, challenge_date),
  constraint daily_challenges_valid_game_type check (
    game_type in ('sudoku', 'word_hunt', 'crossword', 'word_search', 'word_scramble')
  )
);

alter table daily_challenges enable row level security;
-- No policies = service-role only. No client reads: the API route reads via service role
-- and strips the solution before responding.
revoke all on daily_challenges from anon, authenticated;

-- ---------------------------------------------------------------------------
-- daily_scores — one scored attempt per player per challenge
-- ---------------------------------------------------------------------------
-- PK (challenge_id, profile_id) enforces exactly one attempt at the database level.
create table if not exists daily_scores (
  challenge_id    uuid not null references daily_challenges(id) on delete cascade,
  profile_id      uuid not null references profiles(id) on delete cascade,
  normalized_score integer not null check (normalized_score >= 0 and normalized_score <= 1000),
  raw_points      integer not null default 0,
  items_solved    integer not null default 0,
  items_total     integer not null default 0,
  time_seconds    integer not null default 0,
  hints_used      integer not null default 0,
  submitted_at    timestamptz not null default now(),

  primary key (challenge_id, profile_id)
);

-- Leaderboard query: ORDER BY normalized_score DESC, tiebreakers.
create index if not exists idx_daily_scores_leaderboard
  on daily_scores (challenge_id, normalized_score desc, items_solved desc, time_seconds asc, hints_used asc, submitted_at asc);

-- Profile history: "my recent daily scores".
create index if not exists idx_daily_scores_profile
  on daily_scores (profile_id, submitted_at desc);

alter table daily_scores enable row level security;
revoke all on daily_scores from anon, authenticated;

-- ---------------------------------------------------------------------------
-- personal_bests — cached best score + best time per player per game
-- ---------------------------------------------------------------------------
-- Upserted on each daily score submission. Avoids scanning daily_scores for
-- profile pages and personal-best celebrations.
create table if not exists personal_bests (
  profile_id      uuid not null references profiles(id) on delete cascade,
  game_type       text not null,
  best_score      integer not null default 0,
  best_time       integer not null default 0,
  total_plays     integer not null default 0,
  best_date       date,
  updated_at      timestamptz not null default now(),

  primary key (profile_id, game_type),
  constraint personal_bests_valid_game_type check (
    game_type in ('sudoku', 'word_hunt', 'crossword', 'word_search', 'word_scramble')
  )
);

alter table personal_bests enable row level security;
revoke all on personal_bests from anon, authenticated;
