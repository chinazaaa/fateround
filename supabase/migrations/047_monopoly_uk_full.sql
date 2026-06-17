-- UK Monopoly: buildings, mortgages, auctions, trades, card decks
ALTER TABLE monopoly_boards ADD COLUMN IF NOT EXISTS property_buildings jsonb NOT NULL DEFAULT '{}';
ALTER TABLE monopoly_boards ADD COLUMN IF NOT EXISTS mortgaged_properties jsonb NOT NULL DEFAULT '{}';
ALTER TABLE monopoly_boards ADD COLUMN IF NOT EXISTS houses_in_bank integer NOT NULL DEFAULT 32;
ALTER TABLE monopoly_boards ADD COLUMN IF NOT EXISTS hotels_in_bank integer NOT NULL DEFAULT 12;
ALTER TABLE monopoly_boards ADD COLUMN IF NOT EXISTS chance_deck jsonb NOT NULL DEFAULT '[]';
ALTER TABLE monopoly_boards ADD COLUMN IF NOT EXISTS community_deck jsonb NOT NULL DEFAULT '[]';
ALTER TABLE monopoly_boards ADD COLUMN IF NOT EXISTS chance_discard jsonb NOT NULL DEFAULT '[]';
ALTER TABLE monopoly_boards ADD COLUMN IF NOT EXISTS community_discard jsonb NOT NULL DEFAULT '[]';
ALTER TABLE monopoly_boards ADD COLUMN IF NOT EXISTS auction_state jsonb;
ALTER TABLE monopoly_boards ADD COLUMN IF NOT EXISTS pending_trade jsonb;

ALTER TABLE monopoly_boards DROP CONSTRAINT IF EXISTS monopoly_boards_phase_check;
ALTER TABLE monopoly_boards ADD CONSTRAINT monopoly_boards_phase_check CHECK (
  phase IN ('roll', 'buy', 'jail', 'pay_rent', 'auction', 'finished')
);
