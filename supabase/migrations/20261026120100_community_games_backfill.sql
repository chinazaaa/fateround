-- Community leaderboard: seed the boards for the 18 games that ship the "post your win"
-- button but never got a `community_games` row.
--
-- `PostWinToCommunity` is rendered by 33 game folders, but only 15 game types had a board
-- created by a migration (3 from the base starter list in 20260630120000, 12 added by their
-- own migrations). For the rest, `postWinFromGame` returned `not_on_leaderboard` and the
-- winner's post silently went nowhere — the button was live with nothing behind it.
-- `docs/new-game-checklist.md` §7 lists this INSERT as a required step for a new game; it
-- was skipped for every game predating the checklist.
--
-- Boards are also creatable by hand at /admin/community, so an environment may already have
-- some of these. ON CONFLICT (slug) keeps this idempotent and, like the other per-game
-- migrations, refreshes game_type/accent without clobbering an admin's renamed `name` or
-- reordered `sort_order`.
--
-- `name` / `accent` mirror `GAME_TYPE_CONFIG` and `slug` mirrors `GAME_TYPE_TO_SLUG`
-- (src/lib/game-types.ts, src/lib/game-landing.ts) so a board matches its landing page.
-- sort_order continues the existing sequence (highest in use before this: 62, Troll Run).

INSERT INTO community_games (name, slug, accent, sort_order, game_type, is_active) VALUES
  ('Estate Kings',            'estate-kings',           '#16a34a', 63, 'monopoly',               true),
  ('Chess',                   'chess',                  '#6366f1', 64, 'chess',                  true),
  ('Ludo',                    'ludo',                   '#dc2626', 65, 'ludo',                   true),
  ('Five Dice',               'yahtzee',                '#f59e0b', 66, 'yahtzee',                true),
  ('Checkers: American',      'checkers',               '#dc2626', 67, 'checkers',               true),
  ('Checkers: International', 'checkers-international', '#dc2626', 68, 'checkers_international', true),
  ('Checkers: Nigeria',       'checkers-nigeria',       '#16a34a', 69, 'checkers_nigeria',       true),
  ('Snake & Ladder',          'snakes-and-ladders',     '#16a34a', 70, 'snake_and_ladder',       true),
  ('Tic-Tac-Toe',             'tic-tac-toe',            '#0ea5e9', 71, 'tic_tac_toe',            true),
  ('Crazy Eights',            'crazy-eights',           '#7c3aed', 72, 'crazy_eights',           true),
  ('Sudoku',                  'sudoku',                 '#8b5cf6', 73, 'sudoku',                 true),
  ('Word Hunt',               'word-hunt',              '#22c55e', 74, 'word_hunt',              true),
  ('Bingo',                   'bingo',                  '#3b82f6', 75, 'bingo',                  true),
  ('Codewords',               'codewords',              '#dc2626', 76, 'codewords',              true),
  ('Two Truths & a Lie',      'two-truths-and-a-lie',   '#8b5cf6', 77, 'two_truths',             true),
  ('Text Charades',           'text-charades',          '#14b8a6', 78, 'describe_it',            true),
  ('I Call On',               'i-call-on',              '#0ea5e9', 79, 'i_call_on',              true),
  ('Matching Pairs',          'matching-pairs',         '#f59e0b', 80, 'matching_pairs',         true)
ON CONFLICT (slug) DO UPDATE
SET
  game_type = EXCLUDED.game_type,
  accent = EXCLUDED.accent,
  is_active = EXCLUDED.is_active;
