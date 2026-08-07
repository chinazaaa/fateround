-- Store the player's country code (ISO 3166-1 alpha-2) from the CF-IPCountry header.
-- Populated on join; NULL for players who joined before this migration or without Cloudflare.

alter table players add column if not exists country text;

-- Admin dashboard reads this for geographic breakdown.
-- Column-level grant so anon/authenticated can read it (0122 made grants column-level).
grant select (country) on table players to anon, authenticated;
