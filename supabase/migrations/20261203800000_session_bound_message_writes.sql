-- Session-bound chat / message writes and wipes, decided atomically against the game row.
--
-- A message route used to check games.status once and insert afterwards, and a finish wiped with
-- `created_at <= finished_at` (an app-clock value compared against a database-clock default). A
-- message accepted just before a finish could therefore be inserted after the wipe, or carry a
-- created_at later than the cutoff, and survive in a finished game.
--
-- Both sides now lock the games row the same way every other atomic path here does: the insert holds
-- FOR SHARE on it, the finish UPDATE and Play Again's reset UPDATE need a conflicting lock. So an
-- insert either sees the game already finished (and is rejected) or commits before the finish does,
-- and the wipe, which holds the same lock while it checks the game is still the finished session it was
-- told about (same finished_at), deletes every row of that session with no clock comparison at all.
-- Additive: new functions only, nothing is revoked or altered.

create or replace function public.insert_anonymous_message_if_active(
  p_game_id text,
  p_player_id uuid,
  p_text text,
  p_reply_to_id uuid,
  p_reply_to_text text,
  p_message_type text,
  p_media_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if p_game_id is null or p_player_id is null then
    raise exception 'message insert: game id and player id are required';
  end if;
  select status into v_status from public.games where id = upper(p_game_id) for share;
  if v_status is distinct from 'active' then
    return jsonb_build_object('status', 'game_not_active');
  end if;

  insert into public.anonymous_messages (
    game_id, player_id, text, reply_to_id, reply_to_text, message_type, media_url
  ) values (
    upper(p_game_id), p_player_id, p_text, p_reply_to_id, p_reply_to_text, p_message_type, p_media_url
  );
  return jsonb_build_object('status', 'inserted');
end;
$$;

create or replace function public.insert_codewords_message_if_active(
  p_game_id text,
  p_player_id uuid,
  p_team text,
  p_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if p_game_id is null or p_player_id is null then
    raise exception 'message insert: game id and player id are required';
  end if;
  select status into v_status from public.games where id = upper(p_game_id) for share;
  if v_status is distinct from 'active' then
    return jsonb_build_object('status', 'game_not_active');
  end if;

  insert into public.codewords_messages (game_id, player_id, team, text)
  values (upper(p_game_id), p_player_id, p_team, p_text);
  return jsonb_build_object('status', 'inserted');
end;
$$;

-- Wipe the per-session rows of a FINISHED session. `p_kind` is 'anonymous' (messages and bans, shared by
-- Anonymous Messages and the Secret Message Board) or 'codewords' (chat). Does nothing unless the game is still
-- finished with exactly the finished_at the caller's finish wrote: a replayed (Play Again) game is never touched.
create or replace function public.wipe_finished_session_rows(
  p_game_id text,
  p_finished_at timestamptz,
  p_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_finished_at timestamptz;
begin
  -- `NOT IN` is NULL (not true) for a NULL kind, so a NULL must be rejected explicitly or it would skip the
  -- check and reach the delete branch below.
  if p_game_id is null or p_finished_at is null or p_kind is null then
    raise exception 'wipe_finished_session_rows: game id, finished_at and kind are required';
  end if;
  if p_kind not in ('anonymous', 'codewords') then
    raise exception 'wipe_finished_session_rows: unknown kind %', p_kind;
  end if;

  select status, finished_at into v_status, v_finished_at
  from public.games where id = upper(p_game_id) for share;
  if v_status is distinct from 'finished' or v_finished_at is distinct from p_finished_at then
    return jsonb_build_object('status', 'not_current_session');
  end if;

  if p_kind = 'anonymous' then
    delete from public.anonymous_messages where game_id = upper(p_game_id);
    delete from public.anonymous_room_bans where game_id = upper(p_game_id);
  else
    delete from public.codewords_messages where game_id = upper(p_game_id);
  end if;
  return jsonb_build_object('status', 'wiped');
end;
$$;

-- SECURITY DEFINER functions in `public` are callable by PUBLIC by default (inherited by anon and
-- authenticated). These write and delete chat rows for any player, so only the service role may call them.
revoke execute on function public.insert_anonymous_message_if_active(text, uuid, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.insert_anonymous_message_if_active(text, uuid, text, uuid, text, text, text) to service_role;
revoke execute on function public.insert_codewords_message_if_active(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.insert_codewords_message_if_active(text, uuid, text, text) to service_role;
revoke execute on function public.wipe_finished_session_rows(text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.wipe_finished_session_rows(text, timestamptz, text) to service_role;
