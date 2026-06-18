ALTER TABLE games ADD COLUMN IF NOT EXISTS whot_pick3_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE games ADD COLUMN IF NOT EXISTS whot_cards_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE games ADD COLUMN IF NOT EXISTS whot_number_calls_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN games.whot_pick3_enabled IS 'Whot: include Pick 3 (5) cards and penalty stacking.';
COMMENT ON COLUMN games.whot_cards_enabled IS 'Whot: include WHOT (20) wild cards in the deck.';
COMMENT ON COLUMN games.whot_number_calls_enabled IS 'Whot: allow calling a number (not just shape) when playing WHOT.';
