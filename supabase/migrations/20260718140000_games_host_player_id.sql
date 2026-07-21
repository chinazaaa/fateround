-- Public host identity for the roster drawer.
--
-- Today nothing links a game's host to a player row that other clients can read:
-- host_token is secret (server-only, migration 0122) and pending_host_player_id is
-- only for host transfers. So other players can't tell which roster row is the host,
-- and a "host only" host isn't a player row at all.
--
-- games.host_player_id records which player row is the host — non-secret, just a
-- player id (exactly like pending_host_player_id). The roster drawer badges the row
-- whose id matches it with a HOST pill, on every client.
--
-- After applying this migration, two more edits activate the cross-client badge:
--   1. add `host_player_id` to GAME_SELECT (src/lib/supabase-selects.ts) so clients read it;
--   2. set games.host_player_id server-side when the host seats (host+play join and the
--      "host only" spectator seat) and on host transfer/claim; clear it (or repoint it)
--      when the host leaves their seat.

alter table public.games
  add column if not exists host_player_id uuid references public.players(id) on delete set null;

-- Column-level SELECT grant: migration 0122 made games grants column-level, so every
-- new client-readable games column needs its own grant or reads fail with 42501.
grant select (host_player_id) on public.games to anon, authenticated;
