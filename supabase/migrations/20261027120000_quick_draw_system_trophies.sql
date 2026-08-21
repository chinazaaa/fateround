-- Seed the per-game SYSTEM trophies for Quick Draw (id prefix quick_draw.sys.<suffix>).
--
-- Authored in src/lib/trophies/system-trophies/quick-draw.ts and emitted at finish by the
-- facts builder in src/lib/trophies/game-facts/quick-draw.ts. Mirrored here so a fresh
-- database has these rows on migration without needing an admin to click "Seed launch
-- trophies". Idempotent: ON CONFLICT DO NOTHING skips rows an admin already seeded.
--
-- Quick Draw was the last competitive game with no trophies at all: it had neither a facts
-- builder nor a system-trophy set, so its games recorded `games_played` and nothing else.
-- Two variants share the game type (`lie` — draw a prompt, everyone writes decoy titles,
-- the room votes for the real one; `guess` — one drawer, the rest race to type the word),
-- and they write disjoint tables, so the trophies split into two tracks. A player who only
-- ever plays one variant never moves the other's counters — that is by design, and the two
-- tracks are balanced so neither is the cheap one.

INSERT INTO trophies (id, game_type, tier, title, description, criteria, points, hidden, sort_order, is_active, is_system)
VALUES
  ('quick_draw.sys.first_drawing', 'quick_draw', 'bronze', 'Pencils down',
    'Submit your first drawing.',
    '{"type":"counter","counter":"quick_draw_drawings_submitted","gte":1,"gameType":"quick_draw"}'::jsonb,
    10, false, 10, true, true),
  ('quick_draw.sys.first_fool', 'quick_draw', 'bronze', 'Gotcha',
    'Fool someone into voting for your fake title.',
    '{"type":"counter","counter":"quick_draw_fools","gte":1,"gameType":"quick_draw"}'::jsonb,
    10, false, 20, true, true),
  ('quick_draw.sys.first_read', 'quick_draw', 'bronze', 'Good eye',
    'Pick the real title for a drawing.',
    '{"type":"counter","counter":"quick_draw_correct_reads","gte":1,"gameType":"quick_draw"}'::jsonb,
    10, false, 30, true, true),
  ('quick_draw.sys.first_word_guessed', 'quick_draw', 'bronze', 'Got it',
    'Be the first to guess a word in guess mode.',
    '{"type":"counter","counter":"quick_draw_words_guessed","gte":1,"gameType":"quick_draw"}'::jsonb,
    10, false, 40, true, true),
  ('quick_draw.sys.took_the_pen', 'quick_draw', 'bronze', 'Took the pen',
    'Take a drawing turn in guess mode.',
    '{"type":"counter","counter":"quick_draw_drawer_turns","gte":1,"gameType":"quick_draw"}'::jsonb,
    10, false, 50, true, true),
  ('quick_draw.sys.full_lobby', 'quick_draw', 'bronze', 'Full table',
    'Play a game with 6 or more players.',
    '{"type":"counter","counter":"quick_draw_full_lobby_games","gte":1,"gameType":"quick_draw"}'::jsonb,
    15, false, 60, true, true),
  ('quick_draw.sys.triple_fool', 'quick_draw', 'silver', 'Master forger',
    'Fool 3 people across one game with your fake titles.',
    '{"type":"counter","counter":"quick_draw_triple_fool_games","gte":1,"gameType":"quick_draw"}'::jsonb,
    25, false, 70, true, true),
  ('quick_draw.sys.mass_fool', 'quick_draw', 'silver', 'Whole room fooled',
    'Catch 3 voters with a single fake title.',
    '{"type":"counter","counter":"quick_draw_mass_fool_games","gte":1,"gameType":"quick_draw"}'::jsonb,
    30, false, 80, true, true),
  ('quick_draw.sys.unmistakable', 'quick_draw', 'silver', 'Unmistakable',
    'Draw something so clear that every voter found the real title.',
    '{"type":"counter","counter":"quick_draw_unmistakable_games","gte":1,"gameType":"quick_draw"}'::jsonb,
    30, false, 90, true, true),
  ('quick_draw.sys.perfect_voter', 'quick_draw', 'silver', 'Never fooled',
    'Vote on 3 or more drawings in a game and get every one right.',
    '{"type":"counter","counter":"quick_draw_perfect_voter_games","gte":1,"gameType":"quick_draw"}'::jsonb,
    30, false, 100, true, true),
  ('quick_draw.sys.five_guesses', 'quick_draw', 'silver', 'On a roll',
    'Guess 5 words in one game.',
    '{"type":"counter","counter":"quick_draw_five_guess_games","gte":1,"gameType":"quick_draw"}'::jsonb,
    25, false, 110, true, true),
  ('quick_draw.sys.flawless_turn', 'quick_draw', 'silver', 'Flawless turn',
    'Draw a turn of 3 or more words and have every one of them guessed.',
    '{"type":"counter","counter":"quick_draw_flawless_turn_games","gte":1,"gameType":"quick_draw"}'::jsonb,
    35, false, 120, true, true),
  ('quick_draw.sys.trigger_happy', 'quick_draw', 'silver', 'Trigger happy',
    'Type 20 guesses in a single game.',
    '{"type":"counter","counter":"quick_draw_twenty_guess_games","gte":1,"gameType":"quick_draw"}'::jsonb,
    20, false, 130, true, true),
  ('quick_draw.sys.fifty_fools', 'quick_draw', 'gold', 'Career con artist',
    'Fool 50 people with fake titles across all your games.',
    '{"type":"counter","counter":"quick_draw_fools","gte":50,"gameType":"quick_draw"}'::jsonb,
    50, false, 140, true, true),
  ('quick_draw.sys.fifty_reads', 'quick_draw', 'gold', 'Lie detector',
    'Pick the real title 50 times across all your games.',
    '{"type":"counter","counter":"quick_draw_correct_reads","gte":50,"gameType":"quick_draw"}'::jsonb,
    50, false, 150, true, true),
  ('quick_draw.sys.hundred_words_guessed', 'quick_draw', 'gold', 'Mind reader',
    'Guess 100 words across all your games.',
    '{"type":"counter","counter":"quick_draw_words_guessed","gte":100,"gameType":"quick_draw"}'::jsonb,
    50, false, 160, true, true),
  ('quick_draw.sys.hundred_words_landed', 'quick_draw', 'gold', 'Worth a thousand words',
    'Have 100 of the words you drew guessed across all your games.',
    '{"type":"counter","counter":"quick_draw_words_landed","gte":100,"gameType":"quick_draw"}'::jsonb,
    50, false, 170, true, true)
ON CONFLICT (id) DO NOTHING;
