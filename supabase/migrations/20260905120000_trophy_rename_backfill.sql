-- Backfill trophy titles and descriptions to match the trademark-safe product names.
-- The trophies table is insert-only (see /api/admin/trophies PUT), so the code catalog rename
-- (UNO → Match Up, Monopoly → Estate Kings, Scrabble → Word Tiles, Yahtzee → Five Dice,
-- Quiplash → Punchline) doesn't reach rows already seeded. This migration rewrites the affected
-- description templates in place, one game at a time. Trophy IDs and criteria are untouched, so
-- every already-earned `player_trophies.trophy_id` row keeps working.

-- UNO → Match Up: the generic template descriptions plus the "call UNO" language + Wild Draw
-- Four / Draw Two card names we already renamed in code.
UPDATE public.trophies SET
  description = replace(description, ' UNO', ' Match Up')
WHERE game_type = 'uno' AND description LIKE '% UNO%';
UPDATE public.trophies SET
  description = replace(description, 'UNO ', 'Match Up ')
WHERE game_type = 'uno' AND description LIKE 'UNO %';
UPDATE public.trophies SET description = replace(description, 'call UNO', 'call the last card')
  WHERE game_type = 'uno' AND description LIKE '%call UNO%';
UPDATE public.trophies SET description = replace(description, 'Wild Draw Four', 'Draw 4')
  WHERE game_type = 'uno' AND description LIKE '%Wild Draw Four%';
UPDATE public.trophies SET description = replace(description, 'Draw Four', 'Draw 4')
  WHERE game_type = 'uno' AND description LIKE '%Draw Four%';
UPDATE public.trophies SET description = replace(description, 'Draw Two', 'Draw 2')
  WHERE game_type = 'uno' AND description LIKE '%Draw Two%';
UPDATE public.trophies SET title = 'Last card!'
  WHERE id = 'uno.uno_call' AND title = 'UNO!';
UPDATE public.trophies SET title = 'Draw 2'
  WHERE id = 'uno.draw_two' AND title = 'Draw Two';

-- Monopoly → Estate Kings.
UPDATE public.trophies SET description = replace(description, ' Monopoly', ' Estate Kings')
  WHERE game_type = 'monopoly' AND description LIKE '% Monopoly%';
UPDATE public.trophies SET description = replace(description, 'Monopoly ', 'Estate Kings ')
  WHERE game_type = 'monopoly' AND description LIKE 'Monopoly %';

-- Scrabble → Word Tiles.
UPDATE public.trophies SET description = replace(description, ' Scrabble', ' Word Tiles')
  WHERE game_type = 'scrabble' AND description LIKE '% Scrabble%';
UPDATE public.trophies SET description = replace(description, 'Scrabble ', 'Word Tiles ')
  WHERE game_type = 'scrabble' AND description LIKE 'Scrabble %';

-- Yahtzee → Five Dice.
UPDATE public.trophies SET description = replace(description, ' Yahtzee', ' Five Dice')
  WHERE game_type = 'yahtzee' AND description LIKE '% Yahtzee%';
UPDATE public.trophies SET description = replace(description, 'Yahtzee ', 'Five Dice ')
  WHERE game_type = 'yahtzee' AND description LIKE 'Yahtzee %';

-- Quiplash → Punchline.
UPDATE public.trophies SET description = replace(description, ' Quiplash', ' Punchline')
  WHERE game_type = 'quiplash' AND description LIKE '% Quiplash%';
UPDATE public.trophies SET description = replace(description, 'Quiplash ', 'Punchline ')
  WHERE game_type = 'quiplash' AND description LIKE 'Quiplash %';
