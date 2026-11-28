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
-- Bookkeeping: a finish this function commits writes the durable `finish_bookkeeping` marker in the same UPDATE only
-- when `p_track_bookkeeping` is true (Word Rush, whose Play Again already refuses to reset while the marker is owed);
-- every other game's side effects run inline in the caller, exactly as for any other finish. Writing the marker for
-- games whose Play Again does not honour it would let the cron sweep run a finish's bookkeeping against a replayed game.
--
-- Additive: one new function, nothing existing is altered.

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
      'finished_at', v_game.finished_at, 'result_reason', v_game.result_reason, 'session_changed', v_changed,
      -- A finish of another Play Again generation is not this leave's to clean up; a Start in the SAME generation (only
      -- session_started_at differs) is the same session, so its finish is.
      'replayed', v_replayed
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
          -- Lock order: games row, then the nominee. remove_player_if_game_open follows it (games row first). A removal
          -- helper that deletes a player directly (the per-game engines, not changed here) locks the player first and then
          -- needs this games row for ON DELETE SET NULL; if the nominee leaves that way during this settlement,
          -- PostgreSQL aborts one of the two (the settle call is retried by the app; a leave reports an error and is repeatable).
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
          pending_host_nominated_at = clock_timestamp(),
          host_user_id = case when v_ours then null else host_user_id end
      where id = v_id;
    return jsonb_build_object('status', 'nominated', 'nominee', v_successor, 'session_changed', v_changed);
  end if;

  -- A replay (Play Again) is another session: an older leave never finishes it (the stale-lobby cron / idle reaper end a
  -- hostless one). A game that merely STARTED (same sessions_played) is still the session the leave inspected.
  if v_game.sessions_played is distinct from p_sessions_played then
    return jsonb_build_object('status', 'settled', 'session_changed', true);
  end if;

  -- Nobody left to hand it to: end the game, with its reason in the same statement.
  v_now := clock_timestamp();
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

-- SECURITY DEFINER functions in `public` are callable by PUBLIC by default (inherited by anon and
-- authenticated). This nominates hosts and ends games, so only the service role may call it.
revoke execute on function public.settle_host_leave(text, uuid, uuid, timestamptz, integer, boolean) from public, anon, authenticated;
grant execute on function public.settle_host_leave(text, uuid, uuid, timestamptz, integer, boolean) to service_role;

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
     -- (No clause for a pending nominee: a nominee only keeps the game alive while it is ELIGIBLE, and an eligible
     -- nominee is itself an eligible player, covered by the roster check below. A nominee who became a spectator / bot
     -- therefore no longer blocks the end, so the host leaving alone still ends the game BEFORE their seat and results
     -- are deleted, instead of the settlement finishing it afterwards without them.)
     or exists (
       select 1 from public.players
       where game_id = v_id and is_bot = false and spectator = false and id <> p_outgoing_player_id
     ) then
    return jsonb_build_object('status', 'continue', 'game_status', v_game.status);
  end if;

  v_now := clock_timestamp();
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

revoke execute on function public.end_game_if_host_alone(text, uuid, timestamptz, integer, boolean) from public, anon, authenticated;
grant execute on function public.end_game_if_host_alone(text, uuid, timestamptz, integer, boolean) to service_role;

-- Word Rush leaves are durable: the seat of a player who left stays (off the roster) until the round decision their leave
-- may trigger and the effects it owes have been applied, and the players who have left are recorded on the session itself
-- (word_rush_remove_player). The seat deletion is then completed by whoever finds it pending; no separate record or
-- table is needed. Additive column; the session row is created and replaced with the game, so it never outlives it.
alter table public.word_rush_sessions add column if not exists leavers uuid[] not null default '{}';
-- The host handoff a departing HOST still owes, recorded with their leave (player id -> {session_started_at, sessions_played};
-- the host's user id is NOT stored here, this table is publicly readable: the delete stage reads it from the locked games row) and settled by the very transaction that deletes their seat (word_rush_remove_player, stage delete), so a
-- deferred seat deletion never leaves the game without a host or a nominee.
alter table public.word_rush_sessions add column if not exists leaver_handoffs jsonb not null default '{}'::jsonb;


-- A seat is never inserted into a game that a HOST LEAVE has finished (result_reason 'host_ended'), decided under the games
-- row lock: the join handler reads the status and inserts in separate calls, so a host-alone finish (settle_host_leave /
-- end_game_if_host_alone / remove_player_if_game_open, all FOR UPDATE or FOR NO KEY UPDATE) could commit between them and
-- leave an eligible player seated in a game that was just ended for lack of one (its post-finish cleanup has already run
-- for the roster it saw). Games that finished any other way keep accepting late joiners exactly as before (they land on
-- the results screen), so this narrows nothing that worked. The lock is FOR NO KEY UPDATE: the level the lobby's own AFTER
-- INSERT trigger (touch_game_activity) already takes on this row, so it adds no new contention, conflicts with every
-- finish, and cannot deadlock with a lock upgrade.
create or replace function public.players_require_unfinished_game()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_reason text;
begin
  select status, result_reason into v_status, v_reason from public.games where id = new.game_id for no key update;
  if found and v_status = 'finished' and v_reason = 'host_ended' then
    raise exception 'game_finished: cannot seat a player in a game its host ended' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.players_require_unfinished_game() from public, anon, authenticated;

drop trigger if exists players_require_unfinished_game on public.players;
create trigger players_require_unfinished_game
  before insert on public.players
  for each row execute function public.players_require_unfinished_game();

-- Remove a player's seat only while the game is still open (every game except Word Rush, which has word_rush_remove_player).
-- The caller's own status read can be stale by the time it deletes (another request finishes the game in between), and
-- deleting a seat of a FINISHED game erases that player's row from the result (the score tables cascade off it). The game
-- row is locked FOR NO KEY UPDATE, which conflicts with the UPDATE that finishes a game AND serializes concurrent removals:
-- the delete's own foreign-key actions update this row (host_player_id / pending_host_player_id SET NULL), so two removals
-- that both held a shared lock first (the host and the pending nominee) would each wait for the other and deadlock. The
-- second removal waits here instead, and still sees a finish that committed first. A host leave that may FINISH the game
-- takes FOR UPDATE instead (see below).
create or replace function public.remove_player_if_game_open(
  p_game_id text,
  p_player_id uuid,
  -- Joiners mode: the participant row that goes with the seat. Deleted in the same transaction, under the same lock,
  -- so a finish either keeps BOTH rows or loses to the delete of both (never one without the other).
  p_participant_name text default null,
  -- The leaver is the game's host. If nobody else is eligible, the game is FINISHED here (host_ended, bound to the session
  -- the caller inspected) and the seat is KEPT: the decision to finish and the decision to delete the host seat are one
  -- locked check, so a successor leaving in between can never leave a finished game without its host's results.
  p_host_leave boolean default false,
  p_sessions_played integer default null,
  p_track_bookkeeping boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_game public.games%rowtype;
  v_participant_id uuid;
  v_deleted integer;
  v_now timestamptz;
begin
  if p_game_id is null or p_player_id is null then
    raise exception 'remove_player_if_game_open: game id and player id are required';
  end if;
  -- A host leave that may FINISH the game needs the strongest row lock: a join only takes KEY SHARE on the games row (its
  -- foreign key), which FOR NO KEY UPDATE does not conflict with, so a join could commit between the successor check
  -- below and the finish and leave an eligible player seated in a finished game. FOR UPDATE conflicts with it (and is
  -- taken first and alone, so removals still serialise exactly as before). A removal that also deletes a PARTICIPANT by
  -- name needs it for the same reason: a same-name participant insert could otherwise commit between the ambiguity count
  -- and the delete. Every other removal keeps FOR NO KEY UPDATE.
  if p_host_leave or p_participant_name is not null then
    select * into v_game from public.games where id = upper(p_game_id) for update;
  else
    select * into v_game from public.games where id = upper(p_game_id) for no key update;
  end if;
  if not found then
    return jsonb_build_object('status', 'game_missing');
  end if;
  if v_game.status = 'finished' then
    return jsonb_build_object('status', 'game_finished');
  end if;
  if p_host_leave and v_game.status in ('waiting', 'active') and v_game.host_player_id = p_player_id
     and v_game.sessions_played is not distinct from p_sessions_played
     and not exists (
       select 1 from public.players
       where game_id = v_game.id and is_bot = false and spectator = false and id <> p_player_id
     ) then
    -- clock_timestamp(): the finish happens NOW, not when this transaction started (it may have waited for the lock).
    v_now := clock_timestamp();
    update public.games
      set status = 'finished',
          finished_at = v_now,
          result_reason = 'host_ended',
          pending_host_player_id = null,
          finish_bookkeeping = case
            when p_track_bookkeeping then jsonb_build_object('finished_at', v_now, 'attempts', 0)
            else finish_bookkeeping
          end
      where id = v_game.id;
    return jsonb_build_object('status', 'host_ended', 'finished_at', v_now);
  end if;
  -- The seat first; the participant row goes only when THIS call removed the seat (a call for an absent seat removes
  -- nothing, so it can never take a participant row of someone else who now holds the same name). The seat's own
  -- participant_id is read before the delete; the name is only the fallback for a seat that has none. One transaction.
  if p_participant_name is not null then
    select participant_id into v_participant_id from public.players
      where id = p_player_id and game_id = upper(p_game_id);
    -- A seat with no linked participant is matched by NAME only when that is unambiguous: two participants with the same
    -- name must never both go with one seat (and neither can be proven to be this seat's). Refuse BEFORE anything is
    -- deleted, so the seat delete is not committed either.
    if v_participant_id is null
       and exists (select 1 from public.players where id = p_player_id and game_id = upper(p_game_id))
       and (select count(*) from public.participants where game_id = upper(p_game_id) and name = p_participant_name) > 1 then
      return jsonb_build_object('status', 'participant_ambiguous');
    end if;
  end if;
  delete from public.players where id = p_player_id and game_id = upper(p_game_id);
  get diagnostics v_deleted = row_count;
  if p_participant_name is not null and v_deleted > 0 then
    if v_participant_id is not null then
      delete from public.participants where id = v_participant_id and game_id = upper(p_game_id);
    else
      delete from public.participants where game_id = upper(p_game_id) and name = p_participant_name;
    end if;
  end if;
  return jsonb_build_object('status', 'deleted');
end;
$$;

revoke execute on function public.remove_player_if_game_open(text, uuid, text, boolean, integer, boolean) from public, anon, authenticated;
grant execute on function public.remove_player_if_game_open(text, uuid, text, boolean, integer, boolean) to service_role;

-- Two Truths start: ONE transaction under the games row lock. It re-checks that the game is still waiting and that
-- every submitter still has a seat (and that enough of them remain) BEFORE it writes anything, then creates the
-- rounds and their answer keys (create_ttl_rounds), applies the spectator flags and activates the game. A rejected
-- start writes nothing at all. Without it a host leave landing between the separate writes read a half-changed
-- roster, finished the game, and the final status write (which filtered on the id only) re-activated the finished
-- row; and a finish landing before the rounds were created still got round data written to a finished game.
-- Statuses: started | lost (no longer waiting) | submitters_changed (a submitter's seat is gone, or too few remain) |
-- game_missing. Lock order is the same as settle_host_leave / end_game_if_host_alone: games row first.
create or replace function public.start_two_truths_game(
  p_game_id text,
  p_submitted_player_ids uuid[],
  p_session_started_at timestamptz,
  p_rounds jsonb,
  p_lies jsonb,
  p_min_submitters integer,
  -- The lobby generation (games.sessions_played) the caller read its statements and built its rounds from: a Play Again in
  -- between leaves the game `waiting` with the same seats, so the generation is what tells the lobbies apart.
  p_sessions_played integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text;
  v_status text;
  v_generation integer;
  v_seated integer;
  v_rounds integer;
begin
  if p_game_id is null or p_session_started_at is null or p_rounds is null or p_lies is null
     or p_min_submitters is null or p_min_submitters < 1
     or p_submitted_player_ids is null or coalesce(array_length(p_submitted_player_ids, 1), 0) = 0
     or jsonb_typeof(p_rounds) <> 'array' or jsonb_array_length(p_rounds) = 0 then
    raise exception 'start_two_truths_game: game id, submitters, session start, rounds, lies and minimum are required';
  end if;
  v_id := upper(p_game_id);
  select status, sessions_played into v_status, v_generation from public.games where id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'game_missing');
  end if;
  if v_status <> 'waiting' or v_generation is distinct from p_sessions_played then
    return jsonb_build_object('status', 'lost', 'game_status', v_status);
  end if;
  -- Recount the submitted seats under the lock: a submitter who left since the route read the roster would otherwise
  -- start the game with a round whose submitter is gone (and possibly fewer players than the minimum).
  select count(*) into v_seated from public.players
    where game_id = v_id and id = any (p_submitted_player_ids);
  if v_seated <> (select count(distinct x) from unnest(p_submitted_player_ids) x) or v_seated < p_min_submitters then
    return jsonb_build_object('status', 'submitters_changed');
  end if;
  v_rounds := jsonb_array_length(p_rounds);
  perform public.create_ttl_rounds(p_rounds, p_lies);
  -- Everyone watches, except the players who submitted statements (they are the guessers).
  update public.players set spectator = true where game_id = v_id;
  update public.players set spectator = false where game_id = v_id and id = any (p_submitted_player_ids);
  update public.games
    set status = 'active',
        session_started_at = p_session_started_at,
        current_round_number = 1,
        rounds_count = v_rounds
    where id = v_id;
  return jsonb_build_object('status', 'started');
end;
$$;

revoke execute on function public.start_two_truths_game(text, uuid[], timestamptz, jsonb, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.start_two_truths_game(text, uuid[], timestamptz, jsonb, jsonb, integer, integer) to service_role;


-- Finish the still-active rounds of a FINISHED session, bound to that session in the same transaction: the games row is
-- locked FOR SHARE (a Play Again / restart UPDATE of it waits) and must still be finished with exactly the finished_at
-- the caller names. While the game is in that state every active round of it belongs to that session: rounds are only
-- ever created for a game that is not finished (and Play Again deletes the old ones), so no clock comparison between
-- the application's round timestamps and the database's finished_at is needed (or safe: a skewed app clock would
-- otherwise leave a live round of the finished session open).
create or replace function public.finish_rounds_of_finished_session(
  p_game_id text,
  p_finished_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_game public.games%rowtype;
begin
  if p_game_id is null or p_finished_at is null then
    raise exception 'finish_rounds_of_finished_session: game id and finished_at are required';
  end if;
  select * into v_game from public.games where id = upper(p_game_id) for share;
  if not found then
    return jsonb_build_object('status', 'game_missing');
  end if;
  if v_game.status <> 'finished' or v_game.finished_at is distinct from p_finished_at then
    return jsonb_build_object('status', 'not_current_session');
  end if;
  update public.rounds
    set status = 'finished', ended_at = p_finished_at
    where game_id = upper(p_game_id) and status = 'active';
  -- The rounds of the confirmed session, read under the same lock: the caller limits its reveal to exactly these (a
  -- replay may start a new session under the same game id the moment this lock is released).
  return jsonb_build_object(
    'status', 'finished_session',
    'round_ids', coalesce((select jsonb_agg(id) from public.rounds where game_id = upper(p_game_id) and status = 'finished'), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.finish_rounds_of_finished_session(text, timestamptz) from public, anon, authenticated;
grant execute on function public.finish_rounds_of_finished_session(text, timestamptz) to service_role;

-- The prompt setter that replaces `p_excluded` (and every player who has already left) for a manual-letters round that is
-- still awaiting its prompt, with the rule the application uses: individual = the roster at turn_index mod size; team = the
-- sorted members of the active team at the round index mod size. NULL when nobody is left (the application's round-ending
-- logic then ends the round). The one definition used by word_rush_remove_player AND the seat-delete trigger.
create or replace function public.word_rush_pick_setter(p_session public.word_rush_sessions, p_excluded uuid)
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_candidates uuid[];
begin
  if p_session.mode = 'team' then
    select coalesce(array_agg(wp.player_id order by wp.player_id::text collate "C"), '{}'::uuid[]) into v_candidates
      from public.word_rush_players wp
      join public.players p on p.id = wp.player_id
      where wp.game_id = p_session.game_id and wp.team = p_session.active_team and wp.player_id <> p_excluded
        and not (wp.player_id = any (coalesce(p_session.leavers, '{}'::uuid[]))) and p.spectator is not true;
    return case when cardinality(v_candidates) = 0 then null
                else v_candidates[((p_session.turn_index / greatest(p_session.num_teams, 1)) % cardinality(v_candidates)) + 1] end;
  end if;
  v_candidates := array_remove(p_session.roster, p_excluded);
  return case when cardinality(v_candidates) = 0 then null
              else v_candidates[(p_session.turn_index % cardinality(v_candidates)) + 1] end;
end;
$$;

revoke execute on function public.word_rush_pick_setter(public.word_rush_sessions, uuid) from public, anon, authenticated;

-- Whatever deletes a Word Rush seat (the removal function below, a host kick, the per-engine helpers, a cascade), the
-- session never keeps a reference to it: before the row goes it leaves the roster and the leavers list, and a prompt setter
-- of a round still awaiting its prompt is replaced first (the foreign key would otherwise null it and nobody could enter the
-- letters). This is the safety net for deleters that do not go through word_rush_remove_player; that function does
-- the same work explicitly and in the right order, and the trigger then finds nothing left to do.
create or replace function public.word_rush_detach_seat_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s public.word_rush_sessions%rowtype;
begin
  for s in
    select * from public.word_rush_sessions
      where game_id = old.game_id
        and (old.id = any (roster) or old.id = any (leavers) or prompt_setter_player_id = old.id)
      for update
  loop
    update public.word_rush_sessions
      set roster = array_remove(roster, old.id),
          leavers = array_remove(leavers, old.id),
          prompt_setter_player_id = case
            when prompt_setter_player_id = old.id and phase = 'awaiting_prompt' and prompt_mode = 'manual' and status <> 'finished'
              then public.word_rush_pick_setter(s, old.id)
            else prompt_setter_player_id
          end,
          updated_at = clock_timestamp()
      where id = s.id;
  end loop;
  return old;
end;
$$;

revoke execute on function public.word_rush_detach_seat_before_delete() from public, anon, authenticated;

drop trigger if exists word_rush_detach_seat_before_delete on public.players;
create trigger word_rush_detach_seat_before_delete
  before delete on public.players
  for each row execute function public.word_rush_detach_seat_before_delete();

-- A Word Rush player leaves: ONE function, two stages, always under the games row lock first and then the session row lock
-- (the established order), so a leave is atomic against a join, a finish, a Play Again reset and another leave.
--
--   stage 'leave'   the durable part. Refuses an ambiguous participant name BEFORE anything changes; finishes the game as
--                   host_ended when the leaver is the host and nobody else is eligible (the seat is kept, as for every game);
--                   otherwise, when a session exists, takes the player off the roster, replaces them as prompt setter when
--                   they are the setter of a manual round awaiting its prompt, and records them in session.leavers, all in
--                   this one transaction (`left`). With no session (a lobby) the seat is simply deleted (`deleted`).
--   stage 'delete'  the completion, run by the leave itself and by any runner that finds a recorded leaver. It deletes the
--                   seat (with its participant row in joiners mode) once nothing the leave owes is pending: the round
--                   decision the leave may trigger has been made by the application (it always decides BEFORE asking), and
--                   no round_finalize marker is set (`finalizing`: the effects it applies read the leaver's rows); on a
--                   finished game only for a natural finish (no result_reason) whose bookkeeping has completed
--                   (`bookkeeping_owed` until then). An admin / host / idle finish keeps the seat for its result
--                   (`game_finished`; the leave record is dropped, the seat stays part of the result). A host's leave records the
--                   session generation with it (p_session_started_at, p_sessions_played) and the delete stage settles the
--                   handoff (settle_host_leave) in the SAME transaction as the seat deletion, returning its outcome as `settled`.
--                   With no session the delete stage deletes nothing (`not_left`).
--
-- Because the leave is recorded durably before the application decides what it means for the round, there is no state a
-- crash can strand: the decision is a function of the current session (a round ends iff it can no longer be played), so
-- any runner re-derives it, and the seat deletion is derived from the leavers list.
-- Statuses: game_missing | left | deleted | host_ended | participant_ambiguous | game_finished | bookkeeping_owed |
--           finalizing | not_left
create or replace function public.word_rush_remove_player(
  p_game_id text,
  p_player_id uuid,
  p_stage text default 'leave',
  p_host_leave boolean default false,
  p_sessions_played integer default null,
  p_track_bookkeeping boolean default true,
  p_session_started_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_game public.games%rowtype;
  v_session public.word_rush_sessions%rowtype;
  v_settled jsonb;
  v_has_session boolean;
  v_in_leavers boolean;
  v_participant_id uuid;
  v_name text;
  v_seat boolean;
  v_now timestamptz;
begin
  if p_game_id is null or p_player_id is null or p_stage is null or p_stage not in ('leave', 'delete') then
    raise exception 'word_rush_remove_player: game id, player id and a stage (leave | delete) are required';
  end if;
  -- FOR UPDATE (not NO KEY UPDATE) for every stage: the host-alone finish needs it against a concurrent join, and a joiners-mode
  -- removal deletes a participant by name after counting same-name rows, which a concurrent same-name participant insert
  -- (KEY SHARE on the games row) must not slip between.
  select * into v_game from public.games where id = upper(p_game_id) for update;
  if not found then
    return jsonb_build_object('status', 'game_missing');
  end if;
  select * into v_session from public.word_rush_sessions where game_id = v_game.id for update;
  v_has_session := found;
  v_in_leavers := v_has_session and p_player_id = any (v_session.leavers);
  select participant_id, name, true into v_participant_id, v_name, v_seat from public.players
    where id = p_player_id and game_id = v_game.id;
  v_seat := coalesce(v_seat, false);

  if v_game.status = 'finished' then
    -- Only a player who had LEFT a naturally finished game is ever deleted; any other seat is part of the result.
    if v_game.result_reason is not null then
      -- The seat stays as part of the result: the leave record (and any handoff it carried) is dropped so it is not swept again.
      if v_in_leavers then
        update public.word_rush_sessions
          set leavers = array_remove(leavers, p_player_id), leaver_handoffs = leaver_handoffs - p_player_id::text
          where id = v_session.id;
      end if;
      return jsonb_build_object('status', 'game_finished');
    end if;
    if not v_in_leavers then
      return jsonb_build_object('status', 'game_finished');
    end if;
    -- The leaver's rows (answers, team rows) cascade off the seat and are read by the owed post-finish bookkeeping.
    if v_game.finish_bookkeeping is not null then
      return jsonb_build_object('status', 'bookkeeping_owed');
    end if;
    if v_has_session and v_session.round_finalize is not null then
      return jsonb_build_object('status', 'finalizing');
    end if;
  elsif p_stage = 'leave' then
    if v_game.participant_mode = 'joiners' and v_seat and v_participant_id is null
       and (select count(*) from public.participants where game_id = v_game.id and name = v_name) > 1 then
      return jsonb_build_object('status', 'participant_ambiguous');
    end if;
    if p_host_leave and v_game.status in ('waiting', 'active') and v_game.host_player_id = p_player_id
       and v_game.sessions_played is not distinct from p_sessions_played
       and not exists (
         select 1 from public.players
         where game_id = v_game.id and is_bot = false and spectator = false and id <> p_player_id
           -- a player who has already LEFT (recorded, seat awaiting its delete) is not a successor
           and not (id = any (coalesce(v_session.leavers, '{}'::uuid[])))
       ) then
      v_now := clock_timestamp();
      update public.games
        set status = 'finished',
            finished_at = v_now,
            result_reason = 'host_ended',
            pending_host_player_id = null,
            finish_bookkeeping = case
              when p_track_bookkeeping then jsonb_build_object('finished_at', v_now, 'attempts', 0)
              else finish_bookkeeping
            end
        where id = v_game.id;
      return jsonb_build_object('status', 'host_ended', 'finished_at', v_now);
    end if;
    if v_has_session then
      update public.word_rush_sessions
        set roster = array_remove(roster, p_player_id),
            prompt_setter_player_id = case
              when prompt_setter_player_id = p_player_id and phase = 'awaiting_prompt' and prompt_mode = 'manual'
                   and status <> 'finished'
                then public.word_rush_pick_setter(v_session, p_player_id)
              else prompt_setter_player_id
            end,
            leavers = case when p_player_id = any (leavers) then leavers else array_append(leavers, p_player_id) end,
            leaver_handoffs = case
              when p_host_leave then leaver_handoffs || jsonb_build_object(p_player_id::text, jsonb_build_object(
                'session_started_at', p_session_started_at, 'sessions_played', p_sessions_played))
              else leaver_handoffs
            end,
            updated_at = clock_timestamp()
        where id = v_session.id;
      return jsonb_build_object('status', 'left', 'session_id', v_session.id);
    end if;
    -- no session (a lobby): nothing to reconcile, the seat goes right away
  else
    -- The delete stage only completes a leave that was RECORDED: with no session (a reopened lobby) nothing was recorded
    -- (v_in_leavers is false), so a non-leaver's seat is never deleted here (the leave stage deletes a lobby seat at once).
    if v_session.round_finalize is not null then
      return jsonb_build_object('status', 'finalizing');
    end if;
    if not v_in_leavers then
      return jsonb_build_object('status', 'not_left');
    end if;
  end if;

  -- The seat (and, in joiners mode, ITS participant row) go in this transaction. An unlinked seat's participant is matched
  -- by name only when that is unambiguous.
  if v_game.participant_mode = 'joiners' and v_seat and v_participant_id is null
     and (select count(*) from public.participants where game_id = v_game.id and name = v_name) > 1 then
    return jsonb_build_object('status', 'participant_ambiguous');
  end if;
  delete from public.players where id = p_player_id and game_id = v_game.id;
  if v_game.participant_mode = 'joiners' and v_seat then
    if v_participant_id is not null then
      delete from public.participants where id = v_participant_id and game_id = v_game.id;
    else
      delete from public.participants where game_id = v_game.id and name = v_name;
    end if;
  end if;
  -- (the BEFORE DELETE trigger has already dropped the player from the roster and the leavers list)
  -- A departing host's handoff is settled in THIS transaction (against the then-current row), so the seat deletion and the
  -- handoff cannot be separated by a crash.
  if v_has_session and v_session.leaver_handoffs ? p_player_id::text then
    v_settled := public.settle_host_leave(
      v_game.id,
      p_player_id,
      case when v_game.host_player_id = p_player_id then v_game.host_user_id end,
      nullif(v_session.leaver_handoffs -> p_player_id::text ->> 'session_started_at', '')::timestamptz,
      nullif(v_session.leaver_handoffs -> p_player_id::text ->> 'sessions_played', '')::integer,
      true
    );
    update public.word_rush_sessions set leaver_handoffs = leaver_handoffs - p_player_id::text where id = v_session.id;
  end if;
  return case when v_settled is null then jsonb_build_object('status', 'deleted')
              else jsonb_build_object('status', 'deleted', 'settled', v_settled) end;
end;
$$;

revoke execute on function public.word_rush_remove_player(text, uuid, text, boolean, integer, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.word_rush_remove_player(text, uuid, text, boolean, integer, boolean, timestamptz) to service_role;




-- Two Truths: activate a pending round (and move the game's round pointer) only while the game is ACTIVE, under the games
-- row lock. The finish cleanup (finish_rounds_of_finished_session) takes the same lock and requires a finished game, so
-- exactly one wins: if the activation wins, the cleanup closes that round; if the finish wins, the activation writes
-- nothing (an advance that read an active game earlier can no longer open a round of a finished game).
create or replace function public.activate_ttl_round(
  p_game_id text,
  p_round_id uuid,
  p_round_number integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_pointer integer;
  v_updated integer;
begin
  if p_game_id is null or p_round_id is null or p_round_number is null then
    raise exception 'activate_ttl_round: game id, round id and round number are required';
  end if;
  -- A WRITE lock (not FOR SHARE): two activations that both hold a share lock would deadlock when each then needs the
  -- games row for the pointer write; this way the second one waits here, before it touches any round.
  select status, current_round_number into v_status, v_pointer
    from public.games where id = upper(p_game_id) for no key update;
  if not found then
    return jsonb_build_object('status', 'game_missing');
  end if;
  if v_status <> 'active' then
    return jsonb_build_object('status', 'not_active');
  end if;
  -- One round is active at a time: a stale advance must not open a second one.
  if exists (select 1 from public.rounds where game_id = upper(p_game_id) and status = 'active') then
    return jsonb_build_object('status', 'round_active');
  end if;
  -- The pointer only moves forward: a stale advance that picked an earlier pending round (a later one was activated and
  -- finished since, the skipped round stays pending) must not move it back.
  if v_pointer is not null and p_round_number < v_pointer then
    return jsonb_build_object('status', 'stale_round');
  end if;
  update public.rounds
    -- clock_timestamp(): the round starts when it is activated, not when this transaction began waiting for the games lock.
    set status = 'active', started_at = clock_timestamp(), ended_at = null
    where id = p_round_id and game_id = upper(p_game_id) and status = 'pending';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('status', 'not_pending');
  end if;
  update public.games set current_round_number = p_round_number where id = upper(p_game_id);
  return jsonb_build_object('status', 'activated');
end;
$$;

revoke execute on function public.activate_ttl_round(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.activate_ttl_round(text, uuid, integer) to service_role;
