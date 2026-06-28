-- Cumulative per-player chess clock (chess.com style). Each player has a total
-- time budget that only ticks down on their own turn; first to reach zero loses.
-- NULL time columns mean the game is untimed.

ALTER TABLE chess_sessions
  ADD COLUMN IF NOT EXISTS white_time_ms integer,
  ADD COLUMN IF NOT EXISTS black_time_ms integer,
  -- When the current player's clock started running (set on each move / at start).
  ADD COLUMN IF NOT EXISTS turn_started_at timestamptz;
