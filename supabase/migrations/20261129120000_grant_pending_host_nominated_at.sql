-- Grant client reads of games.pending_host_nominated_at.
--
-- anon/authenticated hold COLUMN-level SELECT on games (migration 0122), so every new column
-- must be granted explicitly or any client query that selects it fails closed with 401
-- ("permission denied"). 20261103130000 added pending_host_nominated_at without this grant, so
-- HostNominationBanner (web), which selects `pending_host_player_id, pending_host_nominated_at`,
-- has been erroring for every player since it shipped, so a pending host nomination was never
-- shown. (Mobile selects only pending_host_player_id, so it was unaffected.)
--
-- Additive and idempotent. The timestamp is not sensitive: it sits next to
-- pending_host_player_id, which is already granted (20260702150000).

grant select (pending_host_nominated_at) on public.games to anon, authenticated;
