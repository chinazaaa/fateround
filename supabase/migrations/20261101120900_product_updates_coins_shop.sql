-- What's new: the coins & shop launch (Phases 1–4).
--
-- Same idempotent shape as 20261030120000_product_updates_recent_features.sql
-- and every earlier product_updates migration — insert each row only if a
-- product_updates row with that title doesn't already exist, so a re-run (or
-- a replay across environments) is a no-op.
--
-- sort_order descends in the list. The prior batch topped out at 500, so this
-- batch starts at 600 and steps down in 5s to sit as a group above it in the
-- "Recent" section.

insert into product_updates (type, title, description, month, year, sort_order)
select v.type, v.title, v.description, v.month, v.year, v.sort_order
from (
  values
    (
      'new',
      'Coins',
      $$Play games, earn coins. Wins, daily challenges, tournaments, and hosting rooms all pay out on the finish screen. Sign up to keep the coins you earn as a guest — you'll see them added to your account when you save your profile.$$,
      11::smallint,
      2026::smallint,
      600::integer
    ),
    (
      'new',
      'The Shop',
      $$A brand-new shop for cosmetics: avatar frames, name colors, winner animations, and shareable card-template designs — plus visual themes for Whot, Ludo, and Sudoku. Streak Freeze protects your daily-challenge streak from one missed day. Everything you buy is yours forever.$$,
      11::smallint,
      2026::smallint,
      595::integer
    ),
    (
      'new',
      'Estate Kings — USA',
      $$The first paid Estate Kings edition. American streets, dollar currency, sleigh-quiet stations swapped for iconic US rail terminals, and USA-flavored Chance and Community Chest cards. Ships alongside the free London and Naija editions, so nothing you already play changes.$$,
      11::smallint,
      2026::smallint,
      590::integer
    ),
    (
      'new',
      'Extra bots for busy rooms',
      $$Your first bot in a room is still free. Additional bots cost 50 coins each — pay once when you add them, no subscription.$$,
      11::smallint,
      2026::smallint,
      585::integer
    ),
    (
      'new',
      'Coin history on your profile',
      $$Every coin you earn or spend gets a row on your profile — with the reason, date, and running balance — so you can see exactly where your coins went.$$,
      11::smallint,
      2026::smallint,
      580::integer
    )
) as v(type, title, description, month, year, sort_order)
where not exists (
  select 1 from product_updates pu where pu.title = v.title
);
