-- ⚠️ DO NOT APPLY TO PRODUCTION until a compatible mobile build has shipped and old installs
-- have drained.
--
-- The build currently on `main` selects `guessed_index,is_correct,points` in TTL_GUESS_SELECT
-- (apps/mobile/lib/supabase-selects.ts). PostgREST fails the WHOLE query with 42501 when any
-- requested column is revoked, so this migration breaks Two Truths on every installed build the
-- moment it reaches the production project — and OTA cannot rescue them, because expo-updates
-- reads its config from the native binary, baked at build time. That is a store-release wait or
-- a recorded breakage window, not something a hotfix can undo.
--
-- Merging into `dev` is safe: installed builds read the PRODUCTION Supabase project. The exposure
-- is at the dev → main promotion, which the Mobile Rollout Gate blocks without an explicit
-- MOBILE-ROLLOUT-ACK. Same reasoning as 20260815120000_sec_crazy8_hide_piles.sql.
--
-- Keep Two Truths GUESSES out of client-readable data until the round is revealed.
--
-- 20260807120000_sec_ttl_hide_lie.sql closed two paths to the answer (rounds.ttl_metadata
-- and ttl_statements.lie_index) but left a third wide open:
--
--   ttl_guesses is anon-readable (policy "ttl_guesses_read ... using(true)", added by
--   0115_rls_lockdown_two_truths.sql) and carries guessed_index + is_correct. A round only
--   ends once EVERY guesser has answered (two-truths-advance.ts), so in a 6-player game the
--   first player's row `{guessed_index: 1, is_correct: true}` is readable with the publishable
--   anon key — and realtime-pushed — while players 2..5 are still choosing. They read the lie
--   off that row and always score 100.
--
-- Fix, in two halves:
--
--   1. Postgres enforces the redaction. `guessed_index`, `is_correct` and `points` are revoked
--      from anon/authenticated; the rest of the row stays readable. The surviving columns
--      (id, game_id, round_id, player_id, guessed_at) are exactly the LIVE PROGRESS state —
--      who has guessed and how many — which is legitimately public and which the lock-in UI
--      and realtime subscriptions need. Nothing about WHAT anyone guessed survives.
--
--   2. The server folds the results back in at the reveal moment. `endActiveRound` already
--      writes `ttl_metadata.lie_index` in the same update that flips the round to 'finished';
--      it now writes `ttl_metadata.guesses` there too — an array of
--      {id, player_id, guessed_index, is_correct, points}. Clients read every post-reveal
--      guess (scoreboard, /history, session summary) from that array, and their OWN in-flight
--      guess from POST /api/two-truths/my-guesses, gated on their secret resume token.
--
-- Anti-vacuum: a redacted read is not a silent empty. A client that asks for a revoked column
-- gets 42501 (a hard error), and the progress row still proves "this player has guessed" —
-- so "I may not see this" never renders as "nobody has guessed".

-- ── Revoke the answer columns from the public roles ──
-- Column-level SELECT on every column EXCEPT guessed_index / is_correct / points, built
-- dynamically from information_schema — the same shape used for ttl_statements.lie_index
-- (20260807120000) and games.host_token / players.resume_token
-- (20260704150000_regrant_games_players_select.sql). Any future column added to ttl_guesses
-- must re-run a block like this or anon reads break with 42501.
do $$
declare
  guess_cols text;
  role_name text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into guess_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'ttl_guesses'
     and column_name not in ('guessed_index', 'is_correct', 'points');

  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('revoke select on public.ttl_guesses from %I', role_name);
    execute format('grant select (%s) on public.ttl_guesses to %I', guess_cols, role_name);
  end loop;
end $$;

-- The server writes every guess with the service role (/api/two-truths/guess); make sure the
-- revoke above cannot starve it.
GRANT ALL ON TABLE ttl_guesses TO service_role;

-- ── Backfill: fold results into rounds that were already revealed before this deploy ──
-- Without this, /history and the session summary for every past session would show an empty
-- leaderboard: the guesses are still in ttl_guesses, but the clients can no longer read the
-- scoring columns from there. Only 'finished' TTL rounds are touched — an in-flight round
-- must stay redacted, and `? 'statements'` keeps this off non-TTL rounds.
UPDATE rounds r
SET ttl_metadata = r.ttl_metadata || jsonb_build_object('guesses', g.results)
FROM (
  SELECT
    round_id,
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'player_id', player_id,
        'guessed_index', guessed_index,
        'is_correct', is_correct,
        'points', points
      )
      ORDER BY guessed_at
    ) AS results
  FROM ttl_guesses
  GROUP BY round_id
) g
WHERE g.round_id = r.id
  AND r.status = 'finished'
  AND r.ttl_metadata ? 'statements'
  AND NOT (r.ttl_metadata ? 'guesses');

-- ── ROLLBACK (drafted, not run) ──────────────────────────────────────────────
-- Restores the pre-migration (leaky) state. Only useful if the app is rolled back to a build
-- that reads guessed_index / is_correct / points straight off ttl_guesses in the browser.
--
--   GRANT SELECT ON public.ttl_guesses TO anon, authenticated;
--
--   UPDATE rounds
--   SET ttl_metadata = ttl_metadata - 'guesses'
--   WHERE ttl_metadata ? 'guesses';
