-- UNO High Stakes (No Mercy) — widen the uno_sessions CHECK constraints so the new card
-- kinds and the roulette phase are accepted.
--
-- The engine writes 'draw6' / 'draw10' / 'wild_reverse_draw4' / 'wild_color_roulette' to
-- pending_wild, 'draw6' / 'draw10' / 'wild_reverse_draw4' to draw_penalty_kind, and
-- 'color_roulette' to phase. The original migrations only allowed the classic values, so
-- every attempt to play a HS wild fails silently with a check-constraint violation and
-- the play button appears dead on the client. This is why +6 / +10 / +4 Reverse / Colour
-- Roulette "did nothing when tapped" even in a fresh HS game.
--
-- Drop-and-recreate CHECKs (Postgres doesn't do IF NOT EXISTS on named constraints, and
-- the widened predicate is strictly a superset of the original — existing rows stay valid).

ALTER TABLE uno_sessions DROP CONSTRAINT IF EXISTS uno_sessions_pending_wild_check;
ALTER TABLE uno_sessions
  ADD CONSTRAINT uno_sessions_pending_wild_check
  CHECK (
    pending_wild IS NULL
    OR pending_wild IN (
      'wild',
      'wild_draw4',
      'draw6',
      'draw10',
      'wild_reverse_draw4',
      'wild_color_roulette'
    )
  );

ALTER TABLE uno_sessions DROP CONSTRAINT IF EXISTS uno_sessions_draw_penalty_kind_check;
ALTER TABLE uno_sessions
  ADD CONSTRAINT uno_sessions_draw_penalty_kind_check
  CHECK (
    draw_penalty_kind IS NULL
    OR draw_penalty_kind IN ('draw2', 'wild_draw4', 'draw6', 'draw10', 'wild_reverse_draw4')
  );

ALTER TABLE uno_sessions DROP CONSTRAINT IF EXISTS uno_sessions_phase_check;
ALTER TABLE uno_sessions
  ADD CONSTRAINT uno_sessions_phase_check
  CHECK (
    phase IN (
      'playing',
      'choose_color',
      'challenge_window',
      'swap_target',
      'team_leave_decision',
      'color_roulette',
      'finished'
    )
  );

NOTIFY pgrst, 'reload schema';
