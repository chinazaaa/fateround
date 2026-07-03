-- Per-player secret identity for tournaments — the player's cross-device "code".
--
-- Tournament players were identified only by their (unique) display name, and the
-- game rooms trust whoever arrives with that name. That let anyone who knew a name
-- claim that player's seat, and left a real player locked out ("name already taken")
-- whenever they lost their local session and came back.
--
-- Give each player a short secret code at join time (like the per-game resume_token).
-- It's stored here — a table only the service role can read (RLS on, no policy,
-- privileges revoked) — so it never reaches the browser except in the join/resume
-- response that hands it to its owner, and is never exposed by the anon-readable
-- tournament_players table or its realtime feed. The game-join and resume routes
-- (service role) verify the code to seat / reclaim / restore a player, and the player
-- can read it out or scan it to continue on another device.

create table if not exists tournament_player_tokens (
  player_id uuid primary key references tournament_players(id) on delete cascade,
  tournament_id text not null references tournaments(id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now()
);

-- Unique per tournament so lookups by (tournament, code) resolve to one player.
create unique index if not exists idx_tournament_player_tokens_unique
  on tournament_player_tokens (tournament_id, token);

alter table tournament_player_tokens enable row level security;
-- No policy + revoked privileges: anon/authenticated get nothing; only the service
-- role (which bypasses RLS) can read or write codes.
revoke all on tournament_player_tokens from anon, authenticated;

-- Generate a short, readable code unique within a tournament. Charset drops the
-- confusable I/O/0/1 (same as the per-game resume_token); 8 chars keeps it easy to
-- read aloud while giving ~40 bits — plenty for a casual tournament seat.
create or replace function gen_tournament_player_token(p_tournament_id text)
returns text language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  attempts int := 0;
begin
  loop
    candidate := '';
    for i in 1..8 loop
      candidate := candidate || substr(chars, floor(random() * length(chars))::int + 1, 1);
    end loop;
    if not exists (
      select 1 from tournament_player_tokens
      where tournament_id = p_tournament_id and token = candidate
    ) then
      return candidate;
    end if;
    attempts := attempts + 1;
    if attempts > 30 then raise exception 'Could not generate tournament player token'; end if;
  end loop;
end; $$;

-- Backfill a code for every existing player (one row at a time, so each generation
-- sees the codes minted just before it) so in-flight tournaments keep working.
do $$
declare r record;
begin
  for r in
    select id, tournament_id from tournament_players
    where id not in (select player_id from tournament_player_tokens)
  loop
    insert into tournament_player_tokens (player_id, tournament_id, token)
      values (r.id, r.tournament_id, gen_tournament_player_token(r.tournament_id));
  end loop;
end $$;

-- Re-declare the atomic join to also mint + return the player's code. SECURITY
-- DEFINER so it can write the service-role-only tokens table; search_path pinned for
-- safety. Behaviour is otherwise identical to the prior version.
create or replace function join_tournament(p_tournament_id text, p_player_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_max integer;
  v_elim jsonb;
  v_count integer;
  v_existing tournament_players%rowtype;
  v_lives integer;
  v_player tournament_players%rowtype;
  v_token text;
begin
  select status, max_players, elimination_config into v_status, v_max, v_elim
    from tournaments where id = p_tournament_id for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if v_status <> 'waiting' then
    return jsonb_build_object('error', case when v_status = 'finished' then 'ended' else 'started' end);
  end if;

  select * into v_existing from tournament_players
    where tournament_id = p_tournament_id and lower(player_name) = lower(p_player_name) limit 1;
  if found then
    if v_existing.is_eliminated then return jsonb_build_object('error', 'eliminated'); end if;
    return jsonb_build_object('error', 'name_taken');
  end if;

  if v_max is not null then
    select count(*) into v_count from tournament_players where tournament_id = p_tournament_id;
    if v_count >= v_max then return jsonb_build_object('error', 'full'); end if;
  end if;

  v_lives := case when v_elim ->> 'mode' = 'lives' then (v_elim ->> 'startingLives')::int else null end;

  insert into tournament_players (tournament_id, player_name, lives_remaining)
    values (p_tournament_id, p_player_name, v_lives) returning * into v_player;

  v_token := gen_tournament_player_token(p_tournament_id);
  insert into tournament_player_tokens (player_id, tournament_id, token)
    values (v_player.id, p_tournament_id, v_token);

  return jsonb_build_object('player', to_jsonb(v_player), 'token', v_token);
end; $$;

grant execute on function join_tournament(text, text) to anon, authenticated, service_role;
