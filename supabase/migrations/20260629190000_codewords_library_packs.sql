-- Seed approved Codewords library packs so they show up in the in-app game library.
-- Library packs live in `question_packs`; a pack is visible to the public only when
-- status = 'approved' (see RLS policy "public_read_approved" in 0081_question_library.sql).
-- For Codewords the `questions` JSONB is a plain array of single words (>= 25 unique,
-- no spaces, <= 40 chars) — matches parseStoredCodewordsWords in src/lib/codewords-pool.ts.

-- The original 0081 CHECK constraint only allowed trivia/would_you_rather/most_likely_to.
-- The app has since accepted more game types (see VALID_GAME_TYPES in the admin/library
-- API route); widen the constraint here so this migration is self-consistent on a fresh DB.
alter table question_packs drop constraint if exists question_packs_game_type_check;
alter table question_packs add constraint question_packs_game_type_check
  check (game_type in (
    'trivia',
    'would_you_rather',
    'most_likely_to',
    'this_or_that',
    'never_have_i_ever',
    'describe_it',
    'codewords',
    'pick_a_number'
  ));

insert into question_packs (title, game_type, author_name, description, status, question_count, questions, tags, approved_at)
values
  (
    'Classic Mix',
    'codewords',
    'FateRound',
    'A balanced mix of everyday words — a great starter pack for any group.',
    'approved',
    30,
    '["Ocean","Mountain","Castle","Dragon","Pizza","Guitar","Rocket","Forest","Diamond","Thunder","Penguin","Volcano","Wizard","Chocolate","Rainbow","Pirate","Jungle","Robot","Sunset","Treasure","Phoenix","Carnival","Glacier","Vampire","Lantern","Safari","Comet","Mermaid","Tornado","Cactus"]'::jsonb,
    array['family-friendly','easy'],
    now()
  ),
  (
    'Animal Kingdom',
    'codewords',
    'FateRound',
    'Creatures from land, sea and sky — perfect for animal lovers.',
    'approved',
    30,
    '["Lion","Tiger","Elephant","Giraffe","Zebra","Panda","Koala","Kangaroo","Dolphin","Octopus","Shark","Whale","Eagle","Falcon","Owl","Penguin","Flamingo","Peacock","Crocodile","Iguana","Cheetah","Leopard","Rhino","Hippo","Walrus","Otter","Beaver","Hedgehog","Raccoon","Squirrel"]'::jsonb,
    array['family-friendly','easy'],
    now()
  ),
  (
    'Foodie Favorites',
    'codewords',
    'FateRound',
    'Tasty treats and kitchen staples to get everyone hungry.',
    'approved',
    30,
    '["Burger","Taco","Sushi","Pasta","Noodle","Pancake","Waffle","Muffin","Donut","Cupcake","Cookie","Brownie","Pretzel","Popcorn","Pickle","Mango","Banana","Cherry","Peach","Lemon","Avocado","Broccoli","Carrot","Pepper","Mushroom","Cheese","Yogurt","Honey","Coffee","Smoothie"]'::jsonb,
    array['family-friendly','party'],
    now()
  ),
  (
    'Around the World',
    'codewords',
    'FateRound',
    'Famous cities across the globe — a tour for the well-travelled.',
    'approved',
    30,
    '["Paris","London","Tokyo","Cairo","Sydney","Venice","Lisbon","Athens","Dublin","Moscow","Bangkok","Toronto","Madrid","Berlin","Vienna","Prague","Helsinki","Nairobi","Mumbai","Seoul","Istanbul","Amsterdam","Brussels","Stockholm","Oslo","Warsaw","Budapest","Marrakech","Reykjavik","Singapore"]'::jsonb,
    array['family-friendly','intermediate'],
    now()
  ),
  (
    'Sci-Fi & Fantasy',
    'codewords',
    'FateRound',
    'Spaceships, sorcery and mythical beasts for adventurous teams.',
    'approved',
    30,
    '["Galaxy","Nebula","Asteroid","Spaceship","Android","Cyborg","Laser","Portal","Wormhole","Hyperdrive","Wizard","Sorcerer","Goblin","Troll","Elf","Dwarf","Unicorn","Griffin","Phoenix","Centaur","Kraken","Wraith","Potion","Amulet","Scepter","Gauntlet","Dungeon","Citadel","Prophecy","Sorcery"]'::jsonb,
    array['family-friendly','intermediate'],
    now()
  );
