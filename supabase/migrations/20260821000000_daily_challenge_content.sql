-- Admin-managed daily challenge content.
--
-- Lets the admin pre-populate word/clue banks for specific dates so the daily
-- puzzles never run out of fresh material. The daily challenge route checks this
-- table first; if no row exists for (game_type, challenge_date) it falls back to
-- the hardcoded banks + algorithmic generation.
--
-- Crossword, word_search, word_scramble, and trivia accept admin content. Sudoku
-- and word_hunt are fully algorithmic (infinite variety from the seed alone).
-- Trivia REQUIRES admin content (no algorithmic fallback).

create table if not exists daily_challenge_content (
  id              uuid primary key default gen_random_uuid(),
  game_type       text not null,
  challenge_date  date not null,
  -- The word/clue bank for puzzle generation:
  --   crossword:     [{answer, clue}, ...]
  --   word_search:   [word, ...]
  --   word_scramble: [{word, clue}, ...]
  --   trivia:        [{question, choices: [A,B,C,D], correct_index: 0}, ...]
  content         jsonb not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint daily_content_one_per_day unique (game_type, challenge_date),
  constraint daily_content_valid_game_type check (
    game_type in ('crossword', 'word_search', 'word_scramble', 'trivia')
  )
);

alter table daily_challenge_content enable row level security;
revoke all on daily_challenge_content from anon, authenticated;
