-- Troll Run: record a death and update the runner's total in ONE transaction, serialised with
-- both the final clear and the round-scoring pass.
--
-- POST /api/troll-run/report-death used to insert the death event, recount, write the total with a
-- "still unfinished" guard and, if the guard matched nothing (the runner had just cleared the final
-- level), delete the event again. Between the insert and the delete the round-scoring pass could
-- read the event, so a death that was later withdrawn stayed in the scored total; and the cleanup
-- delete could itself fail and leave the event behind.
--
-- This function does the whole thing under row locks so there is no window to observe:
--   * the session row is locked FOR SHARE, so the UPDATE that moves the round from racing to
--     scoreboard (the scoring claim) waits for in-flight deaths, and a death that arrives after
--     the claim sees a phase other than 'racing' and is ignored without writing anything;
--   * the player's state row is locked FOR UPDATE, so the final clear (an UPDATE of that row)
--     either commits first (the death is ignored, nothing inserted) or waits until the death has
--     committed event and total together.
-- Lock order is always session then state, matching the scoring pass, so it cannot deadlock.
create or replace function public.troll_run_report_death(
  p_game_id text,
  p_player_id uuid,
  p_round integer,
  p_level_id text,
  p_level_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phase text;
  v_round integer;
  v_levels integer;
  v_state_id uuid;
  v_index integer;
  v_deaths integer;
begin
  select phase, current_round, coalesce(jsonb_array_length(level_order), 0)
    into v_phase, v_round, v_levels
  from public.troll_run_sessions
  where game_id = p_game_id
  for share;
  if not found then
    return jsonb_build_object('status', 'session_not_found');
  end if;
  if v_phase is distinct from 'racing' then
    return jsonb_build_object('status', 'ignored', 'reason', 'not_racing');
  end if;
  if v_round is distinct from p_round then
    return jsonb_build_object('status', 'ignored', 'reason', 'stale_round');
  end if;

  select id, current_level_index, deaths into v_state_id, v_index, v_deaths
  from public.troll_run_player_states
  where game_id = p_game_id and player_id = p_player_id and current_round = p_round
  for update;
  if not found then
    return jsonb_build_object('status', 'state_not_found');
  end if;
  if v_index >= v_levels then
    return jsonb_build_object('status', 'ignored', 'reason', 'finished', 'deaths', v_deaths);
  end if;

  insert into public.troll_run_events (game_id, player_id, round, level_id, level_name, event_type)
  values (p_game_id, p_player_id, p_round, p_level_id, coalesce(p_level_name, p_level_id), 'death');

  select count(*) into v_deaths
  from public.troll_run_events
  where game_id = p_game_id and player_id = p_player_id and round = p_round and event_type = 'death';

  update public.troll_run_player_states
  set deaths = v_deaths, updated_at = now()
  where id = v_state_id;

  return jsonb_build_object('status', 'ok', 'deaths', v_deaths);
end;
$$;

-- SECURITY DEFINER functions in `public` are callable by PUBLIC by default (inherited by anon and
-- authenticated). This writes events and totals for any player, so only the service role may call it.
revoke execute on function public.troll_run_report_death(text, uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.troll_run_report_death(text, uuid, integer, text, text) to service_role;
