-- Let hosts remove players mid-game without a foreign-key violation.
--
-- rounds.submitter_player_id records the round's caller/submitter (in "I call on"
-- every round stores its caller here). The original FK had no ON DELETE rule, so
-- it defaulted to NO ACTION: deleting a player who had ever called a letter threw
-- a foreign-key violation. The joiners removal path swallowed that error and still
-- reported success, so the host saw the name vanish (optimistic UI) while the row
-- lingered in the DB — and it reappeared on the next reload/round.
--
-- Switch the FK to ON DELETE SET NULL. Finished rounds keep their computed scores;
-- the submitter pointer simply clears. For an in-progress "I call on" round the
-- caller falls back to caller_order (roundCallerPlayerId), and the next round's
-- rebuild drops the departed player from the rotation.

alter table rounds drop constraint if exists rounds_submitter_player_id_fkey;

alter table rounds
  add constraint rounds_submitter_player_id_fkey
  foreign key (submitter_player_id) references players (id) on delete set null;
