-- Play Again reset fence, and a host-left finish that cannot race it.
--
-- Play Again deletes a finished (or abandoned) session's rows before it reopens the lobby. A host-left finish writes a
-- durable bookkeeping marker whose recovery reads those rows, so the two must be serialized by the database:
--
--  * begin_play_again_reset() is the FIRST write of a reset. In one statement sequence under FOR UPDATE on the game
--    row it checks that the game is still exactly the game the request read (status AND the session identity,
--    `session_started_at` + `sessions_played`, which together change on every start and every reset), that no
--    bookkeeping is owed, and that no other reset is running, and only then marks the reset as started
--    (`reset_started_at`). Every later write of the reset runs only if it answered `started`.
--  * While a reset is running (marker younger than 60 s) end_game_if_host_alone() and the fresh-finish branch of
--    settle_host_leave() refuse to commit a finish, so a host-left finish can never land against a reset in
--    progress; a finish that committed FIRST leaves its marker, which makes begin_play_again_reset answer
--    `bookkeeping_owed`, so its rows are kept until the bookkeeping settles.
--  * The game's visible state does not change until the reset's final statement (which also clears the marker), so a
--    failed reset leaves the previous state in place and is simply retried; abort_play_again_reset() releases the
--    marker, a crashed reset's marker expires after 60 s.
--
-- A single transactional reset function was not used: the deletes span roughly forty per-game tables owned by the
-- game engines, which a database function would have to duplicate.
--
-- `reset_started_at` is server-only (the client reads use curated column lists, see docs/games-column-revoke-audit.md).
-- The two host-leave functions are redefined (create or replace, same signatures) with the reset check.

alter table public.games add column if not exists reset_started_at timestamptz;
comment on column public.games.reset_started_at is
  'Set while a Play Again reset is running (see begin_play_again_reset); NULL otherwise. Expires after 60 seconds.';

create or replace function public.settle_host_leave(
  p_game_id text,
  p_outgoing_player_id uuid,
  p_outgoing_host_user_id uuid,
  p_session_started_at timestamptz,
  p_sessions_played integer,
  p_track_bookkeeping boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text;
  v_game public.games%rowtype;
  v_changed boolean;
  v_ours boolean;
  v_replayed boolean;
  v_successor uuid;
  v_now timestamptz;
begin
  -- The user id and the session identity may legitimately be NULL (anonymous host, unstarted game); the rest may not.
  if p_game_id is null or p_outgoing_player_id is null or p_track_bookkeeping is null then
    raise exception 'settle_host_leave: game id, outgoing player id and track flag are required';
  end if;
  v_id := upper(p_game_id);

  select * into v_game from public.games where id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'game_missing');
  end if;

  v_changed := v_game.sessions_played is distinct from p_sessions_played
    or v_game.session_started_at is distinct from p_session_started_at;

  -- The leave only counts once the seat is really gone.
  if exists (select 1 from public.players where id = p_outgoing_player_id) then
    return jsonb_build_object('status', 'seat_retained', 'game_status', v_game.status, 'session_changed', v_changed);
  end if;

  -- Whether the game's host linkage is still the outgoing host's (see the header). Decided once, under the lock.
  -- Only a REPLAY (another Play Again generation) is another session as far as the linkage goes: a Start in the same
  -- generation is the same session, so the departed host's linkage is still this leave's to release.
  v_replayed := v_game.sessions_played is distinct from p_sessions_played;
  v_ours := p_outgoing_host_user_id is not null
    and not v_replayed
    and v_game.host_user_id = p_outgoing_host_user_id
    and (v_game.host_player_id is null
         or v_game.host_player_id = p_outgoing_player_id
         or not exists (select 1 from public.players where id = v_game.host_player_id));

  if v_game.status = 'finished' then
    if v_ours then
      update public.games set host_user_id = null where id = v_id;
    end if;
    return jsonb_build_object(
      'status', 'finished', 'finished_now', false,
      'finished_at', v_game.finished_at, 'result_reason', v_game.result_reason, 'session_changed', v_changed
    );
  end if;

  if v_game.status not in ('waiting', 'active') then
    return jsonb_build_object('status', 'settled', 'session_changed', v_changed);
  end if;

  -- A valid nominee, or another existing player already hosting: nothing to hand over. Still stop routing the
  -- outgoing host back (the clear is conditional, so a claimant's linkage is never touched).
  -- (A nominee counts only while it is still ELIGIBLE: same game, not a bot, not a spectator. One who stopped being
  -- eligible falls through to the election below, which replaces the nomination.)
  if (v_game.pending_host_player_id is not null
        and exists (
          select 1 from public.players
          where id = v_game.pending_host_player_id and game_id = v_id and is_bot = false and spectator = false
          -- Locked, like the election below: a concurrent spectator / bot update of the nominee waits until this
          -- transaction commits, so a nominee judged eligible here is still eligible when the settlement lands.
          for no key update
        ))
     or (v_game.host_player_id is not null
         and v_game.host_player_id <> p_outgoing_player_id
         and exists (select 1 from public.players where id = v_game.host_player_id)) then
    if v_ours then
      update public.games set host_user_id = null where id = v_id;
    end if;
    return jsonb_build_object('status', 'settled', 'session_changed', v_changed);
  end if;

  -- Hostless (or a nominee that no longer exists): hand over to the oldest eligible player, chosen in this
  -- transaction. FOR NO KEY UPDATE on the chosen row makes a concurrent DELETE of that player AND a concurrent
  -- ordinary UPDATE of it (a spectator or bot flag, a rename) wait until this transaction commits, so the nominee
  -- cannot leave or stop being eligible between the choice and the write; the eligibility columns are therefore
  -- still true when the nomination is written and need no re-check. (FOR KEY SHARE would only have blocked the
  -- delete.) A join takes KEY SHARE on this games row through its foreign key, which conflicts with the FOR UPDATE
  -- above: a join either committed before this read, and is a candidate, or waits until this transaction ends.
  select id into v_successor
    from public.players
    where game_id = v_id and is_bot = false and spectator = false and id <> p_outgoing_player_id
    order by joined_at, id
    limit 1
    for no key update;

  if v_successor is not null then
    update public.games
      set pending_host_player_id = v_successor,
          pending_host_nominated_at = now(),
          host_user_id = case when v_ours then null else host_user_id end
      where id = v_id;
    return jsonb_build_object('status', 'nominated', 'nominee', v_successor, 'session_changed', v_changed);
  end if;

  -- A Play Again reset is in progress: a finish must not commit against it (the reset keeps the lobby it is building;
  -- a host-less lobby is ended later by the stale-lobby cron).
  if v_game.reset_started_at is not null and v_game.reset_started_at > now() - interval '60 seconds' then
    return jsonb_build_object('status', 'settled', 'reset_in_progress', true, 'session_changed', v_changed);
  end if;

  -- A replay (Play Again) is another session: an older leave never finishes it (the stale-lobby cron / idle reaper end a
  -- hostless one). A game that merely STARTED (same sessions_played) is still the session the leave inspected.
  if v_game.sessions_played is distinct from p_sessions_played then
    return jsonb_build_object('status', 'settled', 'session_changed', true);
  end if;

  -- Nobody left to hand it to: end the game, with its reason in the same statement.
  v_now := now();
  update public.games
    set status = 'finished',
        finished_at = v_now,
        result_reason = 'host_ended',
        host_user_id = case when v_ours then null else host_user_id end,
        pending_host_player_id = null,
        finish_bookkeeping = case
          when p_track_bookkeeping then jsonb_build_object('finished_at', v_now, 'attempts', 0)
          else finish_bookkeeping
        end
    where id = v_id;
  return jsonb_build_object(
    'status', 'finished', 'finished_now', true,
    'finished_at', v_now, 'result_reason', 'host_ended', 'session_changed', v_changed
  );
end;
$$;

create or replace function public.end_game_if_host_alone(
  p_game_id text,
  p_outgoing_player_id uuid,
  p_session_started_at timestamptz,
  p_sessions_played integer,
  p_track_bookkeeping boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text;
  v_game public.games%rowtype;
  v_now timestamptz;
begin
  if p_game_id is null or p_outgoing_player_id is null or p_track_bookkeeping is null then
    raise exception 'end_game_if_host_alone: game id, outgoing player id and track flag are required';
  end if;
  v_id := upper(p_game_id);

  select * into v_game from public.games where id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'game_missing');
  end if;

  if v_game.status = 'finished' then
    if v_game.result_reason = 'host_ended' then
      return jsonb_build_object('status', 'finished', 'finished_now', false, 'finished_at', v_game.finished_at);
    end if;
    -- Finished for another reason: the caller must not remove the host's seat from a finished result.
    return jsonb_build_object('status', 'continue', 'game_status', v_game.status);
  end if;

  if v_game.status not in ('waiting', 'active')
     or v_game.sessions_played is distinct from p_sessions_played
     or v_game.session_started_at is distinct from p_session_started_at
     or v_game.host_player_id is distinct from p_outgoing_player_id
     -- (No clause for a pending nominee: only an ELIGIBLE one keeps the game alive, and it is itself an eligible player,
     -- covered by the roster check below; a nominee who became a spectator / bot no longer blocks the end.)
     -- A Play Again reset is in progress (its deletes may be running): never commit a finish against it.
     or (v_game.reset_started_at is not null and v_game.reset_started_at > now() - interval '60 seconds')
     or exists (
       select 1 from public.players
       where game_id = v_id and is_bot = false and spectator = false and id <> p_outgoing_player_id
     ) then
    return jsonb_build_object('status', 'continue', 'game_status', v_game.status);
  end if;

  v_now := now();
  update public.games
    set status = 'finished',
        finished_at = v_now,
        result_reason = 'host_ended',
        pending_host_player_id = null,
        finish_bookkeeping = case
          when p_track_bookkeeping then jsonb_build_object('finished_at', v_now, 'attempts', 0)
          else finish_bookkeeping
        end
    where id = v_id;
  return jsonb_build_object('status', 'finished', 'finished_now', true, 'finished_at', v_now);
end;
$$;

create or replace function public.begin_play_again_reset(
  p_game_id text,
  p_status text,
  p_session_started_at timestamptz,
  p_sessions_played integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text;
  v_game public.games%rowtype;
  v_token timestamptz;
begin
  if p_game_id is null or p_status is null then
    raise exception 'begin_play_again_reset: game id and status are required';
  end if;
  v_id := upper(p_game_id);

  select * into v_game from public.games where id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'game_missing');
  end if;
  if v_game.finish_bookkeeping is not null then
    return jsonb_build_object('status', 'bookkeeping_owed');
  end if;
  if v_game.status is distinct from p_status
     or v_game.session_started_at is distinct from p_session_started_at
     or v_game.sessions_played is distinct from p_sessions_played then
    return jsonb_build_object('status', 'changed');
  end if;
  if v_game.reset_started_at is not null and v_game.reset_started_at > now() - interval '60 seconds' then
    return jsonb_build_object('status', 'in_progress');
  end if;

  v_token := clock_timestamp();
  update public.games set reset_started_at = v_token where id = v_id;
  return jsonb_build_object('status', 'started', 'token', v_token);
end;
$$;

-- Release a reset's marker (only the one this caller set), after a failed reset or a reset with no final games update.
create or replace function public.abort_play_again_reset(
  p_game_id text,
  p_token timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_game_id is null or p_token is null then
    raise exception 'abort_play_again_reset: game id and token are required';
  end if;
  update public.games set reset_started_at = null
    where id = upper(p_game_id) and reset_started_at = p_token;
end;
$$;

-- SECURITY DEFINER functions in `public` are callable by PUBLIC by default; these change game state, so only the
-- service role may call them.
revoke execute on function public.begin_play_again_reset(text, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.begin_play_again_reset(text, text, timestamptz, integer) to service_role;
revoke execute on function public.abort_play_again_reset(text, timestamptz) from public, anon, authenticated;
grant execute on function public.abort_play_again_reset(text, timestamptz) to service_role;
revoke execute on function public.settle_host_leave(text, uuid, uuid, timestamptz, integer, boolean) from public, anon, authenticated;
grant execute on function public.settle_host_leave(text, uuid, uuid, timestamptz, integer, boolean) to service_role;
revoke execute on function public.end_game_if_host_alone(text, uuid, timestamptz, integer, boolean) from public, anon, authenticated;
grant execute on function public.end_game_if_host_alone(text, uuid, timestamptz, integer, boolean) to service_role;
