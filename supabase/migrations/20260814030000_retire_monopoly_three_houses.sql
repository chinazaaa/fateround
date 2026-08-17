-- Retire the old Monopoly "Full house" trophy id after the 3-houses -> 4-houses rename.
--
-- The houses-before-hotel rule went 3 -> 4, so the "Full house" trophy now means FOUR houses. Its
-- code id and counter were renamed to match:
--   monopoly.sys.three_houses -> monopoly.sys.four_houses
--   monopoly_three_houses (counter) -> monopoly_four_houses
-- The new id is seeded from the code catalog the usual way (admin "seed missing trophies"). This
-- migration only removes the STALE old row, which the seed step leaves behind because it upserts by
-- id and never deletes ids that vanished from the catalog.
--
-- The trophy is brand new and unearned (verified: 0 player_trophies referenced it at rename time),
-- so a plain delete is safe. But `player_trophies.trophy_id` and `round_unlocks.trophy_id` are both
-- ON DELETE RESTRICT, so guard against the (unexpected) case where someone earned or unlocked it
-- between shipping and this migration: retire it (is_active = false) instead of failing the deploy.

do $$
begin
  if exists (select 1 from player_trophies where trophy_id = 'monopoly.sys.three_houses')
     or exists (select 1 from round_unlocks where trophy_id = 'monopoly.sys.three_houses') then
    update trophies set is_active = false where id = 'monopoly.sys.three_houses';
  else
    delete from trophies where id = 'monopoly.sys.three_houses';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- ROLLBACK. There is nothing to restore: the row is re-created by re-seeding the
-- catalog from code, and rolling the code back to the `three_houses` id would
-- re-seed the old row on the next seed. No forward-migration rollback needed.
-- ----------------------------------------------------------------------------
