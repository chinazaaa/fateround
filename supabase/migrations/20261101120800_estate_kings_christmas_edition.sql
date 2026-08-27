-- Coins & Shop — Phase 5 (Estate Kings — Christmas edition, seasonal drop).
--
-- Reference:
--   docs/coins-and-shop-plan.md § "Launch sequencing" → Phase 5
--   docs/estate-kings-christmas-edition.md — content spec
--   supabase/migrations/20261101120700_estate_kings_america_edition.sql — Phase 4 template
--
-- Adds:
--   * 'christmas' added to games_theme_check so the theme column can carry
--     the new value alongside america / naija / pirate / arctic / default.
--   * One `christmas` row in game_editions: game_type='monopoly',
--     price_coins=800, is_active=true, sort_order=60 (after america=50).
--     Content JSONB carries the full board per the spec: 32 properties
--     (22 base + 10 expansion), 4 sleigh-route stations, 2 festive
--     utilities, Coal Bin / Cozy Fireside / On the Naughty List corners,
--     Stocking Stuffer / Gift Under the Tree card decks, currency $,
--     starting cash / GO salary matching USA + London scale.
--
-- Purchase already works via the Phase 3 purchase_item RPC (kind='edition',
-- slug='christmas'). Entitlement is enforced by the Phase 4 shared helper
-- in src/lib/coins/editions.ts once the slug is added to the theme/edition
-- maps in that file.

-- ---------------------------------------------------------------------------
-- games_theme_check — allow 'christmas' as a theme value.
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
  'christmas'::text,
  'grass_court'::text,
  -- 'ping_pong' retained per Phase 4 migration note: retired game type but
  -- pre-retirement rows may still carry this theme value; rejecting here
  -- would break their future UPDATEs. Cleanup is a separate migration
  -- that also scrubs the rows.
  'ping_pong'::text
])) not valid;

-- ---------------------------------------------------------------------------
-- Estate Kings — Christmas edition.
-- ---------------------------------------------------------------------------
-- Property names, prices, and rents copied verbatim from
-- docs/estate-kings-christmas-edition.md. Rents follow the London Edition
-- rent tables at the matching tier (see MONOPOLY_BOARD in
-- src/lib/monopoly-board.ts) — identical to what USA uses, so no rules
-- code changes needed. Currency stays '$' (spec §"Currency, art, typography":
-- the star motif goes into the card back / corner art, not the money
-- symbol) which also keeps parity with USA on the formatter side.
insert into game_editions (game_type, slug, name, content, price_coins, is_active, sort_order)
values
  ('monopoly', 'christmas', 'Christmas',
   jsonb_build_object(
     'currency_symbol', '$',
     'currency_word',   'dollars',
     'starting_cash',   jsonb_build_object('40', 1500, '48', 6000),
     'go_salary',       jsonb_build_object('40', 200,  '48', 800),
     'seasonal',        true,
     'corner_labels',   jsonb_build_object(
       'go',           'PAYDAY',
       'jail',         'Coal Bin',
       'free_parking', 'Cozy Fireside',
       'go_to_jail',   'On the Naughty List'
     ),
     'card_decks',      jsonb_build_object(
       'chance',    'Stocking Stuffer',
       'community', 'Gift Under the Tree'
     ),
     'card_flavor', jsonb_build_object(
       'advance_to_go',        'Sleigh lift back to PAYDAY. Advance and collect.',
       'advance_to_boardwalk', 'Whisked to North Pole Plaza.',
       'bank_dividend',        'Christmas bonus — collect $50.',
       'doctors_fees',         'Cold from the caroling — pay $50.',
       'go_back_3',            'Blizzard detour. Go back 3 spaces.',
       'get_out_of_jail_free', 'Santa vouched for you. Off the Naughty List.',
       'building_repairs',     'Roof damage from a heavy sleigh — $25 per house, $100 per hotel.',
       'inherit_100',          'A generous secret Santa — collect $100.'
     ),
     'properties', jsonb_build_array(
       jsonb_build_object('index', 1,  'name', 'Stocking Row',            'price', 60,  'rent', 2,  'rentTable', jsonb_build_array(2,10,30,90,160,250),        'houseCost', 50,  'color', 'brown'),
       jsonb_build_object('index', 3,  'name', 'Chimney Lane',            'price', 60,  'rent', 4,  'rentTable', jsonb_build_array(4,20,60,180,320,450),       'houseCost', 50,  'color', 'brown'),
       jsonb_build_object('index', 6,  'name', 'Carolers'' Corner',       'price', 100, 'rent', 6,  'rentTable', jsonb_build_array(6,30,90,270,400,550),       'houseCost', 50,  'color', 'light_blue'),
       jsonb_build_object('index', 8,  'name', 'Wreath Way',              'price', 100, 'rent', 6,  'rentTable', jsonb_build_array(6,30,90,270,400,550),       'houseCost', 50,  'color', 'light_blue'),
       jsonb_build_object('index', 9,  'name', 'Village Green',           'price', 120, 'rent', 8,  'rentTable', jsonb_build_array(8,40,100,300,450,600),      'houseCost', 50,  'color', 'light_blue'),
       jsonb_build_object('index', 11, 'name', 'Gingerbread Lane',        'price', 140, 'rent', 10, 'rentTable', jsonb_build_array(10,50,150,450,625,750),     'houseCost', 50,  'color', 'pink'),
       jsonb_build_object('index', 13, 'name', 'Cocoa Court',             'price', 140, 'rent', 10, 'rentTable', jsonb_build_array(10,50,150,450,625,750),     'houseCost', 50,  'color', 'pink'),
       jsonb_build_object('index', 14, 'name', 'Candy Cane Boulevard',    'price', 160, 'rent', 12, 'rentTable', jsonb_build_array(12,60,180,500,700,900),     'houseCost', 50,  'color', 'pink'),
       jsonb_build_object('index', 16, 'name', 'Toybox Alley',            'price', 180, 'rent', 14, 'rentTable', jsonb_build_array(14,70,200,550,750,900),     'houseCost', 100, 'color', 'orange'),
       jsonb_build_object('index', 18, 'name', 'Wooden Soldier Row',      'price', 180, 'rent', 14, 'rentTable', jsonb_build_array(14,70,200,550,750,900),     'houseCost', 100, 'color', 'orange'),
       jsonb_build_object('index', 19, 'name', 'Nutcracker Square',       'price', 200, 'rent', 16, 'rentTable', jsonb_build_array(16,80,220,600,800,1000),    'houseCost', 100, 'color', 'orange'),
       jsonb_build_object('index', 21, 'name', 'Pine Ridge',              'price', 220, 'rent', 18, 'rentTable', jsonb_build_array(18,90,250,700,875,1050),    'houseCost', 100, 'color', 'red'),
       jsonb_build_object('index', 23, 'name', 'Fir Forest Road',         'price', 220, 'rent', 18, 'rentTable', jsonb_build_array(18,90,250,700,875,1050),    'houseCost', 100, 'color', 'red'),
       jsonb_build_object('index', 24, 'name', 'Snowfall Boulevard',      'price', 240, 'rent', 20, 'rentTable', jsonb_build_array(20,100,300,750,925,1100),   'houseCost', 100, 'color', 'red'),
       jsonb_build_object('index', 26, 'name', 'Firelight Lane',          'price', 260, 'rent', 22, 'rentTable', jsonb_build_array(22,110,330,800,975,1150),   'houseCost', 150, 'color', 'yellow'),
       jsonb_build_object('index', 27, 'name', 'Golden Bell Row',         'price', 260, 'rent', 22, 'rentTable', jsonb_build_array(22,110,330,800,975,1150),   'houseCost', 150, 'color', 'yellow'),
       jsonb_build_object('index', 29, 'name', 'Angel''s Terrace',        'price', 280, 'rent', 24, 'rentTable', jsonb_build_array(24,120,360,850,1025,1200),  'houseCost', 150, 'color', 'yellow'),
       jsonb_build_object('index', 31, 'name', 'Mistletoe Manor Drive',   'price', 300, 'rent', 26, 'rentTable', jsonb_build_array(26,130,390,900,1100,1275),  'houseCost', 150, 'color', 'green'),
       jsonb_build_object('index', 32, 'name', 'Holly Grove',             'price', 300, 'rent', 26, 'rentTable', jsonb_build_array(26,130,390,900,1100,1275),  'houseCost', 150, 'color', 'green'),
       jsonb_build_object('index', 34, 'name', 'Evergreen Boulevard',     'price', 320, 'rent', 28, 'rentTable', jsonb_build_array(28,150,450,1000,1200,1400), 'houseCost', 150, 'color', 'green'),
       jsonb_build_object('index', 37, 'name', 'Santa''s Workshop',       'price', 350, 'rent', 35, 'rentTable', jsonb_build_array(35,175,500,1100,1300,1500), 'houseCost', 200, 'color', 'dark_blue'),
       jsonb_build_object('index', 39, 'name', 'North Pole Plaza',        'price', 400, 'rent', 50, 'rentTable', jsonb_build_array(50,200,600,1400,1700,2000), 'houseCost', 200, 'color', 'dark_blue')
     ),
     'expanded_properties', jsonb_build_array(
       jsonb_build_object('index', 1,  'name', 'Stocking Row',           'color', 'brown'),
       jsonb_build_object('index', 3,  'name', 'Chimney Lane',           'color', 'brown'),
       jsonb_build_object('index', 4,  'name', 'Carolers'' Corner',      'color', 'light_blue'),
       jsonb_build_object('index', 5,  'name', 'Wreath Way',             'color', 'light_blue'),
       jsonb_build_object('index', 7,  'name', 'Village Green',          'color', 'light_blue'),
       jsonb_build_object('index', 8,  'name', 'Reindeer Trail',         'color', 'indigo'),
       jsonb_build_object('index', 10, 'name', 'Sleigh Bell Lane',       'color', 'indigo'),
       jsonb_build_object('index', 11, 'name', 'Prancer''s Path',        'color', 'indigo'),
       jsonb_build_object('index', 13, 'name', 'Toybox Alley',           'color', 'orange'),
       jsonb_build_object('index', 15, 'name', 'Wooden Soldier Row',     'color', 'orange'),
       jsonb_build_object('index', 16, 'name', 'Nutcracker Square',      'color', 'orange'),
       jsonb_build_object('index', 17, 'name', 'Icicle Row',             'color', 'violet'),
       jsonb_build_object('index', 19, 'name', 'Snowflake Terrace',      'color', 'violet'),
       jsonb_build_object('index', 20, 'name', 'Gingerbread Lane',       'color', 'pink'),
       jsonb_build_object('index', 22, 'name', 'Cocoa Court',            'color', 'pink'),
       jsonb_build_object('index', 23, 'name', 'Candy Cane Boulevard',   'color', 'pink'),
       jsonb_build_object('index', 25, 'name', 'Pine Ridge',             'color', 'red'),
       jsonb_build_object('index', 27, 'name', 'Fir Forest Road',        'color', 'red'),
       jsonb_build_object('index', 28, 'name', 'Snowfall Boulevard',     'color', 'red'),
       jsonb_build_object('index', 29, 'name', 'Aurora Boulevard',       'color', 'teal'),
       jsonb_build_object('index', 31, 'name', 'Starlight Circle',       'color', 'teal'),
       jsonb_build_object('index', 32, 'name', 'Firelight Lane',         'color', 'yellow'),
       jsonb_build_object('index', 34, 'name', 'Golden Bell Row',        'color', 'yellow'),
       jsonb_build_object('index', 35, 'name', 'Angel''s Terrace',       'color', 'yellow'),
       jsonb_build_object('index', 37, 'name', 'Mistletoe Manor Drive',  'color', 'green'),
       jsonb_build_object('index', 39, 'name', 'Holly Grove',            'color', 'green'),
       jsonb_build_object('index', 40, 'name', 'Evergreen Boulevard',    'color', 'green'),
       jsonb_build_object('index', 41, 'name', 'Santa''s Workshop',      'color', 'dark_blue'),
       jsonb_build_object('index', 43, 'name', 'North Pole Plaza',       'color', 'dark_blue'),
       jsonb_build_object('index', 44, 'name', 'Ornament Court',         'color', 'coral'),
       jsonb_build_object('index', 46, 'name', 'Tinsel Terrace',         'color', 'coral'),
       jsonb_build_object('index', 47, 'name', 'Grand Sleigh Approach',  'color', 'coral')
     ),
     'stations', jsonb_build_array(
       jsonb_build_object('index', 5,  'name', 'Northern Sleigh Depot',  'price', 200),
       jsonb_build_object('index', 15, 'name', 'Frostwind Junction',     'price', 200),
       jsonb_build_object('index', 25, 'name', 'Silverbell Terminal',    'price', 200),
       jsonb_build_object('index', 35, 'name', 'Winterhaven Depot',      'price', 200)
     ),
     'expanded_stations', jsonb_build_array(
       jsonb_build_object('index', 6,  'name', 'Northern Sleigh Depot'),
       jsonb_build_object('index', 18, 'name', 'Frostwind Junction'),
       jsonb_build_object('index', 30, 'name', 'Silverbell Terminal'),
       jsonb_build_object('index', 42, 'name', 'Winterhaven Depot')
     ),
     'utilities', jsonb_build_array(
       jsonb_build_object('index', 12, 'name', 'Northern Lights Co.',    'price', 150),
       jsonb_build_object('index', 28, 'name', 'Frostwater Springs',     'price', 150)
     ),
     'expanded_utilities', jsonb_build_array(
       jsonb_build_object('index', 21, 'name', 'Frostwater Springs'),
       jsonb_build_object('index', 33, 'name', 'Northern Lights Co.')
     ),
     'art_slug', 'christmas-v1'
   ),
   800, true, 60)
on conflict (game_type, slug) do nothing;

-- ---------------------------------------------------------------------------
-- ROLLBACK (drafted). Apply as a NEW forward migration; do NOT edit this file.
--   delete from game_editions where game_type = 'monopoly' and slug = 'christmas';
--   alter table games drop constraint if exists games_theme_check;
--   alter table games add constraint games_theme_check check (theme = any (array[
--     'default','dark','neon','retro','elegant','tropical',
--     'pirate','arctic','naija','america','grass_court','ping_pong']));
-- ---------------------------------------------------------------------------
