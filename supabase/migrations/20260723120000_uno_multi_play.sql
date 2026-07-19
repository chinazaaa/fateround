-- UNO Multi-Play: lay several matching cards in one turn. The host picks the grouping rule,
-- so this needs a MODE (the deferred `uno_multi_play` boolean can't express 3 options):
--   'off'                  — Classic, one card per turn
--   'same_color'           — a run of one colour (e.g. red Skip + red 5 + red Reverse)
--   'same_number'          — a set of one number across colours (e.g. all your 6s)
--   'same_color_or_number' — either of the above (default when enabled)

ALTER TABLE games ADD COLUMN IF NOT EXISTS uno_multi_play_mode text NOT NULL DEFAULT 'off'
  CHECK (uno_multi_play_mode IN ('off', 'same_color', 'same_number', 'same_color_or_number'));

GRANT SELECT (uno_multi_play_mode) ON public.games TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
