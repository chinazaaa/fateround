-- UNO Multi-Play visibility: remember the exact cards laid in the most recent play, in play
-- order. When a set covers action cards (e.g. a Draw Two played under a Skip), only the last
-- card shows on the discard pile — so the room can't see the buried cards. The client renders
-- these as a small "played together" fan behind the top card. NULL / a single card = nothing
-- extra to show. uno_sessions has table-level SELECT for anon/authenticated, so no per-column
-- grant is needed (mirrors draw_penalty_kind).

ALTER TABLE uno_sessions ADD COLUMN IF NOT EXISTS last_play_cards jsonb;

NOTIFY pgrst, 'reload schema';
