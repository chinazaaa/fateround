-- One approved Bingo claim per game.
--
-- POST /api/bingo/claim checked "has anyone already won?" and then inserted an approved claim,
-- with nothing atomic between the two. Two players completing a line on the same call and
-- claiming at the same moment both passed the check and both got an approved claim (reproduced on
-- production: two concurrent claims both returned 200). Room points follow the earliest approved
-- claim while both players were told they won, and trophy logic reads approved claims.
--
-- A partial unique index makes the second insert fail with 23505, which the route now reports as
-- "Someone already won this round".
--
-- Existing data: if a game already holds more than one approved claim (this race, or testing), keep
-- the earliest and mark the rest rejected so the index can be built. Rows are never deleted.
--
-- Additive and idempotent.

update public.bingo_claims c
set status = 'rejected'
where c.status = 'approved'
  and exists (
    select 1
    from public.bingo_claims o
    where o.game_id = c.game_id
      and o.status = 'approved'
      and (o.created_at, o.id) < (c.created_at, c.id)
  );

create unique index if not exists bingo_claims_one_approved_per_game
  on public.bingo_claims (game_id)
  where status = 'approved';
