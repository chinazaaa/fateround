-- UNO stacking (host toggle `uno_stacking`, column already exists):
-- Draw Two can be stacked on Draw Two, Draw Four on Draw Four — the penalty accumulates
-- and passes on. `draw_penalty_kind` records which card the pending penalty accepts as a
-- stack ('draw2' | 'wild_draw4'); NULL means the penalty can't be stacked (must be drawn).

ALTER TABLE uno_sessions ADD COLUMN IF NOT EXISTS draw_penalty_kind text
  CHECK (draw_penalty_kind IS NULL OR draw_penalty_kind IN ('draw2', 'wild_draw4'));

NOTIFY pgrst, 'reload schema';
