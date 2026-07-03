import type { ReactNode } from 'react'
import { GameLink } from '@/components/marketing/GameLink'

export type MarketingFaq = { question: string; answer: string }

export type MarketingFeatureCard = { emoji: string; title: string; description: string }

export type MarketingStep = { title: string; description: string }

export type MarketingComparison = {
  heading: string
  /** Column headers: [Fate Round, competitor]. */
  columns: [string, string]
  rows: { label: string; a: string; b: string }[]
  note?: string
}

export type MarketingGameList = {
  heading: string
  items: { game: ReactNode; description: string }[]
  footnote?: ReactNode
}

export type MarketingPageContent = {
  slug: string
  seoTitle: string
  seoDescription: string
  keywords: string[]
  /** Short name used in the breadcrumb trail. */
  breadcrumbName: string
  heroTitle: string
  heroSubtitle: string
  highlights: string[]
  featureCards: MarketingFeatureCard[]
  stepsHeading: string
  steps: MarketingStep[]
  body: ReactNode
  comparison?: MarketingComparison
  gameList?: MarketingGameList
  faqs: MarketingFaq[]
  ctaHeading: string
  ctaSubtext: string
  /** Accent hex used for the hero glow and CTA gradient. */
  accent: string
}

const JACKBOX: MarketingPageContent = {
  slug: 'free-jackbox-alternative',
  breadcrumbName: 'Free Jackbox alternative',
  seoTitle: 'Free Jackbox Alternative — No Download, No Sign-Up',
  seoDescription:
    'Want Jackbox without the price tag or the download? Fate Round is free forever — share one link and your whole group joins from their phones. 20+ games, no app, no account.',
  keywords: [
    'free jackbox alternative',
    'free jackbox alternatives',
    'games like jackbox no download',
    'free jackbox alternative no signup',
    'jackbox alternative free',
    'games like jackbox free',
    'party games like jackbox',
    'jackbox free version',
  ],
  heroTitle: 'The free Jackbox alternative — no pack to buy, no screen to share',
  heroSubtitle:
    "Love the “everyone plays from their phone” chaos, hate paying per pack and downloading on a host screen? Fate Round gives you the same energy — one link, everyone's in — across 20+ games. Free forever.",
  highlights: [
    'Free forever — no pack to buy',
    'No download, no sign-up',
    '20+ games in one room',
    'Works over Discord, Zoom & FaceTime',
  ],
  featureCards: [
    { emoji: '⚡', title: 'No sign-up', description: 'Create a game and play in seconds. Nobody makes an account.' },
    {
      emoji: '💸',
      title: 'Actually free',
      description: 'Every mode, free forever. No pack to unlock, no card to enter.',
    },
    {
      emoji: '📱',
      title: 'Phone = controller',
      description: "Just like Jackbox, but there's no host screen to buy or run. Your phone is the whole game.",
    },
    {
      emoji: '🎲',
      title: 'More than party trivia',
      description: 'Voting games, board classics, card games, word and trivia — one link covers the whole night.',
    },
  ],
  stepsHeading: 'How it works',
  steps: [
    {
      title: 'Pick a game',
      description: "Smash Marry Kill, Would You Rather, Trivia, Monopoly — whatever the group's in the mood for.",
    },
    {
      title: 'Share the code',
      description: 'Send one short room code or link. Everyone joins from any browser.',
    },
    {
      title: 'Play from your phones',
      description: 'Vote, guess, and roll in real time. Switch to a new game without leaving the room.',
    },
  ],
  body: (
    <>
      <p>
        Jackbox is great — and it costs money, needs a screen everyone can see, and locks each night to whichever pack
        the host owns. Fate Round keeps the part everyone actually loves (your phone is the controller, the reveals are
        the punchline) and drops the friction. There&apos;s no pack to buy, no download, and no account. You share a
        link, your group joins from wherever they are, and you jump between{' '}
        <GameLink type="custom">20+ games</GameLink> in the same room.
      </p>
      <p>
        And Fate Round isn&apos;t just party trivia. The same room that runs{' '}
        <GameLink type="smash_marry_kill" /> and <GameLink type="would_you_rather" /> also runs{' '}
        <GameLink type="monopoly" />, <GameLink type="yahtzee" />, <GameLink type="whot" />, <GameLink type="ludo" />,{' '}
        <GameLink type="chess" />, <GameLink type="codewords" />, and <GameLink type="trivia" />. It&apos;s the whole
        game night behind one link — not one pack at a time. Perfect over a Discord or Zoom call, on a couch, or across
        the country.
      </p>
    </>
  ),
  comparison: {
    heading: 'How Fate Round compares to Jackbox',
    columns: ['Fate Round', 'Jackbox'],
    rows: [
      { label: 'Price', a: 'Free forever', b: 'Paid — one-time purchase per pack (~$25–30, varies)' },
      { label: 'Download', a: 'None', b: 'Host installs a screen' },
      { label: 'Account', a: 'None', b: 'Steam/host account (players join free)' },
      { label: 'How players join', a: 'Share a code, any browser', b: 'Room code to a host screen' },
      { label: 'Game breadth', a: '20+ — voting, board, card, trivia', b: '~5 games per pack' },
      { label: 'Best for', a: 'Friends over any call, instantly', b: 'Streamers, one shared screen' },
    ],
    note: 'Comparison reflects Jackbox as of July 2026 — check jackboxgames.com for current pricing.',
  },
  faqs: [
    {
      question: 'Is Fate Round really free?',
      answer: 'Yes — free forever. Every game, every round. No pack to buy, no premium tier, no card required.',
    },
    {
      question: 'Do I need to download anything?',
      answer: 'No. Fate Round runs in any phone or laptop browser. No app, no install, nothing to update.',
    },
    {
      question: 'Does everyone need an account?',
      answer: 'No. The host creates a game, shares a code, and everyone joins with just a display name.',
    },
    {
      question: 'Can we play over Discord or Zoom?',
      answer:
        "Yes — that's the sweet spot. Start a call, share the room code, and everyone plays from their own phone while you talk.",
    },
    {
      question: 'Is it like Jackbox where my phone is the controller?',
      answer: 'Exactly like that — minus the host screen you have to buy and run. Your phone is the whole game.',
    },
  ],
  ctaHeading: 'Ready to ditch the pack?',
  ctaSubtext: 'Free forever. No download. Start a room in under a minute.',
  accent: '#8b5cf6',
}

const VIDEO_CALL: MarketingPageContent = {
  slug: 'video-call-games',
  breadcrumbName: 'Video call games',
  seoTitle: 'Free Video Call Games — FaceTime, Zoom, Discord',
  seoDescription:
    'Already on a call? Fate Round adds games without ending it. Share one link — everyone plays from their own phone. Free, no app, no sign-up. Works on FaceTime, Zoom, and Discord.',
  keywords: [
    'games to play on facetime',
    'games to play on facetime with friends',
    'zoom games no download',
    'discord video call games',
    'video call games',
    'games to play on zoom',
    'games to play on discord',
    'facetime games free',
  ],
  heroTitle: 'Games to play on your next FaceTime, Zoom, or Discord call',
  heroSubtitle:
    "You're already on the call — now give everyone something to do. Share one Fate Round link and the whole group joins from their own phone. No app, no sign-up, no ending the call to open something.",
  highlights: [
    'Play alongside FaceTime, Zoom, Discord & Meet',
    'One shared code, everyone joins',
    'Free forever, no download',
    '20+ games — a quick vote to a full board-game night',
  ],
  featureCards: [
    {
      emoji: '📞',
      title: 'Plays beside your call',
      description: 'No screen-share gymnastics. Your call stays open; the game runs in the browser next to it.',
    },
    {
      emoji: '🔗',
      title: "One link, everyone's in",
      description: 'Drop the code in the group chat or Discord. Players join in seconds from any browser.',
    },
    {
      emoji: '🎭',
      title: 'From icebreaker to chaos',
      description: 'Warm up with Would You Rather, escalate to Smash Marry Kill, cool down with Codewords.',
    },
    {
      emoji: '📱',
      title: 'Any device',
      description: "iPhone, Android, laptop — everyone plays from whatever's in their hand.",
    },
  ],
  stepsHeading: 'How it works',
  steps: [
    { title: 'Start your call', description: 'FaceTime, Zoom, Discord, Meet. Whatever you already use.' },
    {
      title: 'Create a game and share the code',
      description: 'One short link in the chat. Everyone taps in.',
    },
    {
      title: 'Play while you talk',
      description: 'Vote, guess, and reveal in real time without leaving the call.',
    },
  ],
  body: (
    <>
      <p>
        The best call games don&apos;t hijack the call. Fate Round runs in the browser right next to FaceTime, Zoom, or
        Discord — nobody has to screen-share, download an app, or make an account. You share one short code, everyone
        joins from their own phone, and the game plays out live while you keep talking and laughing.
      </p>
      <p>
        Because there are <GameLink type="custom">20+ modes</GameLink> behind one link, a single call can go anywhere.
        Break the ice with <GameLink type="most_likely_to" />, get spicy with <GameLink type="never_have_i_ever" />,
        settle a debate with <GameLink type="would_you_rather" />, then turn it into a real game night with{' '}
        <GameLink type="monopoly" />, <GameLink type="whot" />, <GameLink type="ludo" />, or{' '}
        <GameLink type="trivia" />. Long-distance friends, a Discord server, a family spread across three time zones —
        same link, everyone&apos;s in.
      </p>
    </>
  ),
  gameList: {
    heading: 'Best Fate Round games for a video call',
    items: [
      { game: <GameLink type="would_you_rather" />, description: 'impossible choices, anonymous votes. Instant warm-up.' },
      { game: <GameLink type="most_likely_to" />, description: 'vote for the friend who fits. Savage reveals, zero mercy.' },
      { game: <GameLink type="smash_marry_kill" />, description: 'three names a round, chaos guaranteed.' },
      { game: <GameLink type="trivia" />, description: 'fastest correct answer wins. Great for bigger groups.' },
      { game: <GameLink type="codewords" />, description: 'two teams, one call, one spymaster each. Perfect for Discord.' },
      {
        game: (
          <>
            <GameLink type="monopoly" /> / <GameLink type="yahtzee" /> / <GameLink type="scrabble" /> /{' '}
            <GameLink type="whot" /> / <GameLink type="ludo" />
          </>
        ),
        description: 'when the call turns into a proper game night.',
      },
    ],
  },
  faqs: [
    {
      question: 'What games can you play on FaceTime?',
      answer:
        'Any Fate Round mode works over FaceTime — Would You Rather, Most Likely To, Smash Marry Kill, Trivia, and board games like Monopoly and Ludo. Keep FaceTime open and play in the browser beside it.',
    },
    {
      question: 'Do we need to download an app for Zoom or Discord games?',
      answer:
        'No. Fate Round runs in the browser. Share the room code in your Zoom or Discord chat and everyone joins — no app, no bot, no install.',
    },
    {
      question: 'How do people join?',
      answer:
        'The host creates a game and shares one short code or link. Everyone opens it in their phone or laptop browser and joins with a display name.',
    },
    {
      question: 'Is it free?',
      answer: 'Yes, free forever — no sign-up and no download.',
    },
    {
      question: 'How many people can play?',
      answer:
        'From two friends on a call up to a big group — modes support large lobbies, so it works for a couple or a whole Discord server.',
    },
  ],
  ctaHeading: 'Add a game to your call',
  ctaSubtext: "You're already on the call. Start a room and share the code in seconds.",
  accent: '#0ea5e9',
}

const LONG_DISTANCE: MarketingPageContent = {
  slug: 'long-distance-games',
  breadcrumbName: 'Long distance games',
  seoTitle: 'Free Online Games for Long Distance Couples & Friends',
  seoDescription:
    'Miles apart? Fate Round keeps you close — one link, play together in real time. Free, no download, no sign-up. Two-player Chess, Monopoly, Yahtzee, Scrabble & Whot, plus voting games for two.',
  keywords: [
    'online games for long distance couples',
    'games to play with friends far away free',
    'long distance relationship games',
    'long distance couple games online',
    'games for long distance friends',
    'two player online games free',
    'games to play with your partner online',
  ],
  heroTitle: 'Long distance, same game — free games to play together from anywhere',
  heroSubtitle:
    'Distance is the only thing between you. Share one Fate Round link and play in real time tonight — from a quick “how well do you know me” round to a full Chess rematch. Free, no app, no sign-up.',
  highlights: [
    'Made for two (and up)',
    'Real-time play from anywhere',
    'Free forever, no account',
    'Chess, Monopoly, Yahtzee, Scrabble & Whot',
  ],
  featureCards: [
    {
      emoji: '💌',
      title: 'Closer, not just on a call',
      description: 'Something to do together, not just a screen to stare at.',
    },
    {
      emoji: '♟️',
      title: 'Two-player classics',
      description: 'Chess, Monopoly, Yahtzee, Scrabble, Whot — a full game night for two.',
    },
    {
      emoji: '🤍',
      title: 'Learn each other',
      description: 'Would You Rather, Never Have I Ever, and This or That, built for two.',
    },
    {
      emoji: '🔁',
      title: 'Comes back easy',
      description: "No account means no barrier. One link, any night, you're playing.",
    },
  ],
  stepsHeading: 'How it works',
  steps: [
    {
      title: 'Pick a game',
      description: 'A fast voting round to warm up, or a two-player board game to settle a score.',
    },
    {
      title: 'Send the link',
      description: 'One code by text or chat. They tap in from wherever they are.',
    },
    {
      title: 'Play together, live',
      description: 'Every move and vote syncs in real time. Keep the call open and make a night of it.',
    },
  ],
  body: (
    <>
      <p>
        When you&apos;re apart, the hard part isn&apos;t finding time — it&apos;s finding something to actually do
        together. Fate Round turns “we&apos;re both just on our phones” into a game you&apos;re playing side by side.
        Share one link, and you&apos;re both in the same room in real time. No app to download, no account to make, no
        friction between you and the fun.
      </p>
      <p>
        For two people, that means quiet head-to-head games — <GameLink type="chess" />, <GameLink type="checkers" />,{' '}
        <GameLink type="crazy_eights" />, <GameLink type="whot" /> — when you want something slow and competitive. Want a
        proper game night instead? The board and word classics all play two: <GameLink type="monopoly" />,{' '}
        <GameLink type="yahtzee" />, <GameLink type="scrabble" />, <GameLink type="ludo" />, and{' '}
        <GameLink type="snake_and_ladder">Snakes &amp; Ladders</GameLink>. And when you want to learn each other, the
        two-player voting modes are perfect: <GameLink type="would_you_rather" />, <GameLink type="never_have_i_ever" />,
        and <GameLink type="this_or_that" /> turn into little “how well do you actually know me” moments. Got a few more
        friends scattered across cities? The same link scales up — and modes like <GameLink type="most_likely_to" /> and{' '}
        <GameLink type="two_truths">Two Truths and a Lie</GameLink> kick in once you&apos;re three or more.
      </p>
    </>
  ),
  gameList: {
    heading: 'Best Fate Round games for long distance (just the two of you)',
    items: [
      { game: <GameLink type="would_you_rather" />, description: 'trade impossible choices and find out how they think.' },
      { game: <GameLink type="never_have_i_ever" />, description: 'a two-player confession round that gets tellingly honest.' },
      { game: <GameLink type="this_or_that" />, description: 'quick-fire A or B; upload your own prompts.' },
      {
        game: (
          <>
            <GameLink type="chess" /> / <GameLink type="checkers" />
          </>
        ),
        description: 'slow head-to-head when you want to actually compete.',
      },
      {
        game: (
          <>
            <GameLink type="crazy_eights" /> / <GameLink type="whot" />
          </>
        ),
        description: 'easy card nights that fill the quiet.',
      },
      {
        game: (
          <>
            <GameLink type="yahtzee" /> / <GameLink type="scrabble" />
          </>
        ),
        description: 'dice and word games that go the distance — chase the high score or outspell each other.',
      },
      {
        game: (
          <>
            <GameLink type="monopoly" /> / <GameLink type="ludo" /> /{' '}
            <GameLink type="snake_and_ladder">Snakes &amp; Ladders</GameLink>
          </>
        ),
        description: 'turn a quiet evening into a full board-game night, just the two of you.',
      },
      { game: <GameLink type="tic_tac_toe" />, description: "the fast rematch you can't stop playing." },
    ],
    footnote: (
      <>
        More friends join? <GameLink type="most_likely_to" />,{' '}
        <GameLink type="two_truths">Two Truths and a Lie</GameLink>, and <GameLink type="who_said_this" /> unlock at
        three or more.
      </>
    ),
  },
  faqs: [
    {
      question: 'What are good online games for long distance couples?',
      answer:
        "For two people, Fate Round's Chess, Checkers, Crazy Eights, and Whot are great head-to-head, and the board and word classics all play two — Monopoly, Yahtzee, Scrabble, Ludo, and Snakes & Ladders — for a proper game night. When you want to learn each other, Would You Rather, Never Have I Ever, and This or That are perfect. All free, all in the browser.",
    },
    {
      question: 'Can just two people play?',
      answer:
        'Yes — plenty of modes are built for two, including Monopoly, Yahtzee, Scrabble, Chess, Checkers, Whot, Crazy Eights, Ludo, Would You Rather, and Never Have I Ever. Group modes like Most Likely To unlock once a third friend joins.',
    },
    {
      question: 'Do we need to download an app or make an account?',
      answer: "No. Share one link and you're both playing in the browser — no download, no sign-up.",
    },
    {
      question: 'Is it free?',
      answer: 'Yes, free forever.',
    },
    {
      question: 'Can we play while on a video call?',
      answer:
        "Yes — keep FaceTime, Zoom, or Discord open and play in the browser beside it. That's the ideal long-distance setup.",
    },
  ],
  ctaHeading: 'Play together tonight',
  ctaSubtext: 'Free forever. One link, both of you in — no download, no sign-up.',
  accent: '#f43f5e',
}

export const MARKETING_PAGES: Record<string, MarketingPageContent> = {
  [JACKBOX.slug]: JACKBOX,
  [VIDEO_CALL.slug]: VIDEO_CALL,
  [LONG_DISTANCE.slug]: LONG_DISTANCE,
}

export const ALL_MARKETING_SLUGS = Object.keys(MARKETING_PAGES)

export function getMarketingPage(slug: string): MarketingPageContent | null {
  return MARKETING_PAGES[slug] ?? null
}
