-- Generic atomic board-claim + player-state writer for Monopoly.
--
-- Complements monopoly_settle_payment (rent/debt settlement): every other
-- handler that moves cash — card effects paying/collecting from other
-- players, trades, auctions, bankruptcy transfers, buys, mortgages — used the
-- same claim-then-write pattern: CAS the board row, then issue separate
-- absolute cash UPDATEs computed from reads taken before the claim, with
-- errors unchecked. Any failure or concurrently interleaved write in that
-- window silently lost money.
--
-- This function applies the board patch (the optimistic-concurrency claim)
-- and every per-player write in ONE transaction. A key present in a patch is
-- applied (JSON null → SQL NULL); an absent key keeps the current value.
-- Cash and Get Out of Jail cards can be adjusted by delta (`cash_delta`,
-- `cards_delta`) so transfers commute and can never be double-applied; a
-- delta that would drive a balance negative raises INSUFFICIENT_FUNDS and
-- rolls back everything, including the claim.
CREATE OR REPLACE FUNCTION monopoly_claim_and_apply(
  p_game_id text,
  p_expected_updated_at timestamptz,
  p_board_patch jsonb,
  p_player_patches jsonb DEFAULT '[]'::jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
-- pg_temp last so this SECURITY DEFINER function can't be hijacked via a
-- temp-schema object shadowing an unqualified name.
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claimed integer;
  v_patch   jsonb;
  v_cash    integer;
  v_cards   integer;
  v_key     text;
BEGIN
  -- Reject unknown keys up front: a patch field this function does not apply
  -- must fail loudly, not be silently dropped (a dropped field would desync
  -- the board while still reporting success to the caller).
  FOR v_key IN SELECT jsonb_object_keys(coalesce(p_board_patch, '{}'::jsonb)) LOOP
    IF v_key NOT IN (
      'phase', 'last_dice', 'consecutive_doubles', 'current_turn_index',
      'property_owners', 'property_buildings', 'mortgaged_properties',
      'houses_in_bank', 'hotels_in_bank',
      'chance_deck', 'community_deck', 'chance_discard', 'community_discard',
      'auction_state', 'pending_trade', 'pending_debt', 'pending_space',
      'status_message', 'last_card_event', 'last_rent_event',
      'last_cash_event', 'last_trade_event', 'turn_deadline_at', 'winner_player_id'
    ) THEN
      RAISE EXCEPTION 'UNKNOWN_BOARD_COLUMN: %', v_key;
    END IF;
  END LOOP;
  FOR v_key IN
    SELECT DISTINCT k FROM jsonb_array_elements(coalesce(p_player_patches, '[]'::jsonb)) p,
      LATERAL jsonb_object_keys(p.value) k
  LOOP
    IF v_key NOT IN (
      'player_id', 'cash', 'cash_delta', 'get_out_of_jail_free', 'cards_delta',
      'position', 'in_jail', 'jail_turns', 'passed_go_once', 'bankrupt'
    ) THEN
      RAISE EXCEPTION 'UNKNOWN_PLAYER_COLUMN: %', v_key;
    END IF;
  END LOOP;

  UPDATE monopoly_boards b SET
    phase               = CASE WHEN p_board_patch ? 'phase'               THEN p_board_patch->>'phase'                                    ELSE b.phase               END,
    last_dice           = CASE WHEN p_board_patch ? 'last_dice'           THEN NULLIF(p_board_patch->'last_dice', 'null'::jsonb)          ELSE b.last_dice           END,
    consecutive_doubles = CASE WHEN p_board_patch ? 'consecutive_doubles' THEN (p_board_patch->>'consecutive_doubles')::integer           ELSE b.consecutive_doubles END,
    current_turn_index  = CASE WHEN p_board_patch ? 'current_turn_index'  THEN (p_board_patch->>'current_turn_index')::integer            ELSE b.current_turn_index  END,
    property_owners     = CASE WHEN p_board_patch ? 'property_owners'     THEN p_board_patch->'property_owners'                           ELSE b.property_owners     END,
    property_buildings  = CASE WHEN p_board_patch ? 'property_buildings'  THEN p_board_patch->'property_buildings'                        ELSE b.property_buildings  END,
    mortgaged_properties = CASE WHEN p_board_patch ? 'mortgaged_properties' THEN p_board_patch->'mortgaged_properties'                    ELSE b.mortgaged_properties END,
    houses_in_bank      = CASE WHEN p_board_patch ? 'houses_in_bank'      THEN (p_board_patch->>'houses_in_bank')::integer                ELSE b.houses_in_bank      END,
    hotels_in_bank      = CASE WHEN p_board_patch ? 'hotels_in_bank'      THEN (p_board_patch->>'hotels_in_bank')::integer                ELSE b.hotels_in_bank      END,
    chance_deck         = CASE WHEN p_board_patch ? 'chance_deck'         THEN p_board_patch->'chance_deck'                               ELSE b.chance_deck         END,
    community_deck      = CASE WHEN p_board_patch ? 'community_deck'      THEN p_board_patch->'community_deck'                            ELSE b.community_deck      END,
    chance_discard      = CASE WHEN p_board_patch ? 'chance_discard'      THEN p_board_patch->'chance_discard'                            ELSE b.chance_discard      END,
    community_discard   = CASE WHEN p_board_patch ? 'community_discard'   THEN p_board_patch->'community_discard'                         ELSE b.community_discard   END,
    auction_state       = CASE WHEN p_board_patch ? 'auction_state'       THEN NULLIF(p_board_patch->'auction_state', 'null'::jsonb)      ELSE b.auction_state       END,
    pending_trade       = CASE WHEN p_board_patch ? 'pending_trade'       THEN NULLIF(p_board_patch->'pending_trade', 'null'::jsonb)      ELSE b.pending_trade       END,
    pending_debt        = CASE WHEN p_board_patch ? 'pending_debt'        THEN NULLIF(p_board_patch->'pending_debt', 'null'::jsonb)       ELSE b.pending_debt        END,
    pending_space       = CASE WHEN p_board_patch ? 'pending_space'       THEN (p_board_patch->>'pending_space')::integer                 ELSE b.pending_space       END,
    status_message      = CASE WHEN p_board_patch ? 'status_message'      THEN p_board_patch->>'status_message'                           ELSE b.status_message      END,
    last_card_event     = CASE WHEN p_board_patch ? 'last_card_event'     THEN NULLIF(p_board_patch->'last_card_event', 'null'::jsonb)    ELSE b.last_card_event     END,
    last_rent_event     = CASE WHEN p_board_patch ? 'last_rent_event'     THEN NULLIF(p_board_patch->'last_rent_event', 'null'::jsonb)    ELSE b.last_rent_event     END,
    last_cash_event     = CASE WHEN p_board_patch ? 'last_cash_event'     THEN NULLIF(p_board_patch->'last_cash_event', 'null'::jsonb)    ELSE b.last_cash_event     END,
    last_trade_event    = CASE WHEN p_board_patch ? 'last_trade_event'    THEN NULLIF(p_board_patch->'last_trade_event', 'null'::jsonb)   ELSE b.last_trade_event    END,
    turn_deadline_at    = CASE WHEN p_board_patch ? 'turn_deadline_at'    THEN (p_board_patch->>'turn_deadline_at')::timestamptz          ELSE b.turn_deadline_at    END,
    winner_player_id    = CASE WHEN p_board_patch ? 'winner_player_id'    THEN (p_board_patch->>'winner_player_id')::uuid                 ELSE b.winner_player_id    END,
    updated_at          = now()
  WHERE b.game_id = p_game_id AND b.updated_at = p_expected_updated_at;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN
    RETURN false;
  END IF;

  -- The board claim above serializes writers, so applying the player patches
  -- inside the same transaction cannot deadlock or interleave with another
  -- handler's reads-then-writes.
  FOR v_patch IN SELECT jsonb_array_elements(coalesce(p_player_patches, '[]'::jsonb)) LOOP
    -- A JSON null for a balance field would resolve to SQL NULL, which the
    -- `< 0` guards below can't catch (NULL < 0 is NULL, not true), corrupting the
    -- balance. Reject it explicitly before writing anything.
    IF (v_patch ? 'cash' AND v_patch->'cash' = 'null'::jsonb)
       OR (v_patch ? 'get_out_of_jail_free' AND v_patch->'get_out_of_jail_free' = 'null'::jsonb) THEN
      RAISE EXCEPTION 'INVALID_PLAYER_PATCH';
    END IF;

    UPDATE monopoly_player_state s SET
      cash = (CASE WHEN v_patch ? 'cash' THEN (v_patch->>'cash')::integer ELSE s.cash END)
             + COALESCE((v_patch->>'cash_delta')::integer, 0),
      get_out_of_jail_free = (CASE WHEN v_patch ? 'get_out_of_jail_free' THEN (v_patch->>'get_out_of_jail_free')::integer ELSE s.get_out_of_jail_free END)
             + COALESCE((v_patch->>'cards_delta')::integer, 0),
      position       = CASE WHEN v_patch ? 'position'       THEN (v_patch->>'position')::integer       ELSE s.position       END,
      in_jail        = CASE WHEN v_patch ? 'in_jail'        THEN (v_patch->>'in_jail')::boolean        ELSE s.in_jail        END,
      jail_turns     = CASE WHEN v_patch ? 'jail_turns'     THEN (v_patch->>'jail_turns')::integer     ELSE s.jail_turns     END,
      passed_go_once = CASE WHEN v_patch ? 'passed_go_once' THEN (v_patch->>'passed_go_once')::boolean ELSE s.passed_go_once END,
      bankrupt       = CASE WHEN v_patch ? 'bankrupt'       THEN (v_patch->>'bankrupt')::boolean       ELSE s.bankrupt       END
    WHERE s.game_id = p_game_id AND s.player_id = (v_patch->>'player_id')::uuid
    RETURNING s.cash, s.get_out_of_jail_free INTO v_cash, v_cards;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;
    IF v_cash < 0 OR v_cards < 0 THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS';
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

-- Only the server (service_role, via the admin client) ever calls this mutating
-- SECURITY DEFINER function — never the browser. Strip the default PUBLIC EXECUTE
-- so it can't be invoked with an anon/authenticated key (matches the sudoku RPCs).
REVOKE EXECUTE ON FUNCTION monopoly_claim_and_apply(text, timestamptz, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
