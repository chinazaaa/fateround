-- W9 scalability: batch the per-player tournament scoring writes.
--
-- applyTournamentScoring() previously did one `increment_tournament_points` RPC
-- per placed player, plus a SELECT+UPDATE per bottom-N player for lives. On a
-- 40-player tournament game that is ~40+ sequential round-trips per finish. These
-- two RPCs collapse each loop into a single statement.

-- Add points (and +1 game played) to many players at once. `p_updates` is a JSON
-- array of {player_id, points}. games_played is incremented for every entry —
-- matching the old loop, which bumped it for every player in the points map even
-- when they earned zero.
create or replace function increment_tournament_points_batch(p_updates jsonb)
returns void
language plpgsql
as $$
begin
  update tournament_players tp
     set total_points = tp.total_points + u.points,
         games_played = tp.games_played + 1
    from jsonb_to_recordset(p_updates) as u(player_id uuid, points integer)
   where tp.id = u.player_id;
end;
$$;

grant execute on function increment_tournament_points_batch(jsonb) to anon, authenticated, service_role;

-- Decrement one life from each of the given players, eliminating any that hit
-- zero — in a single statement. Mirrors the old per-player logic exactly:
--   newLives = coalesce(lives_remaining, 1) - 1
--   newLives <= 0 -> is_eliminated = true, lives_remaining = 0
--   else          -> lives_remaining = newLives (is_eliminated untouched)
-- eliminated_at is stamped only on a fresh elimination so an existing time is kept.
create or replace function apply_tournament_life_loss(p_player_ids uuid[])
returns void
language plpgsql
as $$
begin
  update tournament_players
     set lives_remaining = greatest(coalesce(lives_remaining, 1) - 1, 0),
         is_eliminated = case when coalesce(lives_remaining, 1) - 1 <= 0 then true else is_eliminated end,
         eliminated_at = case
           when coalesce(lives_remaining, 1) - 1 <= 0 and eliminated_at is null then now()
           else eliminated_at
         end
   where id = any(p_player_ids);
end;
$$;

grant execute on function apply_tournament_life_loss(uuid[]) to anon, authenticated, service_role;
