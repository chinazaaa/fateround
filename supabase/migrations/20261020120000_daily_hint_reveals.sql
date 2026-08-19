-- Server-side record of "I paid for a hint" for daily-challenge games that support it
-- (Wordle today). Without a persisted flag, a modified client could reveal the hint locally
-- and then submit `hintUsed: false` to avoid the score penalty. The submit route joins this
-- table and OR's the persisted flag over the client field, so paying can't be un-paid.

CREATE TABLE IF NOT EXISTS daily_hint_reveals (
  challenge_id uuid NOT NULL REFERENCES daily_challenges(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  revealed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, profile_id)
);

ALTER TABLE daily_hint_reveals ENABLE ROW LEVEL SECURITY;
-- No policies. Writes go through the /api/daily-challenges/[gameType]/reveal-hint route
-- (service role); reads go through the submit route (service role). Anon has no access.
