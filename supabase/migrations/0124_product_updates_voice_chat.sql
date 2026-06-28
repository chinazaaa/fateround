-- What's new: announce Voice Chat (June 2026).

insert into product_updates (type, title, description, month, year, sort_order)
select v.type, v.title, v.description, v.month, v.year, v.sort_order
from (
  values
    (
      'new',
      'Voice Chat',
      $$Talk to everyone in real time while you play. Jump into a live voice channel right from the game room — no extra app or setup. Tap Join Voice to hop in, minimize the panel to keep playing while you chat, and hit Disconnect when you're done.$$,
      6::smallint,
      2026::smallint,
      260::integer
    )
) as v(type, title, description, month, year, sort_order)
where not exists (
  select 1 from product_updates pu where pu.title = v.title
);
