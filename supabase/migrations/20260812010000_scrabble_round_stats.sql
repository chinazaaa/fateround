-- Scrabble per-game trophy accumulator.
--
-- WHY A COLUMN AND NOT A DERIVATION. Scrabble is a POSITION game: `scrabble_sessions.last_move`
-- is overwritten every turn and the final board carries no per-play attribution, so "played a
-- bingo", "covered a triple-word square", "played a Q with no U", "formed three words in one
-- turn" cannot be reconstructed after the fact the way Chess (full PGN) or Yahtzee (the whole
-- scorecard) can. This adds a per-(game,player) accumulator that the engine folds forward inside
-- the SAME atomic player-state write it already does on each play/exchange/pass — counting only,
-- never touching board, rack, score, dictionary validation, or turn logic — so the trophy facts
-- builder can read it at finish. (The pure score-total and empty-rack trophies stay derivable
-- from the final `score`/`rack` and use no key here.)
--
-- The bag is opaque integer counters (see src/lib/scrabble.ts `foldScrabblePlayStats` /
-- `foldScrabbleScorelessStats` and src/lib/trophies/game-facts/scrabble.ts). Defaulting to '{}'
-- means existing in-flight games and the initial deal need no backfill: an absent key reads zero.
--
-- GRANTS. `scrabble_player_state` (created in 0096_scrabble.sql, locked down in
-- 0113_rls_lockdown_scrabble.sql) is governed by RLS with a `for select using (true)` policy and
-- TABLE-level grants — its existing `rack`/`score` columns are readable with no per-column grant,
-- which is only possible under a table-level grant that automatically extends to new columns. So
-- no column grant is needed here. (Unlike `games`/`players`, switched to COLUMN-level grants by
-- migration 0122, where every new column needs an explicit grant or reads 42501.) If this table
-- is ever migrated to column-level grants, add
-- `grant select (stats) on scrabble_player_state to anon, authenticated;`.

alter table scrabble_player_state
  add column if not exists stats jsonb not null default '{}'::jsonb;

comment on column scrabble_player_state.stats is
  'Scrabble per-game trophy accumulator (opaque integer counters, folded forward on each play/exchange/pass). Read at finish by the trophy facts builder. See src/lib/trophies/game-facts/scrabble.ts.';

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted):
--   alter table scrabble_player_state drop column if exists stats;
-- ----------------------------------------------------------------------------
