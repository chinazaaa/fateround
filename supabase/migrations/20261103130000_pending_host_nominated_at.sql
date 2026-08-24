-- Track when a host nomination was posted so we can open the claim to any
-- remaining eligible player once the named nominee has ignored it for a bit.
--
-- Rationale: today the auto-nominate-on-host-leave path (and the explicit
-- transfer-host path) writes games.pending_host_player_id. If that nominee
-- ignores the HostNominationBanner, nobody else can claim — the game
-- stalls until the idle-reaper catches it (~30 minutes). Adding a timestamp
-- lets HostNominationBanner offer "Nobody accepted — Claim host" to other
-- eligible players after ~60 s, and lets /claim-host accept a claim from any
-- eligible remaining player once the nomination is that stale.
--
-- Nullable so old rows carry no timestamp; the client + server treat null
-- as "no open-claim window active" (only the named nominee can claim).

alter table games add column if not exists pending_host_nominated_at timestamptz;

comment on column games.pending_host_nominated_at is
  'Set alongside pending_host_player_id when a nomination is posted (explicit transfer or auto-nominate on host leave). NULL if no nomination is pending. When non-null and older than ~60s, /claim-host and HostNominationBanner treat the claim as open to any remaining eligible player, so an ignored invite doesn''t strand the game.';
