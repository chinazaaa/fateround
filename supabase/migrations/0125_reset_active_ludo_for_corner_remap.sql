-- Ludo corner remap (green TL / red TR / blue BR / yellow BL) changes START_POS
-- for every colour. Each piece's absolute track index in ludo_player_state.pieces
-- is interpreted RELATIVE to its colour's START_POS, so any in-progress game would
-- render with pieces misplaced and mis-scored under the new layout (a red piece's
-- saved position would now read as a different distance-from-home, etc.).
--
-- This migration MUST ship with the START_POS change. It resets only LIVE Ludo
-- games back to the waiting lobby so they restart cleanly under the new layout:
--   * waiting games  — no session/pieces yet, nothing to do.
--   * active games   — drop session + per-player piece state, return to lobby.
--   * finished games — left untouched; the recorded outcome (winner_player_id)
--                      stands. Only a historical board snapshot would differ,
--                      which is cosmetic and not re-played.

-- Drop live per-player piece state for active Ludo games.
delete from ludo_player_state
where game_id in (
  select id from games where game_type = 'ludo' and status = 'active'
);

-- Drop the live session rows for those games.
delete from ludo_sessions
where game_id in (
  select id from games where game_type = 'ludo' and status = 'active'
);

-- Send the games back to the waiting lobby so the host can start a fresh round.
update games
set status = 'waiting',
    session_started_at = null,
    current_round_number = 0
where game_type = 'ludo' and status = 'active';
