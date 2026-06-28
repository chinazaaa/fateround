-- Upgrade Tic-Tac-Toe to Ultimate (Super) Tic-Tac-Toe: a 3x3 grid of nine 3x3 boards.
-- The flat `board` now holds 81 cells. `board_winners` tracks the result of each of the
-- 9 sub-boards ('X' | 'O' | 'draw' | null). `active_board` is the sub-board the current
-- player must play in (0-8), or null when they may play anywhere.

ALTER TABLE tic_tac_toe_sessions
  ADD COLUMN IF NOT EXISTS board_winners jsonb NOT NULL
    DEFAULT '[null,null,null,null,null,null,null,null,null]',
  ADD COLUMN IF NOT EXISTS active_board integer;

ALTER TABLE tic_tac_toe_sessions
  ALTER COLUMN board SET DEFAULT
    '[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]';

-- Reset any in-flight classic (9-cell) sessions to the new 81-cell format.
UPDATE tic_tac_toe_sessions
SET board = (SELECT jsonb_agg(NULL::jsonb) FROM generate_series(1, 81)),
    board_winners = '[null,null,null,null,null,null,null,null,null]',
    active_board = NULL
WHERE jsonb_array_length(board) = 9;
