-- Let a player leave a tournament from the lobby before it starts.
--
-- Done as an atomic RPC (mirroring join_tournament) rather than a check-then-delete
-- from the app: it locks the tournament row `for update`, so a concurrent round
-- start — which flips tournaments.status to 'active' via an UPDATE that needs the
-- same row lock — is serialized against it. Once the tournament is no longer
-- 'waiting', the leave is rejected, so a player can never be removed after round
-- rows have been staged (which would null out tournament_games player refs and
-- leave the bracket inconsistent).
--
-- The player is authenticated by their private code with an exact match (the codes
-- are exact-verified everywhere else — short readable codes or legacy UUIDs — and
-- the client always sends the exact code it was given, so no case-fold / ilike is
-- needed here; exact match also avoids `%`/`_` being treated as wildcards).
--
-- SECURITY DEFINER so it can read the service-role-only tokens table and delete the
-- player; search_path pinned. Deleting the player row cascades to their token row,
-- and there are no game rows referencing the player while still 'waiting'.
create or replace function leave_tournament(p_tournament_id text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_player_id uuid;
begin
  select status into v_status from tournaments where id = p_tournament_id for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if v_status <> 'waiting' then
    return jsonb_build_object('error', case when v_status = 'finished' then 'ended' else 'started' end);
  end if;

  select player_id into v_player_id from tournament_player_tokens
    where tournament_id = p_tournament_id and token = p_token limit 1;
  if v_player_id is null then return jsonb_build_object('error', 'invalid_token'); end if;

  delete from tournament_players where id = v_player_id and tournament_id = p_tournament_id;

  return jsonb_build_object('ok', true);
end; $$;

grant execute on function leave_tournament(text, text) to anon, authenticated, service_role;
