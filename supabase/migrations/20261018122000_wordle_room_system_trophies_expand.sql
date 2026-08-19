-- Expand the multiplayer Wordle system trophy set from 9 to 27, bringing it in line with the
-- richer per-game catalogs (Word Grouping etc). New counters are backed by the extended facts
-- builder in src/lib/trophies/game-facts/wordle-room.ts, all registered in counters.ts.
--
-- Idempotent — ON CONFLICT DO NOTHING skips rows already seeded by 20261018121000 or by an
-- admin.

INSERT INTO trophies (id, game_type, tier, title, description, criteria, points, hidden, sort_order, is_active, is_system)
VALUES
  -- Bronze additions
  ('wordle_room.sys.sniper', 'wordle_room', 'bronze', 'Sniper',
    'Solve a word on the second guess.',
    '{"type":"counter","counter":"wordle_room_two_guess_solves","gte":1,"gameType":"wordle_room"}'::jsonb,
    10, false, 30, true, true),
  ('wordle_room.sys.last_gasp', 'wordle_room', 'bronze', 'Last gasp',
    'Solve a word on your final allowed attempt.',
    '{"type":"counter","counter":"wordle_room_last_gasp_solves","gte":1,"gameType":"wordle_room"}'::jsonb,
    15, false, 40, true, true),
  ('wordle_room.sys.five_solved', 'wordle_room', 'bronze', 'Five solved',
    'Solve 5 words in a single race.',
    '{"type":"counter","counter":"wordle_room_five_solved_games","gte":1,"gameType":"wordle_room"}'::jsonb,
    10, false, 70, true, true),
  ('wordle_room.sys.stayer', 'wordle_room', 'bronze', 'Stayer',
    'Finish a 10-word Wordle race.',
    '{"type":"counter","counter":"wordle_room_ten_word_finishes","gte":1,"gameType":"wordle_room"}'::jsonb,
    15, false, 80, true, true),
  ('wordle_room.sys.kept_going', 'wordle_room', 'bronze', 'Kept going',
    'Finish a race with at least one solve in the back half.',
    '{"type":"counter","counter":"wordle_room_second_half_finishes","gte":1,"gameType":"wordle_room"}'::jsonb,
    10, false, 90, true, true),

  -- Silver additions
  ('wordle_room.sys.ten_solved', 'wordle_room', 'silver', 'Ten solved',
    'Solve 10 words in a single race.',
    '{"type":"counter","counter":"wordle_room_ten_solved_games","gte":1,"gameType":"wordle_room"}'::jsonb,
    25, false, 120, true, true),
  ('wordle_room.sys.race_winner', 'wordle_room', 'silver', 'Race winner',
    'Top the standings on a Wordle race.',
    '{"type":"counter","counter":"wordle_room_race_wins","gte":1,"gameType":"wordle_room"}'::jsonb,
    30, false, 160, true, true),
  ('wordle_room.sys.endurance', 'wordle_room', 'silver', 'Endurance',
    'Finish a 15-word Wordle race.',
    '{"type":"counter","counter":"wordle_room_fifteen_word_finishes","gte":1,"gameType":"wordle_room"}'::jsonb,
    30, false, 170, true, true),
  ('wordle_room.sys.fifteen_solved', 'wordle_room', 'silver', 'Fifteen solved',
    'Solve 15 words in a single race.',
    '{"type":"counter","counter":"wordle_room_fifteen_solved_games","gte":1,"gameType":"wordle_room"}'::jsonb,
    35, false, 180, true, true),
  ('wordle_room.sys.clean_veteran', 'wordle_room', 'silver', 'Clean veteran',
    'Finish 5 Wordle races without any hints.',
    '{"type":"counter","counter":"wordle_room_no_hint_finished_games","gte":5,"gameType":"wordle_room"}'::jsonb,
    45, false, 190, true, true),
  ('wordle_room.sys.volume', 'wordle_room', 'silver', 'Volume',
    'Solve 250 Wordle words across your games.',
    '{"type":"counter","counter":"wordle_room_words_solved_total","gte":250,"gameType":"wordle_room"}'::jsonb,
    60, false, 200, true, true),

  -- Gold additions
  ('wordle_room.sys.twenty_solved', 'wordle_room', 'gold', 'Twenty solved',
    'Solve every word in a 20-word race.',
    '{"type":"counter","counter":"wordle_room_twenty_solved_games","gte":1,"gameType":"wordle_room"}'::jsonb,
    60, false, 230, true, true),
  ('wordle_room.sys.clean_big_race', 'wordle_room', 'gold', 'Clean big race',
    'Finish a big room (10+ players) without buying a single hint.',
    '{"type":"counter","counter":"wordle_room_clean_big_wins","gte":1,"gameType":"wordle_room"}'::jsonb,
    60, false, 240, true, true),
  ('wordle_room.sys.sniper_master', 'wordle_room', 'gold', 'Sniper master',
    'Solve 25 words on the first guess across your games.',
    '{"type":"counter","counter":"wordle_room_first_guess_solves","gte":25,"gameType":"wordle_room"}'::jsonb,
    80, false, 250, true, true),
  ('wordle_room.sys.race_veteran', 'wordle_room', 'gold', 'Race veteran',
    'Win 10 Wordle races.',
    '{"type":"counter","counter":"wordle_room_race_wins","gte":10,"gameType":"wordle_room"}'::jsonb,
    100, false, 260, true, true),
  ('wordle_room.sys.wordle_master', 'wordle_room', 'gold', 'Wordle master',
    'Solve 500 Wordle words across your games.',
    '{"type":"counter","counter":"wordle_room_words_solved_total","gte":500,"gameType":"wordle_room"}'::jsonb,
    150, false, 270, true, true),
  ('wordle_room.sys.perfect_race', 'wordle_room', 'gold', 'Perfect race',
    'Finish a race with no hints AND every word solved on the first guess.',
    '{"type":"counter","counter":"wordle_room_perfect_race_wins","gte":1,"gameType":"wordle_room"}'::jsonb,
    200, false, 280, true, true)
ON CONFLICT (id) DO NOTHING;
