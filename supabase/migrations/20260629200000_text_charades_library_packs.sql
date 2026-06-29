-- Seed approved Text Charades library packs so they show up in the in-app game library.
-- "Text Charades" is the user-facing name for the internal game type `describe_it`
-- (see gameTypeToSlug in src/lib/game-types.ts). The host lobby offers a "Library" word
-- source that imports an approved pack's words (DescribeItHostView -> LibraryPackBrowser
-- with gameType="describe_it").
--
-- Library packs live in `question_packs`; a pack is visible to the public only when
-- status = 'approved' (RLS policy "public_read_approved" in 0081_question_library.sql).
-- For describe_it the `questions` JSONB is a plain array of words/short phrases — each is
-- trimmed, whitespace-collapsed and capped at 40 chars by normalizeDescribeWord
-- (src/lib/describe-it-words.ts), so phrases with spaces are allowed.
--
-- The describe_it game type is already permitted by question_packs_game_type_check
-- (widened in 20260629190000_codewords_library_packs.sql), so no constraint change here.

insert into question_packs (title, game_type, author_name, description, status, question_count, questions, tags, approved_at)
values
  (
    'Famous Landmarks',
    'describe_it',
    'FateRound',
    'World-famous places and wonders — describe the landmark without naming it.',
    'approved',
    30,
    '["eiffel tower","statue of liberty","great wall of china","big ben","taj mahal","leaning tower of pisa","golden gate bridge","sydney opera house","mount rushmore","colosseum","pyramids of giza","stonehenge","christ the redeemer","niagara falls","grand canyon","mount everest","sahara desert","amazon rainforest","london eye","brandenburg gate","sagrada familia","machu picchu","acropolis","burj khalifa","hollywood sign","times square","buckingham palace","white house","easter island","trevi fountain"]'::jsonb,
    array['family-friendly','intermediate'],
    now()
  ),
  (
    'On the Move',
    'describe_it',
    'FateRound',
    'Vehicles and ways to get around — great for big, animated descriptions.',
    'approved',
    30,
    '["helicopter","submarine","hot air balloon","skateboard","bicycle","motorcycle","sailboat","rocket ship","fire truck","ambulance","bulldozer","tractor","canoe","jet ski","roller skates","scooter","train","subway","cable car","gondola","hovercraft","monster truck","race car","tugboat","ferry","zeppelin","surfboard","snowmobile","unicycle","rickshaw"]'::jsonb,
    array['family-friendly','easy'],
    now()
  ),
  (
    'Jobs & Professions',
    'describe_it',
    'FateRound',
    'Careers and the people who do them — act out the everyday and the unusual.',
    'approved',
    30,
    '["firefighter","astronaut","chef","dentist","plumber","electrician","lifeguard","librarian","magician","detective","photographer","pilot","surgeon","teacher","farmer","carpenter","scientist","journalist","architect","veterinarian","lawyer","nurse","mechanic","barber","fisherman","painter","sculptor","referee","conductor","beekeeper"]'::jsonb,
    array['family-friendly','easy'],
    now()
  ),
  (
    'At the Movies',
    'describe_it',
    'FateRound',
    'Cinema tropes and movie magic — perfect for a lively party round.',
    'approved',
    30,
    '["popcorn","red carpet","superhero","villain","plot twist","sequel","blockbuster","director","stunt double","special effects","soundtrack","premiere","cliffhanger","sidekick","time travel","alien invasion","car chase","treasure hunt","haunted house","secret agent","robot","dinosaur","pirate ship","space station","jungle","desert island","talking animal","magic spell","slow motion","happy ending"]'::jsonb,
    array['family-friendly','party'],
    now()
  ),
  (
    'Sports & Games',
    'describe_it',
    'FateRound',
    'Sports, games and activities — describe the action and let teams guess.',
    'approved',
    30,
    '["basketball","marathon","bowling","chess","surfing","skiing","archery","boxing","gymnastics","fencing","volleyball","badminton","cricket","hockey","golf","karate","rock climbing","skateboarding","ping pong","dodgeball","hurdles","javelin","weightlifting","figure skating","snowboarding","water polo","wrestling","cycling","tennis","hopscotch"]'::jsonb,
    array['family-friendly','intermediate'],
    now()
  );
