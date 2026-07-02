-- Host transfer (claim-based).
--
-- A host is identified solely by possession of games.host_token (migration 0001). There
-- was previously no way to hand that off: losing the token meant losing host control.
--
-- This adds a *nomination* column. The current host nominates a player by id; that player
-- then claims host by presenting their OWN resume_token, at which point the API mints a
-- fresh host_token and returns it only to them (/api/games/[code]/claim-host). The
-- nomination itself carries no secret — it's just a player id — so it is safe to expose to
-- clients, which lets the nominee's UI show an "accept host" prompt.
--
-- host_token stays revoked from the public roles (migration 0122); only the new column is
-- readable by anon/authenticated.

alter table games add column if not exists pending_host_player_id text;

alter table games
  drop constraint if exists games_pending_host_player_fk;
alter table games
  add constraint games_pending_host_player_fk
  foreign key (pending_host_player_id) references players(id) on delete set null;

-- anon/authenticated hold COLUMN-level SELECT on games (migration 0122), so a new column
-- must be granted explicitly or client reads of it error (fails closed).
grant select (pending_host_player_id) on public.games to anon, authenticated;
