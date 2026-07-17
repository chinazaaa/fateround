-- Drop the stale 12-argument monopoly_settle_payment overload.
--
-- 20260716130000_monopoly_debt_queue added a p_pending_debt parameter via
-- CREATE OR REPLACE. Because that changed the signature, Postgres did NOT
-- replace the original function — it created a SECOND overload, leaving both
-- the 12-arg and 13-arg versions live.
--
-- processMonopolyPayRent calls monopoly_settle_payment WITHOUT p_pending_debt
-- (12 named args). With both overloads present, PostgREST cannot disambiguate
-- (the 13-arg version is also callable since p_pending_debt has a default),
-- so every rent payment fails with PGRST203 "Could not choose the best
-- candidate function" — surfaced to players as "Could not settle rent —
-- please try again".
--
-- Dropping the obsolete 12-arg overload leaves the single 13-arg function,
-- which the 12-arg rent call resolves to unambiguously (p_pending_debt
-- defaults to null, matching the old function's unconditional pending_debt =
-- null clear).
DROP FUNCTION IF EXISTS monopoly_settle_payment(
  text, timestamptz, uuid, uuid, integer, text, integer, integer, text, jsonb, timestamptz, boolean
);
