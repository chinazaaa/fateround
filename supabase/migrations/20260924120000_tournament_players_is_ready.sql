-- Explicit "I'm ready" flag on tournament_players. Only meaningful for
-- scheduled events (a right-now tournament's players are ready by virtue of
-- being present when the host taps Start), but stored on every row so the
-- host UI can render a consistent "ready count" without a null-check dance.
--
-- Reason: a host schedules a tournament for 8pm; a player registers a week
-- ago and forgets. When 8pm hits, the host doesn't want to yank the
-- forgotten player into a live game — the phone might be face-down on a
-- couch somewhere. Requiring an explicit ready click gives the host a
-- signal of who's actually present + attentive vs. still pre-registered
-- from days ago.
--
-- Defaults to false so an existing player's row stays "not ready" until they
-- opt in on the current lobby session. Sticky: once flipped true it stays
-- true across page reloads for the tournament's duration (the tournament is
-- short-lived; no need to reset between games in-flight).
alter table tournament_players
  add column if not exists is_ready boolean not null default false;

-- Grant read to anon/authenticated. The host + projector display this via
-- the public tournament GET, and the 20260803120000 lockdown revoked the
-- table-level SELECT so new columns default to no access — grant explicitly.
grant select (is_ready) on public.tournament_players to anon;
grant select (is_ready) on public.tournament_players to authenticated;
