-- Store the user's country code (ISO 3166-1 alpha-2) from the CF-IPCountry header.
-- Captured on first profile creation; NULL for profiles created before this migration.

alter table profiles add column if not exists country text;

-- Column-level grant so anon/authenticated can read it (0122 made grants column-level).
grant select (country) on table profiles to anon, authenticated;
