-- ⚠️ DO NOT APPLY TO PRODUCTION until a compatible mobile build has shipped and old installs
-- have drained.
--
-- This revokes `ttl_statements.lie_index`, and the build currently on `main` selects it in
-- TTL_STATEMENT_SELECT (web and mobile). PostgREST fails the WHOLE query with 42501 when any
-- requested column is revoked, so applying this to production breaks the Two Truths roster read
-- on every installed build. Web reverts in a minute; an installed binary does not, and OTA cannot
-- rescue it (expo-updates reads config baked into the native binary at build time).
--
-- Merging into `dev` is safe: installed builds read the PRODUCTION Supabase project. The exposure
-- is at the dev → main promotion, which the Mobile Rollout Gate blocks without an explicit
-- MOBILE-ROLLOUT-ACK. Same reasoning as the sibling 20260815130000_sec_ttl_hide_guesses.sql.
--
-- Keep the Two Truths & a Lie answer out of client-readable data.
--
-- Same situation as 0103_sudoku_hide_solution.sql ("the full solution lived in
-- rounds.sudoku_metadata, which players load directly"), via two independent paths:
--
--   1. rounds.ttl_metadata was {statements, lie_index} and ttl_metadata is part of the
--      anon-readable ROUND_SELECT. Every round is created up front (one per player) by
--      buildTtlRoundRows, so the publishable anon key could read the lie for EVERY round —
--      including the round currently being guessed — before anyone guessed.
--   2. ttl_statements.lie_index was anon-readable too, which hands over every player's lie
--      directly from the submission table.
--
-- Fix: the lie moves into ttl_round_lies, which anon can neither read nor write, and the
-- server folds it back into ttl_metadata at the moment it marks the round finished — which
-- is exactly the reveal moment the UI already renders (showLie = revealed || finished).
-- ttl_statements.lie_index is revoked from the public roles; the caller's OWN lie is served
-- by POST /api/two-truths/my-statement, gated on their secret resume token.

CREATE TABLE IF NOT EXISTS ttl_round_lies (
  round_id uuid PRIMARY KEY REFERENCES rounds(id) ON DELETE CASCADE,
  lie_index integer NOT NULL CHECK (lie_index >= 0 AND lie_index <= 2)
);

ALTER TABLE ttl_round_lies ENABLE ROW LEVEL SECURITY;

-- Deliberately NO policies at all — not even an insert policy. Unlike sudoku_solutions
-- (which anon writes at round creation), every write to this table is made by the service
-- role from the start route, so anon needs no access whatsoever. With RLS on and zero
-- policies, PostgREST denies anon/authenticated outright; the service role bypasses RLS.
REVOKE ALL ON TABLE ttl_round_lies FROM anon, authenticated;
GRANT ALL ON TABLE ttl_round_lies TO service_role;

-- Backfill in-flight games so a round mid-flight can still be scored after deploy.
INSERT INTO ttl_round_lies (round_id, lie_index)
SELECT id, (ttl_metadata->>'lie_index')::int
FROM rounds
WHERE ttl_metadata ? 'lie_index'
ON CONFLICT DO NOTHING;

-- Strip the lie from the client-readable metadata for UNREVEALED rounds only. A finished
-- round has already been revealed, and its metadata.lie_index is what /history and the
-- session summary render — removing it there would blank those views retroactively.
UPDATE rounds
SET ttl_metadata = ttl_metadata - 'lie_index'
WHERE ttl_metadata ? 'lie_index'
  AND status <> 'finished';

-- ── Revoke ttl_statements.lie_index from the public roles ──
-- Column-level SELECT on every column EXCEPT lie_index, built dynamically from
-- information_schema — the same shape used for games.host_token / players.resume_token
-- (see 20260704150000_regrant_games_players_select.sql). Any future column added to
-- ttl_statements must re-run a block like this or anon reads break with 42501.
do $$
declare
  stmt_cols text;
  role_name text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into stmt_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'ttl_statements' and column_name <> 'lie_index';

  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('revoke select on public.ttl_statements from %I', role_name);
    execute format('grant select (%s) on public.ttl_statements to %I', stmt_cols, role_name);
  end loop;
end $$;

-- ── ROLLBACK (drafted, not run) ──────────────────────────────────────────────
-- Restores the pre-migration (leaky) state. Only useful if the app is rolled back to a
-- build that still reads metadata.lie_index / ttl_statements.lie_index from the browser.
--
--   -- 1. Put the lie back into every round's client-readable metadata.
--   UPDATE rounds r
--   SET ttl_metadata = coalesce(r.ttl_metadata, '{}'::jsonb)
--       || jsonb_build_object('lie_index', l.lie_index)
--   FROM ttl_round_lies l
--   WHERE l.round_id = r.id;
--
--   -- 2. Re-grant table-level SELECT on ttl_statements (restores lie_index).
--   GRANT SELECT ON public.ttl_statements TO anon, authenticated;
--
--   -- 3. Drop the hidden table.
--   DROP TABLE IF EXISTS ttl_round_lies;
