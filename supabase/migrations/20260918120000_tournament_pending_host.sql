-- Claim-based host transfer for tournaments (mirror of games.pending_host_player_id).
-- The current host nominates a tournament_players row into this column; the nominee
-- claims host on their own device by proving their resume token, which atomically
-- rotates tournaments.host_token to a fresh value and null-outs the nomination.
-- The outgoing host's token stops matching immediately, so their host UI drops on
-- its next auth check — no simultaneous-host confusion.
alter table tournaments add column if not exists pending_host_player_id uuid;
