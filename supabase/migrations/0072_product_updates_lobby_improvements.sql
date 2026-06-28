-- What's new: player lobby, late join default, and rules link placement (June 2026)

insert into product_updates (type, title, description, month, year, sort_order)
select v.type, v.title, v.description, v.month, v.year, v.sort_order
from (
  values
    (
      'changed',
      'Player lobby lists',
      $$Waiting lobbies across Ludo, Whot, Yahtzee, Bingo, Trivia, Two Truths, Codewords, and more now show everyone’s names — not just a headcount like “2 players in lobby.”$$,
      6::smallint,
      2026::smallint,
      125::integer
    ),
    (
      'changed',
      'Late joiners default',
      $$When creating a game, Late joiners now defaults to Viewers only — late arrivals watch live instead of joining as players unless you change it. Board games like Monopoly and Ludo only offer lobby-only or watch-only options.$$,
      6,
      2026,
      120
    ),
    (
      'changed',
      'View game rules in lobby',
      $$In the player waiting room, View game rules now appears above the In lobby player list so you can read up before the host starts.$$,
      6,
      2026,
      115
    )
) as v(type, title, description, month, year, sort_order)
where not exists (
  select 1 from product_updates pu where pu.title = v.title
);
