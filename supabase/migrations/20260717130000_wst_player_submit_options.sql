-- Who Said This "Players submit" mode: players now author full trivia-style questions in the
-- lobby (a quote + up to 4 options, one correct) instead of a quote tied to a name from a
-- pre-uploaded roster. Add the options + correct-index columns to the shared quote pool. The
-- legacy author_participant_id is already nullable (0044) and goes unused in this mode.
ALTER TABLE wst_quote_pool ADD COLUMN IF NOT EXISTS options jsonb;
ALTER TABLE wst_quote_pool ADD COLUMN IF NOT EXISTS correct_index integer;
