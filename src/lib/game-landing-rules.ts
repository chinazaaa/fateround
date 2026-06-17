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
        'Each round reads a "Never have I ever…" prompt. Tap I have if you\'ve done it, or I haven\'t if you haven\'t.',
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
        'Read the prompt and tap I have or I haven\'t before the timer ends.',
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
        'You cannot buy from the Bank or draw Chance / Community Chest cards until you have passed GO at least once on your first lap.',
        'Landing on an unowned Property, Station, or Utility after that lets you buy it at the listed price.',
        'If you decline to buy, the property is auctioned to the highest bidder — including you.',
        'Own all Sites in a colour-group (a monopoly) to charge double rent on unimproved properties in that group.',
      ],
    },
    {
      title: 'Rent',
      points: [
        'Landing on another player\'s property requires paying rent before the next player rolls.',
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
        'Income Tax (space 4): pay £200 to the Bank.',
        'Super Tax (space 38): pay £100 to the Bank.',
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
        'On your turn, play a card that matches the top card\'s shape or number.',
        'If you cannot play, draw from the pile — or draw the full Pick 2 / Pick 3 penalty when those stacks are active.',
        'When the draw pile runs out, played cards (except the current top card) are shuffled back in as a new draw pile.',
        'If no cards can be drawn and nobody can play, the game ends — lowest hand total wins.',
        'WHOT (20) can always be played. After playing it, choose either a shape or a number for the next player to match.',
      ],
    },
    {
      title: 'Special cards',
      points: [
        '1 — Hold On: take another turn immediately.',
        '2 — Pick 2: next player must play a 2 or draw 2 (stacks if they also play 2).',
        '5 — Pick 3: next player must play a 5 or draw 3 (stacks if they also play 5). Pick 2 and Pick 3 stacks are separate and cannot be mixed.',
        '8 — Suspension: skip the next player.',
        '14 — General Market: every other player draws 1 card.',
      ],
    },
    {
      title: 'Game length',
      points: [
        'The host can set a game length (10, 15, 30 minutes, etc.) or play with no limit.',
        'First to empty their hand still wins during normal play.',
        'If time runs out, add up the numbers on the cards left in each hand — lowest total wins (WHOT counts as 20).',
      ],
    },
  ],
}
