-- The most-requested chess look — the green board + classic two-tone ("neo")
-- pieces — becomes the default for newly-created games. Existing games keep
-- whatever the host explicitly chose; each player can still override locally.
-- Allowed ids are validated in the app layer (src/lib/chess.ts).
ALTER TABLE games ALTER COLUMN chess_board_theme SET DEFAULT 'green';
ALTER TABLE games ALTER COLUMN chess_piece_set SET DEFAULT 'neo';
