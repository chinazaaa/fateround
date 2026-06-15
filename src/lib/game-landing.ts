import type { GameType } from '@/types'
import { gameTypeConfig } from '@/lib/game-types'

export type GameLandingContent = {
  gameType: GameType
  slug: string
  seoTitle: string
  seoDescription: string
  keywords: string[]
  heroTitle: string
  heroSubtitle: string
  highlights: string[]
  features: { title: string; description: string; emoji: string }[]
  steps: { title: string; description: string }[]
  perfectFor: string[]
}

export const GAME_TYPE_TO_SLUG: Record<GameType, string> = {
  smash_marry_kill: 'smash-marry-kill',
  red_flag_green_flag: 'red-flag-green-flag',
  smash_or_pass: 'smash-or-pass',
  would_you_rather: 'would-you-rather',
  this_or_that: 'this-or-that',
  most_likely_to: 'most-likely-to',
  who_said_this: 'who-said-this',
  hot_seat: 'hot-seat',
  custom: 'custom-game',
  anonymous_messages: 'anonymous-room',
  secret_message: 'secret-message',
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
  extra: Omit<GameLandingContent, 'gameType' | 'slug' | 'heroTitle'> & { heroTitle?: string }
): GameLandingContent {
  const cfg = gameTypeConfig(gameType)
  return {
    gameType,
    slug: GAME_TYPE_TO_SLUG[gameType],
    heroTitle: extra.heroTitle ?? cfg.label,
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
  }),

  red_flag_green_flag: landing('red_flag_green_flag', {
    seoTitle: 'Red Flag Green Flag Game Online — Free',
    seoDescription:
      'Play Red Flag Green Flag online with friends. Two names per round — rate each person green flag or red flag. Free, instant, no sign-up.',
    keywords: ['red flag green flag game', 'green flag red flag online', 'red flag game with friends'],
    heroSubtitle:
      'Two names, two judgments. Each round your group decides who’s a green flag and who’s a red flag — separately, honestly, and out loud.',
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
  }),

  smash_or_pass: landing('smash_or_pass', {
    seoTitle: 'Smash or Pass Game Online — Free with Friends',
    seoDescription:
      'Play Smash or Pass online for free. Two names each round — smash or pass on each person. Quick rounds, live results, no sign-up.',
    keywords: ['smash or pass game', 'smash or pass online', 'smash pass party game'],
    heroSubtitle:
      'Fast, bold, and brutally simple. Two names show up — your group smashes or passes on each one. No overthinking required.',
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
  }),

  would_you_rather: landing('would_you_rather', {
    seoTitle: 'Would You Rather Online — Free Party Game',
    seoDescription:
      'Play Would You Rather online with friends for free. Hundreds of prompts or bring your own — anonymous votes, instant reveals.',
    keywords: ['would you rather online', 'would you rather game', 'wyr with friends', 'would you rather no signup'],
    heroSubtitle:
      'Impossible choices, anonymous votes. Every round pits two options against each other — see where your group actually stands.',
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
  }),

  this_or_that: landing('this_or_that', {
    seoTitle: 'This or That Game Online — Free with Custom Questions',
    seoDescription:
      'Play This or That online with friends. Upload your own “Coffee or Tea?” prompts — anonymous A/B votes, instant reveals, no sign-up.',
    keywords: ['this or that game', 'this or that online', 'this or that with friends', 'coffee or tea game'],
    heroSubtitle:
      'Your prompts, your vibe. Upload “Coffee or Tea?” style questions — everyone picks A or B and you see where the group lands.',
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
  }),

  most_likely_to: landing('most_likely_to', {
    seoTitle: 'Most Likely To Game Online — Free with Friends',
    seoDescription:
      'Play Most Likely To online for free. Vote on who fits each prompt — anonymous, hilarious, built for friend groups.',
    keywords: ['most likely to game', 'most likely to online', 'mlt party game', 'most likely to with friends'],
    heroSubtitle:
      '“Most likely to…” prompts meet your actual friend group. Anonymous votes, savage reveals, zero mercy.',
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
  }),

  who_said_this: landing('who_said_this', {
    seoTitle: 'Who Said This Game Online — Free Quote Guessing',
    seoDescription:
      'Play Who Said This online. Submit quotes in the lobby, then guess who said each one. Free party game for friend groups.',
    keywords: ['who said this game', 'guess the quote game', 'who said it party game'],
    heroSubtitle:
      'Your group writes the content. Quotes hit the pool, everyone guesses the author — and friendships get tested.',
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
  }),

  hot_seat: landing('hot_seat', {
    seoTitle: 'Hot Seat Party Game Online — Free',
    seoDescription:
      'Play Hot Seat online with friends. Take turns in the spotlight while everyone submits a compliment, observation, or roast.',
    keywords: ['hot seat game', 'hot seat party game online', 'roast compliment game'],
    heroSubtitle:
      'One person in the hot seat. Everyone else drops a compliment, observation, or roast. Take turns until nobody’s safe.',
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
  }),

  custom: landing('custom', {
    seoTitle: 'Custom Voting Party Game — Build Your Own Categories',
    seoDescription:
      'Create a custom online voting game with your own categories — Date, Friendzone, or anything you want. Free on Fate Round.',
    keywords: ['custom party game', 'make your own voting game', 'custom categories game online'],
    heroTitle: 'Custom Voting Game',
    heroSubtitle:
      'You name the slots. Date, Friendzone, CEO — whatever fits your group. Build categories, pick rules, run the poll.',
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
  }),

  anonymous_messages: landing('anonymous_messages', {
    seoTitle: 'Anonymous Room — Free Live Anonymous Chat Game',
    seoDescription:
      'Create a free anonymous room for your group. Auto-assigned lobby names, fully anonymous messages, live for everyone — no sign-up.',
    keywords: ['anonymous chat game', 'anonymous messages party', 'anonymous room online', 'free anonymous chat'],
    heroSubtitle:
      'A live anonymous wall for your group. Join with one tap, get a random lobby name, and post messages everyone sees in real time — with no names attached.',
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
  }),

  secret_message: landing('secret_message', {
    seoTitle: 'Secret Message Link — Free Anonymous Inbox',
    seoDescription:
      'Create a free secret message link and share it anywhere. Friends send anonymous messages — only you see your private inbox. No sign-up for senders.',
    keywords: [
      'secret message link',
      'anonymous message inbox',
      'send me anonymous messages',
      'instagram anonymous messages',
    ],
    heroSubtitle:
      'Like a private suggestion box for your link. Share once — anyone can send you a message, and only you read them.',
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
  }),
}

export function getGameLandingContent(slug: string): GameLandingContent | null {
  const gameType = gameTypeFromSlug(slug)
  if (!gameType) return null
  return GAME_LANDING_CONTENT[gameType]
}
