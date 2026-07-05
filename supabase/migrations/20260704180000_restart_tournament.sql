-- Host restarts a finished tournament — "run it back" with the same roster.
--
-- Puts everyone back into a fresh 'waiting' lobby: scores, eliminations, lives and
-- school ladder reset to their join-time state, the round/bracket history is wiped,
-- and the tournament reopens for the host to start again. Names, seats and every
-- config value (format, game type, settings, lives config, placement points, cap)
-- are kept.
--
-- Done as one atomic RPC (mirroring join/leave) so the reset can't land half-applied
-- and so the `for update` lock serializes it against a concurrent finish/round start.
-- Only a 'finished' tournament can restart; the caller (restart route) checks the
-- host token first. SECURITY DEFINER + pinned search_path, like the sibling RPCs.
create or replace function restart_tournament(p_tournament_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_elim jsonb;
  v_lives integer;
begin
  select status, elimination_config into v_status, v_elim
    from tournaments where id = p_tournament_id for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if v_status <> 'finished' then return jsonb_build_object('error', 'not_finished'); end if;

  -- Same starting-lives derivation as join_tournament (null when lives mode is off).
  v_lives := case when v_elim ->> 'mode' = 'lives' then (v_elim ->> 'startingLives')::int else null end;

  -- Drop every round/bracket row so a fresh tournament re-stages from scratch. The
  -- child game sessions these referenced are already finished and harmless, and are
  -- left as historical records — finishing never deleted them either.
  delete from tournament_games where tournament_id = p_tournament_id;

  -- Roster back to its join-time state; names and seats stay put.
  update tournament_players set
    total_points = 0,
    games_played = 0,
    is_eliminated = false,
    eliminated_at = null,
    school_level = 0,
    lives_remaining = v_lives
  where tournament_id = p_tournament_id;

  update tournaments set status = 'waiting' where id = p_tournament_id;

  return jsonb_build_object('ok', true);
end; $$;

grant execute on function restart_tournament(text) to anon, authenticated, service_role;
