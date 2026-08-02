-- Remove the cross-game trophies entirely.
--
-- Trophies are strictly per game: the profile lists the games you have PLAYED and opens each
-- one's trophies. There is no screen a game-less trophy can appear on. The seed no longer builds
-- any and the admin form no longer lets you create one, but 13 rows predate that decision and
-- the seed is idempotent — it only inserts missing ids, so it never removed them.
--
-- WHY DELETE RATHER THAN RETIRE. Retiring (`is_active = false`) stops NEW awards but keeps the
-- ones already granted, and `recompute_profile_points` deliberately counts a retired trophy so
-- nobody loses points they earned fairly. That is the right rule for a trophy that was real and
-- is being withdrawn. It is the wrong rule here: these trophies were never visible to a player,
-- so the points they contribute cannot be explained by anything on screen. A player would see
-- their level sitting above the trophies they can actually see, with no way to account for the
-- difference. Removing them makes the visible trophies and the points agree.
--
-- Titles also collided. Both the cross-game and per-game sets are built from the same templates,
-- so a Trivia player held "First round" twice — once as `first_game`, once as `trivia.first_game`.
--
-- ORDER MATTERS. `player_trophies.trophy_id` is ON DELETE RESTRICT, so the award rows must go
-- first or the trophy delete is refused. The affected profiles are captured BEFORE the delete,
-- because afterwards there is nothing left to join to and no way to tell whose totals moved.

do $$
declare
  affected uuid[];
begin
  select array_agg(distinct pt.profile_id)
    into affected
    from player_trophies pt
    join trophies t on t.id = pt.trophy_id
   where t.game_type is null;

  delete from player_trophies
   where trophy_id in (select id from trophies where game_type is null);

  delete from trophies
   where game_type is null;

  -- Points are DERIVED from what a profile holds, so they must be recomputed or every affected
  -- player keeps a cached total that includes trophies that no longer exist. Only the profiles
  -- that actually held one are touched.
  if affected is not null then
    perform recompute_profile_points(a.profile_id) from unnest(affected) as a(profile_id);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- ROLLBACK: NOT AVAILABLE. Apply any change as a NEW forward migration; do NOT
-- edit this file after it has shipped.
--
-- This deletes rows, so it cannot be undone by a reverse statement — the trophy
-- definitions could be re-seeded from an old build, but who had earned them and
-- when is gone. That is accepted deliberately: these awards were never visible
-- to the players holding them. If that trade is ever in doubt, take a backup of
-- `player_trophies` before deploying rather than trying to reverse it after.
-- ----------------------------------------------------------------------------
