-- Rummy: session compare-and-swap + hand writes in ONE transaction.
--
-- The app used to win an optimistic CAS on rummy_sessions.updated_at and then update
-- rummy_player_hands in a separate request. If the hand write failed after the claim, a discard
-- left the turn advanced with the card both on the discard pile and still in the hand, and a
-- go-out left the session finished with the winning hand untouched (and the retry rejected by the
-- 'Game is finished' guard). This function does the CAS and every hand write inside one implicit
-- transaction: either everything lands or nothing does (any exception rolls the session update
-- back too). Same shape as public.mahjong_apply_transition (20261201140000).
--
-- p_session_patch: jsonb object of rummy_sessions columns to set (updated_at is always advanced).
-- p_hand_writes:   jsonb array of {"id": <rummy_player_hands.id>, "patch": {<column>: <value>, ...}}.
-- Only real, writable columns are accepted: id / game_id / created_at (and updated_at on the session,
-- player_id on hands, generated columns such as draw_count / discard_count) are never patchable.
-- Values round-trip through jsonb_populate_record so they keep the column's type; a key present
-- with JSON null sets SQL NULL.
-- Returns {"status":"conflict"} (nothing written) or {"status":"ok","updated_at":<timestamptz text>}.
create or replace function public.rummy_apply_transition(
  p_game_id text,
  p_expected_updated_at timestamptz,
  p_session_patch jsonb,
  p_hand_writes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_cols text[];
  v_hand_cols text[];
  v_keys text[];
  v_bad text[];
  v_set text;
  v_new_updated_at timestamptz;
  v_write jsonb;
  v_id uuid;
  v_patch jsonb;
  v_count integer;
begin
  p_session_patch := coalesce(p_session_patch, '{}'::jsonb);
  p_hand_writes := coalesce(p_hand_writes, '[]'::jsonb);

  if jsonb_typeof(p_session_patch) is distinct from 'object' then
    raise exception 'rummy_apply_transition: session patch must be a json object';
  end if;
  if jsonb_typeof(p_hand_writes) is distinct from 'array' then
    raise exception 'rummy_apply_transition: hand writes must be a json array';
  end if;

  select coalesce(array_agg(attname::text), '{}') into v_session_cols
  from pg_attribute
  where attrelid = 'public.rummy_sessions'::regclass and attnum > 0 and not attisdropped
    and attgenerated = ''
    and attname not in ('id', 'game_id', 'created_at', 'updated_at');

  select coalesce(array_agg(attname::text), '{}') into v_hand_cols
  from pg_attribute
  where attrelid = 'public.rummy_player_hands'::regclass and attnum > 0 and not attisdropped
    and attgenerated = ''
    and attname not in ('id', 'game_id', 'player_id', 'created_at');

  -- Validate every column name up front, before anything is written.
  select array_agg(k) into v_bad
  from jsonb_object_keys(p_session_patch) as k
  where k <> all (v_session_cols);
  if v_bad is not null then
    raise exception 'rummy_apply_transition: invalid session column(s): %', array_to_string(v_bad, ', ');
  end if;

  for v_write in select * from jsonb_array_elements(p_hand_writes) loop
    if jsonb_typeof(v_write) is distinct from 'object'
       or jsonb_typeof(v_write -> 'patch') is distinct from 'object' then
      raise exception 'rummy_apply_transition: each hand write must be {id, patch}';
    end if;
    select array_agg(k) into v_bad
    from jsonb_object_keys(v_write -> 'patch') as k
    where k <> all (v_hand_cols);
    if v_bad is not null then
      raise exception 'rummy_apply_transition: invalid hand column(s): %', array_to_string(v_bad, ', ');
    end if;
  end loop;

  -- Session compare-and-swap.
  select array_agg(k) into v_keys from jsonb_object_keys(p_session_patch) as k;
  v_set := coalesce(
    (select string_agg(format('%I = r.%I', k, k), ', ') from unnest(v_keys) as k),
    ''
  );
  if v_set <> '' then
    v_set := v_set || ', ';
  end if;

  execute format(
    'update public.rummy_sessions as t set %s updated_at = now() '
    'from jsonb_populate_record(null::public.rummy_sessions, $1) as r '
    'where t.game_id = $2 and t.updated_at = $3 '
    'returning t.updated_at',
    v_set
  )
  into v_new_updated_at
  using p_session_patch, p_game_id, p_expected_updated_at;

  if v_new_updated_at is null then
    return jsonb_build_object('status', 'conflict');
  end if;

  -- Hand writes, same transaction. game_id is pinned so a write can never touch another game.
  for v_write in select * from jsonb_array_elements(p_hand_writes) loop
    v_id := (v_write ->> 'id')::uuid;
    v_patch := v_write -> 'patch';

    select array_agg(k) into v_keys from jsonb_object_keys(v_patch) as k;
    if v_keys is null then
      continue;
    end if;
    v_set := (select string_agg(format('%I = r.%I', k, k), ', ') from unnest(v_keys) as k);

    execute format(
      'update public.rummy_player_hands as t set %s '
      'from jsonb_populate_record(null::public.rummy_player_hands, $1) as r '
      'where t.id = $2 and t.game_id = $3',
      v_set
    )
    using v_patch, v_id, p_game_id;

    get diagnostics v_count = row_count;
    -- MUTANT: a write to a missing hand is silently ignored
  end loop;

  return jsonb_build_object('status', 'ok', 'updated_at', v_new_updated_at);
end;
$$;

-- SECURITY DEFINER functions in `public` are callable by PUBLIC by default (inherited by anon and
-- authenticated). This writes hidden hands and piles (see 20261128120000_sec_rummy_hide_hands_and_piles),
-- so only the service role may call it.
revoke execute on function public.rummy_apply_transition(text, timestamptz, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.rummy_apply_transition(text, timestamptz, jsonb, jsonb) to service_role;

-- The session `updated_at` is the optimistic-concurrency version, so every write must move it to a
-- value that has never been used before. The app stamps it with a millisecond timestamp and the RPC
-- above with now(); two writes in the same millisecond could repeat a value and let a stale
-- compare-and-swap succeed. This trigger overrides the supplied value with one strictly greater than
-- the previous version, at microsecond precision, for every update of rummy_sessions.
create or replace function public.rummy_sessions_bump_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;

drop trigger if exists rummy_sessions_bump_version on public.rummy_sessions;
create trigger rummy_sessions_bump_version
  before update on public.rummy_sessions
  for each row execute function public.rummy_sessions_bump_version();
