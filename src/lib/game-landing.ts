import type { GameType } from '@/types'
import { gameTypeConfig } from '@/lib/game-types'
import { GAME_LANDING_RULES, type GameLandingRuleSection } from '@/lib/game-landing-rules'

export type { GameLandingRuleSection } from '@/lib/game-landing-rules'

export type GameLandingFaq = {
  question: string
  answer: string
}

export type GameLandingContent = {
  gameType: GameType
  slug: string
  seoTitle: string
  seoDescription: string
  keywords: string[]
  heroTitle: string
  heroSubtitle: string
  bodyParagraph?: string
  highlights: string[]
  features: { title: string; description: string; emoji: string }[]
  steps: { title: string; description: string }[]
  rules: GameLandingRuleSection[]
  perfectFor: string[]
  extraFaqs?: GameLandingFaq[]
}

export const GAME_TYPE_TO_SLUG: Record<GameType, string> = {
  smash_marry_kill: 'smash-marry-kill',
  red_flag_green_flag: 'red-flag-green-flag',
  smash_or_pass: 'smash-or-pass',
  parent_approval: 'date-my-kid',
  would_you_rather: 'would-you-rather',
  never_have_i_ever: 'never-have-i-ever',
  pick_a_number: 'pick-a-number',
  this_or_that: 'this-or-that',
  most_likely_to: 'most-likely-to',
  who_said_this: 'who-said-this',
  hot_seat: 'hot-seat',
  custom: 'custom-game',
  anonymous_messages: 'anonymous-room',
  secret_message: 'secret-message',
  bingo: 'bingo',
  codewords: 'codewords',
  trivia: 'trivia',
  two_truths: 'two-truths-and-a-lie',
  monopoly: 'monopoly',
  yahtzee: 'yahtzee',
  whot: 'whot',
  crazy_eights: 'crazy-eights',
  ludo: 'ludo',
  i_call_on: 'i-call-on',
  sudoku: 'sudoku',
  tic_tac_toe: 'tic-tac-toe',
  word_hunt: 'word-hunt',
  chess: 'chess',
  checkers: 'checkers',
  describe_it: 'text-charades',
  scrabble: 'scrabble',
  snake_and_ladder: 'snakes-and-ladders',
}

const SLUG_TO_GAME_TYPE = Object.fromEntries(
  Object.entries(GAME_TYPE_TO_SLUG).map(([type, slug]) => [slug, type])
) as Record<string, GameType>

export function gameTypeFromSlug(slug: string): GameType | null {
  return SLUG_TO_GAME_TYPE[slug] ?? null
}

export function gameLandingSlug(gameType: GameType): string {
  return GAME_TYPE_TO_SLUG[gameType]
}

export function gameRulesHref(gameType: GameType): string {
  return `/games/${GAME_TYPE_TO_SLUG[gameType]}#rules`
}

export const ALL_GAME_LANDING_SLUGS = Object.values(GAME_TYPE_TO_SLUG)

const SHARED_FEATURES = {
  noSignup: { title: 'No sign-up', description: 'Create a game and play in seconds — no account needed.', emoji: '⚡' },
  realtime: {
    title: 'Live results',
    description: 'Votes sync in real time. Reveal round-by-round or all at once.',
    emoji: '📡',
  },
  mobile: {
    title: 'Phone & desktop',
    description: 'Everyone joins from any browser — perfect for group chats.',
    emoji: '📱',
  },
  code: { title: 'Share a code', description: 'One short room code. Send the link and you’re in.', emoji: '🔗' },
}

function landing(
  gameType: GameType,
  extra: Omit<GameLandingContent, 'gameType' | 'slug' | 'heroTitle' | 'rules'> & { heroTitle?: string }
): GameLandingContent {
  const cfg = gameTypeConfig(gameType)
  return {
    gameType,
    slug: GAME_TYPE_TO_SLUG[gameType],
    heroTitle: extra.heroTitle ?? cfg.label,
    rules: GAME_LANDING_RULES[gameType],
    ...extra,
  }
}

export const GAME_LANDING_CONTENT: Record<GameType, GameLandingContent> = {
  smash_marry_kill: landing('smash_marry_kill', {
    seoTitle: 'Smash Marry Kill Online — Free Party Game',
    seoDescription:
      'Play Smash Marry Kill online with friends for free. Three names each round — pick one to smash, one to marry, one to kill. No download, no sign-up.',
    keywords: ['smash marry kill online', 'smash marry kill game', 'kiss marry kill online', 'free smash marry kill'],
    heroSubtitle:
      'The classic party game, upgraded. Three faces land each round — your group assigns smash, marry, and kill. Results get messy.',
    bodyParagraph:
      'Smash Marry Kill (also called Kiss Marry Kill) puts three names in front of your group every round — celebrities, friends from a custom list, or names players add live. Unlike shouting answers across the room, Fate Round collects everyone’s votes privately and reveals who got smashed, married, and killed together. Upload a celebrity list, enable gender-based rounds, or let joiners fill the poll on the fly.',
    highlights: ['3 picks per round', 'Gender-based or names-only', 'Import a list or join & play'],
    features: [
      {
        title: 'Three-way choices',
        description: 'Every round presents three names — one slot for each fate.',
        emoji: '🔥',
      },
      {
        title: 'List or lobby modes',
        description: 'Upload celebrities, claim from a roster, or let joiners enter the poll.',
        emoji: '📋',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      {
        title: 'Create your room',
        description: 'Pick rounds, timer, and whether rounds are gender-based or names-only.',
      },
      { title: 'Share the code', description: 'Friends join from their phones with a short link or room code.' },
      {
        title: 'Smash, marry, kill',
        description: 'Vote each round, then reveal who got what — and who won each category.',
      },
    ],
    perfectFor: ['Friend groups', 'Birthday parties', 'Discord calls', 'Icebreakers'],
    extraFaqs: [
      {
        question: 'What’s the difference between Smash Marry Kill and Smash or Pass?',
        answer:
          'Smash Marry Kill gives you three names each round and you must assign smash, marry, and kill to each one. Smash or Pass is simpler — two names per round and you only decide smash or pass on each person individually. Both are free on Fate Round.',
      },
    ],
  }),

  red_flag_green_flag: landing('red_flag_green_flag', {
    seoTitle: 'Red Flag Green Flag Game Online — Free',
    seoDescription:
      'Play Red Flag Green Flag online with friends. Two names per round — rate each person green flag or red flag. Free, instant, no sign-up.',
    keywords: ['red flag green flag game', 'green flag red flag online', 'red flag game with friends'],
    heroSubtitle:
      'Two names, two judgments. Each round your group decides who’s a green flag and who’s a red flag — separately, honestly, and out loud.',
    bodyParagraph:
      'Red Flag Green Flag works like the viral dating debate format, but online with your whole group voting at once. Upload celebrities, crushes, or friends from a custom list — each round shows two names and everyone rates them green flag or red flag independently. Unlike arguing in a group chat, Fate Round tallies every vote and reveals who got flagged together.',
    highlights: ['Two names per round', 'Rate each person individually', 'Spicy group debates'],
    features: [
      {
        title: 'Dual ratings',
        description: 'Both names get their own green or red flag — not a versus pick.',
        emoji: '🚩',
      },
      { title: 'Pair voting rules', description: 'One-each mode or any combo — host picks the vibe.', emoji: '⚖️' },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.mobile,
    ],
    steps: [
      { title: 'Set up the list', description: 'Add friends, celebrities, or let everyone join into the poll.' },
      { title: 'Send the link', description: 'Players join with a name and wait in the lobby.' },
      { title: 'Flag away', description: 'Reveal results round by round and see who’s collecting red flags.' },
    ],
    perfectFor: ['Date debates', 'Roommate nights', 'Twitch streams', 'Group chats'],
    extraFaqs: [
      {
        question: 'How is Red Flag Green Flag different from Smash or Pass?',
        answer:
          'Red Flag Green Flag rates two people separately on a green-or-red scale — both names get judged each round. Smash or Pass is a simple smash-or-pass binary on each person. Both are free on Fate Round.',
      },
    ],
  }),

  smash_or_pass: landing('smash_or_pass', {
    seoTitle: 'Smash or Pass Game Online — Free with Friends',
    seoDescription:
      'Play Smash or Pass online for free. Two names each round — smash or pass on each person. Quick rounds, live results, no sign-up.',
    keywords: ['smash or pass game', 'smash or pass online', 'smash pass party game'],
    heroSubtitle:
      'Fast, bold, and brutally simple. Two names show up — your group smashes or passes on each one. No overthinking required.',
    bodyParagraph:
      'Smash or Pass is the quickest party game on Fate Round — two names per round, smash or pass on each, done. Import a celebrity list, add friends from your group, or let players join the poll live. Unlike playing verbally where loudest voice wins, everyone votes privately and results reveal together with a live smash leaderboard.',
    highlights: ['Quick binary votes', 'Two names per round', 'Perfect for rapid rounds'],
    features: [
      { title: 'Smash or pass', description: 'Clean A/B energy on every name — no third option needed.', emoji: '🔥' },
      { title: 'Timed rounds', description: 'Optional countdown keeps the pace up and the takes hot.', emoji: '⏱️' },
      SHARED_FEATURES.code,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Host a room', description: 'Upload names or use join-and-play mode with your friend group.' },
      { title: 'Everyone joins', description: 'Share the code — players pick a name and hop in the lobby.' },
      { title: 'Smash or pass', description: 'Vote, reveal, repeat. Leaderboards show who got the most smashes.' },
    ],
    perfectFor: ['Quick warm-ups', 'College hangs', 'After-parties', 'Bold friend groups'],
    extraFaqs: [
      {
        question: 'What’s the difference between Smash or Pass and Smash Marry Kill?',
        answer:
          'Smash or Pass shows two names per round and you pick smash or pass on each person. Smash Marry Kill gives you three names and you must assign smash, marry, and kill to all three. Smash or Pass is faster; Smash Marry Kill has more chaos.',
      },
    ],
  }),

  parent_approval: landing('parent_approval', {
    seoTitle: 'Date My Kid Game Online — Free Party Game',
    seoDescription:
      'Play Date My Kid online for free. One name each round — would you let your son or daughter date or marry them? Yes or no votes, live results, no sign-up.',
    keywords: ['date my kid game', 'parent approval game', 'would you let your kid date them', 'party game online'],
    heroSubtitle:
      'One name steps into the spotlight. Everyone votes yes or no — would you let your son or daughter date or marry this person?',
    bodyParagraph:
      'Date My Kid (Parent Approval) puts one name in the spotlight each round and asks the brutal question: would you let your son or daughter date or marry them? Load celebrities, exes, or friends from a custom list — everyone votes yes or no privately, then results reveal together. It’s funnier than shouting across the room because you see the actual split, not just the loudest opinion.',
    highlights: ['One name per round', 'Yes or no votes', 'Import a list or join & play'],
    features: [
      {
        title: 'Parental judgment',
        description: 'Celebrities, friends, exes — the room decides if they are good enough for your kid.',
        emoji: '👨‍👩‍👧',
      },
      {
        title: 'Flexible roster',
        description: 'Upload names, let players join the poll, or use vote-only import mode.',
        emoji: '📋',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Set up the poll', description: 'Add names on the next step or let players join the list.' },
      { title: 'Everyone joins', description: 'Share the code — players pick a name and hop in the lobby.' },
      { title: 'Yes or no', description: 'Each round reveals one person. Vote, reveal, repeat.' },
    ],
    perfectFor: ['Friend groups', 'Family game night', 'Podcast bits', 'Group chats'],
    extraFaqs: [
      {
        question: 'Can I use celebrities in Date My Kid?',
        answer:
          'Yes. Upload a custom name list with celebrities, fictional characters, or anyone your group wants to judge. You can also let players join the poll and add names live when creating the room.',
      },
    ],
  }),

  would_you_rather: landing('would_you_rather', {
    seoTitle: 'Would You Rather Online — Free Party Game',
    seoDescription:
      'Play Would You Rather online with friends for free. Hundreds of prompts or bring your own — anonymous votes, instant reveals.',
    keywords: ['would you rather online', 'would you rather game', 'wyr with friends', 'would you rather no signup'],
    heroSubtitle:
      'Impossible choices, anonymous votes. Every round pits two options against each other — see where your group actually stands.',
    bodyParagraph:
      'Would You Rather on Fate Round handles the classic “pick A or B” format with anonymous voting and instant reveals. Use hundreds of built-in prompts or upload your own questions — perfect for icebreakers, road trips, or Zoom calls. Unlike playing out loud where people follow the crowd, anonymous votes show where your group actually stands before the arguments start.',
    highlights: ['Anonymous voting', 'Platform or custom questions', '2+ players, zero setup'],
    features: [
      {
        title: 'Built-in question pool',
        description: 'Jump in with curated Would You Rather prompts — or upload your own.',
        emoji: '🤔',
      },
      {
        title: 'Fully anonymous',
        description: 'Nobody knows who picked what until you reveal — if you reveal.',
        emoji: '🎭',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Start a lobby', description: 'Choose round count and timer — no participant list needed.' },
      { title: 'Friends join', description: 'Share the link. Everyone enters a display name and waits.' },
      { title: 'Pick A or B', description: 'Vote each round, reveal the split, and argue about the minority.' },
    ],
    perfectFor: ['Road trips (passenger mode)', 'Zoom hangs', 'Icebreakers', 'Late-night nonsense'],
    extraFaqs: [
      {
        question: 'Can I add my own Would You Rather questions?',
        answer:
          'Yes. Fate Round includes a built-in question pool, and you can upload your own prompts when creating a room. Pick round count, set a timer, and share the link — no participant list required.',
      },
    ],
  }),

  never_have_i_ever: landing('never_have_i_ever', {
    seoTitle: 'Never Have I Ever Online — Free Party Game',
    seoDescription:
      "Play Never Have I Ever online with friends for free. Anonymous I have / I haven't votes, instant reveals, built-in or custom prompts.",
    keywords: [
      'never have i ever online',
      'never have i ever game',
      'nhie party game',
      'never have i ever with friends',
    ],
    heroSubtitle:
      "Classic confession game, online. Each prompt asks who's done it — anonymous votes reveal how spicy the group really is.",
    bodyParagraph:
      "Never Have I Ever on Fate Round reads each prompt aloud on every screen while players tap I have or I haven't anonymously. Use built-in prompts or upload your own — perfect for parties, pregames, or friend groups who want honest confessions without the awkward eye contact. Unlike playing in a circle where people hesitate, anonymous votes get real answers.",
    highlights: ['Anonymous voting', 'Platform or custom prompts', '2+ players, zero setup'],
    features: [
      {
        title: 'Built-in prompt pool',
        description: 'Jump in with curated Never Have I Ever statements — or upload your own.',
        emoji: '🙈',
      },
      {
        title: 'Fully anonymous',
        description: 'See how many have done it — not who raised their hand.',
        emoji: '🎭',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Start a lobby', description: 'Choose round count and timer — no participant list needed.' },
      { title: 'Friends join', description: 'Share the link. Everyone enters a display name and waits.' },
      { title: 'Confess & reveal', description: "Tap I have or I haven't each round and see the group split." },
    ],
    perfectFor: ['Pregames', 'Friend reunions', 'Icebreakers', 'Spicy confession nights'],
    extraFaqs: [
      {
        question: 'Can I add my own Never Have I Ever prompts?',
        answer:
          'Yes. Fate Round includes a built-in prompt pool, and you can upload your own statements when creating a room. The "Never have I ever" prefix is added automatically — just upload the action (e.g. "been skydiving").',
      },
    ],
  }),

  pick_a_number: landing('pick_a_number', {
    seoTitle: 'Pick a Number Game Online — Free Party Question Game',
    seoDescription:
      'Play Pick a Number online with friends. Choose a number from a hidden list — answer the question it reveals. Built-in or custom questions, free, no sign-up.',
    keywords: ['pick a number game', 'pick a number questions', 'party question game', 'number question game'],
    heroSubtitle:
      "Pick a number between 1 and X — you won't know the question until after you choose. Then answer whatever gets revealed.",
    bodyParagraph:
      'Pick a Number is a classic party game: one person chooses a number from a hidden list, and that number maps to a question they have to answer out loud. Fate Round runs it online — upload your own numbered questions or use our built-in pool, rotate who picks each round, and reveal the question on every screen the moment they lock in their number.',
    highlights: ['Hidden numbered list', 'Platform or custom questions', '2+ players, zero setup'],
    features: [
      {
        title: 'Mystery until you pick',
        description: 'The question list stays hidden — pickers only see numbers until they commit.',
        emoji: '🔢',
      },
      {
        title: 'Your questions or ours',
        description: 'Upload a numbered CSV or use built-in party prompts.',
        emoji: '❓',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Start a lobby', description: 'Choose your question source and max picking rounds.' },
      { title: 'Friends join', description: 'Share the link. Everyone enters a display name.' },
      {
        title: 'Pick & answer',
        description: 'Each round one player picks a number — then answers the revealed question.',
      },
    ],
    perfectFor: ['Pregames', 'Road trips', 'Icebreakers', 'Spicy question nights'],
    extraFaqs: [
      {
        question: 'Can I use my own questions?',
        answer:
          'Yes. Upload one question per row in our CSV format — row 1 is question #1, row 2 is #2, and so on. Or use the built-in question pool.',
      },
    ],
  }),

  this_or_that: landing('this_or_that', {
    seoTitle: 'This or That Game Online — Free with Custom Questions',
    seoDescription:
      'Play This or That online with friends. Upload your own “Coffee or Tea?” prompts — anonymous A/B votes, instant reveals, no sign-up.',
    keywords: ['this or that game', 'this or that online', 'this or that with friends', 'coffee or tea game'],
    heroSubtitle:
      'Your prompts, your vibe. Upload “Coffee or Tea?” style questions — everyone picks A or B and you see where the group lands.',
    bodyParagraph:
      'This or That is Would You Rather with your own personality — upload “Coffee or Tea?”, “Dogs or Cats?”, or inside-joke prompts from a CSV. Everyone votes anonymously and you see the split instantly. Unlike verbal rounds where one person picks first and influences everyone else, Fate Round collects private votes before revealing results.',
    highlights: ['Upload your own CSV', 'Anonymous voting', '2+ players, zero setup'],
    features: [
      {
        title: 'Your question list',
        description: 'Bring a CSV of “X or Y?” prompts — or type them in when creating a room.',
        emoji: '📋',
      },
      {
        title: 'Fully anonymous',
        description: 'Nobody knows who picked what until you reveal — if you reveal.',
        emoji: '🎭',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      {
        title: 'Upload prompts',
        description: 'Add your This or That questions when creating — one per row like “Coffee or Tea?”',
      },
      { title: 'Friends join', description: 'Share the link. Everyone enters a display name and waits.' },
      { title: 'Pick A or B', description: 'Vote each round, reveal the split, and argue about the minority.' },
    ],
    perfectFor: ['Icebreakers', 'Team meetings', 'Group chats', 'Custom themed nights'],
    extraFaqs: [
      {
        question: 'What’s the difference between This or That and Would You Rather?',
        answer:
          'Would You Rather uses Fate Round’s built-in impossible-choice prompts. This or That lets you upload your own “X or Y?” questions — ideal for themed nights, team meetings, or inside jokes. Both use anonymous A/B voting.',
      },
    ],
  }),

  most_likely_to: landing('most_likely_to', {
    seoTitle: 'Most Likely To Game Online — Free with Friends',
    seoDescription:
      'Play Most Likely To online for free. Vote on who fits each prompt — anonymous, hilarious, built for friend groups.',
    keywords: ['most likely to game', 'most likely to online', 'mlt party game', 'most likely to with friends'],
    heroSubtitle:
      '“Most likely to…” prompts meet your actual friend group. Anonymous votes, savage reveals, zero mercy.',
    bodyParagraph:
      'Most Likely To on Fate Round lets your group vote on who fits each prompt — “most likely to ghost the group chat”, “most likely to become famous”, and more. Use your actual friend group as the roster or import names, with anonymous votes so nobody knows who picked whom until reveal. It beats playing verbally because shy friends vote honestly and the roast hits harder.',
    highlights: ['Anonymous votes', 'Friend group or imported list', 'Custom prompts supported'],
    features: [
      { title: 'Call out friends', description: 'Each prompt asks who fits best — the group decides.', emoji: '🎯' },
      {
        title: 'Vote on a list',
        description: 'Import names for celebrities or let joiners become the poll.',
        emoji: '👥',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Choose your mode', description: 'Join-and-vote with friends or upload a list for a voter-only game.' },
      { title: 'Share the room', description: 'Players join with a name — no accounts, no friction.' },
      { title: 'Vote & reveal', description: 'See who wins each “most likely to” and crown the chaos.' },
    ],
    perfectFor: ['Friend reunions', 'Team offsites', 'Birthday roasts', 'Group chat nights'],
    extraFaqs: [
      {
        question: 'Can I use custom Most Likely To prompts?',
        answer:
          'Yes. Fate Round includes built-in prompts and supports custom questions when you create a game. Vote on your friend group directly or import a name list — results reveal anonymously round by round.',
      },
    ],
  }),

  who_said_this: landing('who_said_this', {
    seoTitle: 'Who Said This Game Online — Free Quote Guessing',
    seoDescription:
      'Play Who Said This online. Submit quotes in the lobby, then guess who said each one. Free party game for friend groups.',
    keywords: ['who said this game', 'guess the quote game', 'who said it party game'],
    heroSubtitle:
      'Your group writes the content. Quotes hit the pool, everyone guesses the author — and friendships get tested.',
    bodyParagraph:
      'Who Said This turns your group’s own messages into the game. Players submit quotes in the lobby — inside jokes, unhinged texts, or anime lines — then everyone guesses who wrote each one. Unlike reading quotes aloud and having one person guess, Fate Round scores every player and tracks who knows the group best.',
    highlights: ['Player-submitted quotes', 'Anime quote mode', 'Lobby quote pool'],
    features: [
      {
        title: 'Quote pool',
        description: 'Players submit quotes before start — only pooled quotes become rounds.',
        emoji: '💬',
      },
      {
        title: 'Guess the author',
        description: 'Read the quote, pick who said it, score points for correct guesses.',
        emoji: '🕵️',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.mobile,
    ],
    steps: [
      {
        title: 'Claim & submit',
        description: 'Players join, claim their name, and add quotes to the pool in the lobby.',
      },
      { title: 'Host starts', description: 'When enough quotes are in, the host kicks off the guessing rounds.' },
      { title: 'Reveal & score', description: 'See who guessed right and who wrote the most unhinged lines.' },
    ],
    perfectFor: ['Close friend groups', 'Work teams', 'Anime watch parties', 'Inside-joke nights'],
    extraFaqs: [
      {
        question: 'Do players need to submit quotes before the game starts?',
        answer:
          'Yes. Everyone joins the lobby, claims their name, and adds quotes to the pool before the host starts. Only pooled quotes become rounds — so the more your group submits, the better the game gets.',
      },
    ],
  }),

  hot_seat: landing('hot_seat', {
    seoTitle: 'Hot Seat Party Game Online — Free',
    seoDescription:
      'Play Hot Seat online with friends. Take turns in the spotlight while everyone submits a compliment, observation, or roast.',
    keywords: ['hot seat game', 'hot seat party game online', 'roast compliment game'],
    heroSubtitle:
      'One person in the hot seat. Everyone else drops a compliment, observation, or roast. Take turns until nobody’s safe.',
    bodyParagraph:
      'Hot Seat gives every player a turn in the spotlight while the rest of the group submits anonymously — a compliment, an honest observation, or a roast. Upload your friend group, claim names on join, and take turns until everyone has sat in the seat. Unlike verbal roast sessions where people hold back, anonymous submissions bring the real takes.',
    highlights: ['One spotlight per round', 'Compliment · observation · roast', 'Claim-from-list roster'],
    features: [
      {
        title: 'Three submission types',
        description: 'Mix love, truth, and chaos — one message per voter per round.',
        emoji: '🪑',
      },
      { title: 'Turn-based rounds', description: 'Each joined player gets their moment in the seat.', emoji: '🔥' },
      SHARED_FEATURES.code,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Upload names', description: 'Add your group list — each player claims their name when joining.' },
      { title: 'Fill the seat', description: 'When it’s your round, everyone submits anonymously.' },
      { title: 'Read the room', description: 'Reveal submissions one by one — compliments, observations, roasts.' },
    ],
    perfectFor: ['Birthday honorees', 'Send-offs', 'Team bonding', 'Roast sessions'],
    extraFaqs: [
      {
        question: 'Are Hot Seat submissions anonymous?',
        answer:
          'Yes. When someone is in the hot seat, every other player submits one compliment, observation, or roast anonymously. Submissions reveal one by one — the person in the seat sees what the room really thinks.',
      },
    ],
  }),

  custom: landing('custom', {
    seoTitle: 'Custom Voting Party Game — Build Your Own Categories',
    seoDescription:
      'Create a custom online voting game with your own categories — Date, Friendzone, or anything you want. Free on Fate Round.',
    keywords: ['custom party game', 'make your own voting game', 'custom categories game online'],
    heroTitle: 'Custom Voting Game',
    heroSubtitle:
      'You name the slots. Date, Friendzone, CEO — whatever fits your group. Build categories, pick rules, run the poll.',
    bodyParagraph:
      'The Custom Voting Game lets you build your own Smash Marry Kill-style format with 2–5 named slots — Date, Friendzone, CEO, or whatever your group actually says. Upload a name list, set gender rules if you want, and run rounds where everyone assigns one person per slot. Perfect for inside jokes and themed nights that no off-the-shelf party game covers.',
    highlights: ['2–5 custom slots', 'Your labels & emojis', 'Gender-based or names-only'],
    features: [
      {
        title: 'Your categories',
        description: 'Define slot names, emojis, and colors — the game adapts to your vibe.',
        emoji: '✏️',
      },
      {
        title: 'Flexible roster',
        description: 'Import a voter list, claim names, or let joiners fill the poll.',
        emoji: '🎛️',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Design slots', description: 'Pick 2–5 categories and label them exactly how your group talks.' },
      { title: 'Add people', description: 'Upload a list or use join-and-play — set gender rules if you want.' },
      { title: 'Assign & reveal', description: 'Each round, assign one person per slot and reveal the group’s picks.' },
    ],
    perfectFor: ['Inside jokes', 'Themed nights', 'Streamer communities', 'Niche friend groups'],
    extraFaqs: [
      {
        question: 'How many custom categories can I create?',
        answer:
          'You can define 2–5 custom slots when creating a room — each with its own label, emoji, and color. Assign one person per slot each round, then reveal the group’s picks together.',
      },
    ],
  }),

  anonymous_messages: landing('anonymous_messages', {
    seoTitle: 'Anonymous Room — Free Live Anonymous Chat Game',
    seoDescription:
      'Create a free anonymous room for your group. Auto-assigned lobby names, fully anonymous messages, live for everyone — no sign-up.',
    keywords: ['anonymous chat game', 'anonymous messages party', 'anonymous room online', 'free anonymous chat'],
    heroSubtitle:
      'A live anonymous wall for your group. Join with one tap, get a random lobby name, and post messages everyone sees in real time — with no names attached.',
    bodyParagraph:
      'Anonymous Room is a live confession wall for your group — join with one tap, get a random lobby name, and post messages the whole room sees with no sender attached. Unlike separate anonymous apps, everyone shares one live feed in real time. Perfect for confession nights, team retros, or icebreakers where people need cover to be honest.',
    highlights: ['One-tap join', 'Auto-assigned names', 'Live anonymous feed'],
    features: [
      {
        title: 'No name needed',
        description: 'Players join instantly — the platform assigns a fun random lobby name.',
        emoji: '🎭',
      },
      {
        title: 'Truly anonymous posts',
        description: 'Messages never show who sent them — just the words.',
        emoji: '💬',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Create a game', description: 'Host sets a title and shares the game code.' },
      { title: 'Everyone joins', description: 'Players tap join — no typing a name.' },
      { title: 'Post live', description: 'Host starts the session and anonymous messages flow for the whole room.' },
    ],
    perfectFor: ['Confession nights', 'Team retros', 'Icebreakers', 'Group chats'],
    extraFaqs: [
      {
        question: 'Are Anonymous Room messages truly anonymous?',
        answer:
          'Yes. Players get auto-assigned random lobby names and messages never show who sent them. Everyone in the room sees the live feed — but no one can tell which message came from which person.',
      },
    ],
  }),

  secret_message: landing('secret_message', {
    seoTitle: 'Secret Message Link — Free Anonymous Inbox',
    seoDescription:
      'Create a free secret message link and share it anywhere. Friends send anonymous messages — only you see your private inbox. No sign-up.',
    keywords: [
      'secret message link',
      'anonymous message inbox',
      'send me anonymous messages',
      'instagram anonymous messages',
    ],
    heroSubtitle:
      'Like a private suggestion box for your link. Share once — anyone can send you a message, and only you read them.',
    bodyParagraph:
      'Secret Message gives you a private anonymous inbox link — share it on Instagram, in your bio, or a group chat, and anyone can send you a message without signing up. Only you see the inbox; senders never see each other’s messages. Unlike public confession walls, this is a one-to-many suggestion box built for honest feedback, Q&A prompts, or fan messages.',
    highlights: ['Host-only inbox', 'Share anywhere', 'No sender sign-up'],
    features: [
      {
        title: 'Only you see messages',
        description: 'Senders never see each other’s messages — your inbox is private to you.',
        emoji: '🔒',
      },
      {
        title: 'Zero friction',
        description: 'Open the link, type, send. No account or app required.',
        emoji: '✉️',
      },
      SHARED_FEATURES.noSignup,
      SHARED_FEATURES.mobile,
    ],
    steps: [
      { title: 'Create your board', description: 'Pick a title and get your link instantly.' },
      { title: 'Share the link', description: 'Drop it in your story, bio, or group chat.' },
      { title: 'Read your inbox', description: 'Messages arrive on your host panel in real time.' },
    ],
    perfectFor: ['Instagram stories', 'Honest feedback', 'Q&A prompts', 'Fan messages'],
    extraFaqs: [
      {
        question: 'Can senders see each other’s Secret Messages?',
        answer:
          'No. Only the host sees the private inbox. Senders open your link, type a message, and send — they never see other submissions or who else wrote in.',
      },
    ],
  }),

  bingo: landing('bingo', {
    seoTitle: 'Bingo — Free Online Number Bingo Game',
    seoDescription:
      'Host a free online bingo game for your group. Players get unique cards, you call numbers B1–O75, and the first line wins.',
    keywords: [
      'online bingo game',
      'bingo rules',
      'how to play bingo',
      'free bingo party',
      'number bingo multiplayer',
      'host bingo night',
    ],
    heroSubtitle:
      'Classic 75-ball bingo for parties and game nights. Everyone gets their own card on their phone — you call the numbers, they mark and shout BINGO.',
    bodyParagraph:
      'Online Bingo on Fate Round brings 75-ball bingo to your group without printing cards. Every player gets a unique 5×5 card on their phone with a free center square — you call numbers B1 through O75, they tap to mark, and the first completed line wins. Perfect for family nights, office parties, or classrooms where everyone already has a phone.',
    highlights: ['Unique cards', 'Host calls numbers', 'First line wins'],
    features: [
      {
        title: 'Real bingo cards',
        description: 'Each player gets a unique 5×5 card with a free center square.',
        emoji: '🎱',
      },
      {
        title: 'You’re the caller',
        description: 'Tap to call random numbers or pick them yourself — everyone sees what’s been called.',
        emoji: '📣',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Create a game', description: 'Set a title, share the code, and wait for players to join.' },
      { title: 'Deal cards', description: 'Start the game — every player gets a unique bingo card instantly.' },
      { title: 'Call & win', description: 'Call numbers until someone completes a line and claims BINGO.' },
    ],
    perfectFor: ['Family game night', 'Office parties', 'Classroom fun', 'Pub quizzes'],
    extraFaqs: [
      {
        question: 'How do you win at online Bingo?',
        answer:
          'Complete any full line on your card — a row, column, or diagonal of five marked cells, with the free center square counting toward it. Tap BINGO to claim, and the host confirms the win.',
      },
      {
        question: 'What numbers are called in 75-ball Bingo?',
        answer:
          'Numbers run B1–B15, I16–I30, N31–N45, G46–G60, and O61–O75 — one range per column. You can only mark a number once the host has actually called it.',
      },
      {
        question: 'Does the host pick the numbers or are they random?',
        answer:
          'Either. The host can call random numbers at the tap of a button, set an auto timer, or pick numbers manually. Every called number syncs in real time so all players see the same board.',
      },
      {
        question: 'Does each player get a different Bingo card?',
        answer:
          'Yes. When the host starts the game, every player receives a unique 5×5 bingo card automatically. Numbers called by the host sync in real time across all devices.',
      },
    ],
  }),

  codewords: landing('codewords', {
    seoTitle: 'Codewords — Free Online Word Spy Game',
    seoDescription:
      'Play Codewords online with friends. Two teams, spymasters give clues, operatives guess the secret words on a 5×5 grid.',
    keywords: ['codenames online', 'codewords party game', 'word spy game', 'free codenames alternative'],
    heroSubtitle:
      'The classic word-association spy game online. Red vs Blue — spymasters know the secret key, operatives guess the right words. One wrong pick on the assassin ends it all.',
    bodyParagraph:
      'Codewords is the word-association spy game online — Red vs Blue teams, spymasters who see the secret key card, and operatives who guess words from one-word clues. Hit the assassin word and the game is over. Unlike passing a physical board around, everyone plays from their phone with roles assigned automatically.',
    highlights: ['Red vs Blue teams', 'Spymaster clues', '5×5 word grid'],
    features: [
      {
        title: 'Two teams, hidden roles',
        description: 'Pick spymaster or operative — spymasters see the full key card, operatives see only words.',
        emoji: '🕵️',
      },
      {
        title: 'One-word clues',
        description: 'Give a clue and a number — your team guesses which words match. Avoid the assassin!',
        emoji: '💬',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Create & join', description: 'Host sets up a room — players join and pick Red or Blue plus a role.' },
      { title: 'Spymasters clue', description: 'Starting team spymaster gives a one-word clue and a number.' },
      { title: 'Guess to win', description: 'Operatives tap words — first team to find all their words wins.' },
    ],
    perfectFor: ['Game nights', 'Team building', 'Word nerds', 'Board game fans'],
    extraFaqs: [
      {
        question: 'How is Codewords different from Codenames?',
        answer:
          'Codewords follows the same word-association spy game format — two teams, spymaster clues, and a 5×5 word grid — playable free in your browser on Fate Round with no board or app required.',
      },
    ],
  }),

  trivia: landing('trivia', {
    seoTitle: 'Trivia — Free Online Quiz Game',
    seoDescription:
      'Host a fast-finger trivia game online. Tech or general knowledge — fastest correct answers climb the leaderboard.',
    keywords: ['online trivia game', 'quiz party game', 'tech trivia', 'general knowledge quiz'],
    heroSubtitle:
      'Speed-based trivia for groups. Pick Tech or General Knowledge, or upload your own questions. Fastest correct answers score the most.',
    bodyParagraph:
      'Trivia on Fate Round is built for fast-finger competition — multiple-choice questions, a live timer, and speed bonuses for the first correct answer. Use Tech or General Knowledge categories or upload your own CSV of questions. Unlike shouting answers in a pub quiz, every player taps their choice and the leaderboard updates automatically.',
    highlights: ['Tech & general categories', 'Speed scoring', 'Live leaderboard'],
    features: [
      {
        title: 'Fast-finger scoring',
        description: 'Correct answers earn base points plus a speed bonus — first correct gets an extra boost.',
        emoji: '⚡',
      },
      {
        title: 'Your questions or ours',
        description: 'Use the built-in question pool or upload a CSV with your own Q&A.',
        emoji: '📋',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Create & join', description: 'Pick a category, set rounds and timer — players join with their name.' },
      {
        title: 'Answer fast',
        description: 'Each round shows a multiple-choice question — tap your answer before time runs out.',
      },
      { title: 'Climb the board', description: 'Points stack across rounds — fastest fingers win the leaderboard.' },
    ],
    perfectFor: ['Pub quizzes', 'Team meetings', 'Classroom reviews', 'Game nights'],
    extraFaqs: [
      {
        question: 'Can I upload my own trivia questions?',
        answer:
          'Yes. Pick Tech or General Knowledge from the built-in pool, or upload a CSV with your own multiple-choice questions when creating a room. Fastest correct answers earn speed bonus points.',
      },
    ],
  }),

  two_truths: landing('two_truths', {
    seoTitle: 'Two Truths and a Lie — Free Online Party Game',
    seoDescription:
      'Play Two Truths and a Lie online with friends. Everyone submits statements — guess the lie each round and climb the leaderboard.',
    keywords: ['two truths and a lie online', 'party game', 'icebreaker game', 'social deduction'],
    heroSubtitle:
      'Classic icebreaker, online. Write two truths and a lie, then take turns in the hot seat while everyone guesses the fib.',
    bodyParagraph:
      'Two Truths and a Lie on Fate Round handles the classic icebreaker end to end — everyone submits two truths and one lie in the lobby, then takes turns in the hot seat while the group guesses the fib. Statements shuffle each round and points track who spots lies best. Better than playing in person because scoring is automatic and shy players participate through their phone.',
    highlights: ['Lobby statement prep', 'One round per player', 'Lie spotting scores'],
    features: [
      {
        title: 'Everyone plays',
        description: 'Each player submits three statements in the lobby before the host starts.',
        emoji: '🎭',
      },
      {
        title: 'Spot the lie',
        description: 'Statements are shuffled each round — tap the one you think is false.',
        emoji: '🤥',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join & write', description: 'Enter your name and submit two truths plus one lie about yourself.' },
      { title: 'Take turns', description: 'Each round features one player — everyone else guesses the lie.' },
      { title: 'Score points', description: 'Correct guesses earn points; fool the most people for bonus points.' },
    ],
    perfectFor: ['Icebreakers', 'Team offsites', 'Classrooms', 'Friend groups'],
    extraFaqs: [
      {
        question: 'When do players write their Two Truths and a Lie?',
        answer:
          'In the lobby before the host starts. Each player submits two true statements and one lie about themselves. Once the game begins, one player’s statements are shown each round for the group to guess.',
      },
    ],
  }),

  monopoly: landing('monopoly', {
    seoTitle: 'Monopoly — Free Online Board Game for Groups',
    seoDescription:
      'Play Monopoly online with friends. Roll dice, buy properties, pay rent, and bankrupt your opponents — all on your phones.',
    keywords: [
      'online monopoly game',
      'monopoly rules',
      'how to play monopoly',
      'free monopoly multiplayer',
      'board game night',
      'property game online',
    ],
    heroSubtitle:
      'Classic Monopoly on your phones. Join a room, roll the dice, buy properties, and be the last player standing.',
    bodyParagraph:
      'Monopoly on Fate Round uses the UK edition board — London streets, Stations, £ currency, full Chance and Community Chest decks, property auctions, houses, hotels, mortgages, and player trading. Join 2–6 players and play turn-by-turn in real time.',
    highlights: ['Full 40-space board', '2–6 players', 'Real-time turns'],
    features: [
      {
        title: 'Classic board',
        description: 'All the familiar spaces — London properties, Stations, Utilities, Chance, and Community Chest.',
        emoji: '🏠',
      },
      {
        title: 'Turn-based play',
        description:
          'Roll dice, buy or pass on properties, pay rent, draw cards, and manage Jail — core Monopoly rules on your phones.',
        emoji: '🎲',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      {
        title: 'Create a game',
        description: 'Set the player cap and share the link — everyone joins with their name.',
      },
      { title: 'Start the game', description: 'Everyone begins on GO with £1,500. The host starts when ready.' },
      {
        title: 'Last one wins',
        description: 'Buy properties, collect rent, and bankrupt opponents until one player remains.',
      },
    ],
    perfectFor: ['Game nights', 'Family gatherings', 'Friend groups', 'Remote hangouts'],
    extraFaqs: [
      {
        question: 'How do you win at Monopoly?',
        answer:
          'Buy properties, charge rent, and manage your cash until every opponent goes bankrupt. The last solvent player left in the game wins — there’s no points total, just survival.',
      },
      {
        question: 'How much money do you start with in Monopoly?',
        answer:
          'Every player starts on GO with £1,500 in the UK edition used on Fate Round, and collects £200 each time they pass GO (after their first lap around the board).',
      },
      {
        question: 'What happens when you land on an unowned property?',
        answer:
          'You can buy it from the Bank at its listed price. If you decline, it goes to auction and any player — including you — can bid. Note you can’t buy, pay tax, or draw cards until you’ve passed GO once on your first lap.',
      },
      {
        question: 'How do you get out of Jail in Monopoly?',
        answer:
          'Pay the £50 fine before your next roll, use a Get Out of Jail Free card, or roll doubles on any of your next three turns. After three turns without doubles, you pay £50 and move by your roll.',
      },
      {
        question: 'How many people can play Monopoly online?',
        answer:
          'Monopoly on Fate Round supports 2–6 players in one room. Everyone joins with a display name, starts on GO with £1,500, and takes turns rolling dice until one player bankrupts the rest.',
      },
    ],
  }),

  yahtzee: landing('yahtzee', {
    seoTitle: 'Play Yahtzee Online Free with Friends — No Sign-Up',
    seoDescription:
      'Play Yahtzee online free with friends — no sign-up, no download. Roll five dice, hold what you want, and fill your scorecard. Solo or up to 6 players.',
    keywords: [
      'yahtzee game online',
      'yahtzee rules',
      'how to play yahtzee',
      'how many dice in yahtzee',
      'full house yahtzee',
      'yahtzee scoring',
      'dice game multiplayer',
      'roll hold scorecard',
      'play yahtzee friends',
    ],
    heroSubtitle: 'The classic dice puzzle — score straights, full houses, and Yahtzees together.',
    bodyParagraph:
      'Yahtzee on Fate Round brings roll-and-hold dice scoring to your group online — often mistyped as Yatzee, Yahtzy, Yachtzee, Yathzee, or Tahtzee, it’s the same classic five-dice game. Roll five dice up to three times per turn, hold the ones you want, and fill your scorecard category by category — three of a kind, full house, small and large straights, chance, and the coveted Yahtzee (five of a kind). Play solo or with up to six friends — no physical scorecard or dice cup needed.',
    highlights: ['5 dice', '1–6 players', 'Turn-based scoring'],
    features: [
      {
        title: 'Roll & hold',
        description: 'Up to 3 rolls per turn. Hold dice to try for straights or a full house.',
        emoji: '🎲',
      },
      {
        title: 'Fill your card',
        description: 'Pick an unused category each turn and build the best total across all combos.',
        emoji: '🧾',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join a room', description: 'Enter your name and wait for the host to start.' },
      { title: 'Take turns', description: 'Roll dice, hold the best ones, and score a category.' },
      { title: 'Win the board', description: 'Highest total score after the board fills wins.' },
    ],
    perfectFor: ['Game nights', 'Casual hangouts', 'Friend groups'],
    extraFaqs: [
      {
        question: 'How many dice do you play Yahtzee with?',
        answer:
          'Yahtzee is played with five dice. On Fate Round you roll all five on screen — no physical dice or cup needed — and hold the ones you want between rolls.',
      },
      {
        question: 'How many rolls do you get per turn in Yahtzee?',
        answer:
          'Up to three rolls per turn. After the first roll you can hold any dice you like and re-roll the rest, then do the same again. After your third roll (or sooner) you must score one unused category.',
      },
      {
        question: 'What is a full house in Yahtzee?',
        answer:
          'A full house is three dice showing one number plus two dice showing another — for example three 5s and two 2s. It scores a flat 25 points in the Full House category, no matter which numbers make it up.',
      },
      {
        question: 'How does scoring work in online Yahtzee?',
        answer:
          'Each turn you roll up to three times, holding dice between rolls, then fill one unused category. The upper section (Ones–Sixes) scores the total of those dice — reach 63+ there for a 35-point bonus. Lower-section combos pay fixed amounts: Full House 25, Small Straight 30, Large Straight 40, Yahtzee 50, with Three/Four of a Kind and Chance scoring the sum of all five dice. Highest total when every category is filled wins.',
      },
      {
        question: 'What are the odds of rolling a Yahtzee?',
        answer:
          'Getting five of a kind on a single roll of five dice is about 1 in 1,296 (roughly 0.08%). Across all three rolls in a turn, playing optimally to chase it, your odds rise to about 4.6%.',
      },
      {
        question: 'Is it spelled Yahtzee or Yatzee?',
        answer:
          'The correct spelling is Yahtzee, but it’s commonly mistyped as Yatzee, Yahtzy, Yatzy, Yachtzee, Yathzee, or Tahtzee. However you spell it, it’s the same five-dice scoring game — and you can play it free on Fate Round.',
      },
    ],
  }),

  whot: landing('whot', {
    seoTitle: 'Play Whot Online Free with Friends — No Sign-Up',
    seoDescription:
      'Play Whot online free with friends — no sign-up, no download. Match shape or number, stack Pick 2 and Pick 3, and call WHOT. Classic Naija house rules, 2–6 players.',
    keywords: [
      'whot card game online',
      'whot rules',
      'how to play whot',
      'naija whot multiplayer',
      'nigerian whot game',
      'whot special cards',
      'play whot friends',
    ],
    heroSubtitle: 'The Nigerian card classic — match, stack, and call WHOT on your crew.',
    bodyParagraph:
      'Whot on Fate Round follows common Nigerian house rules: match the top card by shape or number, play WHOT to call the next match, and keep Pick 2 and Pick 3 stacks separate. Special cards — Hold On, Suspension, General Market — keep the table lively. First to empty their hand wins.',
    highlights: ['54-card deck', '2–6 players', 'Naija house rules'],
    features: [
      {
        title: 'Match or WHOT',
        description: 'Play a card matching shape or number — or drop WHOT and call what comes next.',
        emoji: '🃏',
      },
      {
        title: 'Pick stacks',
        description: '2 stacks Pick 2, 5 stacks Pick 3 — separate penalties, defended only with the same number.',
        emoji: '2️⃣',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join a room', description: 'Enter your name and wait for the host to deal.' },
      { title: 'Play your turn', description: 'Match the top card, defend pick stacks, or draw.' },
      { title: 'Empty your hand', description: 'First player out of cards wins the game.' },
    ],
    perfectFor: ['Game nights', 'Nigerian diaspora hangouts', 'Card game lovers'],
    extraFaqs: [
      {
        question: 'How do you win at Whot?',
        answer:
          'Be the first to play all the cards in your hand. If the game gets blocked or a game clock is running and time runs out, the player with the lowest total in hand wins instead — the WHOT card counts as 20 points.',
      },
      {
        question: 'How many cards do you start with in Whot?',
        answer:
          'Each player is dealt 5 cards (6 in a 2-player game), with one card turned face-up to start the discard pile. The host deals when everyone is ready.',
      },
      {
        question: 'What does it mean to call WHOT?',
        answer:
          'Playing the WHOT card (number 20) lets you call any shape or number the next player must match. You can override another player’s WHOT call with your own — but you can’t play WHOT to escape an active Pick 2 or Pick 3.',
      },
      {
        question: 'What are the special cards in Whot?',
        answer:
          '1 = Hold On (extra turn), 2 = Pick 2, 5 = Pick 3, 8 = Suspension (skip next player), 14 = General Market (others draw), 20 = WHOT (call shape or number). Pick 2 and Pick 3 stacks cannot be mixed.',
      },
    ],
  }),
  crazy_eights: landing('crazy_eights', {
    seoTitle: 'Play Crazy Eights Online Free with Friends — No Sign-Up',
    seoDescription:
      'Play Crazy Eights online free with friends — no sign-up, no download. Match by rank or suit, play 8s as wild and name the suit, stack Pick Two, skip and reverse. 2–6 players.',
    keywords: [
      'crazy eights online',
      'crazy eights rules',
      'how to play crazy eights',
      'crazy eights card game',
      'play crazy eights friends',
      'crazy eights multiplayer',
      'crazy 8s online',
    ],
    heroSubtitle: 'The worldwide card classic — match, go wild on 8s, and empty your hand first.',
    bodyParagraph:
      'Crazy Eights on Fate Round plays by the popular action-card rules: match the top of the discard by rank or suit, play an 8 anytime to name the next suit, and use 2 (Pick Two), Jack and Ace (Skip), and Queen (Reverse) to control the table. Add Jokers for extra wildcards that make the next player draw five. First to get rid of all their cards wins.',
    highlights: ['Standard 52-card deck', '2–6 players', '8s are wild'],
    features: [
      {
        title: 'Match or go wild',
        description: 'Play a card matching rank or suit — or drop an 8 and name the suit that comes next.',
        emoji: '🎴',
      },
      {
        title: 'Action cards',
        description: '2 makes the next player draw two, Jack and Ace skip, Queen reverses the direction of play.',
        emoji: '8️⃣',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join a room', description: 'Enter your name and wait for the host to deal.' },
      { title: 'Play your turn', description: 'Match by rank or suit, play an 8 to choose the suit, or draw.' },
      { title: 'Empty your hand', description: 'First player out of cards wins the game.' },
    ],
    perfectFor: ['Game nights', 'Family card games', 'Quick card breaks'],
    extraFaqs: [
      {
        question: 'How do you win at Crazy Eights?',
        answer:
          'Be the first to play all the cards in your hand. If a game clock is running and time runs out, the player with the lowest total in hand wins instead — each 8 and Joker counts as 50 points, face cards 10, aces 1.',
      },
      {
        question: 'How many cards do you start with in Crazy Eights?',
        answer:
          'Each player is dealt 5 cards (7 in a 2-player game), with one card turned face-up to start the discard pile. The host deals when everyone is ready.',
      },
      {
        question: 'Why are 8s wild?',
        answer:
          'You can play an 8 on any card, and when you do you name the suit the next player must follow — hearts, spades, clubs, or diamonds. That is the heart of the game, and why it is called "Crazy" Eights.',
      },
      {
        question: 'What are the special cards in Crazy Eights?',
        answer:
          '8 = Wild (name the suit), 2 = Pick Two (next player draws two or stacks their own 2), Jack = Skip, Queen = Reverse, Ace = Skip. With Jokers enabled, a Joker is wild and makes the next player draw five. Action cards are an optional host setting.',
      },
    ],
  }),
  ludo: landing('ludo', {
    seoTitle: 'Ludo Online — Play Classic Board Game with Friends',
    seoDescription:
      'Play Ludo online with friends. Roll two dice, race your pieces home, capture opponents, and block with pairs — classic rules.',
    keywords: [
      'ludo online',
      'ludo rules',
      'how to play ludo',
      'play ludo friends',
      'ludo board game multiplayer',
      'ludo game online free',
    ],
    heroSubtitle: 'The classic board game — roll two dice, race, capture, and be first to get all four pieces home.',
    bodyParagraph:
      'Ludo on Fate Round follows classic rules: roll two dice and use each die separately — a 6 brings pieces onto the board, doubles (e.g. 6+6) let you play both sixes then roll again, send opponents back to their yard on capture, and form blockades with pairs. First player to finish all four pieces wins.',
    highlights: ['2–4 players', 'Classic rules', 'Real-time board'],
    features: [
      {
        title: 'Roll & move',
        description:
          'Roll two dice — use each die on its own. 6+3 brings one piece out then moves 3; 6+6 can bring out two pieces or one out then move 6. Doubles earn another roll after both dice are played.',
        emoji: '🎲',
      },
      {
        title: 'Captures & blockades',
        description: 'Land on an opponent to send them home. Stack two of your pieces to block the square.',
        emoji: '🎯',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join a room', description: 'Enter your name and pick your color when the host starts.' },
      {
        title: 'Roll the dice',
        description:
          'Roll two dice — use each die separately. A 6 brings a piece out; doubles play both dice then roll again.',
      },
      { title: 'Race home', description: 'Get all four pieces into the center home triangle to win.' },
    ],
    perfectFor: ['Family game night', 'Friend groups', 'Board game fans'],
    extraFaqs: [
      {
        question: 'How do you get a piece out of your yard in Ludo?',
        answer:
          'You need to roll a 6 on one of your two dice to move a piece from your home yard onto its start square. Until at least one piece is in play, non-6 dice can’t be used — so on a 6+3 you use the 6 first, then the 3.',
      },
      {
        question: 'How do you win at Ludo?',
        answer:
          'Move all four of your pieces clockwise around the board, up your colored home column, and into the center home triangle. The first player to get all four pieces home wins; the others keep playing for runner-up places.',
      },
      {
        question: 'What happens when you land on an opponent in Ludo?',
        answer:
          'Landing on a single opponent piece on a normal square sends it back to its yard — they need a 6 to re-enter. Pieces on ★ start and safe squares can’t be captured, and stacking two of your own pieces forms a blockade opponents can’t pass.',
      },
      {
        question: 'What happens when I roll three doubles in a row?',
        answer: 'Your turn ends immediately — no move and no extra roll. Play passes to the next player.',
      },
      {
        question: 'Do I need an exact roll to finish?',
        answer: 'Yes. A piece can only enter the home triangle with an exact roll — overshooting is not allowed.',
      },
    ],
  }),

  sudoku: landing('sudoku', {
    seoTitle: 'Sudoku — Multiplayer Puzzle Race Online',
    seoDescription:
      'Play multiplayer Sudoku online. Race your friends cell by cell — first correct answer claims the cell for +10 pts, wrong answers cost points.',
    keywords: ['multiplayer sudoku', 'sudoku online', 'puzzle race game', 'party game sudoku'],
    heroSubtitle:
      'Everyone solves the same 9×9 puzzle. Claim cells before your friends — correct answers score +10 pts, mistakes cost −3.',
    highlights: ['Race to claim cells', 'Color-coded ownership', 'Live real-time puzzle'],
    features: [
      {
        title: 'Claim cells',
        description: 'Tap a cell and enter a number — the first correct answer locks it in your color.',
        emoji: '🔢',
      },
      {
        title: 'Risk vs reward',
        description: 'A wrong answer costs 3 points — but you can keep trying unclaimed cells.',
        emoji: '⚠️',
      },
      {
        title: 'Live scoring',
        description: "See who's claimed which cells in real time as the board fills up.",
        emoji: '⚡',
      },
      {
        title: 'No sign-up',
        description: 'Join with a name, start playing instantly.',
        emoji: '🚀',
      },
    ],
    steps: [
      { title: 'Join the room', description: 'Enter your name and wait for the host to start the puzzle.' },
      {
        title: 'Solve the puzzle',
        description: 'Select any empty cell and tap a number to submit. Use Notes for pencil marks.',
      },
      {
        title: 'Race to the top',
        description: 'Each correct cell = +10 pts. Wrong answer = −3 pts. Most points when the puzzle is done wins.',
      },
    ],
    perfectFor: ['Puzzle fans', 'Game nights', 'Brain teasers', 'Classrooms'],
    extraFaqs: [
      {
        question: 'What happens if I submit a wrong answer?',
        answer: 'You lose 3 points, but you can try again on any cell that has not been claimed yet.',
      },
      {
        question: 'Can multiple players solve the same cell?',
        answer: 'No — the first player to submit the correct number claims that cell. Everyone else must move on.',
      },
    ],
  }),
  i_call_on: landing('i_call_on', {
    seoTitle: 'I Call On — Free Online Party Game',
    seoDescription:
      'Play I Call On online. Call a letter, fill five categories, mark answers together — duplicates score 5, unique answers earn 10.',
    keywords: ['i call on', 'stop game', 'categories game', 'party game online'],
    heroSubtitle:
      'The classic A–Z categories game. Someone calls a letter — everyone fills Name, Animal, Place, Thing, and Food before time runs out.',
    highlights: ['Rotating letter caller', 'Live transparent scoring', 'Duplicate detection'],
    features: [
      {
        title: 'Call the letter',
        description: 'Players take turns picking A–Z for the whole room.',
        emoji: '🔤',
      },
      {
        title: 'Mark together',
        description: 'Everyone sees who marked what — reviewers decide if answers fit the category.',
        emoji: '👀',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join the room', description: 'Enter your name and wait for the host to start.' },
      {
        title: 'Play letters',
        description: 'While time lasts, callers pick unused A–Z letters and everyone fills all five categories.',
      },
      {
        title: 'Score together',
        description:
          "Mark the next player's sheet — duplicates score 5, unique answers score 10, everyone sees marks live.",
      },
    ],
    perfectFor: ['Classrooms', 'Road trips', 'Family game night', 'Friend groups'],
    extraFaqs: [
      {
        question: 'How does scoring work?',
        answer:
          'Each unique valid answer earns 10 points per category (50 max per round). If two or more players write the same answer in a category, everyone with that duplicate gets 5 for it. Reviewers mark whether an answer actually fits its category.',
      },
    ],
  }),

  word_hunt: landing('word_hunt', {
    seoTitle: 'Word Hunt — Multiplayer Boggle-Style Game Online',
    seoDescription:
      'Play Word Hunt online with friends. Race on a 4×4 letter grid — connect adjacent letters to spell words before time runs out.',
    keywords: ['word hunt', 'boggle online', 'word game multiplayer', 'letter grid game'],
    heroSubtitle:
      'Everyone gets the same 4×4 grid — spell words from adjacent letters and rack up points before the clock hits zero.',
    highlights: ['4×4 letter grid', 'Timed race', 'Live leaderboard'],
    features: [
      {
        title: 'Connect letters',
        description: 'Drag across adjacent tiles (including diagonals) to build words of 3+ letters.',
        emoji: '🔤',
      },
      {
        title: 'Score big',
        description: '3 letters = 100 pts, 4 = 400, 5 = 800 — longer words earn even more.',
        emoji: '⭐',
      },
      {
        title: 'Live leaderboard',
        description: 'See who is finding the most words in real time.',
        emoji: '⚡',
      },
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join the room', description: 'Enter your name and wait for the host to start the hunt.' },
      {
        title: 'Find words',
        description: 'Tap adjacent letters on the shared grid and submit valid dictionary words.',
      },
      {
        title: 'Beat the clock',
        description: 'Score as many points as you can before time runs out.',
      },
    ],
    perfectFor: ['Word game fans', 'Classrooms', 'Family game night', 'Quick party rounds'],
  }),

  tic_tac_toe: landing('tic_tac_toe', {
    seoTitle: 'Ultimate Tic-Tac-Toe Online — Play with a Friend',
    seoDescription:
      'Play Ultimate (Super) Tic-Tac-Toe online with a friend. Nine boards in one — your move sends your opponent to the next board. Win three boards in a row to win.',
    keywords: [
      'ultimate tic tac toe online',
      'super tic tac toe',
      'play tic tac toe with friends',
      'noughts and crosses online',
      'XO game online',
    ],
    heroSubtitle: 'Ultimate Tic-Tac-Toe — nine boards in one, win three boards in a row to win it all.',
    bodyParagraph:
      'Ultimate Tic-Tac-Toe on Fate Round takes the classic game deeper: the board is nine small 3x3 boards arranged in one big 3x3 grid. Two players join a room, one is X and the other O, and the cell you play decides which board your opponent must play in next. Win a small board by lining up three of your marks inside it, and win the whole game by claiming three small boards in a row — across, down, or diagonally.',
    highlights: ['2 players', 'Nine boards in one', 'Real-time board'],
    features: [
      {
        title: 'Boards within boards',
        description: 'Nine mini Tic-Tac-Toe boards make up one giant board — strategy on two levels.',
        emoji: '🎯',
      },
      {
        title: 'Your move sends them',
        description: 'The cell you pick forces your opponent into the matching board next turn.',
        emoji: '➡️',
      },
      {
        title: 'Three boards in a row wins',
        description: 'Win three small boards across, down, or diagonally to take the whole game.',
        emoji: '🏆',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join a room', description: 'Two players join with their name — the host can join as a player too.' },
      {
        title: 'Play and send',
        description: 'Place your mark — the cell you choose sends your opponent to the matching board.',
      },
      {
        title: 'Win three boards in a row',
        description: 'Win small boards with three in a row, then line up three boards to win the game.',
      },
    ],
    perfectFor: ['Quick matches', 'Friend groups', 'Killing time'],
    extraFaqs: [
      {
        question: 'What happens if my turn timer runs out?',
        answer:
          'Your turn is skipped and play passes to the other player — you can still join back in on your next turn.',
      },
      {
        question: 'Can more than 2 people play?',
        answer:
          'No — Tic-Tac-Toe is strictly 2 players. The host can play as one of the two if they want in on the match.',
      },
    ],
  }),

  chess: landing('chess', {
    seoTitle: 'Chess Online — Play with a Friend',
    seoDescription:
      'Play chess online with a friend. Two players, full standard rules and move validation — checkmate your opponent to win. No sign-up.',
    keywords: ['chess online', 'play chess with friends', 'online chess 2 player', 'chess with a friend'],
    heroSubtitle: 'Classic chess, head-to-head — outsmart your friend and checkmate to win.',
    bodyParagraph:
      'Chess on Fate Round is a clean two-player game of full standard chess. One player joins a room as White, the other as Black, and White moves first. Every move is validated by the rules — legal moves only, with castling, en passant, and pawn promotion all handled. Check, checkmate, stalemate, and draws are detected automatically. Add an optional chess clock — each player gets their own time bank (3, 5, or 10 minutes) that only ticks on their turn, just like online chess, and the first to flag loses.',
    highlights: ['2 players', 'Full rules', 'Real-time board'],
    features: [
      {
        title: 'Real chess rules',
        description: 'Legal moves only — castling, en passant, and promotion all handled for you.',
        emoji: '♟️',
      },
      {
        title: 'Checkmate to win',
        description: 'Check, checkmate, stalemate, and draws are detected automatically.',
        emoji: '♚',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join a room', description: 'Two players join with their name — the host can join as a player too.' },
      {
        title: 'White moves first',
        description: 'One player is White, the other Black. Tap a piece, then its destination.',
      },
      {
        title: 'Checkmate to win',
        description: 'Trap the enemy king with no legal escape. Stalemate or insufficient material is a draw.',
      },
    ],
    perfectFor: ['Quick matches', 'Friend rivalries', 'Chess fans'],
    extraFaqs: [
      {
        question: 'How does the clock work?',
        answer:
          'Each player has their own time bank that only counts down while it is their turn — making a move stops your clock and starts your opponent’s, just like chess.com. The first player to run out of time loses. Pick 3, 5, or 10 minutes each, or leave it off for an untimed match.',
      },
      {
        question: 'Can I resign?',
        answer: 'Yes — there is a Resign button during play. Resigning hands the win to your opponent.',
      },
      {
        question: 'Can more than 2 people play?',
        answer: 'No — chess is strictly 2 players. The host can play as one of the two if they want in on the match.',
      },
    ],
  }),

  checkers: landing('checkers', {
    seoTitle: 'Checkers Online — Play Draughts with a Friend',
    seoDescription:
      'Play checkers (draughts) online with a friend. Two players, forced jumps, multi-jump chains and king promotion — capture every piece to win. No sign-up.',
    keywords: ['checkers online', 'play checkers with friends', 'online draughts 2 player', 'checkers with a friend'],
    heroSubtitle: 'Classic checkers, head-to-head — jump your friend’s pieces and crown your kings.',
    bodyParagraph:
      'Checkers on Fate Round is a clean two-player game of standard American (8×8) draughts. One player joins a room as Red, the other as Black, and Red moves first. Men slide one square diagonally forward; jump an adjacent opponent to capture it — and if a jump is on offer you must take it, chaining multiple jumps in a single turn. Reach the far row to crown a king that moves and captures both directions. Capture all of your opponent’s pieces, or leave them with no legal move, to win. Add an optional clock — each player gets their own time bank (3, 5, or 10 minutes) that only ticks on their turn, and the first to flag loses.',
    highlights: ['2 players', 'Forced jumps', 'Real-time board'],
    features: [
      {
        title: 'Real checkers rules',
        description: 'Forced captures, multi-jump chains, and king promotion all handled for you.',
        emoji: '⛀',
      },
      {
        title: 'Capture to win',
        description: 'Take every enemy piece, or block their last move — wins and draws are detected automatically.',
        emoji: '👑',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join a room', description: 'Two players join with their name — the host can join as a player too.' },
      {
        title: 'Red moves first',
        description: 'One player is Red, the other Black. Tap a piece, then its diagonal destination.',
      },
      {
        title: 'Capture to win',
        description: 'Jump every enemy piece or leave them no move. Crown kings by reaching the far row.',
      },
    ],
    perfectFor: ['Quick matches', 'Friend rivalries', 'Checkers fans'],
    extraFaqs: [
      {
        question: 'Do I have to take a jump?',
        answer:
          'Yes — checkers uses forced captures. If any of your pieces can jump, you must make a jump that turn, and if the same piece can keep jumping you must continue the chain until it can’t.',
      },
      {
        question: 'How does the clock work?',
        answer:
          'Each player has their own time bank that only counts down while it is their turn — making a move stops your clock and starts your opponent’s. The first player to run out of time loses. Pick 3, 5, or 10 minutes each, or leave it off for an untimed match.',
      },
      {
        question: 'Can more than 2 people play?',
        answer:
          'No — checkers is strictly 2 players. The host can play as one of the two if they want in on the match.',
      },
    ],
  }),

  describe_it: landing('describe_it', {
    seoTitle: 'Text Charades — Online Team Word Game',
    seoDescription:
      'Play Text Charades online with friends. Split into teams, describe the secret word without saying it, and race the clock to guess the most words. No sign-up.',
    keywords: [
      'describe it game',
      'online team word game',
      'password game online',
      'catch phrase online',
      'word guessing game',
    ],
    heroSubtitle:
      'Split into teams, describe the word without saying it, and guess as many as you can before time runs out.',
    bodyParagraph:
      'Text Charades on Fate Round is a fast, team-based word race — like Password or Catch Phrase, online. Players join with their name and split into 2–4 teams. Each round one team is on the clock: a describer sees a secret word and types clues (without using the word), while teammates race to type the answer. Every correct guess scores a point and reveals the next word. After all the rounds, the team with the most words wins.',
    highlights: ['4–20 players', '2–4 teams', 'Race the clock'],
    features: [
      {
        title: 'Describe, don’t say it',
        description: 'The describer types clues for a secret word — but never the word itself.',
        emoji: '🗣️',
      },
      {
        title: 'Teammates race to guess',
        description: 'Everyone on the team types guesses; a correct one scores and reveals the next word.',
        emoji: '💬',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Make teams', description: 'Players join with a name and pick a team — the host sets how many teams.' },
      {
        title: 'Describe & guess',
        description: 'One teammate describes secret words while the rest race to guess them.',
      },
      {
        title: 'Most words wins',
        description: 'Add up each team’s guessed words across all rounds — highest total wins.',
      },
    ],
    perfectFor: ['Parties', 'Team building', 'Family game night', 'Big groups'],
  }),

  scrabble: landing('scrabble', {
    seoTitle: 'Scrabble Online — Play with Friends',
    seoDescription:
      'Play Scrabble online with 2–4 friends. Standard 15×15 board, premium squares, blanks, and full dictionary word-checking. No sign-up.',
    keywords: [
      'scrabble online',
      'play scrabble with friends',
      'online scrabble multiplayer',
      'word game with friends',
    ],
    heroSubtitle: 'The classic crossword tile game — build words, hit the premium squares, outscore your friends.',
    bodyParagraph:
      'Scrabble on Fate Round is the classic word game for 2–4 players on a full standard 15×15 board. Draw seven tiles, take turns building interlocking words outward from the centre star, and rack up points — letters are worth their standard values, and double/triple letter and word squares multiply your score. Every word you form is checked against a real dictionary, so only valid plays count. Use a blank tile as any letter, swap tiles you do not want, or pass. When the bag is empty and someone uses their last tile, the game ends and the highest score wins.',
    highlights: ['2–4 players', 'Real dictionary', 'Premium squares'],
    features: [
      {
        title: 'Real dictionary check',
        description: 'Every word is validated against a full word list — no made-up words slip through.',
        emoji: '📖',
      },
      {
        title: 'Premium squares & blanks',
        description: 'Double and triple letter/word squares, blank tiles, and the 50-point bingo bonus all handled.',
        emoji: '🔠',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join a room', description: '2–4 players join with their name — the host can play too.' },
      {
        title: 'Build words',
        description:
          'Tap tiles from your rack onto the board to form words. The first word must cross the centre star.',
      },
      {
        title: 'Outscore everyone',
        description: 'Hit premium squares for big points. Highest score when the tiles run out wins.',
      },
    ],
    perfectFor: ['Word lovers', 'Family game night', 'Friend rivalries'],
    extraFaqs: [
      {
        question: 'How are words checked?',
        answer:
          'Every word you form — the main word and any crosswords it creates — is checked against a standard English word list. If any of them is not a valid word, the play is rejected and you can try again.',
      },
      {
        question: 'How do blank tiles work?',
        answer:
          'A blank can stand in for any letter — you choose which when you place it. It scores zero points but lets you complete words you otherwise could not.',
      },
      {
        question: 'How many people can play?',
        answer: 'Scrabble supports 2 to 4 players. The host can join as one of the players.',
      },
    ],
  }),
  snake_and_ladder: landing('snake_and_ladder', {
    seoTitle: 'Snakes and Ladders Online — Play the Classic Board Game with Friends',
    seoDescription:
      'Play Snakes and Ladders online with friends. Roll the die, climb ladders, dodge snakes, and race to square 100. Classic rules, real-time multiplayer, no sign-up.',
    keywords: [
      'snakes and ladders online',
      'snake and ladder game',
      'snakes and ladders rules',
      'how to play snakes and ladders',
      'play snakes and ladders friends',
      'snakes and ladders multiplayer',
    ],
    heroSubtitle: 'The timeless race to 100 — roll the die, ride the ladders, slip down the snakes.',
    bodyParagraph:
      'Snakes and Ladders on Fate Round follows classic rules: take turns rolling a single die and moving along the 1–100 board. Land on the bottom of a ladder to climb up; land on a snake’s head to slide down to its tail. Roll a 6 to take another turn. You must land on square 100 exactly to win — overshoot and your token stays put.',
    highlights: ['2–6 players', 'Classic rules', 'Real-time board'],
    features: [
      {
        title: 'Roll & race',
        description: 'One die, one token. Move up the board and be the first to reach square 100 exactly.',
        emoji: '🎲',
      },
      {
        title: 'Ladders & snakes',
        description:
          'Ladders shoot you up the board; snakes drag you back down. The board can change everything in one roll.',
        emoji: '🪜',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join a room', description: 'Enter your name and get your color when the host starts.' },
      { title: 'Roll the die', description: 'On your turn, tap to roll and move forward. Roll a 6 to go again.' },
      { title: 'Reach 100', description: 'Climb ladders, dodge snakes, and land on 100 exactly to win.' },
    ],
    perfectFor: ['Family game night', 'Kids & all ages', 'Friend groups'],
    extraFaqs: [
      {
        question: 'How do you win at Snakes and Ladders?',
        answer:
          'Be the first player to land on square 100. You must reach it with an exact roll — if your roll would take you past 100, your token stays where it is and you try again next turn.',
      },
      {
        question: 'What happens when you land on a snake or a ladder?',
        answer:
          'Land on the bottom of a ladder and you climb straight to its top. Land on a snake’s head and you slide down to its tail. You only jump when you finish your move on that exact square.',
      },
      {
        question: 'Does rolling a 6 do anything special?',
        answer:
          'Yes — rolling a 6 earns you another roll. But roll three 6s in a row and your turn is forfeited, so press your luck carefully.',
      },
      {
        question: 'How many people can play?',
        answer: 'Snakes and Ladders supports 2 to 6 players. The host can join as one of the players.',
      },
    ],
  }),
}

export function getGameLandingContent(slug: string): GameLandingContent | null {
  const gameType = gameTypeFromSlug(slug)
  if (!gameType) return null
  return GAME_LANDING_CONTENT[gameType]
}

export function getGameBodyParagraph(content: GameLandingContent): string {
  if (content.bodyParagraph) return content.bodyParagraph

  const cfg = gameTypeConfig(content.gameType)
  return `${cfg.label} on Fate Round runs entirely in the browser — no app download or account required. ${content.heroSubtitle} Create a game, share a short code with your group, and play together from any phone or computer in real time.`
}

export function getGameFaqs(content: GameLandingContent): GameLandingFaq[] {
  const cfg = gameTypeConfig(content.gameType)
  const label = cfg.label

  return [
    {
      question: `How many players do you need for ${label}?`,
      answer: `${label} works with ${cfg.card.players.toLowerCase()}. Create a game on Fate Round, share the link or code, and everyone joins from their browser — no sign-up required.`,
    },
    {
      question: `Is ${label} free to play online?`,
      answer: `Yes. ${label} on Fate Round is completely free — no download, no payment, and no account needed. Create a game and start playing in under a minute.`,
    },
    {
      question: `Can I play ${label} on my phone?`,
      answer: `Yes. Fate Round runs in any mobile browser. Share the room link in your group chat and everyone can play ${label} from their phone or desktop.`,
    },
    ...(content.extraFaqs ?? []),
  ]
}
