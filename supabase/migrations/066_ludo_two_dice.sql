-- Ludo uses two dice (stored as jsonb like Monopoly).

ALTER TABLE ludo_sessions DROP CONSTRAINT IF EXISTS ludo_sessions_last_dice_check;

ALTER TABLE ludo_sessions
  ALTER COLUMN last_dice TYPE jsonb
  USING (
    CASE
      WHEN last_dice IS NULL THEN NULL
      ELSE jsonb_build_object(
        'd1', last_dice,
        'd2', 1,
        'total', last_dice,
        'doubles', false
      )
    END
  );
