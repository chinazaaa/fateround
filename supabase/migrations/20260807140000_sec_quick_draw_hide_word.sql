-- Quick Draw (guess mode) — the secret prompt was public (same class as the Codewords key card,
-- audit H2, and the Describe It word in 20260807130000).
--
-- `quick_draw_guess_sessions.current_word` is the prompt the drawer must draw and everyone else
-- must guess. It was listed in QUICK_DRAW_GUESS_SESSION_SELECT and read from the browser with the
-- publishable anon key, so EVERY guesser's client already held the answer. The UI merely
-- *rendered* it conditionally (`isDrawer && session.current_word` in QuickDrawGuessPlay.tsx and
-- the mobile QuickDrawPlayerView), which is presentation, not a control: any guesser could read
-- their own network response in devtools and win instantly, every turn.
--
-- `used_words` LEAKS THE SAME SECRET. Every write that sets `current_word` also appends that word
-- to `used_words` (buildTurn / processQuickDrawGuessGuess / processQuickDrawGuessSkip in
-- src/lib/quick-draw-guess.ts), so `used_words[cardinality(used_words)]` IS the current word.
-- Revoking `current_word` alone would move the leak, not close it — both columns go.
--
-- Only the guess-mode table is affected. `quick_draw_sessions` (Drawful "lie" mode) has no
-- `current_word`; each drawer's private prompt lives in `quick_draw_assignments.prompt`, which is
-- a separate concern and is untouched here.
--
-- Not affected, deliberately:
--   * `quick_draw_guess_words.word` is a post-hoc LOG — a row is inserted only AFTER a word is
--     guessed or skipped, i.e. once it is already revealed to everyone.
--   * `current_stroke_data` is the drawing itself. Showing it is the game.
--   * `status_message` interpolates the prompt ("…'s word was \"X\"") and stays public — but ONLY
--     because it is written on the turn -> break transition, i.e. at reveal, when the prompt is
--     no longer secret. ⚠️ If that message is ever set earlier in the turn, it becomes a third
--     path to the answer and must be revoked alongside the two columns below. The identical
--     pattern exists in Describe It (20260807130000), so treat it as systemic, not local.
--
-- Same shape as `games.host_token` (0122), `codewords_boards.key` (20260803170000) and
-- `describe_it_sessions.current_word` (20260807130000), so the same fix: revoke the public roles'
-- table-wide SELECT and re-grant every column except the two secret ones. The data stays exactly
-- where it is — the service role bypasses column grants, so src/lib/quick-draw-guess.ts (guess
-- matching, word rotation, skip, turn summaries, word-pool dedupe) and every quick-draw write
-- route keep working unchanged. No data movement, no server rewrite.
--
-- The drawer gets their prompt back through POST /api/quick-draw/my-word, which resolves the
-- caller from their secret resume token (or the host token, for a host who is seated as a player)
-- and returns the word only when that resolves to `drawer_player_id`.
--
-- `word_seq` replaces the one legitimate, non-secret use the clients had for `used_words`: a
-- per-word counter. The word rotates on a correct guess and on a skip *without* `turn_index`
-- changing, so clients need a public value that ticks once per word to (a) refetch the drawer's
-- prompt and (b) reset the canvas. `cardinality(used_words)` is exactly that counter, and the
-- count alone reveals nothing.
--
-- Realtime: anon `postgres_changes` payloads exclude columns the role cannot select, so
-- `current_word` / `used_words` stop arriving over realtime too. Safe here — the quick-draw guess
-- views use the session event as a RELOAD TRIGGER (useGameTableSync -> load()), never as state to
-- apply, and the drawer refetches the word through the route whenever `word_seq` moves.
--
-- ⚠️ FUTURE SCHEMA CHANGES: anon/authenticated now hold COLUMN-level (not table-level) SELECT on
-- `quick_draw_guess_sessions`. A NEW column must also be granted (re-running the do-block below
-- does that), or client reads of it will error. Fails closed — a read error, never a word leak.
--
-- DUPLICATION (deliberate): this do-block is the fourth copy of the revoke-then-regrant-columns
-- shape (0122, 20260803170000, 20260807130000, here). Factoring it into a resident
-- `public.<helper>(table, secret_cols[])` would mean a permanently installed function that runs
-- GRANT/REVOKE through dynamic SQL, defaulting to EXECUTE for PUBLIC — a widened executable
-- surface, added by a migration whose entire purpose is narrowing surface, for zero benefit to
-- already-shipped migrations. Copying 30 lines of inert DDL is the cheaper risk. If a fifth
-- appears, the helper belongs in a standalone migration that also revokes EXECUTE from
-- public/anon/authenticated, reviewed on its own terms — not smuggled in with a redaction.

do $$
declare
  session_cols text;
  role_name text;
begin
  -- Skip rather than abort where the table hasn't been created yet (a fresh environment applying
  -- migrations out of order), matching 20260803170000's guard.
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'quick_draw_guess_sessions'
  ) then
    raise notice 'quick_draw_guess_sessions not present — skipping';
    return;
  end if;

  -- Public per-word counter (see above). Stored + generated, so it can never drift from
  -- `used_words` and no application code has to maintain it. `cardinality` is immutable, which
  -- is what a generated column requires.
  alter table public.quick_draw_guess_sessions
    add column if not exists word_seq integer
    generated always as (cardinality(used_words)) stored;

  select string_agg(quote_ident(column_name), ', ')
    into session_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'quick_draw_guess_sessions'
     and column_name not in ('current_word', 'used_words');

  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('revoke select on public.quick_draw_guess_sessions from %I', role_name);
    execute format('grant select (%s) on public.quick_draw_guess_sessions to %I', session_cols, role_name);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted). Apply as a NEW forward migration; do NOT edit this file
-- after it has shipped.
--
--   grant select on public.quick_draw_guess_sessions to anon, authenticated;
--   -- and, only if the counter is no longer wanted:
--   -- alter table public.quick_draw_guess_sessions drop column if exists word_seq;
-- ----------------------------------------------------------------------------
