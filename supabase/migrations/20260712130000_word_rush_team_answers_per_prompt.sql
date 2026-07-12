-- Word Rush: let a player record a correct answer for every letter pair they
-- solve within a team turn, not just one.
--
-- The original unique index was built for INDIVIDUAL mode (one word per player
-- per round):
--
--   CREATE UNIQUE INDEX idx_word_rush_answers_individual_once
--     ON word_rush_answers(game_id, turn_index, player_id);
--
-- In TEAM mode every correct word during a team's turn shares the SAME
-- turn_index but advances prompt_index (each solved pair reveals the next). So
-- the 2nd+ correct word by the same player in a turn violated this unique index
-- and its INSERT failed silently — the server still reported the word correct,
-- but no answer row was written, so the team score (a count of correct rows)
-- stalled even though the player kept solving pairs.
--
-- Add prompt_index to the index. In team mode this makes each distinct pair a
-- player solves unique, so they all count. In individual mode there is exactly
-- one prompt per round (prompt_index is constant per turn_index), so the
-- uniqueness is unchanged and the one-word-per-round rule still holds.
DROP INDEX IF EXISTS idx_word_rush_answers_individual_once;

CREATE UNIQUE INDEX IF NOT EXISTS idx_word_rush_answers_individual_once
  ON word_rush_answers(game_id, turn_index, player_id, prompt_index);
