import type { GameType } from '@/types'

export type GameLandingRuleSection = {
  title: string
  points: string[]
}

export const GAME_LANDING_RULES: Record<GameType, GameLandingRuleSection[]> = {
  smash_marry_kill: [
    {
      title: 'Objective',
      points: [
        'Each round shows three names — assign one to smash, one to marry, and one to kill.',
        'After everyone votes, results reveal who won each category across the group.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'The host picks round count, optional timer, and gender-based or names-only mode.',
        'Add names by uploading a list, letting players claim from a roster, or join-and-play where joiners enter the poll.',
      ],
    },
    {
      title: 'How a round works',
      points: [
        'Three names appear on screen. Each player picks smash, marry, and kill — one name per slot.',
        'Votes are private until the host reveals. Leaderboards track most smashed, married, and killed.',
        'Repeat until all rounds are done.',
      ],
    },
  ],

  red_flag_green_flag: [
    {
      title: 'Objective',
      points: [
        'Two names appear each round. Rate each person separately — green flag or red flag.',
        'See who your group thinks is a green flag and who collects red flags.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'Upload a name list or use join-and-play mode so players add names in the lobby.',
        'The host can set pair voting rules (e.g. one green and one red required).',
      ],
    },
    {
      title: 'How a round works',
      points: [
        'Both names show on screen. Vote green flag or red flag on each person independently.',
        'Results reveal per name — not a head-to-head winner, but separate ratings.',
        'Continue round by round until the game ends.',
      ],
    },
  ],

  smash_or_pass: [
    {
      title: 'Objective',
      points: [
        'Two names appear each round. Smash or pass on each person — quick binary votes.',
        'Leaderboards show who got the most smashes by the end.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'Upload celebrities or friends, or let joiners fill the poll when they arrive.',
        'Optional timer keeps rounds fast.',
      ],
    },
    {
      title: 'How a round works',
      points: [
        'Both names display. Tap smash or pass for each one before time runs out.',
        'The host reveals results and moves to the next pair.',
      ],
    },
  ],

  parent_approval: [
    {
      title: 'Objective',
      points: [
        'One name appears each round. Everyone votes yes or no — would you let your son or daughter date or marry them?',
        'See the group split on each person.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'Add names via upload, roster claim, or join-and-play mode.',
        'Set round count and optional timer when creating the room.',
      ],
    },
    {
      title: 'How a round works',
      points: [
        'A single name is revealed. Each player votes yes or no privately.',
        'Results show the yes/no breakdown, then the next name appears.',
      ],
    },
  ],

  would_you_rather: [
    {
      title: 'Objective',
      points: [
        'Each round presents two options. Pick A or B — see where your group actually stands.',
        'Votes are anonymous until reveal.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'No participant list required — players join with a display name.',
        'Use built-in prompts or upload your own questions when creating the room.',
      ],
    },
    {
      title: 'How a round works',
      points: [
        'Read the two options and tap your choice before the timer ends.',
        'The host reveals the vote split. Nobody knows who picked what unless you choose to expose votes.',
        'Play through all rounds and compare results.',
      ],
    },
  ],

  pick_a_number: [
    {
      title: 'Objective',
      points: [
        'Each round one player picks a number from a hidden list (1 to N). That number reveals a question they must answer out loud.',
        'The picker does not know what any number means until after they choose.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'No participant list required — players join with a display name.',
        'Use built-in questions or upload your own numbered list when creating the room.',
        'Set how many picking turns you want — not limited by how many people join.',
      ],
    },
    {
      title: 'How a round works',
      points: [
        'The designated picker sees numbers only — the question list stays hidden.',
        'They lock in a number and the question is revealed to everyone.',
        'They answer out loud; the host advances when ready.',
      ],
    },
  ],

  this_or_that: [
    {
      title: 'Objective',
      points: [
        'Answer simple “X or Y?” prompts — Coffee or Tea, Dogs or Cats, and so on.',
        'Anonymous A/B voting shows the group preference each round.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'Upload a CSV of your own This or That questions when creating the room.',
        'Players join with a name — no roster upload needed.',
      ],
    },
    {
      title: 'How a round works',
      points: [
        'One prompt appears with two choices. Pick A or B anonymously.',
        'Reveal the split and move to the next question.',
      ],
    },
  ],

  never_have_i_ever: [
    {
      title: 'Objective',
      points: [
        "Each round reads a \"Never have I ever…\" prompt. Tap I have if you've done it, or I haven't if you haven't.",
        'See how many in the group confess — votes stay anonymous until reveal.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'No participant list required — players join with a display name.',
        'Use built-in prompts or upload your own statements when creating the room.',
      ],
    },
    {
      title: 'How a round works',
      points: [
        "Read the prompt and tap I have or I haven't before the timer ends.",
        'The host reveals how many people have done it — nobody knows who picked what.',
        'Play through all rounds and compare confessions.',
      ],
    },
  ],

  most_likely_to: [
    {
      title: 'Objective',
      points: [
        'Each prompt asks who in the group is “most likely to…” do something.',
        'Anonymous votes reveal who the group picked for each prompt.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'Use your friend group as the roster, or import a name list.',
        'Built-in prompts are available; custom prompts can be added when creating a room.',
      ],
    },
    {
      title: 'How a round works',
      points: [
        'Read the “most likely to…” prompt and pick one person from the list.',
        'Votes stay hidden until reveal. Repeat for each prompt.',
      ],
    },
  ],

  who_said_this: [
    {
      title: 'Objective',
      points: [
        'Guess who wrote each quote. Score points for correct guesses.',
        'Find out who knows the group best — and who writes the wildest lines.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'Players join, claim their name, and submit quotes to the pool in the lobby.',
        'The host starts when enough quotes are collected. Anime quote mode is available.',
      ],
    },
    {
      title: 'How a round works',
      points: [
        'A quote appears with no author shown. Pick who you think said it.',
        'Reveal the correct author and award points. Continue until all quotes are guessed.',
      ],
    },
  ],

  hot_seat: [
    {
      title: 'Objective',
      points: [
        'Each player takes a turn in the hot seat while everyone else submits anonymously.',
        'Submissions are a compliment, an observation, or a roast — one per voter per round.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'Upload your group list. Each player claims their name when joining.',
        'Turn order follows the roster — everyone gets one hot seat round.',
      ],
    },
    {
      title: 'How a round works',
      points: [
        'One player is in the hot seat. Everyone else picks submission type and writes their message.',
        'Submissions reveal one by one. Then the next player takes the seat.',
      ],
    },
  ],

  custom: [
    {
      title: 'Objective',
      points: [
        'Build your own voting format with 2–5 custom named slots (Date, Friendzone, CEO, etc.).',
        'Each round, assign one person per slot and reveal the group’s picks.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'Name each slot with a label and emoji when creating the room.',
        'Upload a list, use claim-from-roster, or join-and-play. Gender-based mode is optional.',
      ],
    },
    {
      title: 'How a round works',
      points: [
        'Names appear each round. Assign exactly one person to each custom slot.',
        'Reveal results and track category winners on the leaderboard.',
      ],
    },
  ],

  anonymous_messages: [
    {
      title: 'Objective',
      points: [
        'Post anonymous messages to a live feed the whole room can see.',
        'No sender names are shown — only the message text.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'The host creates a room and shares the code.',
        'Players join with one tap — the platform assigns a random lobby name automatically.',
      ],
    },
    {
      title: 'How to play',
      points: [
        'The host starts the session. Messages appear in real time on everyone’s screen.',
        'Anyone can post at any time while the session is active. Messages stay anonymous.',
      ],
    },
  ],

  secret_message: [
    {
      title: 'Objective',
      points: [
        'Create a private inbox link. Anyone who has the link can send you an anonymous message.',
        'Only you (the host) see incoming messages.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'Pick a title and get your link instantly when creating a board.',
        'Share the link on Instagram, in your bio, or a group chat.',
      ],
    },
    {
      title: 'How to play',
      points: [
        'Senders open the link, type a message, and send — no account needed.',
        'Messages arrive in your host inbox in real time. Senders never see each other’s submissions.',
      ],
    },
  ],

  bingo: [
    {
      title: 'Objective',
      points: [
        'Be the first player to complete a winning line on your bingo card.',
        'Mark called numbers on your card as the host announces them.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'The host creates a room and shares the code. Players join with a display name.',
        'When the host starts, every player receives a unique 5×5 card. The center square is free.',
        'Numbers range B1–B15, I16–I30, N31–N45, G46–G60, O61–O75 across the five columns.',
      ],
    },
    {
      title: 'How a round works',
      points: [
        'The host calls numbers manually or on an auto timer. Called numbers sync for everyone.',
        'Tap a cell to mark it when that number has been called and appears on your card.',
        'You can only mark numbers that have actually been called.',
      ],
    },
    {
      title: 'Winning',
      points: [
        'Complete any row, column, or diagonal line of five marked cells (the free center counts).',
        'Tap BINGO to claim. The host confirms the win.',
      ],
    },
  ],

  codewords: [
    {
      title: 'Objective',
      points: [
        'Two teams — Red and Blue — race to identify all of their team’s words on a 5×5 grid.',
        'First team to find all their words wins. Hit the assassin word and your team loses instantly.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'Players join and pick a team plus a role: spymaster or operative.',
        'Each team needs exactly one spymaster. Spymasters see the secret key card; operatives see only words.',
      ],
    },
    {
      title: 'How a turn works',
      points: [
        'The starting team’s spymaster gives a one-word clue and a number (how many words it relates to).',
        'Operatives tap words they think match the clue. Correct guesses let you keep guessing; wrong guesses end the turn.',
        'Revealing a neutral word, the other team’s word, or the assassin ends the turn — assassin ends the game.',
      ],
    },
    {
      title: 'Winning',
      points: [
        'Find all your team’s words before the other team finds theirs.',
        'Avoid the single assassin word hidden on the grid.',
      ],
    },
  ],

  trivia: [
    {
      title: 'Objective',
      points: [
        'Answer multiple-choice questions correctly and quickly to climb the leaderboard.',
        'Fastest correct answers earn speed bonus points.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'Pick Tech or General Knowledge, or upload your own question CSV.',
        'Set round count and per-question timer. Players join with a display name.',
      ],
    },
    {
      title: 'How a round works',
      points: [
        'A question and answer choices appear. Tap your answer before time runs out.',
        'Correct answers earn base points plus a speed bonus for answering first.',
        'Scores stack across all rounds on the live leaderboard.',
      ],
    },
    {
      title: 'Winning',
      points: ['Highest total score when all rounds finish wins.'],
    },
  ],

  two_truths: [
    {
      title: 'Objective',
      points: [
        'Spot the lie among three statements about the player in the hot seat.',
        'Earn points for correct guesses; earn bonus points for fooling the most people with your lie.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'Each player joins and submits two truths and one lie about themselves in the lobby.',
        'Minimum three players. The host starts when everyone has submitted.',
      ],
    },
    {
      title: 'How a round works',
      points: [
        'One player’s three statements appear shuffled. Everyone else picks which one is the lie.',
        'Reveal the lie and award points — 100 for a correct guess, 50 for fooling someone with your lie.',
        'Each player gets one round in the hot seat.',
      ],
    },
  ],

  monopoly: [
    {
      title: 'Objective',
      points: [
        'Buy, rent, and sell properties to grow your wealth until every opponent is bankrupt.',
        'The last player left in the game wins.',
      ],
    },
    {
      title: 'Setup',
      points: [
        '2–6 players join a room and pick a board token (car, hat, dog, etc.). Each player starts on GO with £1,500.',
        'The Bank holds all Title Deeds until purchased. The host starts when everyone is ready; turn order is set at game start.',
      ],
    },
    {
      title: 'Moving & GO',
      points: [
        'On your turn, roll two dice and move clockwise around the 40-space board.',
        'Collect £200 from the Bank every time you land on or pass GO while moving forward — but not on your first lap around the board.',
        'Two or more tokens may occupy the same space.',
      ],
    },
    {
      title: 'Doubles',
      points: [
        'If you roll doubles, move, resolve the space, then roll again for another turn.',
        'If you roll doubles three times in a row on the same turn, go straight to Jail — your turn ends immediately.',
      ],
    },
    {
      title: 'Buying property',
      points: [
        'You cannot buy from the Bank, pay Income Tax or Super Tax, or draw Chance / Community Chest cards until you have passed GO at least once on your first lap.',
        'Landing on an unowned Property, Station, or Utility after that lets you buy it at the listed price.',
        'If you decline to buy, the property is auctioned to the highest bidder — including you.',
        'Own all Sites in a colour-group (a monopoly) to charge double rent on unimproved properties in that group.',
      ],
    },
    {
      title: 'Rent',
      points: [
        "Landing on another player's property requires paying rent before the next player rolls.",
        'Railroad rent increases with each Station owned: £25, £50, £100, or £200 for one through four.',
        'Utility rent is 4× your dice roll if the owner has one Utility, or 10× if they own both.',
        'Build houses and hotels on complete colour-groups (evenly) to increase rent. Mortgaged properties collect no rent.',
      ],
    },
    {
      title: 'Chance & Community Chest',
      points: [
        'You must pass GO once before drawing cards on your first lap — landing on Chance or Community Chest before that ends your turn without drawing.',
        'Draw from the full UK 16-card Chance and 16-card Community Chest decks.',
        'Cards may move you, pay or collect money, charge per house/hotel, or collect from every player.',
        'If a card moves you forward past GO, collect £200 (after your first lap). You do not collect GO salary when sent to Jail.',
        'Get Out of Jail Free cards are kept until used or traded.',
      ],
    },
    {
      title: 'Taxes & Free Parking',
      points: [
        'Income Tax (space 4) and Super Tax (space 38) do not apply until you have passed GO once on your first lap.',
        'After that: Income Tax is £200 and Super Tax is £100, paid to the Bank.',
        'Free Parking has no penalty — simply rest there until your next turn.',
      ],
    },
    {
      title: 'Houses, hotels & mortgages',
      points: [
        'Own all sites in a colour-group to build up to three houses (evenly across the group), then upgrade to a hotel.',
        'Sell buildings back to the Bank at half price. Mortgaged properties cannot collect rent.',
        'Mortgage a property for half its price; unmortgage by paying the mortgage value plus 10% interest.',
      ],
    },
    {
      title: 'Trading',
      points: [
        'Propose trades with other players at any time — cash, properties, and Get Out of Jail Free cards.',
        'The other player must accept or decline. You cannot trade properties that still have buildings on the colour-group.',
      ],
    },
    {
      title: 'Jail',
      points: [
        'You are sent to Jail by landing on "Go To Jail", drawing a card, or rolling three doubles in one turn.',
        'Landing on the Jail space while not sent there is "Just Visiting" — no penalty.',
        'A "Get Out of Jail Free" card may be kept until used or traded.',
        'To get out: pay a £50 fine before your next roll, use a Get Out of Jail Free card, or roll doubles on any of your next three turns.',
        'After three turns in Jail without doubles, pay £50 and move according to your roll.',
        'While in Jail you may still collect rent on properties you own (unless mortgaged).',
      ],
    },
    {
      title: 'Bankruptcy & winning',
      points: [
        'If you owe more than you can raise from cash and assets, you are bankrupt and out of the game.',
        'If bankrupt to another player, they receive your cash, properties, and Get Out of Jail Free cards.',
        'If bankrupt to the Bank, the Bank takes your assets and auctions each property.',
        'The game ends when only one solvent player remains.',
      ],
    },
  ],

  yahtzee: [
    {
      title: 'Objective',
      points: [
        'Fill every category on your scorecard with the best dice combinations you can roll.',
        'Highest total score when all categories are filled wins.',
      ],
    },
    {
      title: 'Setup',
      points: [
        '1–6 players join a room — or play solo. Each player gets an empty scorecard with 13 categories.',
        'Players take turns in order. Five dice are shared on each turn.',
      ],
    },
    {
      title: 'How a turn works',
      points: [
        'Roll up to three times per turn. After each roll, hold dice you want to keep and re-roll the rest.',
        'After at least one roll, pick one unused scorecard category and lock in your score for those dice.',
        'Categories include upper section (Ones–Sixes), Three of a Kind, Four of a Kind, Full House (25 pts), Small Straight (30), Large Straight (40), Yahtzee (50), and Chance.',
      ],
    },
    {
      title: 'Scoring bonus',
      points: [
        'Score 63+ in the upper section (Ones through Sixes) to earn a 35-point bonus.',
        'Each category can only be scored once per game.',
      ],
    },
  ],

  whot: [
    {
      title: 'Objective',
      points: [
        'Be the first player to play all your cards.',
        'Match the top card by shape or number — or play WHOT to set what opponents must match next.',
      ],
    },
    {
      title: 'Setup',
      points: [
        '2–6 players join a room. Each player receives 5 cards (6 for a 2-player game).',
        'One card is turned face-up to start the discard pile. The host starts when everyone is ready.',
      ],
    },
    {
      title: 'How to play',
      points: [
        "On your turn, play a card that matches the top card's shape or number.",
        'If you cannot play, draw from the pile — or draw the full Pick 2 / Pick 3 penalty when those stacks are active.',
        'When the draw pile runs out, played cards (except the current top card) are shuffled back in as a new draw pile.',
        'If no cards can be drawn and nobody can play, the game ends — lowest hand total wins.',
        'WHOT (20) can be played anytime except during Pick 2 or Pick 3 — then you must play the matching number or draw.',
        'If an opponent played WHOT and called a shape or number, you can match that call or play your own WHOT to override it and call something new.',
      ],
    },
    {
      title: 'Special cards',
      points: [
        '1 — Hold On: take another turn immediately.',
        '2 — Pick 2: next player must play another 2 or draw the full stack (stacks +2 if they play a 2).',
        '5 — Pick 3: next player must play another 5 or draw the full stack (stacks +3 if they play a 5). Pick 2 and Pick 3 cannot be mixed — only one penalty applies at a time.',
        '8 — Suspension: skip the next player.',
        '14 — General Market: every other player automatically draws 1 card (no button tap needed).',
        "20 — WHOT: call the next shape or number. Can override another player's WHOT call, but not Pick 2 or Pick 3.",
      ],
    },
    {
      title: 'Game length',
      points: [
        'The host can set a game length (10, 15, 30 minutes, etc.) or play with no limit.',
        'First to empty their hand wins during normal play (no game clock).',
        'With a game clock, players who go out keep watching until time runs out — lowest hand total wins (WHOT counts as 20).',
      ],
    },
  ],

  crazy_eights: [
    {
      title: 'Objective',
      points: [
        'Be the first player to get rid of all the cards in your hand.',
        'Match the top of the discard pile by rank or suit — or play an 8 to name the suit opponents must follow.',
      ],
    },
    {
      title: 'Setup',
      points: [
        '2–6 players join a room. Each player receives 5 cards (7 for a 2-player game).',
        'The rest form the draw pile, with one card turned face-up to start the discard pile. An 8 (or Joker) starter is reshuffled.',
      ],
    },
    {
      title: 'How to play',
      points: [
        "On your turn, play a card that matches the top card's rank or suit.",
        'If you cannot (or choose not to) play, draw a card — or draw the full Pick Two penalty when a 2 stack is active.',
        'When the draw pile runs out, played cards (except the current top card) are shuffled back in as a new draw pile.',
        'If nobody can play and no cards can be drawn, the game ends — lowest hand total wins.',
      ],
    },
    {
      title: 'Special cards',
      points: [
        '8 — Wild: play on anything and name the suit the next player must follow (the only always-on special).',
        '2 — Pick Two: next player draws 2 and is skipped, unless they stack their own 2 to grow and pass the penalty.',
        'Jack — Skip: the next player loses their turn.',
        'Queen — Reverse: the direction of play flips (acts as a skip in a 2-player game).',
        'Ace — Skip: the next player loses their turn.',
        'Joker (optional) — Wild + Draw: the next player draws 5 (the Joker penalty cannot be stacked), then you name the new suit.',
        'The 2 / Jack / Queen / Ace powers are an optional host setting — turn them off to play with only the 8 as wild.',
      ],
    },
    {
      title: 'Game length',
      points: [
        'The host can set a game length (10, 15, 30 minutes, etc.) or play with no limit.',
        'First to empty their hand wins during normal play (no game clock).',
        'With a game clock, time running out ends the game — lowest hand total wins (each 8 and Joker counts as 50, face cards 10, aces 1).',
      ],
    },
  ],

  ludo: [
    {
      title: 'Objective',
      points: [
        'Move all four of your colored pieces clockwise around the board, up your home column, and into the center home triangle.',
        'The first player to finish all four pieces wins. Remaining players continue for runner-up places.',
      ],
    },
    {
      title: 'Setup',
      points: [
        '2–4 players join a room. Each player is assigned a color (red, green, yellow, or blue) with four pieces in their corner base.',
        'Turn order is set when the host starts. Optional per-turn timer keeps the game moving.',
        'Roll two dice each turn. You use each die as its own move — not the combined total.',
      ],
    },
    {
      title: 'Getting pieces into play',
      points: [
        'You need a 6 on a die to move a piece from your home yard onto your start square.',
        'Until at least one piece is in play, you cannot use non-6 dice (e.g. on a 6+3 roll, use the 6 first, then the 3).',
        'Example: 6+3 lets you bring one piece out on the 6, then move it (or another piece) 3 spaces.',
        'Example: 6+6 (doubles) lets you bring out two pieces, or bring one out on the first 6 and move it 6 on the second.',
      ],
    },
    {
      title: 'Doubles',
      points: [
        'Rolling doubles (e.g. 4+4 or 6+6) means you use each die separately, then roll again after both are played.',
        'Three doubles in a row without finishing your turn ends that turn immediately.',
      ],
    },
    {
      title: 'Captures & blockades',
      points: [
        'Landing on a single opponent piece on a normal square sends it back to its home yard circle — they need a 6 to re-enter.',
        '★ Start squares and safe entry squares protect pieces — you can land there but cannot capture.',
        'If two of your pieces share a square, that space is blocked. Opponents cannot land on or pass through it.',
        'Your own pieces can still land on and pass your blockades.',
      ],
    },
    {
      title: 'Home column & winning',
      points: [
        'After completing the main track, pieces enter your colored home column toward the center.',
        'You need an exact roll to enter the home triangle — overshooting is not allowed.',
        'The first player with all four pieces in the center wins.',
      ],
    },
  ],

  i_call_on: [
    {
      title: 'Objective',
      points: [
        'Score the most points across all rounds by writing unique, valid answers for each category.',
        'Each category can earn up to 10 points per round (50 max).',
      ],
    },
    {
      title: 'Setup',
      points: [
        '3–20 players join with their name. The host sets game length, writing time, and marking time.',
        'Game length can be 10–60 minutes, or play until all 26 letters are used.',
        'Letter callers rotate — not one round per player, but as many letters as time allows.',
      ],
    },
    {
      title: 'How a letter works',
      points: [
        'The letter caller picks A–Z. Everyone fills Name, Animal, Place, Thing, and Food starting with that letter.',
        'When time runs out, papers pass — you mark the next player’s answers valid or invalid.',
        'The letter caller reviews everyone’s answers and approves the round before scores are revealed.',
        'Duplicates are detected automatically: if two or more players wrote the same answer in a category, everyone with that duplicate scores 5 for it.',
        'Everyone sees all answers, marks, and scores live so marking stays fair.',
      ],
    },
    {
      title: 'Scoring',
      points: [
        'Empty answer = 0.',
        'Duplicate answer = 5 (automatic).',
        'Marked invalid = 0 (e.g. wrong category like “cat” under Name).',
        'Unique + marked valid = 10 points.',
      ],
    },
  ],
  sudoku: [
    {
      title: 'Objective',
      points: [
        'Everyone races to solve the same 9×9 Sudoku puzzle.',
        'Fill cells one at a time — the first correct answer on a cell earns the most points.',
        'The player with the highest total score when the puzzle is complete wins.',
      ],
    },
    {
      title: 'How it works',
      points: [
        'The host shares a game code — everyone joins with their name.',
        'When the host starts, all players see the same partially-filled 9×9 grid.',
        'Tap a cell, then tap a number to submit. Erase clears a wrong draft; undo reverses your last local change.',
      ],
    },
    {
      title: 'Scoring',
      points: [
        'Per cell: 1st correct = +10, 2nd = +6, 3rd = +4, 4th+ = +2.',
        'Wrong answer = −3 points; the cell stays open for you to try again.',
        'Each player can score from a cell at most once. First correct answer sets the cell color.',
      ],
    },
    {
      title: 'Game end',
      points: [
        'The game ends when every empty cell has been solved correctly or the host taps “End Game”.',
        'The player with the highest total score wins.',
        "Players who didn't ready up for a rematch are excluded from the next game's leaderboard.",
      ],
    },
  ],

  tic_tac_toe: [
    {
      title: 'Objective',
      points: [
        'Ultimate Tic-Tac-Toe is nine small 3x3 boards arranged in one big 3x3 grid.',
        'Win three small boards in a row — across, down, or diagonally — to win the whole game.',
        'Win a small board the classic way: three of your marks (X or O) in a row inside it.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'Exactly 2 players join a room. The host can play too.',
        'One player is randomly assigned X, the other O. X always goes first.',
        'Optional per-turn timer keeps the game moving — if your timer runs out, the turn passes to the other player.',
      ],
    },
    {
      title: 'Taking a turn',
      points: [
        'The first move can go in any cell of any board.',
        'The cell you pick decides which board your opponent must play in next — e.g. play the top-right cell and they must play in the top-right board (highlighted for them).',
        'If you are sent to a board that is already won or completely full, you may play in any open board instead.',
      ],
    },
    {
      title: 'Winning',
      points: [
        'Get three small boards in a row, column, or diagonal to win the game immediately.',
        'A small board that fills with no winner counts as a draw and helps neither player.',
        'Play again resets every board for a fresh rematch — marks stay the same.',
      ],
    },
  ],

  chess: [
    {
      title: 'Objective',
      points: [
        'Checkmate your opponent’s king — attack it so it cannot escape, block, or capture its way out.',
        'A game with no checkmate can end in a draw (stalemate, insufficient material, repetition, or the fifty-move rule).',
      ],
    },
    {
      title: 'Setup',
      points: [
        'Exactly 2 players join a room. The host can play too.',
        'One player is randomly assigned White, the other Black. White always moves first.',
        'Optional chess clock — each player gets their own time bank (e.g. 10 minutes) that only counts down on their turn. Run out and you lose on time.',
      ],
    },
    {
      title: 'Taking a turn',
      points: [
        'On your turn, tap one of your pieces to see its legal moves, then tap a highlighted square to move there.',
        'All standard rules apply — castling, en passant, and pawn promotion are handled automatically; only legal moves are allowed.',
        'When a pawn reaches the far rank, choose what it promotes to (Queen, Rook, Bishop, or Knight).',
      ],
    },
    {
      title: 'Winning',
      points: [
        'Deliver checkmate to win immediately. You can also win if your opponent resigns or runs out of time.',
        'Stalemate or insufficient material ends the game in a draw.',
        'Play again starts a fresh game — colors swap so the previous Black player opens as White.',
      ],
    },
  ],

  checkers: [
    {
      title: 'Objective',
      points: [
        'Capture all of your opponent’s pieces — or leave them with no legal move — to win.',
        'A game where neither side can make progress can end in a draw (the 40-move rule).',
      ],
    },
    {
      title: 'Setup',
      points: [
        'Exactly 2 players join a room. The host can play too.',
        'One player is randomly assigned Red, the other Black. Red always moves first.',
        'Optional clock — each player gets their own time bank (e.g. 10 minutes) that only counts down on their turn. Run out and you lose on time.',
      ],
    },
    {
      title: 'Taking a turn',
      points: [
        'On your turn, tap one of your pieces to see its legal moves, then tap a highlighted square to move there.',
        'Men move one square diagonally forward; jump an adjacent opponent piece into the empty square beyond to capture it.',
        'Captures are forced — if any jump is available you must take it, and you must keep jumping with the same piece while more captures are on offer.',
        'A man that reaches the far row is crowned a king, which can move and capture both forward and backward.',
      ],
    },
    {
      title: 'Winning',
      points: [
        'Capture every enemy piece, or block their last legal move, to win. You can also win if your opponent resigns or runs out of time.',
        '40 moves with no capture or man advance ends the game in a draw.',
        'Play again starts a fresh game — colors swap so the previous Black player opens as Red.',
      ],
    },
  ],

  describe_it: [
    {
      title: 'Objective',
      points: [
        'Split into teams and score points by guessing words. The team with the most words guessed across all rounds wins.',
        'Each round, one team is on the clock — a describer gives clues for secret words and teammates race to guess them.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'Players join with their name and pick a team. The host chooses how many teams (2–4) and how many rounds.',
        'Each team needs at least 2 players — one to describe and at least one to guess.',
        'The host sets the turn length (e.g. 2 minutes). Built-in words are provided; the host can also add their own.',
      ],
    },
    {
      title: 'Taking a turn',
      points: [
        'The describer sees a secret word and types clues for it — but can’t use the word itself.',
        'Teammates type their guesses; the first correct guess scores a point and a new word appears instantly.',
        'The describer can skip a tough word. Only the team on the clock can score during their turn.',
      ],
    },
    {
      title: 'Winning',
      points: [
        'When a team’s timer runs out, their words are tallied and the next team takes over.',
        'The describer role rotates each round so everyone gets a turn to give clues.',
        'After every team has played all rounds, the highest total wins. A tie is shared.',
      ],
    },
  ],

  scrabble: [
    {
      title: 'Objective',
      points: [
        'Score the most points by building interlocking words on a 15×15 board.',
        'Each letter has a point value; premium squares multiply letters and whole words.',
      ],
    },
    {
      title: 'Setup',
      points: [
        '2–4 players join a room. The host can play too.',
        'Everyone draws 7 random tiles onto their rack. Tiles stay hidden from opponents.',
        'The first word of the game must cross the centre star.',
      ],
    },
    {
      title: 'Taking a turn',
      points: [
        'On your turn, place tiles from your rack to form a single word (across or down) that connects to tiles already on the board.',
        'Every word you make — the main word and any crosswords — must be a valid dictionary word, or the play is rejected.',
        'Instead of playing, you can swap any number of tiles back into the bag, or pass.',
        'A blank tile can be any letter (worth 0). Use all 7 tiles in one turn for a 50-point bonus.',
      ],
    },
    {
      title: 'Winning',
      points: [
        'The game ends when the bag is empty and a player uses their last tile, or when everyone passes twice in a row.',
        'Each player subtracts the value of tiles left on their rack; a player who used all their tiles gains the total of everyone else’s leftovers.',
        'The highest score wins. Tap Play again to start a fresh game.',
      ],
    },
  ],
  word_hunt: [
    {
      title: 'Objective',
      points: [
        'Everyone races on the same 4×4 letter grid.',
        'Find as many valid words as you can before the timer runs out.',
        'The player with the highest score wins.',
      ],
    },
    {
      title: 'How it works',
      points: [
        'Tap or drag across adjacent letters (including diagonals) to spell a word.',
        'Each letter can only be used once per word.',
        'Words must be at least 3 letters and appear in the dictionary.',
        'Submit each word once — duplicates do not score again.',
      ],
    },
    {
      title: 'Scoring',
      points: [
        '3 letters = 100 points.',
        '4 letters = 400 points.',
        '5 letters = 800 points.',
        'Longer words score even more (6+ letters add 400 pts per extra letter).',
      ],
    },
    {
      title: 'Game end',
      points: [
        'The game ends when the host taps “End game” or the timer hits zero.',
        'After time is up, no new words can be submitted.',
        'Play again generates a fresh letter grid for the next round.',
      ],
    },
  ],

  snake_and_ladder: [
    {
      title: 'Objective',
      points: [
        'Be the first player to move your token to square 100 on the 1–100 board.',
        'You must land on 100 with an exact roll. The first player to do that wins immediately.',
      ],
    },
    {
      title: 'Setup',
      points: [
        '2–6 players join a room and each gets a colored token starting just off square 1.',
        'Turn order is set when the host starts. An optional per-turn timer keeps the game moving.',
        'On your turn you roll a single die and move forward that many squares.',
      ],
    },
    {
      title: 'Ladders & snakes',
      points: [
        'Finish your move on the bottom of a ladder to climb up to its top.',
        'Finish your move on a snake’s head to slide down to its tail.',
        'You only jump when you land exactly on that square — passing over it does nothing.',
      ],
    },
    {
      title: 'Rolling a 6',
      points: [
        'Roll a 6 and you take another turn straight away.',
        'Roll three 6s in a row and your turn is forfeited — no move on the third six.',
      ],
    },
    {
      title: 'Winning',
      points: [
        'You must reach square 100 exactly. If a roll would take you past 100, your token stays put.',
        'The first token to land on 100 wins the game.',
      ],
    },
  ],
}
