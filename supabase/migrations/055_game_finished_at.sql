ALTER TABLE games ADD COLUMN IF NOT EXISTS finished_at timestamptz;

COMMENT ON COLUMN games.finished_at IS 'When the game session ended (status set to finished).';

UPDATE games g
SET finished_at = sub.max_ended
FROM (
  SELECT game_id, MAX(ended_at) AS max_ended
  FROM rounds
  WHERE ended_at IS NOT NULL
  GROUP BY game_id
) sub
WHERE g.id = sub.game_id
  AND g.status = 'finished'
  AND g.finished_at IS NULL;
