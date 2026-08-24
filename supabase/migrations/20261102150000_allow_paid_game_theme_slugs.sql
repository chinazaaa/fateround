-- Allow per-game paid theme slugs on `games.theme`.
--
-- Phase 3 (20261101120600_coins_shop_phase3.sql) seeded the six paid
-- per-game visual reskins into `game_themes`:
--   whot-neon, whot-naija,
--   ludo-wooden, ludo-naija,
--   sudoku-minimalist, sudoku-newsprint
--
-- The create-game path (`src/app/api/games/route.ts`) writes the picked
-- slug into `games.theme` after the entitlement check. But
-- `games_theme_check` (last touched by
-- 20261101120800_estate_kings_christmas_edition.sql) still only allows
-- the legacy site-wide values plus the Monopoly edition names. Attempting
-- to insert `theme='whot-neon'` errors 23514 at the DB, and the client
-- sees "something went wrong" on create. The workaround is to fall back
-- to `default`, which is what this fix removes the need for.
--
-- Adds the six paid slugs to the whitelist. Superset of the previous
-- list, so existing rows are unaffected. `not valid` + `validate`
-- follows the pattern of the previous constraint bumps to avoid a table
-- scan behind an ACCESS EXCLUSIVE lock on hot production data.

alter table games drop constraint if exists games_theme_check;
alter table games add constraint games_theme_check check (theme = any (array[
  'default'::text,
  'dark'::text,
  'neon'::text,
  'retro'::text,
  'elegant'::text,
  'tropical'::text,
  'pirate'::text,
  'arctic'::text,
  'naija'::text,
  'america'::text,
  'christmas'::text,
  'grass_court'::text,
  'ping_pong'::text,
  -- Paid per-game reskins (game_themes seed).
  'whot-neon'::text,
  'whot-naija'::text,
  'ludo-wooden'::text,
  'ludo-naija'::text,
  'sudoku-minimalist'::text,
  'sudoku-newsprint'::text
])) not valid;

alter table games validate constraint games_theme_check;
