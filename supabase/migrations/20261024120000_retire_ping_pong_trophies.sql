-- Retire ping_pong trophies from the REAL trophy catalog.
--
-- The remove_ping_pong migration (20261023120000) only cleaned a phantom `system_trophies`
-- table that no migration creates and nothing references — so the actual ping_pong trophy
-- definitions in `trophies` (created by 20260804000000_trophies_streaks) were never touched
-- on any environment.
--
-- We RETIRE rather than DELETE: `player_trophies.trophy_id` references `trophies(id)`
-- ON DELETE RESTRICT *by design* — a catalog row must never be deleted out from under a
-- player who earned it (deleting would also desync the cached profiles.trophy_points /
-- trophy_level aggregates). `is_active = false` is the documented way to take a trophy out
-- of circulation. No-op where no ping_pong trophies were ever seeded.
--
-- Lives in its own migration (not folded into 20261023120000) so it also runs on
-- environments that already applied that version.

do $$ begin
  if to_regclass('public.trophies') is not null then
    update trophies set is_active = false where game_type = 'ping_pong';
  end if;
end $$;
