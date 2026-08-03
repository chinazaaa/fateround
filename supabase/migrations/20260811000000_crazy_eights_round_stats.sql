-- Crazy Eights per-game trophy accumulator.
--
-- WHY A COLUMN AND NOT A DERIVATION. Crazy Eights is a POSITION game: the session and each
-- player's hand hold only the CURRENT state, never the history. A finished hand is empty and a
-- finished session keeps no move list, so "played three 8s", "drew ten cards", "changed the suit
-- three times" cannot be reconstructed after the fact the way Chess (full PGN) or Yahtzee (the
-- whole scorecard) can. This adds a per-(game,player) accumulator that the engine folds forward
-- inside the SAME atomic hand write it already does on every play/draw/choose — counting only,
-- never touching game state — so the facts builder can read it at finish.
--
-- The bag is opaque integer counters (see src/lib/crazy-eights.ts `foldPlayStats` and friends and
-- src/lib/trophies/game-facts/crazy-eights.ts). Defaulting to '{}' means existing in-flight games
-- and the initial deal need no backfill: an absent key reads as zero.
--
-- GRANTS. Unlike `games`/`players` (switched to COLUMN-level SELECT grants by migration 0122, so
-- every new column there needs an explicit column grant or reads 42501), the session/hand tables
-- keep TABLE-level grants: `crazy_eights_player_hands` was created in 20260628140000_crazy_eights.sql
-- with no per-column grant and its existing `cards` column is readable, which is only possible
-- under a table-level grant that automatically extends to new columns. So no column grant is
-- needed here. (If that table is ever migrated to column-level grants, add
-- `grant select (stats) on crazy_eights_player_hands to anon, authenticated;`.)

alter table crazy_eights_player_hands
  add column if not exists stats jsonb not null default '{}'::jsonb;

comment on column crazy_eights_player_hands.stats is
  'Crazy Eights per-game trophy accumulator (opaque integer counters, folded forward on each play/draw/choose). Read at finish by the trophy facts builder. See src/lib/trophies/game-facts/crazy-eights.ts.';

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted):
--   alter table crazy_eights_player_hands drop column if exists stats;
-- ----------------------------------------------------------------------------
