-- Atomically set a tournament's elimination config and re-sync every player's
-- lives to match, in a single transaction. Used by the host "edit settings"
-- flow so the config and player lives can never end up out of sync (a failed
-- resync would otherwise leave new rules with stale lives).
create or replace function apply_tournament_lives(p_tournament_id text, p_config jsonb)
returns void
language plpgsql
as $$
declare
  v_lives integer;
begin
  update tournaments set elimination_config = p_config where id = p_tournament_id;

  v_lives := case when p_config ->> 'mode' = 'lives' then (p_config ->> 'startingLives')::int else null end;

  update tournament_players
     set lives_remaining = v_lives, is_eliminated = false, eliminated_at = null
   where tournament_id = p_tournament_id;
end;
$$;

grant execute on function apply_tournament_lives(text, jsonb) to anon, authenticated, service_role;
