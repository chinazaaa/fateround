-- Enrich the extra_bot shop_purchase ref_id so the Coin History tab can render
-- "Extra bot · Whot TXVHTD" instead of "Extra bot · 675db8b9-e76e-4505-93f9-02ce20869204".
--
-- The Phase 3 RPC stored ref_id as 'extra_bot:<player_uuid>'. That's fine for the
-- database (the partial unique index on shop_purchase is scoped to durable kinds only,
-- so the consumable extra_bot rows are free-form) but it renders as raw UUID in the
-- ledger UI. Redefining the RPC to store 'extra_bot:<game_type>:<game_code>:<player_uuid>'
-- gives the client enough to render a human label without a per-row database round-trip.
--
-- Back-compat: old ledger rows (2-part ref_id) render as plain "Extra bot" in the client;
-- this migration only affects rows written from here on.
--
-- Same function body as 20261101120600_coins_shop_phase3.sql aside from the ref_id line
-- and the game_type lookup that feeds it. Kept as a full CREATE OR REPLACE so a rebuilt
-- environment picks up the definitive definition without needing to also apply the phase 3
-- version.

create or replace function add_extra_bot(
  p_game_id         text,
  p_profile_id      uuid,
  p_name            text,
  p_monopoly_token  text,
  p_expected_price  bigint,
  p_max_players     integer,
  p_extra_bot_cost  bigint default 50
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot_count    bigint;
  v_seat_count   bigint;
  v_price        bigint;
  v_player_id    uuid;
  v_new_balance  bigint;
  v_game_type    text;
begin
  if p_game_id is null or length(trim(p_game_id)) = 0 then
    raise exception 'add_extra_bot: game_id is required';
  end if;
  if p_max_players is null or p_max_players < 2 then
    raise exception 'add_extra_bot: max_players must be >= 2 (got %)', p_max_players;
  end if;

  perform pg_advisory_xact_lock(hashtext('add_extra_bot:' || p_game_id));

  -- Read game_type once so the ledger ref_id can carry it. Cheap: single-row
  -- primary key lookup, and we're already under the per-game advisory lock so
  -- the row can't change shape underneath us.
  select game_type into v_game_type from games where id = p_game_id;

  select count(*) into v_bot_count
    from players
   where game_id = p_game_id and is_bot = true;

  select count(*) into v_seat_count
    from players
   where game_id = p_game_id and spectator = false;
  if v_seat_count >= p_max_players then
    return jsonb_build_object(
      'outcome',    'seat_cap',
      'player_id',  null,
      'charged',    0,
      'new_balance', null,
      'price',      0
    );
  end if;
  if v_bot_count >= p_max_players - 1 then
    return jsonb_build_object(
      'outcome',    'bot_cap',
      'player_id',  null,
      'charged',    0,
      'new_balance', null,
      'price',      0
    );
  end if;

  v_price := case when v_bot_count >= 1 then p_extra_bot_cost else 0 end;

  if v_price <> coalesce(p_expected_price, 0) then
    return jsonb_build_object(
      'outcome',    'price_mismatch',
      'player_id',  null,
      'charged',    0,
      'new_balance', null,
      'price',      v_price
    );
  end if;

  insert into players (
    game_id, country, name, gender, identity_gender,
    participant_id, spectator, is_bot, monopoly_token
  ) values (
    p_game_id, null, p_name, 'both', null,
    null, false, true, p_monopoly_token
  ) returning id into v_player_id;

  if v_price > 0 then
    if p_profile_id is null then
      raise exception using errcode = 'P0001',
        message = 'needs_profile:' || v_price::text;
    end if;
    -- ref_id now carries `extra_bot:<game_type>:<game_code>:<player_uuid>` so
    -- the ledger row renders as "Extra bot · <GameName> <code>" without any
    -- extra lookup on the client. Falls back gracefully for older rows in the
    -- client parser (see src/components/coins/CoinHistoryTab.tsx).
    v_new_balance := spend_coins(
      p_profile_id,
      v_price,
      'shop_purchase',
      'extra_bot:' || coalesce(v_game_type, 'unknown') || ':' || p_game_id || ':' || v_player_id::text
    );
    if v_new_balance is null then
      raise exception using errcode = 'P0001',
        message = 'insufficient_funds:' || v_price::text;
    end if;
  end if;

  return jsonb_build_object(
    'outcome',     'ok',
    'player_id',   v_player_id,
    'charged',     v_price,
    'new_balance', v_new_balance,
    'price',       v_price
  );
exception when raise_exception then
  if sqlerrm like 'insufficient_funds:%' then
    return jsonb_build_object(
      'outcome',     'insufficient_funds',
      'player_id',   null,
      'charged',     0,
      'new_balance', null,
      'price',       v_price
    );
  end if;
  if sqlerrm like 'needs_profile:%' then
    return jsonb_build_object(
      'outcome',     'needs_profile',
      'player_id',   null,
      'charged',     0,
      'new_balance', null,
      'price',       v_price
    );
  end if;
  raise;
end;
$$;

revoke all on function add_extra_bot(text, uuid, text, text, bigint, integer, bigint) from public;
grant execute on function add_extra_bot(text, uuid, text, text, bigint, integer, bigint) to authenticated, service_role;
