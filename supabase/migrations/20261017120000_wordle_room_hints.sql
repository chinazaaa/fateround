-- Per-word "reveal hint" purchases for multiplayer Wordle. Each hint costs 300 points off
-- that word's earned score (matching the daily challenge hint mechanic).
--
-- Storage strategy: a jsonb array of word_index integers on wordle_room_progress. Reveal
-- appends the index; the guess route reads this list when it grades a solve and applies the
-- deduction inside wordleRoomWordScore. Kept on the anon-readable progress row so the
-- player's own UI can render "hint bought" state after a refresh without a separate fetch.

ALTER TABLE wordle_room_progress
  ADD COLUMN IF NOT EXISTS hints_used jsonb NOT NULL DEFAULT '[]'::jsonb;

GRANT SELECT (hints_used) ON wordle_room_progress TO anon, authenticated;
