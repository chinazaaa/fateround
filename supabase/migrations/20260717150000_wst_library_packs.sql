-- Seed an approved Who Said This library pack (anime quotes). Packs live in `question_packs`
-- and are public only when status = 'approved' (RLS in 0081_question_library.sql). For
-- who_said_this the `questions` JSONB is an array of {quote, options[], correctIndex} rows —
-- matches parseStoredWstDeck in src/lib/custom-questions.ts.

-- Widen the game_type CHECK to allow who_said_this (was trivia/…/pick_a_number after 20260629190000).
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
    'pick_a_number',
    'who_said_this'
  ));

insert into question_packs (title, game_type, author_name, description, status, question_count, questions, tags, approved_at)
values
  (
    'Anime Icons',
    'who_said_this',
    'FateRound',
    'Legendary anime lines — guess which character said each one.',
    'approved',
    10,
    '[
      {"quote":"Believe it!","options":["Naruto Uzumaki","Luffy","Ichigo","Goku"],"correctIndex":0},
      {"quote":"I''m gonna be King of the Pirates!","options":["Monkey D. Luffy","Naruto","Natsu","Eren"],"correctIndex":0},
      {"quote":"Plus Ultra!","options":["All Might","Deku","Bakugo","Endeavor"],"correctIndex":0},
      {"quote":"People die when they are killed.","options":["Shirou Emiya","Kirito","Light Yagami","Lelouch"],"correctIndex":0},
      {"quote":"I am justice!","options":["Light Yagami","L","Lelouch","Near"],"correctIndex":0},
      {"quote":"Tatakae. (Fight.)","options":["Eren Yeager","Mikasa","Levi","Armin"],"correctIndex":0},
      {"quote":"Omae wa mou shindeiru. (You are already dead.)","options":["Kenshiro","Guts","Saitama","Vegeta"],"correctIndex":0},
      {"quote":"It''s over 9000!","options":["Vegeta","Goku","Piccolo","Krillin"],"correctIndex":0},
      {"quote":"Bankai!","options":["Ichigo Kurosaki","Naruto","Natsu","Yusuke"],"correctIndex":0},
      {"quote":"I want to be the very best, like no one ever was.","options":["Ash Ketchum","Gon","Tanjiro","Yugi"],"correctIndex":0}
    ]'::jsonb,
    array['anime','intermediate'],
    now()
  );
