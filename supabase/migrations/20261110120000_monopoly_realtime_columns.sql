-- Stop Realtime shipping the Monopoly card decks.
--
-- `MONOPOLY_BOARD_SELECT` (web + mobile) no longer requests chance_deck, community_deck,
-- chance_discard or community_discard — see the PR that trimmed it. But a client select only
-- constrains REST. Both `useGameTableSync` subscriptions listen to `monopoly_boards` through
-- `postgres_changes`, and supabase-js has no column projection there: its `filter` option is a
-- ROW filter (`game_id=eq.X`). So every board UPDATE still pushed all four decks to every
-- connected client.
--
-- Those arrays are the shuffled draw order, so a client holding them knows every upcoming
-- Chance and Community Chest card. They are also the largest columns on the row, and Monopoly
-- writes the board on every roll — this is a live game's hottest realtime path.
--
-- WHY A PUBLICATION COLUMN LIST AND NOT A REVOKE. The usual pattern in this repo is to revoke
-- the column from anon, which closes REST and Realtime together because Realtime honours
-- column-level grants. That is the stronger fix and it should still happen. It cannot happen
-- yet: installed mobile builds still SELECT these columns, and PostgREST fails the WHOLE select
-- with 42501 when any requested column is revoked, so a revoke would kill Monopoly on every
-- installed build until a store release (OTA is not wired — no `updates` block in app.json).
--
-- A publication column list needs no grant change, so no client breaks. It is the part of the
-- fix that can ship today.
--
-- ⚠️ THIS LIST MUST STAY IN SYNC WITH THE CLIENT SELECT. Realtime only delivers the columns
-- named here; a column added to the table and to MONOPOLY_BOARD_SELECT but NOT added here
-- arrives as undefined in every payload, and `isCompleteMonopolyBoardRow` (which checks the
-- NOT-NULL keys) will reject the delta and force a full reload every time. The list below is
-- every column of monopoly_boards EXCEPT the four decks.
--
-- Requires Postgres 15+ for per-column publication lists. Supabase is on 15+.

do $$
begin
  alter publication supabase_realtime set table public.monopoly_boards (
    id,
    game_id,
    board_size,
    turn_order,
    current_turn_index,
    phase,
    last_dice,
    consecutive_doubles,
    property_owners,
    property_buildings,
    mortgaged_properties,
    houses_in_bank,
    hotels_in_bank,
    auction_state,
    pending_trade,
    pending_debt,
    pending_space,
    status_message,
    last_card_event,
    last_rent_event,
    last_cash_event,
    last_trade_event,
    loans,
    turn_deadline_at,
    winner_player_id,
    created_at,
    updated_at
  );
exception
  when undefined_object then
    -- Table not in the publication on this database (a fresh local stack that has not run the
    -- ADD TABLE yet). Nothing to narrow; the ADD in 0045 will include every column, which is the
    -- pre-existing behaviour rather than a regression.
    raise notice 'monopoly_boards not in supabase_realtime — skipping column narrowing';
end $$;

-- ── ROLLBACK (drafted, not run) ──────────────────────────────────────────────
-- Restores the full-row publication:
--   alter publication supabase_realtime set table public.monopoly_boards;
