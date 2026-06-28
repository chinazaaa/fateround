-- Individual (skribbl-style) mode for Text Charades, alongside the existing team mode.
-- In individual mode there are no teams: players take turns describing one word while
-- everyone else races to guess it. Guessers score by speed; the describer scores per
-- correct guesser. A per-player leaderboard replaces the team scoreboard.

-- Host-chosen mode for the game.
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS describe_it_mode text NOT NULL DEFAULT 'team'
  CHECK (describe_it_mode IN ('team', 'individual'));

-- Snapshot the mode + the locked describer rotation onto the session at game start.
-- `roster` is the ordered list of player ids that take turns describing (individual mode).
ALTER TABLE describe_it_sessions
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'team'
  CHECK (mode IN ('team', 'individual'));
ALTER TABLE describe_it_sessions
  ADD COLUMN IF NOT EXISTS roster uuid[] NOT NULL DEFAULT '{}';

-- Per-player running score (individual mode) and per-guess points (for UI feedback).
ALTER TABLE describe_it_players
  ADD COLUMN IF NOT EXISTS score integer NOT NULL DEFAULT 0;
ALTER TABLE describe_it_guesses
  ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0;

-- One *scored* correct guess per player per turn — guards against a double-award if a
-- player double-submits. Scoped to points > 0 so it only governs individual mode:
-- team-mode correct guesses store points = 0 (a player can correctly guess several words
-- in one turn there), so they are excluded and never collide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_describe_it_guesses_scored_unique
  ON describe_it_guesses (game_id, turn_index, player_id)
  WHERE correct AND points > 0;

-- Atomic per-player score increment — avoids lost updates when many players score at once.
CREATE OR REPLACE FUNCTION describe_it_add_score(
  p_game_id text,
  p_player_id uuid,
  p_delta integer
) RETURNS void
LANGUAGE sql
AS $$
  UPDATE describe_it_players
  SET score = score + p_delta
  WHERE game_id = p_game_id AND player_id = p_player_id;
$$;
