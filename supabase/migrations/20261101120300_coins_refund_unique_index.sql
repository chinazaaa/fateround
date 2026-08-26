-- Idempotency guard for future refund calls (Phase 3 support tooling).
--
-- award_coins() accepts reason='refund' but nothing in the ledger schema
-- currently prevents a caller from posting the same refund twice for a
-- given purchase. This mirrors the partial unique index pattern already
-- used for launch_grant_v1, welcome_v1, and guest_migration: a repeat
-- refund for the same (profile_id, ref_id) collides on the index and
-- the caller's subtransaction rolls back cleanly instead of crediting
-- the player again.
--
-- ref_id must be set for the guard to fire. Refund callers written in
-- Phase 3 MUST pass the purchase/ledger id being reversed as ref_id;
-- a null ref_id skips the index (partial index excludes nulls) and
-- silently allows a duplicate. Enforce ref_id at the caller layer.

create unique index if not exists coin_ledger_refund_unique
  on coin_ledger (profile_id, ref_id)
  where reason = 'refund';

comment on index coin_ledger_refund_unique is
  'Idempotency guard for reason=refund. Repeat refunds for the same '
  '(profile_id, ref_id) collide here and the caller''s subtransaction '
  'rolls back. Refund callers MUST pass the reversed purchase''s id as '
  'ref_id; a null ref_id is excluded from this partial index.';
