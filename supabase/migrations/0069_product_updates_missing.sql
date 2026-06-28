-- Backfill product updates for game modes and features shipped after 025_product_updates.sql

insert into product_updates (type, title, description, month, year, sort_order)
select v.type, v.title, v.description, v.month, v.year, v.sort_order
from (
  values
    (
      'new',
      'Bingo',
      $$Classic 75-ball bingo for parties. Everyone gets a unique card on their phone — you call numbers, they mark squares, and the first line wins.$$,
      3::smallint,
      2026::smallint,
      75::integer
    ),
    (
      'new',
      'Codewords',
      $$The word-association spy game online. Red vs Blue teams — spymasters give one-word clues, operatives guess words on a 5x5 grid. Avoid the assassin!$$,
      3,
      2026,
      72
    ),
    (
      'new',
      'Trivia',
      $$Speed-based quiz for groups. Pick Tech or General Knowledge, or upload your own questions — fastest correct answers climb the leaderboard.$$,
      4,
      2026,
      85
    ),
    (
      'new',
      'Two Truths and a Lie',
      $$Classic icebreaker, online. Everyone submits two truths and a lie, then takes turns in the hot seat while the group guesses the fib.$$,
      4,
      2026,
      82
    ),
    (
      'new',
      'Date My Kid',
      $$One name steps into the spotlight each round. Would you let your son or daughter date or marry them? Yes or no votes, live reveals.$$,
      5,
      2026,
      88
    ),
    (
      'new',
      'Monopoly',
      $$Classic Monopoly on your phones. Roll dice, buy properties, pay rent, trade, and bankrupt opponents — 2–6 players, real-time turns.$$,
      5,
      2026,
      85
    ),
    (
      'new',
      'Yahtzee',
      $$Roll-and-hold dice scoring with friends. Up to three rolls per turn — fill your scorecard with straights, full houses, and Yahtzees.$$,
      5,
      2026,
      82
    ),
    (
      'new',
      'Never Have I Ever',
      $$Confession game with anonymous I have / I haven't votes. Use built-in prompts or upload your own and see how spicy the group really is.$$,
      5,
      2026,
      78
    ),
    (
      'new',
      'Whot',
      $$The Nigerian card classic online. Match shape or number, stack Pick 2 and Pick 3, play WHOT — first to empty your hand wins.$$,
      6,
      2026,
      110
    ),
    (
      'new',
      'Ludo',
      $$Classic board game on your phones. Roll the die, race your pieces home, capture opponents, and block with pairs — 2–4 players.$$,
      6,
      2026,
      115
    ),
    (
      'new',
      'Pick a Number',
      $$Pick a number from a hidden list — you won't know the question until after you choose. Upload your own prompts or use the built-in pool.$$,
      6,
      2026,
      120
    ),
    (
      'changed',
      'Spectators & late join',
      $$Hosts can allow viewers who watch without playing, or let late arrivals join mid-game when the room settings allow it.$$,
      4,
      2026,
      95
    ),
    (
      'changed',
      'Resume on another device',
      $$Each player gets a personal resume code in the lobby. Switch phones or browsers without losing your spot in the game.$$,
      6,
      2026,
      110
    )
) as v(type, title, description, month, year, sort_order)
where not exists (
  select 1 from product_updates pu where pu.title = v.title
);
