-- Multiplayer Wordle can now source its word sequence from an admin theme (library pack)
-- picked by the host on the create page, instead of the two built-in categories.
--
-- Store the picked pool on the games row so the start route can sample from it — same
-- pattern as `wordle_room_category`. Nullable; when null the start route falls back to the
-- built-in category as before.

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS wordle_room_custom_words jsonb;

COMMENT ON COLUMN games.wordle_room_custom_words IS
  'Optional {word, hint?}[] pool sourced from a library pack; used instead of the built-in '
  'category bank when the host picked "Library" as the word source on the create page.';
