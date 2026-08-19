-- Expand trivia_category from (tech, general) to include the 15 daily-bank categories.
-- 'general' remains the default and draws from all categories combined.
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_trivia_category_check;
ALTER TABLE games ADD CONSTRAINT games_trivia_category_check
  CHECK (trivia_category IN (
    'tech', 'general',
    'art', 'food', 'geography', 'history', 'language', 'literature',
    'math', 'movies', 'music', 'nature', 'pop_culture', 'science',
    'sports', 'technology', 'world_culture'
  ));
