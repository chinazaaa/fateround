-- Scrabble "chess clock" mode: a per-player time bank (like a chess clock) as an
-- alternative to the existing per-turn timer + whole-game duration. Each player gets
-- a fixed budget that only counts down while it's their turn; when it hits zero they
-- "flag out" (can spectate but not play) and their seat is skipped. The game ends
-- when every remaining player's clock has expired; highest final score wins.
--
-- This is a mode flag on the existing `scrabble` game type — no new game_type, so no
-- constraint changes here, only column adds.

-- Host-chosen config, stored on the game.
alter table games
  add column if not exists scrabble_clock_mode text not null default 'standard'
    check (scrabble_clock_mode in ('standard', 'chess')),
  add column if not exists scrabble_clock_seconds integer not null default 0;

-- Session snapshot so the realtime client + engine don't re-read `games` every tick.
-- turn_started_at marks when the current active player's clock began ticking.
alter table scrabble_sessions
  add column if not exists clock_mode text not null default 'standard'
    check (clock_mode in ('standard', 'chess')),
  add column if not exists turn_started_at timestamptz;

-- Per-player time bank (ms) + flagged-out marker. Null clock in standard mode.
alter table scrabble_player_state
  add column if not exists clock_ms_remaining integer,
  add column if not exists timed_out boolean not null default false;
