-- Track whether a player has passed GO at least once (required before buying property).
ALTER TABLE public.monopoly_player_state
  ADD COLUMN IF NOT EXISTS passed_go_once boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.monopoly_player_state.passed_go_once IS
  'True after the player has passed GO while moving forward; unlocks buying, card draws, and GO salary on subsequent laps.';
