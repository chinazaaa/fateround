-- Host leave handoff, decided in ONE transaction under a lock on the game row.
--
-- After a host's seat is deleted the app used to run several separate statements (read the seat, read the game,
-- pick a successor, nominate, or end the game, clear the host linkage), each of which could be overtaken by a start,
-- a replay, a claim, a manual nomination or another leave between two of them. Every one of the resulting races
-- (a nominee who left in between and violates the pending_host_player_id foreign key, a nominee that appeared
-- after the "no nominee" read, a stale session finished or cleaned, a linkage cleared over a new host) was a
-- consequence of that split, not of any single statement.
--
-- settle_host_leave() takes `FOR UPDATE` on the games row and decides everything against the CURRENT row and the
-- CURRENT roster, so none of those interleavings can exist. It is idempotent: a repeat call settles to the same
-- answer (a nominee already set is "settled"; a game already finished is "finished").
--
-- A second function, end_game_if_host_alone(), makes the "nobody else is eligible" decision for a host who is still
-- seated, under the same lock, so the roster read and the finish can never be split by a join (see its comment).
--
-- Outcomes of settle_host_leave (jsonb `status`):
--   game_missing   the game row is gone (nothing to do)
--   seat_retained  the leaver's players row still exists (a finisher's seat is kept): NO handoff. The caller decides
--                  what a retained seat means (it clears the linkage only after a successful retained leave).
--   finished       the game is finished: `finished_now` says whether THIS call finished it (no eligible successor),
--                  `finished_at` is the value on the row. The caller runs the session-bound cleanup and, for
--                  `finished_now`, the post-finish bookkeeping.
--   nominated      the oldest eligible player (non-bot, non-spectator, same game; joined_at, id) was nominated
--   settled        a valid nominee or another existing host is already in place (or the status is not live)
-- `session_changed` is true when the game's session identity (session_started_at / sessions_played) differs from the
-- one the leave inspected: the decision is still made against the current row, never against the stale inspection.
-- The leaver's host_user_id linkage is released by EVERY branch under ONE predicate (`v_ours`): it still equals the
-- captured value, the session is the inspected one, and the game still references the outgoing host, meaning
-- host_player_id is null (the seat delete nulls it, ON DELETE SET NULL), is the outgoing player, or names a seat that
-- no longer exists (unreachable while that foreign key holds; handled so a dangling reference could never pin the
-- linkage). A linkage that belongs to someone else (another user, another session) is never touched.
--
-- Every finish this function commits writes the durable `finish_bookkeeping` marker in the same UPDATE (the existing
-- tracked mechanism of game-finish.ts: leased, fenced, generation-bound to finished_at, swept by the cron), so the
-- post-finish bookkeeping (room points, round facts, tournament work) is owed by that exact finish and survives a
-- lost response: any later call resumes it by claiming the marker; nothing is awarded outside the lease.
--
-- Additive: one new function, nothing existing is altered.

create or replace function public.settle_host_leave(
  p_game_id text,
  p_outgoing_player_id uuid,
  p_outgoing_host_user_id uuid,
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
  v_changed boolean;
  v_ours boolean;
  v_successor uuid;
  v_now timestamptz;
begin
  -- The user id and the session identity may legitimately be NULL (anonymous host, unstarted game); the rest may not.
  if p_game_id is null or p_outgoing_player_id is null then
    raise exception 'settle_host_leave: game id and outgoing player id are required';
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
  v_ours := p_outgoing_host_user_id is not null
    and not v_changed
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
  if (v_game.pending_host_player_id is not null
        and exists (select 1 from public.players where id = v_game.pending_host_player_id and game_id = v_id))
     or (v_game.host_player_id is not null
         and v_game.host_player_id <> p_outgoing_player_id
         and exists (select 1 from public.players where id = v_game.host_player_id)) then
    if v_ours then
      update public.games set host_user_id = null where id = v_id;
    end if;
    return jsonb_build_object('status', 'settled', 'session_changed', v_changed);
  end if;

  -- Hostless (or a nominee that no longer exists): hand over to the oldest eligible player, chosen in this
  -- transaction. FOR KEY SHARE on the chosen row makes a concurrent DELETE of that player wait until this
  -- transaction commits, so the nominee cannot leave between the choice and the write. (A join takes KEY SHARE on
  -- this games row through its foreign key, which conflicts with the FOR UPDATE above: a join either committed
  -- before this read, and is a candidate, or waits until this transaction ends.)
  select id into v_successor
    from public.players
    where game_id = v_id and is_bot = false and spectator = false and id <> p_outgoing_player_id
    order by joined_at, id
    limit 1
    for key share;

  if v_successor is not null then
    update public.games
      set pending_host_player_id = v_successor,
          pending_host_nominated_at = now(),
          host_user_id = case when v_ours then null else host_user_id end
      where id = v_id;
    return jsonb_build_object('status', 'nominated', 'nominee', v_successor, 'session_changed', v_changed);
  end if;

  -- Nobody left to hand it to: end the game, with its reason in the same statement.
  v_now := now();
  update public.games
    set status = 'finished',
        finished_at = v_now,
        result_reason = 'host_ended',
        host_user_id = case when v_ours then null else host_user_id end,
        pending_host_player_id = null,
        finish_bookkeeping = jsonb_build_object('finished_at', v_now, 'attempts', 0)
    where id = v_id;
  return jsonb_build_object(
    'status', 'finished', 'finished_now', true,
    'finished_at', v_now, 'result_reason', 'host_ended', 'session_changed', v_changed
  );
end;
$$;

-- SECURITY DEFINER functions in `public` are callable by PUBLIC by default (inherited by anon and
-- authenticated). This nominates hosts and ends games, so only the service role may call it.
revoke execute on function public.settle_host_leave(text, uuid, uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.settle_host_leave(text, uuid, uuid, timestamptz, integer) to service_role;

-- A host who leaves while NOBODY else is eligible ends the game BEFORE their seat is removed (the finished game keeps
-- the seat, so results stay intact). The roster read and the finish are one statement sequence under FOR UPDATE on the
-- games row: a join inserting a player takes KEY SHARE on that row through its foreign key, so it either committed
-- before this read (then there IS an eligible player and the game is not ended) or waits until this transaction
-- ends. 'finished' is also returned for a game this leave already ended (a repeat after a lost response);
-- `finished_now` tells them apart. Anything else is 'continue': the caller removes the seat and settles the handoff
-- with settle_host_leave against the then-current row.
create or replace function public.end_game_if_host_alone(
  p_game_id text,
  p_outgoing_player_id uuid,
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
  v_now timestamptz;
begin
  if p_game_id is null or p_outgoing_player_id is null then
    raise exception 'end_game_if_host_alone: game id and outgoing player id are required';
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
    return jsonb_build_object('status', 'continue');
  end if;

  if v_game.status not in ('waiting', 'active')
     or v_game.sessions_played is distinct from p_sessions_played
     or v_game.session_started_at is distinct from p_session_started_at
     or v_game.host_player_id is distinct from p_outgoing_player_id
     or v_game.pending_host_player_id is not null
     or exists (
       select 1 from public.players
       where game_id = v_id and is_bot = false and spectator = false and id <> p_outgoing_player_id
     ) then
    return jsonb_build_object('status', 'continue');
  end if;

  v_now := now();
  update public.games
    set status = 'finished',
        finished_at = v_now,
        result_reason = 'host_ended',
        finish_bookkeeping = jsonb_build_object('finished_at', v_now, 'attempts', 0)
    where id = v_id;
  return jsonb_build_object('status', 'finished', 'finished_now', true, 'finished_at', v_now);
end;
$$;

revoke execute on function public.end_game_if_host_alone(text, uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.end_game_if_host_alone(text, uuid, timestamptz, integer) to service_role;
