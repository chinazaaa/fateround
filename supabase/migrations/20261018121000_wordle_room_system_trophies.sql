-- Seed the per-game SYSTEM trophies for Wordle (id prefix wordle_room.sys.<suffix>).
--
-- Authored in src/lib/trophies/system-trophies/wordle-room.ts and emitted at finish by the
-- facts builder in src/lib/trophies/game-facts/wordle-room.ts. Mirrored here so a fresh
-- database has these rows on migration without needing an admin to click "Seed launch
-- trophies". Idempotent: ON CONFLICT DO NOTHING skips rows an admin already seeded.

INSERT INTO trophies (id, game_type, tier, title, description, criteria, points, hidden, sort_order, is_active, is_system)
VALUES
  ('wordle_room.sys.first_word', 'wordle_room', 'bronze', 'First word',
    'Solve your first Wordle word in a race.',
    '{"type":"counter","counter":"wordle_room_words_solved_total","gte":1,"gameType":"wordle_room"}'::jsonb,
    10, false, 10, true, true),
  ('wordle_room.sys.perfect_solve', 'wordle_room', 'bronze', 'Perfect solve',
    'Solve a word on the very first guess.',
    '{"type":"counter","counter":"wordle_room_first_guess_solves","gte":1,"gameType":"wordle_room"}'::jsonb,
    15, false, 20, true, true),
  ('wordle_room.sys.full_race', 'wordle_room', 'bronze', 'Full race',
    'Finish an entire Wordle race (every word).',
    '{"type":"counter","counter":"wordle_room_finished_games","gte":1,"gameType":"wordle_room"}'::jsonb,
    15, false, 30, true, true),
  ('wordle_room.sys.naija_slang', 'wordle_room', 'bronze', 'Naija Slang',
    'Play a Wordle race on the Naija Slang category.',
    '{"type":"counter","counter":"wordle_room_naija_games","gte":1,"gameType":"wordle_room"}'::jsonb,
    10, false, 40, true, true),
  ('wordle_room.sys.wordsmith', 'wordle_room', 'silver', 'Wordsmith',
    'Solve 100 Wordle words across your games.',
    '{"type":"counter","counter":"wordle_room_words_solved_total","gte":100,"gameType":"wordle_room"}'::jsonb,
    40, false, 50, true, true),
  ('wordle_room.sys.clean_race', 'wordle_room', 'silver', 'Clean race',
    'Finish a full Wordle race without buying any hints.',
    '{"type":"counter","counter":"wordle_room_no_hint_finished_games","gte":1,"gameType":"wordle_room"}'::jsonb,
    30, false, 60, true, true),
  ('wordle_room.sys.big_race', 'wordle_room', 'silver', 'Big race',
    'Finish a Wordle race in a room of 10+ players.',
    '{"type":"counter","counter":"wordle_room_big_room_wins","gte":1,"gameType":"wordle_room"}'::jsonb,
    35, false, 70, true, true),
  ('wordle_room.sys.perfectionist', 'wordle_room', 'silver', 'Perfectionist',
    'Solve 5 Wordle words on the first guess across your games.',
    '{"type":"counter","counter":"wordle_room_first_guess_solves","gte":5,"gameType":"wordle_room"}'::jsonb,
    40, false, 80, true, true),
  ('wordle_room.sys.marathon', 'wordle_room', 'gold', 'Marathon',
    'Finish a 20-word Wordle race with zero hints used.',
    '{"type":"counter","counter":"wordle_room_marathon_wins","gte":1,"gameType":"wordle_room"}'::jsonb,
    75, false, 100, true, true)
ON CONFLICT (id) DO NOTHING;
