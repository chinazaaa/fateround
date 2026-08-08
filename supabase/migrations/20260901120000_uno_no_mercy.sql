-- UNO "Show 'em No Mercy" mode. A third top-level UNO shape (alongside Classic and
-- Team-Up 2v2). When mode='no_mercy':
--   * Deck is 168 cards, including new action + wild cards (Discard All, Skip Everyone,
--     Wild Reverse Draw Four, Wild Draw Six, Wild Draw Ten, Wild Color Roulette).
--   * Draw stacking is always on and cross-kind (equal or higher +N chains).
--   * 0-pass / 7-swap are always on (not toggleable).
--   * There is no Wild Draw Four challenge.
--   * Mercy rule: any player who reaches 25+ cards is knocked out. Last player
--     standing wins (parallel to emptying your hand first).

ALTER TABLE games ADD COLUMN IF NOT EXISTS uno_mode text NOT NULL DEFAULT 'classic';

ALTER TABLE games
  ADD CONSTRAINT games_uno_mode_check
  CHECK (uno_mode IN ('classic', 'no_mercy'));

COMMENT ON COLUMN games.uno_mode IS
  'UNO shape: classic (default; the uno_team_mode toggle picks Team-Up 2v2 on top) or no_mercy.';

GRANT SELECT (uno_mode) ON public.games TO anon, authenticated;

-- Host-picked win condition when uno_mode = 'no_mercy'. In classic this column has no effect.
--   * first_out       — the round ends the instant someone empties their hand (classic win).
--   * last_standing   — the round ends when only one player has not been knocked out by Mercy.
ALTER TABLE games ADD COLUMN IF NOT EXISTS uno_no_mercy_win text NOT NULL DEFAULT 'first_out';

ALTER TABLE games
  ADD CONSTRAINT games_uno_no_mercy_win_check
  CHECK (uno_no_mercy_win IN ('first_out', 'last_standing'));

COMMENT ON COLUMN games.uno_no_mercy_win IS
  'No Mercy only: first_out (empty a hand to win) vs last_standing (survive all Mercy knockouts).';

GRANT SELECT (uno_no_mercy_win) ON public.games TO anon, authenticated;

-- Track eliminations under the Mercy rule so the round can end when only one player is
-- left. Stored on the session (not the hand) because a knocked-out player's row is
-- retained for standings/scoring but they no longer take turns.
ALTER TABLE uno_sessions
  ADD COLUMN IF NOT EXISTS eliminated_player_ids text[] NOT NULL DEFAULT ARRAY[]::text[];

COMMENT ON COLUMN uno_sessions.eliminated_player_ids IS
  'No Mercy: player ids knocked out by the 25-card Mercy rule this round.';

GRANT SELECT (eliminated_player_ids) ON public.uno_sessions TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
