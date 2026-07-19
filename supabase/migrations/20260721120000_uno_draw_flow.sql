-- UNO refinements:
--  1. draw flow — after a voluntary draw the player may play the drawn card OR keep it (pass).
--     `drawn_card_id` marks that window: set to the drawn card's id while the current player
--     has drawn and may still play it; NULL otherwise.
--  2. Wild Draw Four failed-challenge penalty defaults to 6 (standard UNO: the 4 + a 2 penalty).

ALTER TABLE uno_sessions ADD COLUMN IF NOT EXISTS drawn_card_id text;

ALTER TABLE games ALTER COLUMN uno_wd4_challenge_penalty SET DEFAULT 6;

-- Bring not-yet-started rooms in line with the new default (started games keep their value).
UPDATE games SET uno_wd4_challenge_penalty = 6
WHERE game_type = 'uno' AND status = 'waiting' AND uno_wd4_challenge_penalty = 4;

NOTIFY pgrst, 'reload schema';
