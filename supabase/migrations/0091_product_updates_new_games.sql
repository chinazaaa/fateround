-- What's new: announce the newest game modes — Chess, Word Hunt, Sudoku,
-- Ultimate Tic-Tac-Toe, and I Call On (June 2026).

insert into product_updates (type, title, description, month, year, sort_order)
select v.type, v.title, v.description, v.month, v.year, v.sort_order
from (
  values
    (
      'new',
      'Chess',
      $$Play classic chess head-to-head. Full rules with castling, en passant, and promotion, plus a chess.com-style clock — each player gets their own time bank (3, 5, or 10 minutes) that only ticks on their turn. Checkmate, run your opponent out of time, or take the resignation to win.$$,
      6::smallint,
      2026::smallint,
      240::integer
    ),
    (
      'new',
      'Word Hunt',
      $$A Boggle-style word race. Everyone gets the same 4x4 letter grid — drag or tap to connect adjacent letters (diagonals count!) and spell as many words as you can before the timer runs out. Longer words score more.$$,
      6,
      2026,
      235
    ),
    (
      'new',
      'Sudoku',
      $$Everyone solves the same 9x9 puzzle together. Race to claim 3x3 blocks before your friends — first correct answer scores, wrong guesses lock you out for a bit.$$,
      6,
      2026,
      230
    ),
    (
      'new',
      'Ultimate Tic-Tac-Toe',
      $$Tic-Tac-Toe with a twist: nine small boards in one big grid. The cell you play sends your opponent to the matching board, and you win by taking three small boards in a row. Quick, head-to-head, and surprisingly strategic.$$,
      6,
      2026,
      225
    ),
    (
      'new',
      'I Call On (Name, Animal, Place…)',
      $$The classic A–Z categories game, online. Someone calls a letter and everyone races to fill Name, Animal, Place, Thing, and Food before time runs out. Unique answers score more than duplicates, and everyone marks the sheets together.$$,
      6,
      2026,
      220
    )
) as v(type, title, description, month, year, sort_order)
where not exists (
  select 1 from product_updates pu where pu.title = v.title
);
