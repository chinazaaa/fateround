-- Coins & Shop — Phase 4 (Estate Kings — USA edition, headline paid drop).
--
-- Reference:
--   docs/coins-and-shop-plan.md § "Launch sequencing" → Phase 4
--   docs/estate-kings-america-edition.md — content spec
--
-- Adds:
--   * games.edition_slug — the room-scoped edition the host picked. NULL
--     means "use the existing theme-based default" (backward compatible
--     for every game already in the wild). Estate Kings rooms created
--     from Phase 4 onward write this column alongside games.theme so the
--     engine has a single, unambiguous edition pointer.
--   * 'america' added to games_theme_check so the theme column can carry
--     the USA edition too (the picker writes both fields in lockstep;
--     see src/app/api/games/route.ts).
--   * Seed rows in game_editions:
--       - 4 grandfathered rows for the London / Naija / Pirate / Arctic
--         editions that already ship inside the app (price 0). The
--         plan's rule "everything already shipped stays free" applies:
--         these existed in code before Phase 1, so their game_editions
--         row is a catalog placeholder for the shop / host picker to
--         key off. Content is minimal — the actual board data still
--         lives in code (monopoly-themes.ts) — but the row's presence
--         is what lets the picker enumerate every monopoly edition
--         uniformly.
--       - The 'america' row itself: price_coins = 800, full content
--         JSONB from docs/estate-kings-america-edition.md.
--
-- purchase_item(kind='edition', slug='america', price=800) already works
-- via the RPC shipped in Phase 3 (20261101120600_coins_shop_phase3.sql).
-- Ownership lands in profile_owned_editions; the host picker (web +
-- mobile) reads that set to gate which editions a host can select.

-- ---------------------------------------------------------------------------
-- games.edition_slug
-- ---------------------------------------------------------------------------
alter table games add column if not exists edition_slug text;

-- Column-level SELECT so anon + authenticated clients (web GAME_SELECT and
-- mobile GAME_SELECT — see src/lib/supabase-selects.ts +
-- apps/mobile/lib/supabase-selects.ts) can hydrate `Game.edition_slug`. An
-- omitted grant would cause every explicit SELECT that names the column
-- to error under the anon key (migration 0122 revoked table-wide SELECT).
grant select (edition_slug) on public.games to anon, authenticated;

-- ---------------------------------------------------------------------------
-- games_theme_check — allow 'america' as a theme value too, so the theme
-- field stays a valid mirror of the picker's edition choice.
-- ---------------------------------------------------------------------------
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
  'grass_court'::text,
  -- 'ping_pong' is retained from the pre-Phase-4 constraint even though the
  -- ping_pong game type was retired in 20261023120000_remove_ping_pong.sql.
  -- The theme column is orthogonal to game_type, so pre-retirement rows may
  -- still carry theme='ping_pong'; a CHECK rejection here would fail every
  -- future UPDATE that touches any column on such rows. The app never writes
  -- this value (not in themeEnum / ThemeId), so it's a dead-but-tolerated
  -- value — drop it in a later cleanup migration that also scrubs the rows.
  'ping_pong'::text
])) not valid;

-- ---------------------------------------------------------------------------
-- Grandfather every existing Estate Kings edition. Free forever, catalog
-- placeholder so the host picker + shop can enumerate them uniformly.
-- ---------------------------------------------------------------------------
insert into game_editions (game_type, slug, name, content, price_coins, is_active, sort_order)
values
  ('monopoly', 'london', 'London',  '{"currency_symbol":"£","art_slug":"london-v1"}'::jsonb, 0, true, 10),
  ('monopoly', 'naija',  'Naija',   '{"currency_symbol":"₦","art_slug":"naija-v1"}'::jsonb,  0, true, 20),
  ('monopoly', 'pirate', 'Pirate',  '{"currency_symbol":"Đ","art_slug":"pirate-v1"}'::jsonb, 0, true, 30),
  ('monopoly', 'arctic', 'Arctic',  '{"currency_symbol":"Ɨ","art_slug":"arctic-v1"}'::jsonb, 0, true, 40)
on conflict (game_type, slug) do nothing;

-- ---------------------------------------------------------------------------
-- Estate Kings — USA edition.
-- ---------------------------------------------------------------------------
-- Every property name, price, and rent value is copied verbatim from
-- docs/estate-kings-america-edition.md. Rents follow the London Edition
-- rent tables at the matching tier (see MONOPOLY_BOARD in
-- src/lib/monopoly-board.ts) so the rules code — rent tables, station
-- progression, utility multipliers — needs no changes.
insert into game_editions (game_type, slug, name, content, price_coins, is_active, sort_order)
values
  ('monopoly', 'america', 'USA',
   jsonb_build_object(
     'currency_symbol', '$',
     'currency_word',   'dollars',
     'starting_cash',   jsonb_build_object('40', 1500, '48', 6000),
     'go_salary',       jsonb_build_object('40', 200,  '48', 800),
     'corner_labels',   jsonb_build_object(
       'go',           'PAYDAY',
       'jail',         'County Jail',
       'free_parking', 'Roadside Diner',
       'go_to_jail',   'Off to Jail'
     ),
     'card_flavor', jsonb_build_object(
       'advance_to_go',        'Payday down at the docks. Advance to PAYDAY.',
       'advance_to_boardwalk', 'Advance to Fifth Avenue.',
       'bank_dividend',        'IRS refund lands — collect $50.',
       'doctors_fees',         'ER copay — pay $50.',
       'go_back_3',            'Wrong turn on the freeway. Go back 3 spaces.',
       'get_out_of_jail_free', 'Cousin knows a lawyer. Keep this card until needed.',
       'building_repairs',     'Windstorm damage — $25 per house, $100 per hotel.',
       'inherit_100',          'Estate lawyer calls — inherit $100.'
     ),
     'properties', jsonb_build_array(
       jsonb_build_object('index', 1,  'name', 'Woodward Avenue',       'price', 60,  'rent', 2,  'rentTable', jsonb_build_array(2,10,30,90,160,250),        'houseCost', 50,  'color', 'brown'),
       jsonb_build_object('index', 3,  'name', 'Cass Avenue',           'price', 60,  'rent', 4,  'rentTable', jsonb_build_array(4,20,60,180,320,450),       'houseCost', 50,  'color', 'brown'),
       jsonb_build_object('index', 6,  'name', 'Music Row',             'price', 100, 'rent', 6,  'rentTable', jsonb_build_array(6,30,90,270,400,550),       'houseCost', 50,  'color', 'light_blue'),
       jsonb_build_object('index', 8,  'name', 'Demonbreun Street',     'price', 100, 'rent', 6,  'rentTable', jsonb_build_array(6,30,90,270,400,550),       'houseCost', 50,  'color', 'light_blue'),
       jsonb_build_object('index', 9,  'name', 'Broadway',              'price', 120, 'rent', 8,  'rentTable', jsonb_build_array(8,40,100,300,450,600),      'houseCost', 50,  'color', 'light_blue'),
       jsonb_build_object('index', 11, 'name', 'South Street',          'price', 140, 'rent', 10, 'rentTable', jsonb_build_array(10,50,150,450,625,750),     'houseCost', 50,  'color', 'pink'),
       jsonb_build_object('index', 13, 'name', 'Chestnut Street',       'price', 140, 'rent', 10, 'rentTable', jsonb_build_array(10,50,150,450,625,750),     'houseCost', 50,  'color', 'pink'),
       jsonb_build_object('index', 14, 'name', 'Market Street',         'price', 160, 'rent', 12, 'rentTable', jsonb_build_array(12,60,180,500,700,900),     'houseCost', 50,  'color', 'pink'),
       jsonb_build_object('index', 16, 'name', 'Ocean Drive',           'price', 180, 'rent', 14, 'rentTable', jsonb_build_array(14,70,200,550,750,900),     'houseCost', 100, 'color', 'orange'),
       jsonb_build_object('index', 18, 'name', 'Lincoln Road',          'price', 180, 'rent', 14, 'rentTable', jsonb_build_array(14,70,200,550,750,900),     'houseCost', 100, 'color', 'orange'),
       jsonb_build_object('index', 19, 'name', 'Collins Avenue',        'price', 200, 'rent', 16, 'rentTable', jsonb_build_array(16,80,220,600,800,1000),    'houseCost', 100, 'color', 'orange'),
       jsonb_build_object('index', 21, 'name', 'Wacker Drive',          'price', 220, 'rent', 18, 'rentTable', jsonb_build_array(18,90,250,700,875,1050),    'houseCost', 100, 'color', 'red'),
       jsonb_build_object('index', 23, 'name', 'State Street',          'price', 220, 'rent', 18, 'rentTable', jsonb_build_array(18,90,250,700,875,1050),    'houseCost', 100, 'color', 'red'),
       jsonb_build_object('index', 24, 'name', 'Michigan Avenue',       'price', 240, 'rent', 20, 'rentTable', jsonb_build_array(20,100,300,750,925,1100),   'houseCost', 100, 'color', 'red'),
       jsonb_build_object('index', 26, 'name', 'Sunset Boulevard',      'price', 260, 'rent', 22, 'rentTable', jsonb_build_array(22,110,330,800,975,1150),   'houseCost', 150, 'color', 'yellow'),
       jsonb_build_object('index', 27, 'name', 'Hollywood Boulevard',   'price', 260, 'rent', 22, 'rentTable', jsonb_build_array(22,110,330,800,975,1150),   'houseCost', 150, 'color', 'yellow'),
       jsonb_build_object('index', 29, 'name', 'Rodeo Drive',           'price', 280, 'rent', 24, 'rentTable', jsonb_build_array(24,120,360,850,1025,1200),  'houseCost', 150, 'color', 'yellow'),
       jsonb_build_object('index', 31, 'name', 'K Street',              'price', 300, 'rent', 26, 'rentTable', jsonb_build_array(26,130,390,900,1100,1275),  'houseCost', 150, 'color', 'green'),
       jsonb_build_object('index', 32, 'name', 'Massachusetts Avenue',  'price', 300, 'rent', 26, 'rentTable', jsonb_build_array(26,130,390,900,1100,1275),  'houseCost', 150, 'color', 'green'),
       jsonb_build_object('index', 34, 'name', 'Constitution Avenue',   'price', 320, 'rent', 28, 'rentTable', jsonb_build_array(28,150,450,1000,1200,1400), 'houseCost', 150, 'color', 'green'),
       jsonb_build_object('index', 37, 'name', 'Wall Street',           'price', 350, 'rent', 35, 'rentTable', jsonb_build_array(35,175,500,1100,1300,1500), 'houseCost', 200, 'color', 'dark_blue'),
       jsonb_build_object('index', 39, 'name', 'Fifth Avenue',          'price', 400, 'rent', 50, 'rentTable', jsonb_build_array(50,200,600,1400,1700,2000), 'houseCost', 200, 'color', 'dark_blue')
     ),
     'expanded_properties', jsonb_build_array(
       jsonb_build_object('index', 1,  'name', 'Woodward Avenue',       'color', 'brown'),
       jsonb_build_object('index', 3,  'name', 'Cass Avenue',           'color', 'brown'),
       jsonb_build_object('index', 4,  'name', 'Music Row',             'color', 'light_blue'),
       jsonb_build_object('index', 5,  'name', 'Demonbreun Street',     'color', 'light_blue'),
       jsonb_build_object('index', 7,  'name', 'Broadway',              'color', 'light_blue'),
       jsonb_build_object('index', 8,  'name', 'South Congress Avenue', 'color', 'indigo'),
       jsonb_build_object('index', 10, 'name', 'East Sixth Street',     'color', 'indigo'),
       jsonb_build_object('index', 11, 'name', 'Rainey Street',         'color', 'indigo'),
       jsonb_build_object('index', 13, 'name', 'Ocean Drive',           'color', 'orange'),
       jsonb_build_object('index', 15, 'name', 'Lincoln Road',          'color', 'orange'),
       jsonb_build_object('index', 16, 'name', 'Collins Avenue',        'color', 'orange'),
       jsonb_build_object('index', 17, 'name', 'Newbury Street',        'color', 'violet'),
       jsonb_build_object('index', 19, 'name', 'Beacon Street',         'color', 'violet'),
       jsonb_build_object('index', 20, 'name', 'South Street',          'color', 'pink'),
       jsonb_build_object('index', 22, 'name', 'Chestnut Street',       'color', 'pink'),
       jsonb_build_object('index', 23, 'name', 'Market Street',         'color', 'pink'),
       jsonb_build_object('index', 25, 'name', 'Wacker Drive',          'color', 'red'),
       jsonb_build_object('index', 27, 'name', 'State Street',          'color', 'red'),
       jsonb_build_object('index', 28, 'name', 'Michigan Avenue',       'color', 'red'),
       jsonb_build_object('index', 29, 'name', 'Pike Place',            'color', 'teal'),
       jsonb_build_object('index', 31, 'name', 'Lombard Street',        'color', 'teal'),
       jsonb_build_object('index', 32, 'name', 'Sunset Boulevard',      'color', 'yellow'),
       jsonb_build_object('index', 34, 'name', 'Hollywood Boulevard',   'color', 'yellow'),
       jsonb_build_object('index', 35, 'name', 'Rodeo Drive',           'color', 'yellow'),
       jsonb_build_object('index', 37, 'name', 'K Street',              'color', 'green'),
       jsonb_build_object('index', 39, 'name', 'Massachusetts Avenue',  'color', 'green'),
       jsonb_build_object('index', 40, 'name', 'Constitution Avenue',   'color', 'green'),
       jsonb_build_object('index', 41, 'name', 'Wall Street',           'color', 'dark_blue'),
       jsonb_build_object('index', 43, 'name', 'Fifth Avenue',          'color', 'dark_blue'),
       jsonb_build_object('index', 44, 'name', 'Madison Avenue',        'color', 'coral'),
       jsonb_build_object('index', 46, 'name', 'Park Avenue',           'color', 'coral'),
       jsonb_build_object('index', 47, 'name', 'Central Park South',    'color', 'coral')
     ),
     'stations', jsonb_build_array(
       jsonb_build_object('index', 5,  'name', 'Grand Central Terminal',    'price', 200),
       jsonb_build_object('index', 15, 'name', 'Union Station',             'price', 200),
       jsonb_build_object('index', 25, 'name', '30th Street Station',       'price', 200),
       jsonb_build_object('index', 35, 'name', 'Los Angeles Union Station', 'price', 200)
     ),
     'expanded_stations', jsonb_build_array(
       jsonb_build_object('index', 6,  'name', 'Grand Central Terminal'),
       jsonb_build_object('index', 18, 'name', 'Union Station'),
       jsonb_build_object('index', 30, 'name', '30th Street Station'),
       jsonb_build_object('index', 42, 'name', 'Los Angeles Union Station')
     ),
     'utilities', jsonb_build_array(
       jsonb_build_object('index', 12, 'name', 'Hoover Dam Power',   'price', 150),
       jsonb_build_object('index', 28, 'name', 'Great Lakes Water',  'price', 150)
     ),
     'expanded_utilities', jsonb_build_array(
       jsonb_build_object('index', 21, 'name', 'Great Lakes Water'),
       jsonb_build_object('index', 33, 'name', 'Hoover Dam Power')
     ),
     'art_slug', 'usa-v1'
   ),
   800, true, 50)
on conflict (game_type, slug) do nothing;

-- ---------------------------------------------------------------------------
-- ROLLBACK (drafted). Apply as a NEW forward migration; do NOT edit this file.
--   delete from game_editions where game_type = 'monopoly'
--     and slug in ('london','naija','pirate','arctic','america');
--   alter table games drop constraint if exists games_theme_check;
--   alter table games add constraint games_theme_check check (theme = any (array[
--     'default','dark','neon','retro','elegant','tropical',
--     'pirate','arctic','naija','grass_court','ping_pong']));
--   alter table games drop column if exists edition_slug;
-- ---------------------------------------------------------------------------
