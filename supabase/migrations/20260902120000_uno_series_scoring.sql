-- UNO optional series scoring (the official "keeping score" method).
--
-- When uno_series_scoring is on:
--   * At the end of every hand, the round winner is awarded points equal to the sum of card
--     values still in every opponent's hand (numbers = face, coloured action cards = 20,
--     wild cards = 50), PLUS 250 for every player knocked out during the hand by the Mercy
--     rule (No Mercy only).
--   * Running per-player totals live on games.uno_series_scores (jsonb map playerId → int).
--   * When any player reaches uno_series_target (default 1000) the series is won and the id
--     lands in games.uno_series_winner_id. New hands stop awarding points once the winner
--     is set.

ALTER TABLE games ADD COLUMN IF NOT EXISTS uno_series_scoring boolean NOT NULL DEFAULT false;
ALTER TABLE games ADD COLUMN IF NOT EXISTS uno_series_target int NOT NULL DEFAULT 1000;
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS uno_series_scores jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE games ADD COLUMN IF NOT EXISTS uno_series_winner_id text;

COMMENT ON COLUMN games.uno_series_scoring IS
  'UNO optional scoring: award points at hand end, first to uno_series_target wins the series.';
COMMENT ON COLUMN games.uno_series_target IS
  'UNO series target — points needed to win the series when scoring is on.';
COMMENT ON COLUMN games.uno_series_scores IS
  'UNO running per-player series totals (map playerId → int). Cleared on new game.';
COMMENT ON COLUMN games.uno_series_winner_id IS
  'UNO series winner id (set when someone first crosses uno_series_target).';

GRANT SELECT (uno_series_scoring, uno_series_target, uno_series_scores, uno_series_winner_id)
  ON public.games TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
