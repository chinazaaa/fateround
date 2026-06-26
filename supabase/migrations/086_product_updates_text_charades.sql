-- What's new: announce Text Charades (June 2026).

insert into product_updates (type, title, description, month, year, sort_order)
select v.type, v.title, v.description, v.month, v.year, v.sort_order
from (
  values
    (
      'new',
      'Text Charades',
      $$A team word race — like Password or Catch Phrase, online. Split into 2–4 teams: each round one team is on the clock while a describer types clues for a secret word (without saying it) and teammates race to type the answer. Every correct guess scores a point and reveals the next word. Most words across all rounds wins.$$,
      6::smallint,
      2026::smallint,
      250::integer
    )
) as v(type, title, description, month, year, sort_order)
where not exists (
  select 1 from product_updates pu where pu.title = v.title
);
