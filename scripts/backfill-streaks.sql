-- ONE-TIME streak backfill.
-- Run in the Supabase SQL editor (service role). Safe to re-run.
--
-- Recomputes current_streak, longest_streak, and last_active_date from actual
-- play history: daily_scores + finished games (via players.profile_id).
-- All timestamps → WAT (UTC+1) dates, matching advanceStreak() in streak.ts.

WITH play_dates AS (
  SELECT profile_id,
         ((created_at AT TIME ZONE 'UTC') + INTERVAL '1 hour')::date AS d
  FROM   daily_scores
  WHERE  profile_id IS NOT NULL
  UNION
  SELECT p.profile_id,
         ((g.finished_at AT TIME ZONE 'UTC') + INTERVAL '1 hour')::date AS d
  FROM   players p
  JOIN   games g ON g.id = p.game_id
  WHERE  p.profile_id IS NOT NULL
    AND  g.status = 'finished'
    AND  g.finished_at IS NOT NULL
),

-- Dedupe to one row per (profile, date)
days AS (
  SELECT DISTINCT profile_id, d FROM play_dates
),

-- Classic consecutive-group trick: d minus its row-number gives a constant
-- for each run of consecutive dates.
grouped AS (
  SELECT profile_id, d,
         d - (ROW_NUMBER() OVER (PARTITION BY profile_id ORDER BY d))::int AS grp
  FROM   days
),

-- Length of every streak
streaks AS (
  SELECT profile_id, grp,
         COUNT(*)  AS len,
         MAX(d)    AS streak_end
  FROM   grouped
  GROUP BY profile_id, grp
),

-- Per-profile: longest streak, and the streak that contains the most recent date
summary AS (
  SELECT profile_id,
         MAX(len) AS longest_streak,
         -- current streak = length of the streak whose end is the profile's last play date
         (SELECT s2.len
          FROM   streaks s2
          WHERE  s2.profile_id = streaks.profile_id
          ORDER  BY s2.streak_end DESC
          LIMIT  1) AS recent_streak_len,
         MAX(streak_end) AS last_play
  FROM   streaks
  GROUP BY profile_id
),

wat_today AS (
  SELECT (NOW() AT TIME ZONE 'UTC' + INTERVAL '1 hour')::date AS today
)

UPDATE profiles p
SET    current_streak  = CASE
         -- Active only if most recent play was today or yesterday
         WHEN (SELECT today FROM wat_today) - s.last_play <= 1
         THEN s.recent_streak_len
         ELSE 0
       END,
       longest_streak  = GREATEST(p.longest_streak, s.longest_streak),
       last_active_date = s.last_play
FROM   summary s
WHERE  p.id = s.profile_id;
