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
  -- DROP then ADD, never `SET TABLE`.
  --
  -- `ALTER PUBLICATION ... SET TABLE` replaces the publication's ENTIRE table list. This
  -- publication carries 84 tables; using SET here would have silently dropped the other 83 and
  -- killed realtime across nearly every game in the app. `DROP TABLE` + `ADD TABLE (cols)`
  -- touches only monopoly_boards. (Caught in review — the first version of this migration had
  -- exactly that bug, in both the statement and its rollback.)
  --
  -- Both statements are guarded so this is safe on a database where the table is not published
  -- yet (a fresh local stack that has not reached 0045), and idempotent on re-run.
  if exists (select 1 from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'monopoly_boards') then

    if exists (select 1 from pg_publication_rel pr
                 join pg_publication p on p.oid = pr.prpubid
                 join pg_class c on c.oid = pr.prrelid
                 join pg_namespace n on n.oid = c.relnamespace
                where p.pubname = 'supabase_realtime'
                  and n.nspname = 'public'
                  and c.relname = 'monopoly_boards') then
      alter publication supabase_realtime drop table public.monopoly_boards;
    end if;

    alter publication supabase_realtime add table public.monopoly_boards (
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
  else
    raise notice 'monopoly_boards not present — skipping realtime column narrowing';
  end if;
end $$;

-- ── ROLLBACK (drafted, not run) ──────────────────────────────────────────────
-- Restores the full-row publication:
--   alter publication supabase_realtime drop table public.monopoly_boards;
--   alter publication supabase_realtime add  table public.monopoly_boards;
-- (DROP + ADD, NOT `set table` — that would replace the publication's whole table list.)

-- ── CORRECTION (added later; NO SQL CHANGED — this migration is already applied) ─────────
--
-- The header above is WRONG about the mechanism. A publication column list does NOT narrow
-- `postgres_changes` payloads.
--
-- Supabase Realtime decodes the WAL through wal2json. wal2json reads `pg_publication` only
-- to decide (a) which tables to stream (`add-tables`) and (b) which actions to emit
-- (`pubinsert` / `pubupdate` / `pubdelete`). It never reads `pg_publication_rel.prattrs` —
-- the per-column list — so the columns named below have no effect on what is decoded, and
-- every subscriber still receives the full row including the four decks.
--
-- The ONLY thing that narrows a postgres_changes payload is a COLUMN-LEVEL REVOKE: Realtime
-- filters columns in `realtime.apply_rls` via `has_column_privilege(...)`, per subscriber.
-- That is what the header calls "the stronger fix"; it is in fact the only fix.
--
-- This migration is nonetheless HARMLESS and is left in place: the four deck columns are
-- separately protected from anon by a column-level revoke elsewhere, so the decks are not
-- actually reaching browser clients. But do not copy this file as a pattern, and do not
-- rely on a publication column list to hide anything.
--
-- Consequence for the ⚠️ warning above: it does not apply either. Adding a column to
-- monopoly_boards without adding it to the list below will NOT make it arrive as undefined
-- in payloads — the publication list is inert. Column-level grants are what matter.
