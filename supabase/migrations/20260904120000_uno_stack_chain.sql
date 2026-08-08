-- UNO: track the current Draw-card stack chain depth in the session. A "chain" is the running
-- count of Draw cards played onto a pending draw penalty without it resolving. Resets to 0 when
-- someone actually draws (forced) or a non-Draw card is played that clears the pending state.
-- Used by the Match Up High Stakes "Double Stack" trophy (chain of 3+ cards).

ALTER TABLE uno_sessions ADD COLUMN IF NOT EXISTS draw_stack_chain int NOT NULL DEFAULT 0;

COMMENT ON COLUMN uno_sessions.draw_stack_chain IS
  'UNO: current Draw-card stack chain depth (Match Up High Stakes Double Stack trophy).';

GRANT SELECT (draw_stack_chain) ON public.uno_sessions TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
