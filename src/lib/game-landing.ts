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
  ludo: 'ludo',
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
  noSignup: { title: 'No sign-up', description: 'Create a room and play in seconds — no account needed.', emoji: '⚡' },
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
      'Play Never Have I Ever online with friends for free. Anonymous I have / I haven\'t votes, instant reveals, built-in or custom prompts.',
    keywords: ['never have i ever online', 'never have i ever game', 'nhie party game', 'never have i ever with friends'],
    heroSubtitle:
      'Classic confession game, online. Each prompt asks who\'s done it — anonymous votes reveal how spicy the group really is.',
    bodyParagraph:
      'Never Have I Ever on Fate Round reads each prompt aloud on every screen while players tap I have or I haven\'t anonymously. Use built-in prompts or upload your own — perfect for parties, pregames, or friend groups who want honest confessions without the awkward eye contact. Unlike playing in a circle where people hesitate, anonymous votes get real answers.',
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
      { title: 'Confess & reveal', description: 'Tap I have or I haven\'t each round and see the group split.' },
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
      'Pick a number between 1 and X — you won\'t know the question until after you choose. Then answer whatever gets revealed.',
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
      { title: 'Pick & answer', description: 'Each round one player picks a number — then answers the revealed question.' },
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
          'Yes. Fate Round includes built-in prompts and supports custom questions when you create a room. Vote on your friend group directly or import a name list — results reveal anonymously round by round.',
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
      { title: 'Create a room', description: 'Host sets a title and shares the game code.' },
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
    keywords: ['online bingo game', 'free bingo party', 'number bingo multiplayer', 'host bingo night'],
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
      { title: 'Create a room', description: 'Set a title, share the code, and wait for players to join.' },
      { title: 'Deal cards', description: 'Start the game — every player gets a unique bingo card instantly.' },
      { title: 'Call & win', description: 'Call numbers until someone completes a line and claims BINGO.' },
    ],
    perfectFor: ['Family game night', 'Office parties', 'Classroom fun', 'Pub quizzes'],
    extraFaqs: [
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
      { title: 'Answer fast', description: 'Each round shows a multiple-choice question — tap your answer before time runs out.' },
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
    keywords: ['online monopoly game', 'free monopoly multiplayer', 'board game night', 'property game online'],
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
        description: 'Roll dice, buy or pass on properties, pay rent, draw cards, and manage Jail — core Monopoly rules on your phones.',
        emoji: '🎲',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Create a room', description: 'Set the player cap and share the link — everyone joins with their name.' },
      { title: 'Start the game', description: 'Everyone begins on GO with £1,500. The host starts when ready.' },
      { title: 'Last one wins', description: 'Buy properties, collect rent, and bankrupt opponents until one player remains.' },
    ],
    perfectFor: ['Game nights', 'Family gatherings', 'Friend groups', 'Remote hangouts'],
    extraFaqs: [
      {
        question: 'How many people can play Monopoly online?',
        answer:
          'Monopoly on Fate Round supports 2–6 players in one room. Everyone joins with a display name, starts on GO with £1,500, and takes turns rolling dice until one player bankrupts the rest.',
      },
    ],
  }),

  yahtzee: landing('yahtzee', {
    seoTitle: 'Yahtzee Online — Roll, Hold, and Score',
    seoDescription: 'Play Yahtzee online with friends. Roll dice, hold what you want, and fill your scorecard with the best combos.',
    keywords: ['yahtzee game online', 'dice game multiplayer', 'roll hold scorecard', 'play yahtzee friends'],
    heroSubtitle: 'The classic dice puzzle — score straights, full houses, and Yahtzees together.',
    bodyParagraph:
      'Yahtzee on Fate Round brings roll-and-hold dice scoring to your group online. Up to three rolls per turn, hold the dice you want, and fill your scorecard category by category — straights, full houses, chance, and the coveted Yahtzee. Play solo or with up to six friends — no physical scorecard or dice cup needed.',
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
        question: 'How does scoring work in online Yahtzee?',
        answer:
          'Each turn you roll up to three times, holding dice between rolls. Pick an unused scorecard category to fill — upper section, lower section combos, or chance. Highest total when the board is full wins.',
      },
    ],
  }),

  whot: landing('whot', {
    seoTitle: 'Whot Online — Nigerian Card Game with Friends',
    seoDescription:
      'Play Whot online with friends. Match shape or number, stack Pick 2 and Pick 3, call WHOT — classic Naija house rules.',
    keywords: ['whot card game online', 'naija whot multiplayer', 'nigerian whot game', 'play whot friends'],
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
        question: 'What are the special cards in Whot?',
        answer:
          '1 = Hold On (extra turn), 2 = Pick 2, 5 = Pick 3, 8 = Suspension (skip next player), 14 = General Market (others draw), 20 = WHOT (call shape or number). Pick 2 and Pick 3 stacks cannot be mixed.',
      },
    ],
  }),
  ludo: landing('ludo', {
    seoTitle: 'Ludo Online — Play Classic Board Game with Friends',
    seoDescription:
      'Play Ludo online with friends. Roll two dice, race your pieces home, capture opponents, and block with pairs — classic rules.',
    keywords: ['ludo online', 'play ludo friends', 'ludo board game multiplayer', 'ludo game online free'],
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
      { title: 'Roll the dice', description: 'Roll two dice — use each die separately. A 6 brings a piece out; doubles play both dice then roll again.' },
      { title: 'Race home', description: 'Get all four pieces into the center home triangle to win.' },
    ],
    perfectFor: ['Family game night', 'Friend groups', 'Board game fans'],
    extraFaqs: [
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
}

export function getGameLandingContent(slug: string): GameLandingContent | null {
  const gameType = gameTypeFromSlug(slug)
  if (!gameType) return null
  return GAME_LANDING_CONTENT[gameType]
}

export function getGameBodyParagraph(content: GameLandingContent): string {
  if (content.bodyParagraph) return content.bodyParagraph

  const cfg = gameTypeConfig(content.gameType)
  return `${cfg.label} on Fate Round runs entirely in the browser — no app download or account required. ${content.heroSubtitle} Create a room, share a short code with your group, and play together from any phone or computer in real time.`
}

export function getGameFaqs(content: GameLandingContent): GameLandingFaq[] {
  const cfg = gameTypeConfig(content.gameType)
  const label = cfg.label

  return [
    {
      question: `How many players do you need for ${label}?`,
      answer: `${label} works with ${cfg.card.players.toLowerCase()}. Create a room on Fate Round, share the link or code, and everyone joins from their browser — no sign-up required.`,
    },
    {
      question: `Is ${label} free to play online?`,
      answer: `Yes. ${label} on Fate Round is completely free — no download, no payment, and no account needed. Create a room and start playing in under a minute.`,
    },
    {
      question: `Can I play ${label} on my phone?`,
      answer: `Yes. Fate Round runs in any mobile browser. Share the room link in your group chat and everyone can play ${label} from their phone or desktop.`,
    },
    ...(content.extraFaqs ?? []),
  ]
}
