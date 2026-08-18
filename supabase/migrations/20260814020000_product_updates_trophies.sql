-- What's new: announce the accounts / trophies / streaks / public-profiles batch (August 2026).
--
-- Same idempotent shape as 0124_product_updates_voice_chat.sql: insert each row only if no update
-- with that title exists yet, so a re-run (or a replay across environments) is a no-op. sort_order
-- descends in the list, so these sit above the June Voice Chat entry (260).

insert into product_updates (type, title, description, month, year, sort_order)
select v.type, v.title, v.description, v.month, v.year, v.sort_order
from (
  values
    (
      'new',
      'Trophies',
      $$Every game now has trophies to chase — from your very first win to rare, game-specific feats across Trivia, Chess, Whot, Crazy Eights, Ludo, Monopoly, Mafia, Scrabble, Mahjong, Ayo and more. Hidden ones stay secret until you unlock them.$$,
      8::smallint,
      2026::smallint,
      350::integer
    ),
    (
      'new',
      'Profiles, points & levels',
      $$Your play now builds a profile. Earn trophy points, climb levels, and watch your trophy cabinet grow — there's nothing to sign up for, it starts the moment you finish a game.$$,
      8::smallint,
      2026::smallint,
      340::integer
    ),
    (
      'new',
      'Daily streaks',
      $$Come back and play on consecutive days to build a streak. Your current and longest streaks show right on your profile — miss a day and it resets, so keep it going.$$,
      8::smallint,
      2026::smallint,
      330::integer
    ),
    (
      'new',
      'Shareable trophy profiles',
      $$Claim a username and get a public profile page to show off your cabinet. Share everything you've won with a single link — fateround.com/u/yourname.$$,
      8::smallint,
      2026::smallint,
      320::integer
    )
) as v(type, title, description, month, year, sort_order)
where not exists (
  select 1 from product_updates pu where pu.title = v.title
);
