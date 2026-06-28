-- Grant anon/authenticated SELECT on the crazy8_* games columns.
--
-- Migration 0122 switched `games` to COLUMN-level SELECT grants for the public roles
-- (so the secret host_token stays unreadable). `ADD COLUMN` does NOT extend those
-- column grants, so the crazy8_* columns added in 20260628140000_crazy_eights.sql are
-- not readable by anon/authenticated — the host page's `games` select then errors with
-- 42501 (surfaced as a bogus "Access Denied — invalid host token"). These are non-secret
-- game config, safe to expose. Mirrors 0123 (the same fix for the ai_questions columns).
--
-- Done as a separate forward migration because 20260628140000_crazy_eights.sql has already
-- shipped — shipped migrations are immutable (see CONTRIBUTING.md).

GRANT SELECT (crazy8_action_cards, crazy8_jokers, crazy8_pick2_stacking) ON public.games TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted): revoke the read grant on these columns.
--   revoke select (crazy8_action_cards, crazy8_jokers, crazy8_pick2_stacking)
--     on public.games from anon, authenticated;
-- ----------------------------------------------------------------------------
