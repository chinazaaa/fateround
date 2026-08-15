-- Lock down `tournaments.custom_wst_pack` to service role only, matching the
-- treatment `custom_trivia_pack` gets in 20260921. The default state after
-- 20260803120000_lockdown_tournaments.sql is that a new column added to
-- `tournaments` is UNREADABLE by anon/authenticated (grants are per-column
-- and the table-level SELECT was revoked), so this is defense-in-depth: an
-- explicit revoke that survives someone re-running the 20260921 grant
-- template — that template only excludes host_token + custom_trivia_pack and
-- would otherwise fold this pack into the anon-readable set.
--
-- Reason to withhold: the WST deck contains the correct answer for every
-- quote. Leaking it to any caller with the tournament code would spoil
-- every planned Who Said This game the same way a leaked trivia pack would.
revoke select (custom_wst_pack) on public.tournaments from anon;
revoke select (custom_wst_pack) on public.tournaments from authenticated;
