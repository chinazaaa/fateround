-- Who Said This speed scoring ("fastest correct wins"): record how quickly each answer came in
-- and the points it earned, mirroring trivia. Points reward correct answers, weighted by speed,
-- with a first-correct bonus. Both columns are null for non-WST votes.
ALTER TABLE votes ADD COLUMN IF NOT EXISTS response_ms integer;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS points integer;
