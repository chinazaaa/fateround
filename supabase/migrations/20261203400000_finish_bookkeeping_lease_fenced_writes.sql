-- Lease-fenced writes for the post-finish bookkeeping (see games.finish_bookkeeping and
-- claim_finish_bookkeeping in 20261202450000_word_rush_round_finalization.sql).
--
-- PROBLEM. The bookkeeping runner holds an owner-bound lease, but a step that stalls longer than the lease
-- can still write after another runner took over: its reads are stale, and the writers it calls (room points,
-- trophy round facts) were not lease-checked. A late room-points write double-counted the award; a late
-- round-facts upsert could overwrite the takeover's correct row with facts derived from a replayed round.
--
-- FENCE. The lease `owner` is a fresh uuid per claim, so it doubles as the fencing token: a stalled runner's
-- token can never equal the token of the runner that took over, nor match a cleared marker. Each function
-- below does its whole write in ONE transaction that first locks the games row (FOR UPDATE, the same lock
-- claim/renew/complete/fail take) and checks that the marker's owner is still the caller. The check and the
-- write are therefore atomic with respect to any takeover: the write either commits before the takeover
-- claims (and the new owner then sees it) or is rejected with 'not_owner'.
-- p_owner null means "no lease" (an untracked caller): the owner check is skipped, the write is still atomic.

-- Award a finished room game's points to room members exactly once, atomically.
-- p_awards: [{"member_id": uuid, "points": n}, ...]. Increments room_points / games_played in SQL (no
-- read-modify-write) and stamps room_games.points_awarded_at in the same transaction, so a replay sees either
-- everything or nothing. Returns 'awarded', 'already_awarded', 'no_room_game' or 'not_owner'.
create or replace function public.award_room_game_points_fenced(
  p_game_id text,
  p_owner uuid,
  p_awards jsonb
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_marker jsonb;
  v_stamp timestamptz;
  v_room_game uuid;
  v_award jsonb;
begin
  select g.finish_bookkeeping into v_marker from public.games g where g.id = p_game_id for update;
  if p_owner is not null and (v_marker is null or v_marker->>'owner' is distinct from p_owner::text) then
    return 'not_owner';
  end if;

  select rg.id, rg.points_awarded_at into v_room_game, v_stamp
    from public.room_games rg where rg.game_id = p_game_id for update;
  if v_room_game is null then
    return 'no_room_game';
  end if;
  if v_stamp is not null then
    return 'already_awarded';
  end if;

  for v_award in select * from jsonb_array_elements(coalesce(p_awards, '[]'::jsonb)) loop
    update public.room_members
       set room_points = room_points + (v_award->>'points')::integer,
           games_played = games_played + 1
     where id = (v_award->>'member_id')::uuid;
  end loop;

  update public.room_games set points_awarded_at = now() where id = v_room_game;
  return 'awarded';
end;
$$;

-- Upsert a finished round's trophy facts for (game, player, finished_at), only while the caller still owns the
-- lease. p_rows: [{"player_id": uuid, "facts": {...}}, ...]. Returns 'written' or 'not_owner'.
create or replace function public.upsert_round_facts_fenced(
  p_game_id text,
  p_owner uuid,
  p_finished_at timestamptz,
  p_rows jsonb
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_marker jsonb;
begin
  select g.finish_bookkeeping into v_marker from public.games g where g.id = p_game_id for update;
  if p_owner is not null and (v_marker is null or v_marker->>'owner' is distinct from p_owner::text) then
    return 'not_owner';
  end if;

  insert into public.round_facts (game_id, player_id, finished_at, facts)
  select p_game_id, (r->>'player_id')::uuid, p_finished_at, coalesce(r->'facts', '{}'::jsonb)
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  on conflict (game_id, player_id, finished_at) do update set facts = excluded.facts;
  return 'written';
end;
$$;

-- These write scores and trophy facts, so only the service role may call them. (Contains revoke ... from
-- public, anon, authenticated; grant ... to service_role, like the lease RPCs it extends.)
revoke execute on function public.award_room_game_points_fenced(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.award_room_game_points_fenced(text, uuid, jsonb) to service_role;
revoke execute on function public.upsert_round_facts_fenced(text, uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_round_facts_fenced(text, uuid, timestamptz, jsonb) to service_role;
