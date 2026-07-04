-- Scrabble knockout: a group-elimination format that plays in rooms (like the
-- head-to-head Scrabble bracket — up to 4 per room) but is cut by a single global
-- score ranking each round rather than "only the room winner advances". Everyone
-- earns their Scrabble score; once every room in the round is finished the whole
-- field is ranked together and the bottom half is knocked out, so it doesn't
-- matter which room a player was in — only their score against the field.
--
-- The rooms reuse tournament_games' group-bracket columns (member_ids /
-- round_number); each room stores its members' final Scrabble scores in
-- `placements` (tp_id -> raw score) when it finishes, and the round-wide cut reads
-- them all to rank the field.
--
-- last_knockout_cut_round is the race guard for that cut: every room's finish runs
-- the resolver, and the resolver that sees the last room finish performs the one
-- global elimination. Two rooms finishing at once could otherwise both trigger it,
-- so the resolver CAS-bumps this to the round number and only the winner proceeds.
alter table tournaments
  add column if not exists last_knockout_cut_round integer;
