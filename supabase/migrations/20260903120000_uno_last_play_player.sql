-- UNO: record who played the most recent card on the discard pile. Used to attribute High
-- Stakes knockout trophies (Knockout, Double KO, Mass Extinction, Stack Kingpin) back to the
-- player who set the fatal draw penalty (and roulette-caster trophies once Colour Roulette
-- follows this column too).

ALTER TABLE uno_sessions ADD COLUMN IF NOT EXISTS last_play_player_id text;

COMMENT ON COLUMN uno_sessions.last_play_player_id IS
  'UNO: id of the player who played the current top card. Nulled when the round finishes.';

GRANT SELECT (last_play_player_id) ON public.uno_sessions TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
