-- Seed the generic per-game trophy set for Wordle (game_type = 'wordle_room').
--
-- Every other game got these when its game type was first registered; Wordle Room shipped
-- without them, so the trophy list on a player's Wordle profile was empty. This migration
-- inserts the same eight templates the admin "Seed launch trophies" button would insert
-- (see buildCatalogForGame in src/lib/trophies/catalog.ts), plus the platinum capstone.
--
-- Idempotent: ON CONFLICT DO NOTHING skips any row an admin already inserted by hand.
--
-- Criteria shape mirrors the code: {type: "counter", counter, gte, gameType} for the
-- counting trophies and {type: "platinum", game_type} for the capstone. Wordle Room has a
-- resolvable winner (via getCompetitiveStandings in room-points.ts), so the win-based
-- trophies are included — they would only be skipped for a winnerless game.

INSERT INTO trophies (id, game_type, tier, title, description, criteria, points, hidden, sort_order, is_active, is_system)
VALUES
  ('wordle_room.first_game',   'wordle_room', 'bronze', 'First round', 'Finish your first game of Wordle.',
    '{"type":"counter","counter":"games_played","gte":1,"gameType":"wordle_room"}'::jsonb, 10,  false, 10,  true, false),
  ('wordle_room.first_win',    'wordle_room', 'bronze', 'First win',   'Win a game of Wordle.',
    '{"type":"counter","counter":"games_won","gte":1,"gameType":"wordle_room"}'::jsonb,    25,  false, 20,  true, false),
  ('wordle_room.ten_games',    'wordle_room', 'bronze', 'Regular',     'Finish 10 games of Wordle.',
    '{"type":"counter","counter":"games_played","gte":10,"gameType":"wordle_room"}'::jsonb, 30, false, 30,  true, false),
  ('wordle_room.ten_wins',     'wordle_room', 'silver', 'Winner',      'Win 10 games of Wordle.',
    '{"type":"counter","counter":"games_won","gte":10,"gameType":"wordle_room"}'::jsonb,   75,  false, 40,  true, false),
  ('wordle_room.fifty_games',  'wordle_room', 'silver', 'Devoted',     'Finish 50 games of Wordle.',
    '{"type":"counter","counter":"games_played","gte":50,"gameType":"wordle_room"}'::jsonb, 100, false, 50, true, false),
  ('wordle_room.fifty_wins',   'wordle_room', 'gold',   'Champion',    'Win 50 games of Wordle.',
    '{"type":"counter","counter":"games_won","gte":50,"gameType":"wordle_room"}'::jsonb,   200, false, 60,  true, false),
  ('wordle_room.hundred_wins', 'wordle_room', 'gold',   'Legend',      'Win 100 games of Wordle.',
    '{"type":"counter","counter":"games_won","gte":100,"gameType":"wordle_room"}'::jsonb,  400, false, 70,  true, false),
  ('wordle_room.night_owl',    'wordle_room', 'silver', 'Night owl',   'Finish 5 games of Wordle after midnight.',
    '{"type":"counter","counter":"late_night_games","gte":5,"gameType":"wordle_room"}'::jsonb, 60, true, 80, true, false),
  ('wordle_room.platinum',     'wordle_room', 'platinum', 'Master',    'Earn every other Wordle trophy.',
    '{"type":"platinum","game_type":"wordle_room"}'::jsonb,                                500, false, 999, true, false)
ON CONFLICT (id) DO NOTHING;
