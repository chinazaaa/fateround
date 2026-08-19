-- Restructure trophies: PS5-style platinum = "earn every other trophy for this game".
-- All existing platinum-tier trophies become gold. One new platinum per game is added
-- by the app's seed/sync pass (not by this migration — trophy rows are code-owned).
--
-- Safe to re-run: the WHERE clause is additive.

UPDATE trophies
SET    tier = 'gold'
WHERE  tier = 'platinum'
  AND  is_active = true;
