-- Mafia: split the single "Day" phase into separate Discussion and Voting phases with
-- independent timers, matching Wolvesville's actual day/vote/night structure instead of
-- one dial that doubles for day.

ALTER TABLE mafia_sessions DROP CONSTRAINT IF EXISTS mafia_sessions_phase_check;
ALTER TABLE mafia_sessions ADD CONSTRAINT mafia_sessions_phase_check CHECK (
  phase IN ('role_reveal', 'night', 'day_report', 'day', 'voting', 'elimination', 'game_over')
);

ALTER TABLE games
ADD COLUMN IF NOT EXISTS mafia_day_seconds integer NOT NULL DEFAULT 90,
ADD COLUMN IF NOT EXISTS mafia_voting_seconds integer NOT NULL DEFAULT 45;

GRANT SELECT (mafia_day_seconds, mafia_voting_seconds) ON public.games TO anon, authenticated;

ALTER TABLE mafia_sessions
ADD COLUMN IF NOT EXISTS day_seconds integer NOT NULL DEFAULT 90,
ADD COLUMN IF NOT EXISTS voting_seconds integer NOT NULL DEFAULT 45;
