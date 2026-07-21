-- Who Said This "Players submit" mode stores full trivia-style questions (a quote + options +
-- correct index) with no roster author, so it inserts author_participant_id = NULL. The column
-- has been NOT NULL since the base schema (0001) and was never actually dropped — migration
-- 0044 only made player_id nullable, and 20260717130000 wrongly assumed the author column was
-- already nullable. That mismatch makes every player submission fail with a 23502 NOT NULL
-- violation ("Something went wrong"). Drop the constraint; the FK to participants(id) still
-- holds for non-null values (legacy name-based quotes keep setting it).
ALTER TABLE wst_quote_pool ALTER COLUMN author_participant_id DROP NOT NULL;
