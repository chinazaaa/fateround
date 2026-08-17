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
      title: 'Note on Editions & Themes',
      points: [
        'The detailed rules below use classic UK theme terminology and currency (£) as reference examples, but apply identically to all customizable Monopoly variations (including Naija Edition and others) where space names and currency units adapt to the selected theme.',
      ],
    },
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
        '2–6 players join a room and pick a board token (car, hat, dog, etc.). Each player starts on PAYDAY with £1,500.',
        'The Bank holds all Title Deeds until purchased. The host starts when everyone is ready; turn order is set at game start.',
      ],
    },
    {
      title: 'Moving & PAYDAY',
      points: [
        'On your turn, roll two dice and move clockwise around the 40-space board.',
        'Collect £200 from the Bank every time you land on or pass PAYDAY while moving forward — but not on your first lap around the board.',
        'Two or more tokens may occupy the same space.',
      ],
    },
    {
      title: 'Doubles',
      points: [
        'If you roll doubles, move, resolve the space, then roll again for another turn.',
        'If you roll doubles three times in a row on the same turn, go straight to NICKED — your turn ends immediately.',
      ],
    },
    {
      title: 'Buying property',
      points: [
        'You cannot buy from the Bank, pay TAX OFFICE or SURCHARGE, or draw Fate / Kitty cards until you have passed PAYDAY at least once on your first lap.',
        'Landing on an unowned Property, Station, or Utility after that lets you buy it at the listed price.',
        'If you decline to buy, the property is auctioned to the highest bidder — including you.',
        'Own all Sites in a colour-group (a monopoly) to charge double rent on unimproved properties in that group.',
      ],
    },
    {
      title: 'Rent',
      points: [
        "Landing on another player's property requires paying rent before the next player rolls.",
        'Station rent increases with each Station owned: £25, £50, £100, or £200 for one through four.',
        'Utility rent is 4× your dice roll if the owner has one Utility, or 10× if they own both.',
        'Build houses and hotels on complete colour-groups (evenly) to increase rent. Mortgaged properties collect no rent.',
      ],
    },
    {
      title: 'Fate & Kitty',
      points: [
        'You must pass PAYDAY once before drawing cards on your first lap — landing on Fate or Kitty before that ends your turn without drawing.',
        'Draw from the full 16-card Fate and 16-card Kitty decks.',
        'Cards may move you, pay or collect money, charge per house/hotel, or collect from every player.',
        'If a card moves you forward past PAYDAY, collect £200 (after your first lap). You do not collect PAYDAY salary when sent to NICKED.',
        'Skip-the-queue cards are kept until used or traded.',
      ],
    },
    {
      title: 'Taxes & LAY-BY',
      points: [
        'TAX OFFICE (space 4) and SURCHARGE (space 38) do not apply until you have passed PAYDAY once on your first lap.',
        'After that: TAX OFFICE is £200 and SURCHARGE is £100, paid to the Bank.',
        'LAY-BY has no penalty — simply rest there until your next turn.',
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
        'Propose trades with other players at any time — cash, properties, and skip-the-queue cards.',
        'The other player must accept or decline. You cannot trade properties that still have buildings on the colour-group.',
      ],
    },
    {
      title: 'NICKED',
      points: [
        'You are sent to NICKED by landing on "OFF TO JAIL", drawing a card, or rolling three doubles in one turn.',
        'Landing on the NICKED space while not sent there is "Just Visiting" — no penalty.',
        'A skip-the-queue card may be kept until used or traded.',
        'To get out: pay a £50 fine before your next roll, use a skip-the-queue card, or roll doubles on any of your next three turns.',
        'After three turns in NICKED without doubles, pay £50 and move according to your roll.',
        'While in NICKED you may still collect rent on properties you own (unless mortgaged).',
      ],
    },
    {
      title: 'Bankruptcy & winning',
      points: [
        'If you owe more than you can raise from cash and assets, you are bankrupt and out of the game.',
        'If bankrupt to another player, they receive your cash, properties, and skip-the-queue cards.',
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
      title: 'Scorecard categories & points',
      points: [
        'Upper section — Ones, Twos, Threes, Fours, Fives, Sixes: score the sum of the dice showing that number.',
        'Three of a Kind & Four of a Kind: score the total of all five dice when you have 3 (or 4) matching.',
        'Full House: three of one number plus two of another — a flat 25 points.',
        'Small Straight (four in a row) 30 points · Large Straight (five in a row) 40 points.',
        'Five of a Kind: 50 points · Chance: the sum of all five dice, any combination.',
      ],
    },
    {
      title: 'Scoring bonus',
      points: [
        'Score 63+ in the upper section (Ones through Sixes) to earn a 35-point bonus.',
        'After scoring 50 in the Five of a Kind box, each extra five-of-a-kind is worth a 100-point bonus.',
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
      title: 'Card values (for scoring)',
      points: [
        'Values only matter when a timed game ends before someone empties their hand — the lowest hand total wins, so hold cheap cards.',
        'Ace — 1 point.',
        'Number cards 2–10 — worth their face value (a 2 is 2 points, a 10 is 10 points, and so on).',
        'Jack, Queen, King — 10 points each.',
        '8 (Wild) and Joker — 50 points each, so avoid getting stuck holding them.',
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

  uno: [
    {
      title: 'Objective',
      points: [
        'Be the first player to get rid of all the cards in your hand.',
        'Match the top of the discard pile by colour, number, or symbol — or play a Wild to name the colour opponents must follow.',
      ],
    },
    {
      title: 'Setup',
      points: [
        '2–10 players join a room. Each player is dealt 7 cards from the 108-card deck.',
        'The rest form the draw pile, with one number card turned face-up to start the discard pile.',
      ],
    },
    {
      title: 'How to play',
      points: [
        "On your turn, play a card matching the top card's colour, number, or symbol.",
        'If you cannot (or choose not to) play, draw a card — if it can be played you may play it or keep it; otherwise your turn ends.',
        'When the draw pile runs out, played cards (except the current top card) are shuffled back in as a new draw pile.',
        'If nobody can play and no cards can be drawn, the game ends — lowest hand total wins.',
      ],
    },
    {
      title: 'Special cards',
      points: [
        'Skip — the next player loses their turn.',
        'Reverse — the direction of play flips (acts as a Skip in a 2-player game).',
        'Draw 2 — the next player draws 2 cards and is skipped.',
        'Wild — play on anything and name the colour the next player must follow.',
        'Draw 4 — name the colour and the next player draws 4. Playable anytime, but can be challenged.',
      ],
    },
    {
      title: 'Calling last card',
      points: [
        'When you play your second-to-last card, call "last card" — leaving you with one card.',
        'If you forget before the next player takes their turn, you draw a penalty (2 cards by default; the host can raise it to 4).',
      ],
    },
    {
      title: '0-7 rule (optional)',
      points: [
        'A host toggle for a spicier game — off by default.',
        'Play a 0 — every player passes their entire hand to the next player in the current direction of play.',
        'Play a 7 — swap your whole hand with any player you choose.',
      ],
    },
    {
      title: 'Stacking (optional)',
      points: [
        'A host toggle — off by default.',
        'When you are hit with a Draw 2 you may play your own Draw 2 instead of drawing; the penalty grows by 2 and passes to the next player. Draw 4 stacks the same way on Draw 4 (+4).',
        'The stack keeps growing until someone can’t (or won’t) add to it — that player draws the whole pile and loses their turn.',
        'You can only stack like-for-like: a Draw 2 on a Draw 2, a Draw 4 on a Draw 4.',
        'When stacking and the Draw 4 challenge are both on, the player who would have to draw the whole pile can still challenge — they challenge the most recent Draw 4 (the last person to stack one).',
      ],
    },
    {
      title: 'Multi-Play (optional)',
      points: [
        'A host setting — Off, Same colour, Same number, or Same colour or number (off by default).',
        'On your turn, tap “Play multiple”, then tap the cards you want to lay down together and confirm — so you can dump all your reds, or all your 6s, in one turn.',
        'The first card must legally match the top of the discard pile, and every card in the set must fit the chosen grouping rule.',
        'Cards resolve in the order you lay them, and the last card decides what the next player must match.',
        'Action-card effects still apply in sequence — but a plain number/colour card laid on top of an action settles the pile and cancels whatever is buried under it. Cover your own Draw 2 with a number and no one draws; leave the Draw 2 on top and the next player draws 2. A Draw 2 followed by a Skip does both — the next player draws 2 and the player after is skipped.',
        'Only the action cards after your last number card take effect. The full set you laid is shown above the pile (“Played together”) so covered cards stay visible.',
      ],
    },
    {
      title: 'Team-Up 2v2 (optional)',
      points: [
        'A host setting chosen when creating the room — exactly 4 players in 2 teams of 2.',
        'Teams are drawn at random and seated alternating, so teammates always sit across the table and play in strict order (you never skip to your partner).',
        'You can see your teammate’s hand at all times (shown as a read-only “Partner” panel) — a digital-only edge; opponents still can’t see either of your hands.',
        'The round ends the moment either member of a team empties their hand — that team wins, no matter how many cards their partner is still holding.',
        'Penalties still hit only the targeted player; with Stacking on, the target can play their own matching Draw card on their turn to pass it to an opponent. Everyone still calls the last card for themselves.',
      ],
    },
    {
      title: 'Jump-In (optional)',
      points: [
        'A host setting — off by default (recommended off for strict turn order, on for chaotic casual lobbies).',
        'When on, if you hold an EXACT match for the card on top — same colour AND same number, or same colour AND same symbol (e.g. Red 7 on Red 7, Blue Skip on Blue Skip) — you can play it instantly, even when it isn’t your turn. Just tap the highlighted card.',
        'Only exact matches qualify: a different-coloured 7, or a red card of another number, does not count. Wild and Draw 4 cards can never be jumped on.',
        'Play then continues from whoever sits after you (in the current direction) — everyone you jumped over loses that turn entirely.',
        'If two players hold the same card, whoever taps first gets it; the window then closes on the old card (but a match for the new card is fair game).',
        'Jump-In plays a single card — it never triggers a Multi-Play dump — and it’s disabled while a Draw 2/Four penalty is still pending. Drop to one card on a Jump-In and you must still call the last card; jump in a 0 or 7 and its effect fires as normal.',
      ],
    },
    {
      title: 'Draw 4 challenge',
      points: [
        'A Draw 4 is only meant to be played when you have no card of the current colour.',
        'The next player can accept the draw, or challenge: the system reveals the hand.',
        'If the player was bluffing (held the colour), they draw 4 instead — the challenger is safe, and it becomes the challenger’s turn to play as normal (they never lost their turn, just the draw).',
        'If the challenge is wrong, the challenger draws 6 (the 4 they refused plus a 2 penalty) and is skipped.',
        'Hosts can turn the challenge off, in which case a Draw 4 always makes the next player draw 4.',
      ],
    },
    {
      title: 'Card values (for scoring)',
      points: [
        'Values only matter when a timed game ends before someone empties their hand — lowest hand total wins.',
        'Number cards — worth their face value (0–9).',
        'Skip, Reverse, Draw 2 — 20 points each.',
        'Wild and Draw 4 — 50 points each, so avoid getting stuck holding them.',
      ],
    },
    {
      title: 'Game length',
      points: [
        'The host can set a game length (10, 15, 30 minutes, etc.) or play with no limit.',
        'First to empty their hand wins during normal play (no game clock).',
        'With a game clock, time running out ends the game — lowest hand total wins.',
      ],
    },
    {
      title: 'High Stakes mode',
      points: [
        'A host toggle at room creation — flips the whole game to a 168-card deck with new action + wild cards, harder stacking, and knockouts. Classic mode is untouched.',
        '0-7 rule and Draw-card stacking (any equal-or-higher chain) are locked ON. Draw 4 challenge, Team-Up, and Jump-In are OFF. Multi-Play is host-picked in High Stakes just like Classic — pick Off / colour / number / colour-or-number when creating the room.',
        'Mercy knockout — the moment you hold 25 or more cards you are knocked out for the round. Host chooses the win condition when creating: “first out” (classic — empty your hand to win) or “last standing” (outlast every knockout).',
        'If you can’t play, draw — the deck keeps dealing you cards until you finally turn up one that fits, then it stops on that playable card so you can play it or keep it.',
      ],
    },
    {
      title: 'High Stakes — new cards',
      points: [
        'Discard Colour — play it and every other card of its colour in your hand goes to the discard pile with it. A hand dump in one turn.',
        'Skip All — skip every other player at the table; play returns to you and you go again.',
        'Reverse Draw 4 (Wild) — flip the direction of play, then the next player in the new direction draws 4. In a 2-player game the flip puts you back in the hot seat — YOU take the 4 (or stack an equal-or-higher Draw on top to bounce it).',
        'Draw 6 (Wild) — the next player draws 6 and is skipped.',
        'Draw 10 (Wild) — the next player draws 10 and is skipped.',
        'Colour Roulette (Wild) — the next player picks a colour, then clicks Draw one card at a time until they turn up a card of that colour. Everything revealed lands in their hand and their turn ends.',
      ],
    },
    {
      title: 'High Stakes — stacking',
      points: [
        'Any Draw card can stack onto a pending Draw penalty, as long as its value is EQUAL OR HIGHER than the pending value: +2 → +4 → +4 Reverse → +6 → +10. You can never reduce the stack (no +4 on a pending +6).',
        'Every stacked card adds its own value to the running penalty — pending +4 with a +10 played on top becomes 14 for the next player to draw (or continue stacking to +24 with a second +10).',
        'The chain resolves the moment someone can’t (or won’t) add to it — that player draws the whole running total. If the draw pushes them past 25 cards, the Mercy rule knocks them out.',
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

  mahjong: [
    {
      title: 'Objective',
      points: [
        'Be the first player to complete a legal Mahjong hand before the wall runs out.',
        'A standard winning hand is four melds plus one pair. Seven pairs and thirteen orphans also win.',
        'If nobody wins before the wall is empty, the game ends in a wall draw.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'Exactly 4 players join the room. Seats are East, South, West, and North.',
        'Simple Mahjong uses 136 tiles: three suits numbered 1-9 plus wind and dragon honors. Flowers are not included.',
        'Hosts can switch to Hong Kong, Riichi, or MCR rules before starting when the group wants a stricter ruleset.',
        'East starts with 14 tiles and discards first. The other players start with 13 tiles.',
        'Optional per-turn timers keep draws, discards, and calls moving.',
      ],
    },
    {
      title: 'Turn flow',
      points: [
        'On your turn, draw one tile from the wall, then discard one tile from your hand.',
        'After a discard, eligible players may call Mahjong, Pung, Kong, or Chow.',
        'If nobody claims the discard, play continues to the next player.',
      ],
    },
    {
      title: 'Calls',
      points: [
        'Mahjong: claim the winning tile from any player, or declare after your own draw if your hand is complete.',
        'Pung: claim a discard when you have two matching tiles in hand.',
        'Kong: claim a discard with three matching tiles, declare a concealed Kong with four matching tiles, or upgrade an exposed Pung when you draw the fourth tile.',
        'Chow: claim a suited sequence only from the player immediately before you in turn order.',
        'Kongs draw a replacement tile before the player discards.',
      ],
    },
    {
      title: 'Scoring',
      points: [
        'Winning hands show a fan summary with pattern, bonuses, total points, and point deltas.',
        'The in-app scoring model rewards self draw, concealed hands, Pungs/Kongs, dragons, winds, flushes, all simples, seven pairs, and thirteen orphans.',
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

  ping_pong: [
    {
      title: 'Objective',
      points: [
        "Hit the ball back and forth. Don't miss.",
        'Score when your opponent whiffs it or hits it out of bounds.',
        'First to the target score wins — but you have to win by two.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'Two players join. The host picks the winning score (3 to 21).',
        'One player takes the top paddle, the other takes the bottom.',
      ],
    },
    {
      title: 'How to play',
      points: [
        'Drag your paddle to block and return the ball.',
        'If you tie at match point (like 6-6 in a game to 7), you enter overtime. Play continues until someone takes a 2-point lead.',
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
        'American Checkers (8×8 draughts) — capture all of your opponent’s pieces, or leave them with no legal move, to win.',
        'Forced jumps and king promotion are enforced automatically. Optional per-player clocks are available.',
      ],
    },
    {
      title: 'Board & setup',
      points: [
        'The board is 8×8, like chess — but only the 32 dark squares are used. Light squares are never occupied.',
        'Each player starts with 12 pieces: Black on the top three rows, Red on the bottom three (middle two rows empty).',
        'Exactly 2 players join a room. The host can play too. Colors are assigned at random; Black always moves first.',
        'Optional clock — each player gets their own time bank (3, 5, or 10 minutes) that only counts down on their turn.',
      ],
    },
    {
      title: 'Men (regular pieces)',
      points: [
        'Move one square diagonally forward to an empty dark square.',
        'Capture by jumping diagonally over an adjacent opponent piece into the empty square beyond — the jumped piece is removed.',
        'Men can only move and capture forward — not backward.',
      ],
    },
    {
      title: 'Kings',
      points: [
        'When a man reaches the opponent’s back row (the “crownhead”), it is crowned a king automatically.',
        'Kings move and capture one square diagonally in any direction — forward or backward.',
        'American kings are “short” — they slide only one square at a time (not flying kings).',
        'If a man is crowned during a jump, the turn ends — it does not keep jumping as a king.',
      ],
    },
    {
      title: 'Captures & multi-jumps',
      points: [
        'Mandatory capture: if any jump is available anywhere on the board, you must capture — you cannot make a normal move instead.',
        'When multiple capture options exist, you may choose which one (American rules do not require the longest capture).',
        'Multiple jumps: if the same piece can jump again after landing, you must keep going in the same turn — you cannot stop halfway.',
        'Tap a piece, then its destination. During a chain, only the jumping piece can move.',
      ],
    },
    {
      title: 'Winning & draws',
      points: [
        'Win by capturing every enemy piece, or by blocking all of the opponent’s legal moves.',
        'You can also win if your opponent resigns or runs out of time on the clock.',
        'Draw — threefold repetition: the same board position (with the same side to move) occurs three times.',
        'Draw — 40-move rule: 40 consecutive moves by each player with no capture and no man move.',
        'Play again starts a fresh game — colors swap so the previous Red player opens as Black.',
      ],
    },
    {
      title: 'Rules that trip up beginners',
      points: [
        'Flying kings (sliding any distance diagonally) are International Draughts — not used here.',
        'Men cannot capture backward — only kings can move and jump in reverse.',
        'You do not have to take the capture that removes the most pieces — any legal capture is fine.',
        'Huffing (removing a piece for missing a jump) is an old rule — not used. You simply must take the jump.',
      ],
    },
    {
      title: 'Quick strategy',
      points: [
        'Control the center — pieces there have more movement options.',
        'Keep men on your back row as long as you can — they cannot be jumped from behind.',
        'A king is worth roughly 2–3 men — don’t trade two men for one unless it gains position.',
        'Edge pieces have fewer escape squares — try to force your opponent toward the sides.',
        'Watch for traps: bait a piece forward, then jump it with two of yours for a 2-for-1.',
      ],
    },
  ],

  checkers_international: [
    {
      title: 'Objective',
      points: [
        'International Draughts (flying kings, 10×10 board) — capture all of your opponent’s pieces, or leave them with no legal move, to win.',
        'Mandatory majority capture and flying kings are enforced automatically. Optional per-player clocks are available.',
      ],
    },
    {
      title: 'Board & setup',
      points: [
        'The board is 10×10 — only the 50 dark squares are used. Light squares are never occupied.',
        'Each player starts with 20 pieces on the first four rows of their side.',
        'Exactly 2 players join a room. The host can play too. White always moves first.',
        'Optional clock — each player gets their own time bank (3, 5, or 10 minutes) that only counts down on their turn.',
      ],
    },
    {
      title: 'Men (regular pieces)',
      points: [
        'Move one square diagonally forward to an empty dark square.',
        'Capture by jumping diagonally over an adjacent opponent piece — unlike American checkers, men can capture in any direction, forward or backward.',
      ],
    },
    {
      title: 'Kings',
      points: [
        'When a man reaches the opponent’s back row, it is crowned a king automatically — but only at the end of a capture sequence, never mid-jump.',
        'Kings "fly" — they move and capture along the entire open diagonal, like a bishop, not just one square at a time.',
        'A flying king can capture from several squares away, landing on any empty square beyond the captured piece.',
      ],
    },
    {
      title: 'Captures & majority rule',
      points: [
        'Mandatory capture: if any jump is available anywhere on the board, you must capture.',
        'Majority capture: when more than one capture sequence is available, you must play the sequence that captures the most pieces — FateRound only allows moves that satisfy this.',
        'Multiple jumps: if the same piece can jump again after landing, you must keep going in the same turn.',
      ],
    },
    {
      title: 'Winning & draws',
      points: [
        'Win by capturing every enemy piece, or by blocking all of the opponent’s legal moves.',
        'You can also win if your opponent resigns or runs out of time on the clock.',
        'Draw — 25-move rule: 25 consecutive moves by each player with no capture and no man move.',
        'Play again starts a fresh game — colors swap so the previous Black player opens as White.',
      ],
    },
    {
      title: 'Rules that trip up beginners',
      points: [
        'Unlike American checkers, men here capture backward too, not just forward.',
        'You must take the capture sequence that removes the most pieces — you cannot pick a shorter one.',
        'Kings fly the whole diagonal — they are not limited to one square at a time like American kings.',
      ],
    },
    {
      title: 'Quick strategy',
      points: [
        'Control the center — pieces there have more movement options.',
        'A flying king is very strong — protect your back rows to delay your opponent’s promotions.',
        'Count capture sequences before moving — the majority rule can force a jump you didn’t plan on.',
      ],
    },
  ],

  checkers_nigeria: [
    {
      title: 'Objective',
      points: [
        'Nigerian Draughts (Naija checkers) — the same 10×10 flying-kings engine as International Draughts, with local "seed" terminology.',
        'Capture all of your opponent’s seeds, or leave them with no legal move, to win. Optional per-player clocks are available.',
      ],
    },
    {
      title: 'Board & setup',
      points: [
        'The board is 10×10, mirrored to the familiar Nigerian orientation — only the dark squares are used.',
        'Each player starts with 20 seeds on the first four rows of their side.',
        'Exactly 2 players join a room. The host can play too.',
        'Optional clock — each player gets their own time bank (3, 5, or 10 minutes) that only counts down on their turn.',
        'Hosts can optionally switch on Street Rules for a house-rules variant popular in casual street/park play.',
      ],
    },
    {
      title: 'Seeds (regular pieces)',
      points: [
        'Move one square diagonally forward to an empty dark square.',
        'Capture by jumping diagonally over an adjacent opponent seed — seeds can capture in any direction, forward or backward.',
      ],
    },
    {
      title: 'Kings',
      points: [
        'When a seed reaches the opponent’s back row, it is crowned a king automatically — only at the end of a capture sequence, never mid-jump.',
        'Kings fly the full open diagonal, capturing from a distance, just like International Draughts.',
      ],
    },
    {
      title: 'Captures & majority rule',
      points: [
        'Mandatory capture: if any jump is available anywhere on the board, you must capture.',
        'Majority capture: when more than one capture sequence is available, you must play the sequence that captures the most seeds.',
        'Multiple jumps: if the same seed can jump again after landing, you must keep going in the same turn.',
      ],
    },
    {
      title: 'Winning & draws',
      points: [
        'Win by capturing every enemy seed, or by blocking all of the opponent’s legal moves.',
        'You can also win if your opponent resigns or runs out of time on the clock.',
        'Draw — 25-move rule: 25 consecutive moves by each player with no capture and no seed-only move.',
        'Play again starts a fresh game — colors swap sides.',
      ],
    },
    {
      title: 'Rules that trip up beginners',
      points: [
        'This is the same engine as International Draughts — seeds capture backward too, not just forward.',
        'You must take the capture sequence that removes the most seeds — you cannot pick a shorter one.',
        'Street Rules is an optional toggle a host can turn on — off by default, matching standard flying-kings play.',
      ],
    },
    {
      title: 'Quick strategy',
      points: [
        'Control the center — seeds there have more movement options.',
        'A flying king is very strong — protect your back rows to delay your opponent’s promotions.',
        'Count capture sequences before moving — the majority rule can force a jump you didn’t plan on.',
      ],
    },
  ],

  ayo: [
    {
      title: 'Objective',
      points: [
        'Win more houses than your opponent by sowing strategically around the board.',
        'A house is won when your last seed makes it hold exactly four seeds. The winner is traditionally called Ọta; the loser is Ọpẹ. Three straight wins makes an Ọta champion.',
      ],
    },
    {
      title: 'Board & setup',
      points: [
        '12 houses in two rows of six — one row per player, four seeds in each house (48 total).',
        'Exactly 2 players. The host can play. Player A opens on the first game; sides swap on rematch.',
        'Optional per-player clock — Casual (untimed), Ranked (30s), or 3/5/10 minutes each.',
      ],
    },
    {
      title: 'How a turn works',
      points: [
        'Pick up all seeds from one of your own houses that has seeds.',
        "Sow anti-clockwise — drop one seed per house, continuing through the house you picked up and into your opponent's row.",
        'Relay: if your last seed lands in a house that already had seeds, pick them all up and keep sowing. Your turn ends only when your last seed lands in an empty house.',
        "Capture: when your last seed makes a house hold exactly four seeds — your own or your opponent's — you win that house and its four seeds. (Making five, 4+1, wins nothing — you relay on.)",
      ],
    },
    {
      title: 'Winning',
      points: [
        'The player who has won the most houses wins.',
        'Endgame: once only eight seeds remain, the player who captures the first four automatically takes the last four and the game ends.',
        'You can also win if your opponent resigns, leaves, or runs out of time. If both players win the same number of houses, the most seeds captured breaks the tie; a draw needs both to be equal.',
      ],
    },
    {
      title: 'Spectators',
      points: [
        'Late joiners can watch the match in read-only mode — Ayo is traditionally played with commentary and banter.',
        'A host who is not seated can follow the game live while managing the room.',
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

  word_rush: [
    {
      title: 'Objective',
      points: [
        'Name valid English words that start with one letter and end with another.',
        'Team mode: most correct words across all rounds wins. Individual mode: highest personal score wins.',
      ],
    },
    {
      title: 'Team mode',
      points: [
        'The host sets how many rounds (e.g. 3, 5, 7). Each round, every team gets one timed run (default 2 minutes).',
        'Round 1: Team 1 plays, then Team 2, and so on. Round 2: same order again. Highest total correct words across all rounds wins.',
        'Everyone on the active team can type answers. The first correct answer scores and the next letter pair appears immediately.',
        'Automatic mode generates prompts; manual mode lets one teammate enter letter pairs while the timer runs — that caller rotates each round so different people pick letters.',
      ],
    },
    {
      title: 'Individual mode',
      points: [
        'Each round shows one letter pair. Guessers get one answer — fastest correct answers score the most points (10 base + up to 40 speed bonus, like Text Charades). Longer words earn extra bonus points (+2 per letter beyond 3).',
        'In manual mode, a rotating player enters the letters each round and sits out while others guess — they earn mirror points from correct scores. Automatic mode picks letters for everyone each round.',
        'When everyone has answered, the round ends immediately. Otherwise the timer ends the round. Different players can submit the same word — there is no duplicate-word penalty.',
      ],
    },
    {
      title: 'Hard mode',
      points: [
        'Optional difficulty where the minimum word length increases each round (round 1: 3 letters, round 2: 4, round 3: 5, round 4+: 6).',
        'Works in both team and individual modes. Automatic prompt mode uses the round minimum; in manual mode the letter-setter can raise the minimum for that pair (but not go below the round floor).',
      ],
    },
    {
      title: 'Valid words',
      points: [
        'Answers must be real dictionary words (3–20 letters), matching both the start and end letter. Words are checked against merged English Scrabble lists (ENABLE, Collins, TWL) plus our Word Hunt word bank.',
        'In team mode, only the first correct answer on each letter pair counts — the pair advances immediately, so type fast.',
        'In individual mode, every player answers the same pair and multiple players can use the same word.',
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
        'The first word of the game must cross the center star.',
      ],
    },
    {
      title: 'Taking a turn',
      points: [
        'On your turn, place tiles from your rack to form a single word (across or down) that connects to tiles already on the board.',
        'Every word you make — the main word and any crosswords — must be a valid dictionary word, or the play is rejected.',
        'Instead of playing, you can swap any number of tiles back into the bag (only while at least 7 tiles remain), or pass.',
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

  wordle_room: [
    {
      title: 'Objective',
      points: [
        'Everyone races through the same fixed set of 5–20 words — all solved Wordle-style.',
        'The player who solves the most words (fewest guesses, fastest time) wins.',
      ],
    },
    {
      title: 'Setup',
      points: [
        'The host picks a word category (General English or Naija Slang) and how many words the race covers (5, 10, 15 or 20).',
        'The host can set a whole-game timer (2, 5, 10 or 15 minutes) or leave it untimed so the race runs until everyone finishes.',
        'Everyone gets the exact same word sequence, in the same order.',
      ],
    },
    {
      title: 'How it works',
      points: [
        'Each word is solved like Wordle — type a guess and get colour feedback on every letter.',
        'Solve a word to move on to the next one. Run out of guesses and the word counts as a miss and you advance anyway — nobody gets stuck.',
        'You only see the word you are currently solving; nobody can read ahead in the sequence.',
      ],
    },
    {
      title: 'Scoring',
      points: [
        'Every solved word scores base points — fewer guesses means more points.',
        'Solving a word on your first guess earns a +200 perfect bonus.',
        'Unsolvable words score 0. There are no streaks — each word scores independently.',
      ],
    },
    {
      title: 'Game end',
      points: [
        'Untimed races end when every seated player finishes the sequence.',
        'Timed races auto-submit when the clock hits zero: solved words keep their points, your current word is lost, and unreached words score nothing.',
        'Standings rank by most words solved, then fewer total guesses, then faster total time.',
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
  mafia: [
    {
      title: 'Objective',
      points: [
        'Village team: Identify and eliminate all Mafia members (and any Solo killers) to win.',
        'Mafia team: Eliminate Villagers until you match or outnumber them.',
        'Solo roles (Jester, Serial Killer, Arsonist): Each has their own unique win condition.',
      ],
    },
    {
      title: 'Setup',
      points: [
        '5 to 16 players join the lobby. Each player is secretly assigned a role.',
        'Role selection is automatic — the host only flips one Classic/Advanced switch. Classic uses Bodyguard, Serial Killer, and Priest; Advanced swaps in Trapper, Arsonist, and Vigilante (plus Witch and Little Girl join the mix).',
        'The investigator trio (Aura Seer, Seer, Detective) rotates — only 2 of the 3 appear in any given game, never all 3. In Advanced mode, if Detective wins that rotation it becomes Tracker instead.',
        "The Mafia's specialist lineup varies too — Alpha Mafia is independently likely to appear, and Junior Mafia/Framer are mutually exclusive (never both in the same game). Mafia Seer is always available.",
        'Village roles include Villager, Doctor, Aura Seer, Bodyguard, Mayor, Vigilante, Tracker, Medium, Priest, Witch, Little Girl, Trapper, Detective, and Seer.',
        'Mafia roles include Mafia, Alpha Mafia, Junior Mafia, Framer, and Mafia Seer.',
        'Solo roles (Jester, Serial Killer, Arsonist) and Special roles (Cupid, Cursed Villager) add extra twists.',
      ],
    },
    {
      title: 'Night Phase',
      points: [
        'The Mafia secretly vote on a player to eliminate.',
        'The Doctor chooses a player to save from elimination (cannot self-heal).',
        'The Aura Seer investigates one player to learn their alignment — Good, Evil, or Unknown (Solo roles and kill/revive-capable Village roles read Unknown). Beware the Framer!',
        'The Detective checks two players to learn whether they are on the same team.',
        'The Bodyguard protects a player — that player cannot be killed, but the Bodyguard is attacked instead (survives the first attack, dies on the second).',
        'The Tracker sees who their target visited that night.',
        'The Medium can read ghost chat and may revive one dead player (once per game).',
        'The Witch may use a protect potion (only consumed if it actually saves someone) and, from night 2 onward, a kill potion (once per game).',
        'The Little Girl may choose to open her eyes: 75% she sees nothing, 20% she identifies a Mafia member, 5% she is caught and killed.',
        "The Trapper sets traps on up to 3 houses over time, then activates them all — a trapped Mafia kill instead kills the Mafia's weakest member, other attacks are simply blocked.",
        'Solo killers (Serial Killer, Arsonist) act independently.',
        'Villagers, Mayor, and Jester sleep during this phase.',
      ],
    },
    {
      title: 'Day Phase',
      points: [
        'A sunrise report announces who died last night (or if nobody died).',
        'Investigation results from the previous night are delivered privately to each investigative role.',
        'The Vigilante may shoot or reveal one player during the day (each once, not on the same day).',
        'The Priest may throw holy water on one player (once per game) — if they are Mafia, they die; if not, the Priest dies and the target is confirmed innocent.',
        "The town discusses and debates who they suspect. The Mayor's vote counts double.",
        'Players vote to eliminate one suspect. Plurality wins; ties result in no elimination.',
        'If the Jester is voted out, the Jester wins!',
      ],
    },
  ],

  matching_pairs: [
    {
      title: 'Objective',
      points: [
        'Everyone plays their own private board — same icons, independently shuffled positions.',
        'Flip two cards per turn. Match the pair to keep them face-up and score +1000 points.',
        'The player with the highest total score when everyone has finished wins.',
      ],
    },
    {
      title: 'How it works',
      points: [
        'The host shares a game code — everyone joins with their name.',
        'When the host starts, each player sees their own 4x4 (Standard) or 8x4 (Large) card grid.',
        'Tap a card to flip it, then tap a second card. If they match, they stay up. If not, both flip back after 0.8 seconds.',
      ],
    },
    {
      title: 'Scoring',
      points: [
        '+1000 points per correctly matched pair.',
        'Streak bonus: match 3 in a row with no miss in between to earn +500 bonus points. Streaks stack — 6 in a row = +1000 total streak bonus.',
        'Placement bonus: first to finish earns +1500, second +1000, third +500.',
        'Perfect game bonus: complete the board with zero wrong attempts for an extra +2000 points.',
      ],
    },
    {
      title: 'Game end',
      points: [
        'The game ends when the last remaining player finishes matching every pair on their board.',
        'Players who finish early see a live progress screen showing how many pairs each opponent has matched.',
        'Final scores include base points + streak bonus + placement bonus + perfect-game bonus (if earned).',
      ],
    },
  ],

  quiplash: [
    {
      title: 'Objective',
      points: [
        'Each round shows a fill-in-the-blank prompt.',
        'Everyone writes one funny answer.',
        'Everyone votes once for the funniest answer (not your own).',
        'You earn one point per vote your answer receives. Most points after all rounds wins.',
      ],
    },
    {
      title: 'How it works',
      points: [
        '3–6 players join with their name.',
        'Step 1 — Write: everyone submits one answer (default 60 seconds). Answers stay secret.',
        "Step 2 — Vote: all answers appear at once — tap the funniest one. You can't vote for your own.",
        'Step 3 — Results: see who wrote what and how many votes each answer got.',
        'Three to five rounds, then the leaderboard crowns a winner.',
      ],
    },
    {
      title: 'Tips',
      points: [
        'You only get one vote per round — make it count.',
        'Authors stay anonymous until results.',
        'If only one person submits, they still earn points from the room.',
      ],
    },
  ],

  quick_draw: [
    {
      title: 'Two ways to play',
      points: [
        'Lie mode (Drawful-style): draw a weird prompt, others write fake titles, everyone votes on the real one.',
        'Guess mode (Pictionary-style): draw a secret word while teammates (or everyone) race to guess it.',
      ],
    },
    {
      title: 'Lie mode',
      points: [
        'Each round everyone gets a unique weird prompt to draw.',
        'Non-artists write fake titles; everyone votes on which title is real.',
        'Artists earn points when people pick the real title; fakers earn points for fooling the room.',
      ],
    },
    {
      title: 'Guess mode',
      points: [
        'Teams or individual free-for-all — host picks when creating the game.',
        'The drawer sees a secret word and sketches it live on their phone.',
        'Teammates (or all other players) type guesses; correct guesses score points and advance to the next word.',
        'Team mode: most words guessed wins. Individual mode: fastest correct guesses score the most.',
      ],
    },
    {
      title: 'Lie mode tips',
      points: [
        'Bad drawings are funnier — don’t stress about art skills.',
        'The real title is mixed in with the fakes; bold lies often win.',
        'Spectators can watch but cannot draw, title, or vote.',
      ],
    },
    {
      title: 'Guess mode tips',
      points: [
        'Stick to simple shapes — teammates guess from your sketch, not your art degree.',
        'Use the eraser and undo if you mess up; speed matters more than polish.',
        'In team mode, only players on the active team can score guesses during that turn.',
      ],
    },
  ],
  crossword: [
    {
      title: 'Objective',
      points: [
        'Everyone races on the same crossword grid.',
        'Fill every white cell with the correct letters from the Across and Down clues.',
        'First player to complete the whole grid correctly wins — or the highest score when the timer ends.',
      ],
    },
    {
      title: 'How it works',
      points: [
        '1 to 20 players join with their name; the host picks a theme, difficulty, and optional time limit.',
        'Tap a cell to highlight its word, then type the answer. Correct letters lock in your colour.',
        'Each completed word scores 10 points, plus a 5-point speed bonus for finishing that word first.',
        'Need a nudge? Reveal a letter as a hint — but each revealed letter costs 3 points.',
      ],
    },
    {
      title: 'Tips',
      points: [
        'Start with the clues you’re sure of — crossing letters unlock the harder ones.',
        'Finishing a word first is worth extra, so keep moving.',
        'Spectators can watch the grid fill in but can’t enter letters.',
      ],
    },
  ],
  word_search: [
    {
      title: 'Objective',
      points: [
        'Everyone hunts the same grid of scattered letters for the same list of hidden words.',
        'Words run horizontally, vertically, or diagonally — and on harder puzzles, backwards too.',
        'First player to find every listed word wins — or the highest score when the timer ends.',
      ],
    },
    {
      title: 'How it works',
      points: [
        '1 to 20 players join with their name; the host picks a theme, difficulty, and optional time limit.',
        'Drag from a word’s first letter to its last to select it. Correct finds lock in your colour and strike off the list.',
        'Each word found scores 10 points, plus a 5-point speed bonus for finding that word first.',
        'Stuck? Reveal one of the remaining words — but each reveal costs 10 points.',
      ],
    },
    {
      title: 'Tips',
      points: [
        'Scan row by row for a word’s first letter, then check all directions from it.',
        'Finding a word first is worth extra, so keep moving.',
        'On harder puzzles, don’t forget words can read backwards and diagonally.',
      ],
    },
  ],
  word_scramble: [
    {
      title: 'Objective',
      points: [
        'Everyone gets the same jumbled words and races to type the unscrambled answer.',
        'Correct answers lock in and score; wrong guesses just clear so you can try again.',
        'First player to unscramble every word wins — or the highest score when the timer ends.',
      ],
    },
    {
      title: 'How it works',
      points: [
        '1 to 20 players join with their name; the host picks a theme, difficulty, and optional time limit.',
        'Type your guess for the current scramble. Correct answers score and reveal the next scramble.',
        'Each solve scores 10 points, plus a 5-point speed bonus for solving that scramble first; harder puzzles add a per-letter bonus.',
        'Stuck? Reveal a letter for a small penalty.',
      ],
    },
    {
      title: 'Tips',
      points: [
        'Look for common prefixes and suffixes (RE-, -ING, -TION) to crack longer words fast.',
        'Solving first is worth extra, so trust your first instinct and keep moving.',
        'Sound the letters out — saying them aloud often reveals the word.',
      ],
    },
  ],
  word_grouping: [
    {
      title: 'Objective',
      points: [
        'You are shown 16 words. Find the 4 hidden groups of 4 words that share a common connection.',
        'You have a maximum of 4 mistakes — after that the puzzle is over and any remaining groups are revealed.',
        'Harder groups score more points, so solving the trickiest connection first pays off.',
      ],
    },
    {
      title: 'How it works',
      points: [
        'Select 4 words you think belong together and submit your guess.',
        'If the group is correct it locks in and you see the connection. If not, you lose one of your 4 lives.',
        'Groups are colour-coded by difficulty: the easiest group scores 1 point and the hardest scores 4.',
        'Keep going until you find all 4 groups or run out of mistakes.',
      ],
    },
    {
      title: 'Tips',
      points: [
        'Start with the group you are most confident about — locking it in removes 4 words and makes the rest easier.',
        'Watch for red herrings: some words could fit more than one category, but each word belongs to exactly one group.',
        'If you are stuck, look for the oddest connection — the hardest group is often the least obvious theme.',
      ],
    },
  ],
  landmine: [
    {
      title: 'Objective',
      points: [
        'A category is shown and the system secretly plants a “mine” — one of the most obvious answers.',
        'Everyone types one answer blind, without knowing which one is the mine.',
        'Play a valid answer that isn’t the mine to score; hit the mine and you’re zeroed (Zero Points mode) or knocked out (Elimination mode — last player standing wins).',
      ],
    },
    {
      title: 'How it works',
      points: [
        '3 to 20 players join with their name (Elimination mode plays best with 5 or more).',
        'Each round a player picks a category and the system secretly picks the mine; everyone submits one answer before the timer ends.',
        'Answers are shuffled and each is assigned to a different player to mark Valid or Void — this happens before the mine is revealed, so nobody can mark strategically.',
        'The mine is revealed and scored: a valid, non-mine answer scores 10 (+5 if nobody else gave the same answer); a voided answer scores 0.',
      ],
    },
    {
      title: 'Modes, timers & options',
      points: [
        'Zero Points: hitting the mine scores 0 for that round; everyone plays a set number of rounds. Softer, better for casual groups.',
        'Elimination: hitting the mine knocks you out; the last player standing wins.',
        'The host sets the writing and marking timers, the number of mines per round (1, or 2–3 for more carnage), the originality bonus, and whether the host can overturn a contested mark.',
      ],
    },
    {
      title: 'Tips',
      points: [
        'The most obvious answer is the most likely mine — a slightly less common but still valid answer is the safe play.',
        'Nobody else giving your answer earns a bonus, so avoid the crowd where you safely can.',
        'When marking, judge only whether the answer fits the category — you won’t know the mine yet.',
      ],
    },
  ],
}
