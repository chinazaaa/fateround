import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { GameLink, HubLink } from '@/components/marketing/GameLink'
import { SITE_NAME, OG_IMAGE } from '@/lib/seo'

export type MarketingFaq = { question: string; answer: string }

export type MarketingFeatureCard = { emoji: string; title: string; description: string }

export type MarketingStep = { title: string; description: string }

export type MarketingComparison = {
  heading: string
  /** Column headers: [FateRound, competitor]. */
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
  /** Optional override for the primary CTA button (defaults to "Create a free room" → /create).
   *  Used e.g. by the tournaments page to funnel to /tournament/create. */
  primaryCta?: { href: string; label: string }
  /** Optional per-lander OG image path (defaults to the site-wide OG_IMAGE).
   *  Point at an existing 1200×630 asset in /public — e.g. '/og/whot.png' — so
   *  social shares embed the right game art instead of the generic FateRound card. */
  ogImage?: string
  /** Accent hex used for the hero glow and CTA gradient. */
  accent: string
}

const JACKBOX: MarketingPageContent = {
  slug: 'free-jackbox-alternative',
  breadcrumbName: 'Free Jackbox alternative',
  seoTitle: 'Free Jackbox Alternative — No Download, No Sign-Up',
  seoDescription:
    'Want Jackbox without the price tag or the download? FateRound is free forever — share one link and your whole group joins from their phones. 20+ games, no app, no account.',
  keywords: [
    'free jackbox alternative',
    'free jackbox alternatives',
    'games like jackbox no download',
    'free jackbox alternative no signup',
    'jackbox alternative free',
    'games like jackbox free',
    'party games like jackbox',
    'jackbox free version',
    'quiplash free',
    'quiplash online free',
    'free quiplash alternative',
    'jackbox games free alternative',
    'games like jackbox for free',
    'free party games like jackbox',
    'jackbox alternative no download',
  ],
  heroTitle: 'The free Jackbox alternative — no pack to buy, no screen to share',
  heroSubtitle:
    "Love the “everyone plays from their phone” chaos, hate paying per pack and downloading on a host screen? FateRound gives you the same energy — one link, everyone's in — across 20+ games. Free forever.",
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
      description: "Estate Kings, Whot, Trivia, Would You Rather — whatever the group's in the mood for.",
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
        the host owns. FateRound keeps the part everyone actually loves (your phone is the controller, the reveals are
        the punchline) and drops the friction. There&apos;s no pack to buy, no download, and no account. You share a
        link, your group joins from wherever they are, and you jump between <GameLink type="custom">20+ games</GameLink>{' '}
        in the same room.
      </p>
      <p>
        And FateRound isn&apos;t just party trivia. The same room runs <GameLink type="monopoly" />,{' '}
        <GameLink type="yahtzee" />, <GameLink type="whot" />, <GameLink type="uno" />, <GameLink type="ludo" />,{' '}
        <GameLink type="scrabble" />, and <GameLink type="chess" /> — plus quick word and voting games like{' '}
        <GameLink type="codewords" />, <GameLink type="would_you_rather" />, and <GameLink type="trivia" />. It&apos;s
        the whole game night behind one link — not one pack at a time. Perfect over a Discord or Zoom call, on a couch,
        or across the country.
      </p>
    </>
  ),
  comparison: {
    heading: 'How FateRound compares to Jackbox',
    columns: ['FateRound', 'Jackbox'],
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
      question: 'Is FateRound really free?',
      answer: 'Yes — free forever. Every game, every round. No pack to buy, no premium tier, no card required.',
    },
    {
      question: 'Do I need to download anything?',
      answer: 'No. FateRound runs in any phone or laptop browser. No app, no install, nothing to update.',
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
    {
      question: 'Is there a free Quiplash-style game?',
      answer:
        'FateRound has Punchline, a Quiplash-style game — the same write-funny-answers, vote-for-your-favourite format — completely free, no pack to buy. Share a code and everyone plays from their phone.',
    },
    {
      question: 'What games are like Jackbox but free?',
      answer:
        'FateRound gives you 20+ party games for free — including Punchline, trivia, voting games like Would You Rather and Most Likely To, plus board and card games like Estate Kings and Whot.',
    },
    {
      question: 'Can I play Jackbox-style games on my phone without buying packs?',
      answer:
        'Yes. FateRound is free with no packs to unlock. Every game is available from day one — just share a link and everyone joins from their phone browser.',
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
    'Already on a call? FateRound adds games without ending it. Share one link — everyone plays from their own phone. Free, no app, no sign-up. Works on FaceTime, Zoom, and Discord.',
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
    "You're already on the call — now give everyone something to do. Share one FateRound link and the whole group joins from their own phone. No app, no sign-up, no ending the call to open something.",
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
        The best call games don&apos;t hijack the call. FateRound runs in the browser right next to FaceTime, Zoom, or
        Discord — nobody has to screen-share, download an app, or make an account. You share one short code, everyone
        joins from their own phone, and the game plays out live while you keep talking and laughing.
      </p>
      <p>
        Because there are <GameLink type="custom">20+ modes</GameLink> behind one link, a single call can go anywhere.
        Break the ice with <GameLink type="most_likely_to" />, get spicy with <GameLink type="never_have_i_ever" />,
        settle a debate with <GameLink type="would_you_rather" />, then turn it into a real game night with{' '}
        <GameLink type="monopoly" />, <GameLink type="whot" />, <GameLink type="ludo" />, or <GameLink type="trivia" />.
        Long-distance friends, a Discord server, a family spread across three time zones — same link, everyone&apos;s
        in.
      </p>
    </>
  ),
  gameList: {
    heading: 'Best FateRound games for a video call',
    items: [
      {
        game: <GameLink type="would_you_rather" />,
        description: 'impossible choices, anonymous votes. Instant warm-up.',
      },
      {
        game: <GameLink type="most_likely_to" />,
        description: 'vote for the friend who fits. Savage reveals, zero mercy.',
      },
      { game: <GameLink type="smash_marry_kill" />, description: 'three names a round, chaos guaranteed.' },
      { game: <GameLink type="trivia" />, description: 'fastest correct answer wins. Great for bigger groups.' },
      {
        game: <GameLink type="codewords" />,
        description: 'two teams, one call, one spymaster each. Perfect for Discord.',
      },
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
        'Any FateRound mode works over FaceTime — Would You Rather, Most Likely To, Smash Marry Kill, Trivia, and board games like Estate Kings and Ludo. Keep FaceTime open and play in the browser beside it.',
    },
    {
      question: 'Do we need to download an app for Zoom or Discord games?',
      answer:
        'No. FateRound runs in the browser. Share the room code in your Zoom or Discord chat and everyone joins — no app, no bot, no install.',
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
    'Miles apart? FateRound keeps you close — one link, play together in real time. Free, no download, no sign-up. Two-player Chess, Estate Kings, Five Dice, Word Tiles & Whot, plus voting games for two.',
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
    'Distance is the only thing between you. Share one FateRound link and play in real time tonight — from a quick “how well do you know me” round to a full Chess rematch. Free, no app, no sign-up.',
  highlights: [
    'Made for two (and up)',
    'Real-time play from anywhere',
    'Free forever, no account',
    'Chess, Estate Kings, Five Dice, Word Tiles & Whot',
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
      description: 'Chess, Estate Kings, Five Dice, Word Tiles, Whot — a full game night for two.',
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
        together. FateRound turns “we&apos;re both just on our phones” into a game you&apos;re playing side by side.
        Share one link, and you&apos;re both in the same room in real time. No app to download, no account to make, no
        friction between you and the fun.
      </p>
      <p>
        For two people, that means quiet head-to-head games — <GameLink type="chess" />, <GameLink type="checkers" />,{' '}
        <GameLink type="crazy_eights" />, <GameLink type="whot" /> — when you want something slow and competitive. Want
        a proper game night instead? The board and word classics all play two: <GameLink type="monopoly" />,{' '}
        <GameLink type="yahtzee" />, <GameLink type="scrabble" />, <GameLink type="ludo" />, and{' '}
        <GameLink type="snake_and_ladder">Snakes &amp; Ladders</GameLink>. And when you want to learn each other, the
        two-player voting modes are perfect: <GameLink type="would_you_rather" />, <GameLink type="never_have_i_ever" />
        , and <GameLink type="this_or_that" /> turn into little “how well do you actually know me” moments. Got a few
        more friends scattered across cities? The same link scales up — and modes like{' '}
        <GameLink type="most_likely_to" /> and <GameLink type="two_truths">Two Truths and a Lie</GameLink> kick in once
        you&apos;re three or more.
      </p>
    </>
  ),
  gameList: {
    heading: 'Best FateRound games for long distance (just the two of you)',
    items: [
      {
        game: <GameLink type="would_you_rather" />,
        description: 'trade impossible choices and find out how they think.',
      },
      {
        game: <GameLink type="never_have_i_ever" />,
        description: 'a two-player confession round that gets tellingly honest.',
      },
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
        "For two people, FateRound's Chess, Checkers, Crazy Eights, and Whot are great head-to-head, and the board and word classics all play two — Estate Kings, Five Dice, Word Tiles, Ludo, and Snakes & Ladders — for a proper game night. When you want to learn each other, Would You Rather, Never Have I Ever, and This or That are perfect. All free, all in the browser.",
    },
    {
      question: 'Can just two people play?',
      answer:
        'Yes — plenty of modes are built for two, including Estate Kings, Five Dice, Word Tiles, Chess, Checkers, Whot, Crazy Eights, Ludo, Would You Rather, and Never Have I Ever. Group modes like Most Likely To unlock once a third friend joins.',
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

const DISCORD: MarketingPageContent = {
  slug: 'discord-games',
  breadcrumbName: 'Discord games',
  seoTitle: 'Free Discord Games — No Bot, No Download, Just a Link',
  seoDescription:
    'Add games to any Discord server without a bot or download. FateRound runs in the browser — drop one link in the channel and everyone plays from their phone. Free, no sign-up. 20+ games.',
  keywords: [
    'discord games',
    'games to play on discord',
    'discord games no bot',
    'discord voice call games',
    'games for discord no download',
    'discord party games',
    'best discord games',
    'play games on discord',
  ],
  heroTitle: 'Discord games — no bot to add, no download, just a link',
  heroSubtitle:
    'Skip the bot setup and the permissions headache. Drop one FateRound link in your channel and everyone plays from their own phone while you stay in voice. Free, no sign-up, 20+ games.',
  highlights: [
    'No bot, no permissions',
    'One link in any channel',
    'Play right in voice chat',
    '20+ games, free forever',
  ],
  featureCards: [
    {
      emoji: '🚫',
      title: 'No bot required',
      description: 'Nothing to invite, authorize, or configure. Paste a link — the whole server can play.',
    },
    {
      emoji: '🔗',
      title: "One link, everyone's in",
      description: 'Drop the room code in any text channel. Players join from any browser in seconds.',
    },
    {
      emoji: '🎙️',
      title: 'Made for voice chat',
      description: 'Stay in the voice channel and play alongside it — no screen-share, no app switching.',
    },
    {
      emoji: '🎲',
      title: 'A whole game night',
      description: 'Word games, board classics, party votes, trivia — one link covers the night.',
    },
  ],
  stepsHeading: 'How it works',
  steps: [
    { title: 'Hop in a voice channel', description: 'Get your server together like any other game night.' },
    {
      title: 'Create a game and paste the code',
      description: 'One short link in the text channel — no bot, no OAuth prompt.',
    },
    { title: 'Play while you talk', description: 'Everyone joins from their phone and plays live in real time.' },
  ],
  body: (
    <>
      <p>
        Discord bots are powerful — and a hassle. Someone has to find one, invite it, grant permissions, and learn its
        slash commands before anyone plays. FateRound skips all of it: paste one link in a channel and the whole server
        plays from the browser, right beside your voice chat. No bot, no OAuth prompt, no permissions to approve.
      </p>
      <p>
        And there are <HubLink>20+ games</HubLink> behind that one link. Split the server into teams for{' '}
        <GameLink type="codewords" />, run a big-channel <GameLink type="trivia" />, warm up with{' '}
        <GameLink type="would_you_rather" /> and <GameLink type="most_likely_to" />, then turn movie night into game
        night with <GameLink type="monopoly" />, <GameLink type="whot" />, or <GameLink type="chess" />. Everyone plays
        from their own phone while the call keeps going.
      </p>
    </>
  ),
  gameList: {
    heading: 'Best FateRound games for Discord',
    items: [
      {
        game: <GameLink type="codewords" />,
        description: 'two teams, spymaster clues — built for a server split into sides.',
      },
      {
        game: <GameLink type="trivia" />,
        description: 'fast-finger scoring for a big channel. The bigger the server, the better.',
      },
      {
        game: <GameLink type="would_you_rather" />,
        description: 'anonymous votes, instant reveals — the perfect voice-chat warm-up.',
      },
      {
        game: <GameLink type="most_likely_to" />,
        description: 'call out the server. Savage reveals your channel will quote for weeks.',
      },
      {
        game: (
          <>
            <GameLink type="monopoly" /> / <GameLink type="whot" /> / <GameLink type="chess" />
          </>
        ),
        description: 'when the hangout turns into a proper game night.',
      },
    ],
  },
  faqs: [
    {
      question: 'Do I need a Discord bot to play?',
      answer: 'No. FateRound runs in the browser — paste a link, with no bot to invite or authorize.',
    },
    {
      question: 'How do people join from Discord?',
      answer:
        'The host creates a game and drops the room code or link in a text channel. Everyone opens it in any browser and joins with a display name.',
    },
    {
      question: 'Can we play during a voice call?',
      answer:
        "Yes — that's the point. Stay in the voice channel and play in the browser beside it. No screen-share needed.",
    },
    {
      question: 'Is it free?',
      answer: 'Yes, free forever — no sign-up, no download, no premium tier.',
    },
    {
      question: 'How many people can play?',
      answer: 'From a handful up to a big server — modes support large lobbies, so a whole channel can pile in.',
    },
  ],
  ctaHeading: 'Bring it to your server',
  ctaSubtext: 'No bot, no download. Paste one link and play in under a minute.',
  accent: '#5865f2',
}

const PARTY_HUB: MarketingPageContent = {
  slug: 'free-online-party-games',
  breadcrumbName: 'Free party games',
  seoTitle: 'Free Online Party Games — No Sign-Up, No Download',
  seoDescription:
    'Play 20+ free online party games in one place — Smash Marry Kill, Would You Rather, Trivia, Estate Kings, Whot and more. Share a link, everyone joins from their phone. No sign-up, no download.',
  keywords: [
    'free online party games',
    'party games online',
    'party games no sign up',
    'free party games no download',
    'online games with friends',
    'group games online',
    'browser party games',
    'games to play with friends online free',
  ],
  heroTitle: 'Free online party games — no sign-up, no download',
  heroSubtitle:
    'Every party game your group loves, in one browser tab. Pick a mode, share the code, and everyone joins from their own phone. Free forever — no account, no app, no catch.',
  highlights: ['20+ games, one link', 'No sign-up, no download', 'Play from any phone', 'Free forever'],
  featureCards: [
    {
      emoji: '⚡',
      title: 'Start in seconds',
      description: "No account, no install. Create a room, share the code — you're playing in under a minute.",
    },
    {
      emoji: '🗳️',
      title: 'Party votes & confessions',
      description: 'Smash Marry Kill, Would You Rather, Never Have I Ever, Most Likely To — anonymous and savage.',
    },
    {
      emoji: '♟️',
      title: 'Board & card classics',
      description: 'Estate Kings, Five Dice, Whot, Word Tiles, Chess, Ludo — a full game night, no board required.',
    },
    {
      emoji: '🧠',
      title: 'Word, trivia & puzzles',
      description: 'Codewords, Trivia, Word Hunt, Bingo, Sudoku — something for every kind of group.',
    },
  ],
  stepsHeading: 'How it works',
  steps: [
    { title: 'Pick a game', description: 'Browse 20+ modes — party votes, board games, word and trivia.' },
    { title: 'Share the code', description: 'One short link. Everyone joins from any phone or laptop.' },
    {
      title: 'Play together, live',
      description: 'Vote, guess, and play in real time — switch games without leaving the room.',
    },
  ],
  body: (
    <>
      <p>
        FateRound packs <HubLink>20+ multiplayer games</HubLink> into a single browser tab — no sign-up, no download,
        free forever. Pick a mode, create a game, and share the room code so friends can join from any phone or laptop.
        Everything syncs in real time, so it works over a video call, a Discord server, or in the same room.
      </p>
      <p>
        Go savage with party votes like <GameLink type="smash_marry_kill" />, <GameLink type="would_you_rather" />, and{' '}
        <GameLink type="most_likely_to" />; settle in with board and card classics like <GameLink type="monopoly" />,{' '}
        <GameLink type="yahtzee" />, <GameLink type="whot" />, and <GameLink type="scrabble" />; or test the group with{' '}
        <GameLink type="codewords" /> and <GameLink type="trivia" />. Many modes let you upload your own questions or
        name lists, so any theme works for birthdays, icebreakers, or a lazy night in.
      </p>
    </>
  ),
  gameList: {
    heading: 'Popular free party games',
    items: [
      {
        game: <GameLink type="smash_marry_kill" />,
        description: 'three names a round — assign smash, marry, and kill.',
      },
      {
        game: <GameLink type="would_you_rather" />,
        description: 'impossible choices, anonymous votes, instant reveals.',
      },
      { game: <GameLink type="most_likely_to" />, description: 'vote for the friend who fits — savage and revealing.' },
      { game: <GameLink type="trivia" />, description: 'fast-finger quiz with a live leaderboard.' },
      {
        game: (
          <>
            <GameLink type="monopoly" /> / <GameLink type="whot" />
          </>
        ),
        description: 'board and card classics for a proper game night.',
      },
      {
        game: <GameLink type="codewords" />,
        description: 'two-team word game — clues, guesses, and one deadly assassin.',
      },
    ],
    footnote: (
      <>
        That&apos;s just the start — <HubLink>browse the full catalog of 20+ games</HubLink>.
      </>
    ),
  },
  faqs: [
    {
      question: 'Are the games really free?',
      answer: 'Yes — every mode, free forever. No premium tier, no card, no locked content.',
    },
    {
      question: 'Do we need to sign up or download anything?',
      answer:
        'No. Everything runs in the browser. The host creates a game, shares a code, and players join with just a display name.',
    },
    {
      question: 'What party games can we play?',
      answer:
        '20+ modes — Smash Marry Kill, Would You Rather, Most Likely To, and Never Have I Ever, plus board and card games like Estate Kings, Whot, and Five Dice, and word/trivia games like Codewords and Trivia.',
    },
    {
      question: 'How many people can play?',
      answer:
        'From two up to a big group — most modes support large lobbies, so it works for a couple or a whole party.',
    },
    {
      question: 'Can we play on our phones?',
      answer:
        'Yes. Everyone joins from any phone or laptop browser and plays in real time — perfect over a video call or in the same room.',
    },
  ],
  ctaHeading: 'Start the party',
  ctaSubtext: 'Free forever. Pick a game, share the code, and play in under a minute.',
  accent: '#f59e0b',
}

const KAHOOT: MarketingPageContent = {
  slug: 'free-kahoot-alternative',
  breadcrumbName: 'Kahoot alternative',
  seoTitle: 'Free Kahoot Alternative — No Login, Up to 40 Players',
  seoDescription:
    'A free Kahoot alternative with no login and no forced paywall. Host trivia and 20+ games in the browser — share a code and up to 40 players join from their phones. No account, no download.',
  keywords: [
    'free kahoot alternative',
    'kahoot alternative',
    'games like kahoot',
    'kahoot alternative free no login',
    'kahoot alternative for large groups',
    'free trivia game host',
    'kahoot free version',
    'quiz game like kahoot',
  ],
  heroTitle: 'The free Kahoot alternative — no login, up to 40 players',
  heroSubtitle:
    "Kahoot's free tier caps your players and nudges you to pay. FateRound doesn't lock the essentials behind a paywall — host trivia and 20+ other games with no login, up to 40 players a room. Share a code, everyone joins from their phone. Free forever.",
  highlights: ['Up to 40 players', 'No login to host or join', 'Trivia + 20 more games', 'Free forever'],
  featureCards: [
    {
      emoji: '👥',
      title: 'Up to 40 players',
      description: 'Host a small group or a full class of 40 — no free-tier squeeze pushing you to upgrade.',
    },
    {
      emoji: '🔑',
      title: 'No login required',
      description: 'Host without an account. Players join with a code and a nickname — nothing to sign up for.',
    },
    {
      emoji: '⚡',
      title: 'Fast-finger trivia',
      description:
        'Multiple-choice questions, a live timer, and speed bonuses. Upload your own CSV or use built-in packs.',
    },
    {
      emoji: '🎲',
      title: 'More than a quiz',
      description: 'The same room runs party votes, board games, and word games — not just trivia.',
    },
  ],
  stepsHeading: 'How it works',
  steps: [
    {
      title: 'Pick Trivia (or any mode)',
      description: 'Choose a category or upload your own questions — set rounds and a timer.',
    },
    { title: 'Share the code', description: 'Players join from any browser with a nickname. No login, no app.' },
    {
      title: 'Play & climb the board',
      description: 'Fastest correct answers score the most — the leaderboard updates live.',
    },
  ],
  body: (
    <>
      <p>
        Kahoot is great for a classroom quiz — until the free plan caps your players and the paywall appears. FateRound
        keeps the fast-finger, big-screen energy without the squeeze: no login to host, up to 40 players a room, and no
        premium tier gating your questions. Share a code and the whole class, team, or party jumps in from any browser.
      </p>
      <p>
        Run <GameLink type="trivia" /> with built-in categories or your own uploaded CSV, then keep the group in the
        same room for <GameLink type="codewords" />, <GameLink type="would_you_rather" />, and{' '}
        <GameLink type="most_likely_to" /> — <HubLink>20+ games</HubLink> in all, so a review session can roll straight
        into a social.
      </p>
    </>
  ),
  comparison: {
    heading: 'How FateRound compares to Kahoot',
    columns: ['FateRound', 'Kahoot (free)'],
    rows: [
      { label: 'Price', a: 'Free forever', b: 'Free tier limited; paid plans to unlock more' },
      { label: 'Player limit', a: 'Up to 40 in Trivia', b: 'Capped on the free plan' },
      { label: 'Login to host', a: 'None', b: 'Account required' },
      { label: 'Players join by', a: 'Code, any browser, nickname', b: 'Code via app or browser' },
      { label: 'Game types', a: 'Trivia + 20 party/board/word games', b: 'Quiz-style only' },
      { label: 'Best for', a: 'Classrooms, teams, friends', b: 'Classroom quizzes' },
    ],
    note: 'Kahoot free-tier limits vary — check kahoot.com for current player caps and pricing.',
  },
  faqs: [
    {
      question: 'How many players can join?',
      answer:
        "Trivia rooms hold up to 40 players — plenty for a full class or team, and there's no free-tier squeeze pushing you to pay. No account needed to host or join; everyone comes in from a code.",
    },
    {
      question: 'Do players need a Kahoot-style account or app?',
      answer: 'No. Players open the link in any browser and join with a nickname — no login, no app.',
    },
    {
      question: 'Can I upload my own quiz questions?',
      answer:
        'Yes. Pick a built-in Trivia category or upload a CSV of your own multiple-choice questions when you create the room.',
    },
    {
      question: 'Is it good for classrooms and teams?',
      answer:
        'Yes — no login and room for up to 40 make it easy for a class or a whole team to jump in, and speed-based scoring keeps it competitive.',
    },
    {
      question: 'Is it really free?',
      answer: 'Yes, free forever — no premium tier gating players or questions.',
    },
  ],
  ctaHeading: 'Host without the login',
  ctaSubtext: 'Free forever. No login, up to 40 players — start a game in under a minute.',
  accent: '#7c3aed',
}

const TEAM: MarketingPageContent = {
  slug: 'virtual-team-games',
  breadcrumbName: 'Virtual team games',
  seoTitle: 'Virtual Icebreakers & Team Games — Join by Code, No Download',
  seoDescription:
    'Free virtual icebreakers and team games for remote teams. Join by code from any browser — no download, no accounts. Two Truths, Trivia, Would You Rather, Codewords and more.',
  keywords: [
    'virtual icebreakers',
    'virtual team games',
    'remote team games',
    'online team building games',
    'icebreaker games for work',
    'virtual team building activities',
    'games for remote teams',
    'work team games no download',
  ],
  heroTitle: 'Virtual icebreakers & team games — join by code, no download',
  heroSubtitle:
    'Warm up a remote meeting or run a whole team social without the IT ticket. Share one code and the team joins from any browser — no downloads, no accounts, no setup.',
  highlights: [
    'Join by code, no download',
    'No accounts to provision',
    'Icebreakers to full socials',
    'Free for any team size',
  ],
  featureCards: [
    {
      emoji: '🧊',
      title: 'Real icebreakers',
      description: 'Two Truths and a Lie, Would You Rather, This or That — get a quiet team talking in minutes.',
    },
    {
      emoji: '🔗',
      title: 'Join by code',
      description: 'No installs, no admin approval. Paste a link in the meeting chat and everyone hops in.',
    },
    {
      emoji: '🏆',
      title: 'Friendly competition',
      description: 'Trivia and Codewords split the team into sides — great for offsites and Friday socials.',
    },
    {
      emoji: '🔒',
      title: 'No accounts, no cleanup',
      description: "Players use a display name — nobody signs up, so there's nothing to provision or delete after.",
    },
  ],
  stepsHeading: 'How it works',
  steps: [
    { title: 'Pick an activity', description: 'Icebreaker, quiz, or team game — match it to the meeting.' },
    {
      title: 'Drop the code in chat',
      description: 'Share one link in Zoom, Meet, Teams, or Slack. Everyone joins from the browser.',
    },
    { title: 'Play and warm up', description: 'Run a quick round to open a meeting, or a full bracket for a social.' },
  ],
  body: (
    <>
      <p>
        The best virtual icebreaker doesn&apos;t need a download, an account, or an IT approval. FateRound runs in the
        browser — share one code in the meeting chat and the whole team joins from wherever they are. No installs to
        push, no logins to provision, nothing to clean up afterward.
      </p>
      <p>
        Open a standup with <GameLink type="two_truths">Two Truths and a Lie</GameLink> or{' '}
        <GameLink type="would_you_rather" />, then split into sides for <GameLink type="codewords" /> and{' '}
        <GameLink type="trivia" /> at the offsite. <GameLink type="most_likely_to" /> and{' '}
        <GameLink type="who_said_this" /> are perfect once the team knows each other — <HubLink>20+ games</HubLink> in
        all, so there&apos;s something for every meeting.
      </p>
    </>
  ),
  gameList: {
    heading: 'Best FateRound games for teams',
    items: [
      {
        game: <GameLink type="two_truths">Two Truths and a Lie</GameLink>,
        description: 'the classic icebreaker — learn something surprising about each teammate.',
      },
      { game: <GameLink type="would_you_rather" />, description: 'low-stakes debate that gets a quiet room talking.' },
      { game: <GameLink type="trivia" />, description: 'split into teams and settle who really knows their stuff.' },
      {
        game: <GameLink type="codewords" />,
        description: 'two-team word game — strategy and communication, ideal for offsites.',
      },
      {
        game: <GameLink type="most_likely_to" />,
        description: 'lighthearted and revealing — a favorite for team socials.',
      },
      {
        game: <GameLink type="who_said_this" />,
        description: 'submit quotes, guess the author — great for teams that know each other.',
      },
    ],
  },
  faqs: [
    {
      question: 'Do team members need to download or install anything?',
      answer: 'No. Everyone joins from a browser with a code — no downloads and no admin approval needed.',
    },
    {
      question: 'Do people need to create accounts?',
      answer:
        "No. Players join with a display name, so there's nothing to provision and no data to clean up afterward.",
    },
    {
      question: 'Does it work over Zoom, Meet, Teams, or Slack?',
      answer: 'Yes. Share the code in the meeting or channel chat and play in the browser alongside your call.',
    },
    {
      question: 'What are good quick icebreakers?',
      answer:
        'Two Truths and a Lie, Would You Rather, and This or That run in a few minutes and get quiet groups talking fast.',
    },
    {
      question: 'Is it free for a whole team?',
      answer: 'Yes, free forever with no player cap — a small team or the whole company can join.',
    },
  ],
  ctaHeading: 'Warm up your next meeting',
  ctaSubtext: 'Free forever. Join by code — no downloads, no accounts, no IT ticket.',
  accent: '#14b8a6',
}

const GAME_NIGHT: MarketingPageContent = {
  slug: 'virtual-game-night',
  breadcrumbName: 'Virtual game night',
  seoTitle: 'Virtual Game Night & Birthday Party Games — Free, No App',
  seoDescription:
    'Host a virtual game night or online birthday party from different houses. Share one link — everyone plays from their phone. Free, no app, no sign-up. 20+ party and board games.',
  keywords: [
    'virtual game night',
    'online birthday party games',
    'virtual party games',
    'game night ideas online',
    'games to play from different houses',
    'online games for parties',
    'virtual birthday games',
    'family game night online',
  ],
  heroTitle: 'Virtual game night — everyone playing from different houses',
  heroSubtitle:
    'Different cities, same game night. Share one FateRound link and the whole group plays from their own couch — party votes, board classics, and trivia, all free. No app, no sign-up.',
  highlights: [
    'Play from different houses',
    'Party, board & trivia modes',
    'Free, no app, no sign-up',
    'Great for birthdays',
  ],
  featureCards: [
    {
      emoji: '🎂',
      title: 'Built for the occasion',
      description: 'Birthdays, reunions, holidays — one link keeps everyone in the same game from anywhere.',
    },
    {
      emoji: '🗳️',
      title: 'Warm up, then go deep',
      description: 'Open with Would You Rather, escalate to Smash Marry Kill, finish on an Estate Kings marathon.',
    },
    {
      emoji: '📱',
      title: "Everyone's own screen",
      description: 'No shared board, no passing a phone around — each guest plays from their own device.',
    },
    {
      emoji: '🎉',
      title: 'No host homework',
      description: 'No app to install or account to set up. Create a room and send the link.',
    },
  ],
  stepsHeading: 'How it works',
  steps: [
    { title: 'Start a video call', description: 'FaceTime, Zoom, or Discord — get everyone together.' },
    {
      title: 'Create a game and share the link',
      description: 'One code in the group chat. Everyone taps in from home.',
    },
    {
      title: 'Make a night of it',
      description: 'Bounce between party votes, board games, and trivia — all in one room.',
    },
  ],
  body: (
    <>
      <p>
        A virtual game night lives or dies on how easy it is to join. FateRound makes it one tap: share a link and every
        guest plays from their own phone, from their own house, in real time. Keep a video call open so you can see and
        hear each other, and let the games carry the night — no app to install, no account to make.
      </p>
      <p>
        Ease in with <GameLink type="would_you_rather" />, roast the birthday guest with{' '}
        <GameLink type="most_likely_to" />, run a themed <GameLink type="trivia" /> about the guest of honor, then
        settle in for <GameLink type="monopoly" />, <GameLink type="ludo" />, or a family round of{' '}
        <GameLink type="bingo" />. With <HubLink>20+ games</HubLink> in one room, the night can go wherever the group
        wants.
      </p>
    </>
  ),
  gameList: {
    heading: 'Best games for a virtual game night',
    items: [
      {
        game: <GameLink type="would_you_rather" />,
        description: 'the perfect low-key warm-up while everyone arrives.',
      },
      { game: <GameLink type="most_likely_to" />, description: 'call out the birthday guest — savage and hilarious.' },
      { game: <GameLink type="trivia" />, description: 'make it a themed quiz about the guest of honor.' },
      { game: <GameLink type="bingo" />, description: 'host-called numbers, unique cards — a family-night staple.' },
      {
        game: (
          <>
            <GameLink type="monopoly" /> / <GameLink type="ludo" /> /{' '}
            <GameLink type="snake_and_ladder">Snakes &amp; Ladders</GameLink>
          </>
        ),
        description: 'settle in for a proper board-game marathon.',
      },
      { game: <GameLink type="smash_marry_kill" />, description: 'for the grown-up parties — chaos guaranteed.' },
    ],
  },
  faqs: [
    {
      question: "How do we play if everyone's in different houses?",
      answer:
        'Share one FateRound link. Everyone joins from their own phone and plays in real time — keep a video call open so you can see and hear each other.',
    },
    {
      question: 'Is it good for an online birthday party?',
      answer:
        'Yes — run a themed Trivia about the birthday person, roast them with Most Likely To, or play Bingo with the whole family.',
    },
    {
      question: 'Do guests need an app or account?',
      answer: 'No. Everyone joins from a browser with a display name — no downloads, no sign-ups.',
    },
    {
      question: 'What games work for mixed ages?',
      answer:
        'Bingo, Trivia, Estate Kings, Ludo, and Would You Rather are family-friendly; save Smash Marry Kill and Never Have I Ever for grown-up groups.',
    },
    {
      question: 'Is it free?',
      answer: 'Yes, free forever — no app, no sign-up, no premium tier.',
    },
  ],
  ctaHeading: 'Throw the game night',
  ctaSubtext: 'Free forever. One link, everyone from home — start in under a minute.',
  accent: '#d946ef',
}

const BORED: MarketingPageContent = {
  slug: 'games-to-play-when-bored',
  breadcrumbName: 'Bored? Play now',
  seoTitle: 'Games to Play When Bored — Free, Online, With Friends',
  seoDescription:
    'Bored? FateRound has 20+ free games to play with friends online — share one link and start in seconds. No sign-up, no download. Party votes, board games, trivia and more.',
  keywords: [
    'games to play when bored',
    'what to play when bored',
    'fun games to play with friends online',
    'games to play online with friends when bored',
    'bored games online free',
    'things to do online with friends',
    'free online games no download',
  ],
  heroTitle: "Bored? Here's what to play with friends online — one link, 20+ games",
  heroSubtitle:
    'Group chat gone quiet? Share one FateRound link and pick from 20+ games — party votes, board classics, trivia, word games. Everyone plays from their phone. Free, no sign-up.',
  highlights: ['20+ games, one link', 'Start in seconds', 'Play from any phone', 'Free, no sign-up'],
  featureCards: [
    {
      emoji: '⚡',
      title: 'Cure boredom fast',
      description: "No setup, no downloads. Create a room, share the code, and you're playing in under a minute.",
    },
    {
      emoji: '🤷',
      title: "Can't decide? Bounce around",
      description: 'Switch between 20+ modes in the same room until something sticks.',
    },
    {
      emoji: '📱',
      title: 'Wherever you are',
      description: 'On the couch, on a call, or across the country — everyone joins from their own phone.',
    },
    {
      emoji: '🆓',
      title: 'Actually free',
      description: 'Every game, free forever. No account, no app, no premium wall.',
    },
  ],
  stepsHeading: 'How it works',
  steps: [
    { title: 'Pick anything', description: 'Party vote, board game, trivia, word game — whatever kills the boredom.' },
    { title: 'Share the code', description: 'One link in the group chat. Everyone joins from any browser.' },
    {
      title: "Play until you're not bored",
      description: 'Switch games freely — no need to leave the room to try the next one.',
    },
  ],
  body: (
    <>
      <p>
        The fastest fix for a bored group chat is a single link everyone can tap. FateRound gives you exactly that:
        create a room, drop the code, and pick from <HubLink>20+ games</HubLink> — no sign-up, no download, nothing to
        install. Everyone plays from their own phone, so it works whether you&apos;re on a call or scattered across the
        country.
      </p>
      <p>
        Want quick chaos? <GameLink type="smash_marry_kill" /> and <GameLink type="never_have_i_ever" />. Want to think?{' '}
        <GameLink type="codewords" /> or <GameLink type="chess" />. Want a classic? <GameLink type="monopoly" />,{' '}
        <GameLink type="whot" />, or <GameLink type="ludo" />. Big group? <GameLink type="trivia" /> and{' '}
        <GameLink type="bingo" /> keep everyone in. Just two of you? <GameLink type="checkers" /> and{' '}
        <GameLink type="would_you_rather" /> do the trick.
      </p>
    </>
  ),
  gameList: {
    heading: 'Bored? Try one of these',
    items: [
      {
        game: <GameLink type="would_you_rather" />,
        description: 'zero setup, instant debate — the fastest cure for a quiet chat.',
      },
      { game: <GameLink type="smash_marry_kill" />, description: 'when you want chaos, not a warm-up.' },
      { game: <GameLink type="trivia" />, description: 'settle who actually knows things.' },
      { game: <GameLink type="codewords" />, description: 'two teams, one word game — for when you want to think.' },
      {
        game: (
          <>
            <GameLink type="monopoly" /> / <GameLink type="whot" /> / <GameLink type="ludo" />
          </>
        ),
        description: 'turn boredom into a full game night.',
      },
      {
        game: (
          <>
            <GameLink type="chess" /> / <GameLink type="checkers" />
          </>
        ),
        description: 'just the two of you and nothing to do.',
      },
    ],
  },
  faqs: [
    {
      question: 'What can I play with friends online right now?',
      answer:
        'Share a FateRound link and pick any of 20+ games — Would You Rather and Smash Marry Kill for quick chaos, Estate Kings or Whot for a longer session, Trivia for a big group.',
    },
    {
      question: 'Do we need to download or sign up?',
      answer:
        'No. Everything runs in the browser — create a room, share the code, and everyone joins with a display name.',
    },
    {
      question: "What if it's just two of us?",
      answer:
        'Plenty of modes work for two — Chess, Checkers, Whot, Crazy Eights, and Would You Rather are all great head-to-head.',
    },
    {
      question: "What's good for a big bored group?",
      answer: 'Trivia, Bingo, and Codewords scale to large lobbies and keep everyone involved.',
    },
    {
      question: 'Is it free?',
      answer: 'Yes, free forever — no sign-up, no download, no catch.',
    },
  ],
  ctaHeading: 'Kill the boredom',
  ctaSubtext: 'Free forever. One link, 20+ games — start in under a minute.',
  accent: '#f97316',
}

const HOUSEPARTY: MarketingPageContent = {
  slug: 'houseparty-alternative',
  breadcrumbName: 'Houseparty alternative',
  seoTitle: 'Houseparty Alternative (2026) — Free Games With Friends',
  seoDescription:
    'Miss Houseparty? FateRound brings back games with friends over a video call — share one link, everyone plays from their phone. Free, no sign-up, 20+ games. Works with any video app.',
  keywords: [
    'houseparty alternative',
    'apps like houseparty',
    'houseparty replacement',
    'houseparty game app alternative',
    'video call games app',
    'games with friends over video',
    'houseparty shut down alternative',
    'free houseparty alternative',
    'apps like house party',
    'houseparty app replacement',
    'houseparty games app',
    'houseparty app alternative 2026',
    'games to play with friends on video call',
    'apps like houseparty 2026',
  ],
  heroTitle: 'The Houseparty alternative — games with friends, back for good',
  heroSubtitle:
    "Houseparty shut down, but the thing you loved — casual games over a video call — didn't have to. FateRound brings it back: one link, everyone plays from their phone. Free, no sign-up, 20+ games.",
  highlights: ['Games over any video call', 'One link, everyone joins', 'Free, no sign-up', '20+ games'],
  featureCards: [
    {
      emoji: '👋',
      title: 'The part you missed',
      description: 'Casual, spontaneous games with friends — minus the app that shut down.',
    },
    {
      emoji: '🔗',
      title: 'Works with any video app',
      description: 'Keep FaceTime, Zoom, or Discord open and play beside it. No all-in-one app required.',
    },
    {
      emoji: '🎲',
      title: 'Way more games',
      description: 'Trivia, party votes, board and card classics — a deeper bench than Houseparty ever had.',
    },
    {
      emoji: '🆓',
      title: 'Free, no account',
      description: 'No sign-up, no download. Share a link and your friends are in.',
    },
  ],
  stepsHeading: 'How it works',
  steps: [
    { title: 'Start a video call', description: 'Any app you already use — FaceTime, Zoom, Discord, Meet.' },
    { title: 'Share a FateRound link', description: 'One code in the chat. Friends join from any browser.' },
    {
      title: 'Play like the old days',
      description: 'Trivia, Would You Rather, Estate Kings and more — live, together.',
    },
  ],
  body: (
    <>
      <p>
        Houseparty — the video-chat app with built-in games — shut down in 2021, and nothing quite replaced the easy
        &ldquo;jump on and play&rdquo; feeling. FateRound brings back the games-with-friends part and pairs it with
        whatever video app you already use. Keep FaceTime, Zoom, or Discord open, share one link, and everyone plays
        from their phone.
      </p>
      <p>
        And you get a far deeper bench than Houseparty&apos;s handful of quizzes: <GameLink type="trivia" />,{' '}
        <GameLink type="would_you_rather" />, and <GameLink type="most_likely_to" /> for the classics, plus{' '}
        <GameLink type="codewords" />, <GameLink type="monopoly" />, <GameLink type="whot" />, and{' '}
        <GameLink type="chess" /> when you want a real game night — <HubLink>20+ games</HubLink> in all, free forever.
      </p>
    </>
  ),
  gameList: {
    heading: 'Games to play like you did on Houseparty',
    items: [
      { game: <GameLink type="trivia" />, description: 'the head-to-head quiz that defined Houseparty nights.' },
      { game: <GameLink type="would_you_rather" />, description: 'quick, anonymous, endlessly replayable.' },
      { game: <GameLink type="most_likely_to" />, description: 'call out your friends — no mercy.' },
      {
        game: <GameLink type="codewords" />,
        description: "two teams over one call — a step up from Houseparty's quizzes.",
      },
      {
        game: (
          <>
            <GameLink type="monopoly" /> / <GameLink type="whot" /> / <GameLink type="ludo" />
          </>
        ),
        description: 'the full game night Houseparty never had.',
      },
      {
        game: (
          <>
            <GameLink type="chess" /> / <GameLink type="checkers" />
          </>
        ),
        description: 'settle it one-on-one.',
      },
    ],
  },
  faqs: [
    {
      question: 'What happened to Houseparty?',
      answer:
        'Houseparty, the video-chat app with built-in games, shut down in 2021. FateRound brings back the games-with-friends part and works alongside any video app you already use.',
    },
    {
      question: 'Is FateRound like Houseparty?',
      answer:
        "It's the games layer Houseparty was loved for — but you keep your own video call (FaceTime, Zoom, Discord) and get 20+ games instead of a handful.",
    },
    {
      question: 'Do we need to download an app?',
      answer: 'No. FateRound runs in the browser — share a link and everyone joins with a display name.',
    },
    {
      question: 'Does it have video chat built in?',
      answer:
        "No — and that's on purpose. Keep the video app you already use and play FateRound beside it, so nobody has to switch platforms.",
    },
    {
      question: 'Is it free?',
      answer: 'Yes, free forever — no sign-up, no download, no premium tier.',
    },
    {
      question: 'What apps are like Houseparty in 2026?',
      answer:
        'FateRound plus your existing video app (FaceTime, Zoom, Discord) replaces what Houseparty did. You get casual games with friends over a call — 20+ of them — without needing one all-in-one app.',
    },
    {
      question: 'Can I play games over FaceTime like Houseparty?',
      answer:
        'Yes. Keep FaceTime open and share a FateRound link — everyone plays from their phone browser right alongside the call. Trivia, Would You Rather, Estate Kings, and more.',
    },
  ],
  ctaHeading: 'Bring back game night',
  ctaSubtext: 'Free forever. One link over any video call — start in under a minute.',
  accent: '#a855f7',
}

const NAIJA: MarketingPageContent = {
  slug: 'nigerian-games',
  breadcrumbName: 'Nigerian games',
  seoTitle: 'Play Nigerian Games Online Free — Whot, Ludo & More',
  seoDescription:
    'Naija game night, online. Play Whot, Ludo, Draughts, Snakes & Ladders and more with friends and family anywhere — share one link over WhatsApp. Free, no app, no sign-up.',
  keywords: [
    'nigerian games online',
    'naija games',
    'play whot online',
    'whot online nigeria',
    'ludo online nigeria',
    'nigerian card games online',
    'naija game night',
    'play whot and ludo online',
    'nigerian games for diaspora',
    'play naija games online free',
    'draughts online nigeria',
    'stop game name place animal thing online',
    'play nigerian games with family abroad',
    'whot online with friends free',
    'african board games online',
    'african games online free',
    'ayo game online',
    'play ayo online free',
    'nigerian board games',
    'mancala online nigeria',
    'naija card game',
    'nigerian games for friends',
  ],
  heroTitle: 'Naija game night, online — Whot, Ludo and the classics',
  heroSubtitle:
    'Nothing hits like a Naija game night. Now everyone plays from their phone — same city or scattered across the world. Share one link over WhatsApp and the whole crew is in. Free, no app, no sign-up.',
  highlights: [
    'Whot, Ludo, Draughts & more',
    'Play with family abroad',
    'Share once over WhatsApp',
    'Free, no app, no sign-up',
  ],
  featureCards: [
    {
      emoji: '🃏',
      title: 'Real Naija Whot',
      description: 'Nigerian house rules — call WHOT, stack Pick 2 & Pick 3, Hold On, General Market. The proper game.',
    },
    {
      emoji: '🎲',
      title: 'Ludo & the classics',
      description:
        'Ludo, Draughts, Snakes & Ladders, and “Stop” (Name, Place, Animal, Thing) — the games you grew up on.',
    },
    {
      emoji: '🌍',
      title: 'For the diaspora',
      description: 'Play with family in Naija from London, Houston, or Toronto — same board, real time, over any call.',
    },
    {
      emoji: '💬',
      title: 'One WhatsApp link',
      description: 'Drop the link in the family group chat and everyone taps in. No app to download, no account.',
    },
  ],
  stepsHeading: 'How it works',
  steps: [
    { title: 'Pick a game', description: 'Whot, Ludo, Draughts, Snakes & Ladders, or Stop — whatever the crew wants.' },
    {
      title: 'Share the link on WhatsApp',
      description: 'One code in the group chat — everyone joins from their phone.',
    },
    { title: 'Play together, live', description: 'Same board in real time, wherever everyone is in the world.' },
  ],
  body: (
    <>
      <p>
        Whot on a Friday night, Ludo that runs till someone’s vexed, Draughts on the veranda — Naija game night is a
        whole vibe. FateRound brings it online without losing the spirit: everyone plays from their own phone, over one
        shared link, in real time. No app to download, no account to make — just drop the link in the WhatsApp group and
        the crew is in.
      </p>
      <p>
        Play proper Naija <GameLink type="whot" /> with the real house rules — call WHOT, stack Pick 2 and Pick 3, Hold
        On, and General Market — then run it back with <GameLink type="ludo" />,{' '}
        <GameLink type="checkers">Draughts</GameLink>, <GameLink type="snake_and_ladder">Snakes &amp; Ladders</GameLink>
        , <GameLink type="ayo" />, and <GameLink type="i_call_on">Stop (Name, Place, Animal, Thing)</GameLink>. Feeling
        competitive? Bankrupt the family in <GameLink type="monopoly" />. It’s the whole game night behind one link —
        perfect for the diaspora keeping game night alive across time zones.
      </p>
    </>
  ),
  gameList: {
    heading: 'Naija games to play online',
    items: [
      {
        game: <GameLink type="whot" />,
        description: 'the Nigerian card classic — match, stack, and call WHOT on your crew.',
      },
      {
        game: <GameLink type="ludo" />,
        description: 'roll, race, capture, and block your way home. Game night staple.',
      },
      {
        game: <GameLink type="checkers">Draughts</GameLink>,
        description: 'the veranda classic — jump your opponent’s pieces and crown your kings.',
      },
      {
        game: <GameLink type="snake_and_ladder">Snakes &amp; Ladders</GameLink>,
        description: 'climb the ladders, dodge the snakes — the whole family, kids included.',
      },
      {
        game: <GameLink type="ayo" />,
        description: 'the traditional Yoruba seed game — sow, capture 2s and 3s, and crown Ota.',
      },
      {
        game: <GameLink type="i_call_on">Stop (Name, Place, Animal, Thing)</GameLink>,
        description: 'call a letter and race to fill the categories — unique answers score big.',
      },
      {
        game: <GameLink type="monopoly" />,
        description: 'roll, buy, and bankrupt the family. Last one standing wins.',
      },
    ],
  },
  faqs: [
    {
      question: 'What Nigerian games can I play online?',
      answer:
        'FateRound has Whot (with real Naija house rules), Ludo, Draughts (Checkers), Snakes & Ladders, and Stop / Name-Place-Animal-Thing, plus the property-trading game Estate Kings. All free, all in the browser — no app to download.',
    },
    {
      question: 'Can I play Whot online with friends and family abroad?',
      answer:
        'Yes — that’s exactly what it’s built for. Share one link and 2 to 6 of you play the same game of Whot in real time, whether you’re in Lagos, London, or Houston. Perfect over a WhatsApp video call.',
    },
    {
      question: 'How do we all join?',
      answer:
        'The host creates a game and shares one short link — drop it in the family or friends WhatsApp group, and everyone taps in from their own phone with a nickname. No app, no sign-up.',
    },
    {
      question: 'How many people can play?',
      answer:
        'It depends on the game — Whot and Ludo take 2 to 6, Draughts is head-to-head, and party games like Stop scale to bigger groups. Everyone plays from their own phone in one room.',
    },
    {
      question: 'Is it really free?',
      answer: 'Yes — free forever, no sign-up and no download. Just share the link and play.',
    },
    {
      question: 'What is Ayo?',
      answer:
        "Ayo (also called Ayoayo or Ayo Olopon) is a traditional Nigerian mancala board game from Yoruba culture. Two players take turns sowing seeds anti-clockwise around a wooden board with 12 houses. You capture seeds when your last sown seed lands in an opponent's house containing 2 or 3 seeds. Play it free on FateRound — no board needed.",
    },
    {
      question: 'What African games can I play online?',
      answer:
        'FateRound has a growing collection of African games you can play free in your browser: Whot (the Nigerian card game), Ludo, Draughts (Checkers), Ayo (Yoruba mancala), Snakes & Ladders, and Stop (Name, Place, Animal, Thing). All multiplayer, all real-time — just share a link.',
    },
    {
      question: 'How do I play Nigerian games with family in the diaspora?',
      answer:
        'Start a video call on WhatsApp or Zoom, create a game on FateRound, and share the short link in your family group chat. Everyone joins from their phone — Lagos, London, Houston, Toronto, wherever. No app to download, no account needed. Works on any phone browser.',
    },
  ],
  ctaHeading: 'Start the game night',
  ctaSubtext: 'Free forever. Share one link on WhatsApp — the whole crew is in.',
  accent: '#15803d',
}

const LUDO_KING: MarketingPageContent = {
  slug: 'free-ludo-king-alternative',
  breadcrumbName: 'Free Ludo King alternative',
  seoTitle: 'Free Ludo King Alternative — Play Ludo Online, No Download',
  seoDescription:
    'Want Ludo King without the app, ads, or download? Play Ludo free in your browser — share one link and 2–4 players join from any phone. No install, no sign-up.',
  keywords: [
    'ludo king alternative',
    'free ludo king alternative',
    'ludo king online',
    'play ludo online free no download',
    'ludo online no app',
    'ludo king for pc',
    'ludo king browser',
    'ludo online multiplayer free',
    'ludo without download',
    'play ludo with friends online free',
  ],
  heroTitle: 'The free Ludo King alternative — no app, no download',
  heroSubtitle:
    'Love Ludo, tired of the app, the ads, and the download? Play Ludo free in your browser — share one link and 2 to 4 of you roll, race, and capture in real time. No install, no sign-up.',
  highlights: ['Free, no ads to dodge', 'No app or download', 'Share a link — everyone joins', 'Play on any device'],
  featureCards: [
    {
      emoji: '🎲',
      title: 'Classic Ludo rules',
      description: 'Roll, bring pieces out on a 6, capture, blockade, and race all four home.',
    },
    {
      emoji: '🔗',
      title: 'No app — just a link',
      description: 'Share one code; players join from any phone or laptop browser. Nothing to install.',
    },
    {
      emoji: '🌍',
      title: 'Play from anywhere',
      description: 'Friends and family in different cities join the same board in real time.',
    },
    { emoji: '🆓', title: 'Free, no upsell', description: 'No ads gating your game, no coins to buy — just play.' },
  ],
  stepsHeading: 'How it works',
  steps: [
    { title: 'Create a Ludo game', description: 'Pick Ludo and set your options — no account needed.' },
    { title: 'Share the link', description: 'Drop the code in your chat; 2–4 players tap in from their phones.' },
    { title: 'Race home', description: 'Roll, capture, and get all four pieces home first — live on every device.' },
  ],
  body: (
    <>
      <p>
        Ludo King made Ludo a phone staple — but it means an app to download, ads between games, and coins to buy. Fate
        Round keeps the game and drops the friction: <GameLink type="ludo" /> plays right in the browser, free, with the
        classic rules you know. Share one link and 2 to 4 players join from any phone — no install, no account, no ads
        interrupting the fun.
      </p>
      <p>
        It’s perfect for playing with friends and family in different cities, or for the diaspora keeping game night
        alive across time zones. And once the Ludo’s done, the same room runs <GameLink type="whot" />,{' '}
        <GameLink type="checkers">Draughts</GameLink>, and{' '}
        <GameLink type="snake_and_ladder">Snakes &amp; Ladders</GameLink> — see the full{' '}
        <HubLink>Naija game night</HubLink> lineup.
      </p>
    </>
  ),
  comparison: {
    heading: 'How FateRound compares to Ludo King',
    columns: ['FateRound', 'Ludo King'],
    rows: [
      { label: 'Price', a: 'Free forever', b: 'Free with ads + in-app purchases' },
      { label: 'Download', a: 'None — runs in the browser', b: 'App install required' },
      { label: 'Ads', a: 'None', b: 'Ads between games (on the free tier)' },
      { label: 'How to join', a: 'Share a link, any browser', b: 'Add friends in the app' },
      { label: 'Devices', a: 'Any phone, tablet, or laptop', b: 'Mobile app' },
      { label: 'Other games', a: 'Whot, Draughts, Snakes & Ladders & 20+ more', b: 'Ludo (plus a few in-app)' },
    ],
    note: 'Comparison reflects Ludo King’s commonly available free tier as of July 2026 — check the app store for current details.',
  },
  faqs: [
    {
      question: 'Is there a free Ludo King alternative with no download?',
      answer:
        'Yes — FateRound’s Ludo plays right in your browser, free, with no app to install and no sign-up. Share one link and 2 to 4 players join from any phone or laptop.',
    },
    {
      question: 'Can I play Ludo online without the app?',
      answer:
        'Yes. Skip the app store entirely — create a game, share the code, and everyone plays in the browser in real time. Works on phones, tablets, and computers.',
    },
    {
      question: 'How many players, and is it really free?',
      answer:
        'Ludo takes 2 to 4 players, and it’s free forever with no ads gating your game and no coins to buy. Just share the link and play.',
    },
    {
      question: 'Can I play Ludo with friends and family abroad?',
      answer:
        'Yes — everyone joins from their own phone wherever they are, so it’s great for the diaspora. Share one link over WhatsApp and you’re on the same board in real time.',
    },
  ],
  ctaHeading: 'Play Ludo — no app required',
  ctaSubtext: 'Free forever. Share one link and 2–4 players are in.',
  accent: '#15803d',
}

const WHOT_UNO: MarketingPageContent = {
  slug: 'whot-vs-uno',
  breadcrumbName: 'Whot vs Uno',
  seoTitle: 'Whot vs Uno — Differences, and Where to Play Both Free',
  seoDescription:
    'Whot vs Uno: how the two card classics compare, and where to play both free online. Whot uses shapes and WHOT wilds; Uno uses colours and Wild cards. Play both free on FateRound — no app, no sign-up.',
  keywords: [
    'whot vs uno',
    'is whot like uno',
    'difference between whot and uno',
    'whot or uno',
    'nigerian uno',
    'whot and uno online',
    'whot vs uno rules',
    'uno alternative online free',
    'card games like uno online',
  ],
  heroTitle: 'Whot vs Uno — cousins, not twins (and you can play both)',
  heroSubtitle:
    'Whot and Uno are close cousins: match, shed your hand, and use wild cards to bend the game. Here’s how they differ — and how to play both free in your browser, no app, no sign-up.',
  highlights: ['Whot: shapes + WHOT wilds', 'Uno: colours + wilds', 'Play both free online', 'No app, no sign-up'],
  featureCards: [
    {
      emoji: '🃏',
      title: 'Both are shedding games',
      description: 'Match by rank or shape/colour and race to empty your hand first — same core loop.',
    },
    {
      emoji: '🔀',
      title: 'Whot came first',
      description: 'Whot (1950s) uses five shapes and the WHOT wild; Uno (1971) uses four colours and Wild cards.',
    },
    {
      emoji: '⚡',
      title: 'Similar special cards',
      description: 'Whot’s Pick 2, Pick 3 & WHOT mirror Uno’s Draw 2, Draw 4 & Wild — plus Hold On and General Market.',
    },
    {
      emoji: '🎮',
      title: 'Play both here',
      description:
        'FateRound has real Whot and Match Up (our Uno-style card game) — plus Crazy Eights, the classic where 8s are wild — free, in the browser.',
    },
  ],
  stepsHeading: 'How they compare',
  steps: [
    { title: 'The goal is the same', description: 'Empty your hand first by matching the top card and playing wilds.' },
    {
      title: 'The look differs',
      description: 'Whot uses shapes (circle, cross, triangle, square, star); Uno uses colours.',
    },
    {
      title: 'Try each free',
      description: 'Play Whot or Match Up (our Uno-style card game) on FateRound — share a link and your crew joins.',
    },
  ],
  body: (
    <>
      <p>
        If you grew up on one, you already know the other. <GameLink type="whot" /> and Uno are both shedding games:
        match the top card, play action cards to mess with the next player, and race to empty your hand. Whot came first
        (Nigeria and the UK, 1950s), uses five shapes instead of colours, and its WHOT card (number 20) is the wild —
        rhyming exactly with Uno’s Wild. Whot’s Pick 2 and Pick 3 are Uno’s Draw 2 and Draw 4, and Whot adds Hold On and
        General Market for extra chaos.
      </p>
      <p>
        The best part: you don’t have to choose. FateRound has proper Naija <GameLink type="whot" /> and{' '}
        <GameLink type="uno" /> (our Uno-style card game) — plus <GameLink type="crazy_eights">Crazy Eights</GameLink>,
        the classic where 8s are wild — all free, all in the browser, no app to download. Share a link and your crew
        joins from any phone. Part of the <HubLink>Naija game night</HubLink> lineup.
      </p>
    </>
  ),
  comparison: {
    heading: 'Whot vs Uno at a glance',
    columns: ['Whot', 'Uno'],
    rows: [
      { label: 'Origin', a: 'Nigeria / UK, 1950s', b: 'USA, 1971' },
      { label: 'Suits', a: 'Five shapes (circle, cross, triangle, square, star)', b: 'Four colours' },
      { label: 'Wild card', a: 'WHOT (20) — call the next shape', b: 'Wild — call the next colour' },
      { label: 'Draw cards', a: 'Pick 2, Pick 3', b: 'Draw 2, Draw 4' },
      { label: 'Extra cards', a: 'Hold On, Suspension, General Market', b: 'Skip, Reverse' },
      {
        label: 'Play free online',
        a: 'Yes — on FateRound',
        b: 'Match Up (Uno-style) on FateRound, plus Crazy Eights',
      },
    ],
  },
  faqs: [
    {
      question: 'Is Whot the same as Uno?',
      answer:
        'They’re close cousins, not identical. Both are match-and-shed card games where you race to empty your hand, and their special cards line up (Whot’s Pick 2/Pick 3/WHOT vs Uno’s Draw 2/Draw 4/Wild). Whot came first, uses shapes instead of colours, and adds Hold On and General Market.',
    },
    {
      question: 'What’s the main difference between Whot and Uno?',
      answer:
        'Whot uses five shapes and the WHOT wild card; Uno uses four colours and Wild cards. Whot also has Hold On (extra turn) and General Market (everyone draws), which Uno doesn’t. Otherwise the goal and flow are very similar.',
    },
    {
      question: 'Can I play Whot and a Uno-style card game online free?',
      answer:
        'Yes — Whot is free on FateRound, and so is Match Up, our Uno-style colour-and-number card game, plus Crazy Eights (the classic where 8s are wild). They all run in the browser with no app and no sign-up.',
    },
    {
      question: 'Which should I play?',
      answer:
        'If you want the Naija classic with shapes and General Market, play Whot. If you want a colour-matching card game, play Match Up (our Uno-style card game) or Crazy Eights (the 8s-are-wild variant). On FateRound you can jump between all three in the same session.',
    },
  ],
  ctaHeading: 'Play Whot or Match Up',
  ctaSubtext: 'Free forever. Share one link — your crew is in.',
  accent: '#15803d',
}

const CHRISTMAS: MarketingPageContent = {
  slug: 'christmas-games-online',
  breadcrumbName: 'Christmas games online',
  seoTitle: 'Christmas Games to Play Online with Family — Free, No App',
  seoDescription:
    'Holiday game night, wherever the family is. Play Whot, Ludo, Bingo, Trivia and more free in your browser — share one link over WhatsApp. No app, no sign-up. Perfect for Detty December and Christmas.',
  keywords: [
    'christmas games online',
    'online christmas games for family',
    'christmas party games online',
    'games to play on christmas with family',
    'detty december games',
    'holiday games online',
    'virtual christmas games',
    'family christmas games online free',
    'games to play with family far away at christmas',
    'december games nigeria',
  ],
  heroTitle: 'Christmas game night — wherever the family is this year',
  heroSubtitle:
    'Everyone home, or scattered across the world? Either way, the game night happens. Share one FateRound link over WhatsApp and the whole family plays from their phones — Whot, Ludo, Bingo, trivia and more. Free, no app, no sign-up.',
  highlights: [
    'Whot, Ludo, Bingo & more',
    'Everyone plays from their phone',
    'Share once on WhatsApp',
    'Free, no app, no sign-up',
  ],
  featureCards: [
    {
      emoji: '🎄',
      title: 'Made for the season',
      description: 'Detty December energy or a quiet Christmas at home — one link keeps the whole family in the game.',
    },
    {
      emoji: '🌍',
      title: 'Home or abroad',
      description: 'Family in Lagos, London, or Houston all join the same game in real time. No one misses out.',
    },
    {
      emoji: '📱',
      title: "Everyone's own phone",
      description: 'No board to pass around, no app to install — each person plays from their own device.',
    },
    {
      emoji: '👵',
      title: 'Elders to kids',
      description: 'From a Bingo call for the aunties to a Ludo grudge match for the cousins — a game for everyone.',
    },
  ],
  stepsHeading: 'How it works',
  steps: [
    {
      title: 'Pick a game',
      description: 'Whot, Ludo, Bingo, trivia, or a party round — whatever the family’s in the mood for.',
    },
    {
      title: 'Share the link on WhatsApp',
      description: 'One code in the family group chat — everyone taps in from their phone.',
    },
    {
      title: 'Play together, live',
      description: 'Same game, real time, whether you’re all in one house or across the world.',
    },
  ],
  body: (
    <>
      <p>
        Christmas game night doesn’t need everyone in the same room — just the same link. Whether it’s full Detty
        December in Lagos or a video call with family abroad, FateRound gets the whole family playing from their own
        phones in real time. No app to download, no accounts — drop one link in the family WhatsApp group and even the
        aunties are in.
      </p>
      <p>
        Deal a round of Naija <GameLink type="whot" />, run a <GameLink type="ludo" /> grudge match, call{' '}
        <GameLink type="bingo" /> for the whole house, test everyone with a festive <GameLink type="trivia" />, or
        settle in for <GameLink type="monopoly" />. Warm up the crowd with <GameLink type="would_you_rather" /> and{' '}
        <GameLink type="most_likely_to" />. It’s the whole holiday game night behind one link — see the full{' '}
        <HubLink>Naija game night</HubLink> lineup.
      </p>
    </>
  ),
  gameList: {
    heading: 'Best games for a Christmas game night',
    items: [
      { game: <GameLink type="whot" />, description: 'the Naija card classic — the December staple.' },
      { game: <GameLink type="ludo" />, description: 'the family grudge match that runs till someone’s vexed.' },
      { game: <GameLink type="bingo" />, description: 'call the numbers for the whole house — aunties included.' },
      { game: <GameLink type="trivia" />, description: 'run a festive quiz — upload your own family questions.' },
      { game: <GameLink type="most_likely_to" />, description: 'roast the cousins with anonymous votes.' },
      { game: <GameLink type="monopoly" />, description: 'bankrupt the family, Christmas-dinner style.' },
    ],
  },
  faqs: [
    {
      question: 'What games can I play online with family at Christmas?',
      answer:
        'FateRound has Whot, Ludo, Bingo, trivia, Estate Kings, and party games like Most Likely To — all free in the browser. Share one link and the whole family joins from their phones, in one house or across the world.',
    },
    {
      question: 'Can we play if family are in different countries?',
      answer:
        'Yes — that’s the point. Everyone joins the same game from their own phone in real time, so family in Nigeria and the diaspora all play together. Perfect over a WhatsApp video call.',
    },
    {
      question: 'How does everyone join?',
      answer:
        'The host creates a game and shares one short link — drop it in the family WhatsApp group and everyone taps in with a nickname. No app, no sign-up.',
    },
    {
      question: 'Is it free?',
      answer: 'Yes — free forever, no account and no download. Just share the link and play.',
    },
  ],
  ctaHeading: 'Start the Christmas game night',
  ctaSubtext: 'Free forever. Share one link on WhatsApp — the whole family’s in.',
  accent: '#dc2626',
}

const TOURNAMENTS: MarketingPageContent = {
  slug: 'online-tournaments',
  breadcrumbName: 'Online tournaments',
  seoTitle: 'Free Online Tournaments — Chess, Word Tiles, Whot & Trivia',
  seoDescription:
    'Run a free online tournament for your group — Chess, Word Tiles (a Scrabble-style word game), Whot, or Trivia. Head-to-head brackets, knockout, round-robin, and school championships. Share one link, no app, no sign-up.',
  keywords: [
    'online tournament',
    'chess tournament online',
    'scrabble tournament online',
    'whot tournament',
    'trivia tournament online',
    'free tournament bracket maker',
    'run a tournament online free',
    'online tournament bracket generator',
    'host a chess tournament online',
    'knockout tournament online',
    'school games tournament online',
    'free online tournament maker',
  ],
  heroTitle: 'Run a free online tournament — Chess, Word Tiles, Whot & Trivia',
  heroSubtitle:
    'Turn game night into a competition. Set up a bracket, share one link, and your group battles it out across multiple rounds — free, no app, no sign-up. Great for friends, teams, and schools.',
  highlights: [
    'Chess, Word Tiles, Whot, Trivia',
    'Brackets, knockout & round-robin',
    'Share one link to join',
    'Free, no app, no sign-up',
  ],
  featureCards: [
    {
      emoji: '🏆',
      title: 'Multiple formats',
      description: 'Head-to-head brackets, knockout, round-robin leagues, and a school-championship mode.',
    },
    {
      emoji: '♟️',
      title: 'Real competitive games',
      description: 'Chess, Word Tiles, and Whot head-to-head, or Trivia for the whole group — with proper scoring.',
    },
    {
      emoji: '🔗',
      title: 'One link to join',
      description: 'Share a code and everyone joins from their phone. No accounts, no bracket software.',
    },
    {
      emoji: '🏫',
      title: 'Built for schools too',
      description: 'A class-based Whot championship format makes it easy to run a school-wide competition.',
    },
  ],
  stepsHeading: 'How it works',
  steps: [
    {
      title: 'Pick a game and format',
      description: 'Chess, Word Tiles, Whot, or Trivia — bracket, knockout, round-robin, or school.',
    },
    { title: 'Share the join code', description: 'Players join from any browser with a nickname. No app, no sign-up.' },
    {
      title: 'Play it out',
      description: 'Rounds and brackets run automatically; winners advance until you have a champion.',
    },
  ],
  body: (
    <>
      <p>
        A tournament makes any game night feel like an event. On FateRound you can run one free, in the browser, with no
        app and no accounts — just share a link and your group competes across multiple rounds. Choose a format that
        fits the game: head-to-head brackets for <GameLink type="chess" />, <GameLink type="scrabble" />, and{' '}
        <GameLink type="whot" />; or round-robin and knockout rounds for <GameLink type="trivia" />.
      </p>
      <p>
        It’s built for friends and teams, but also for schools — the class-based{' '}
        <GameLink type="whot">School Whot championship</GameLink> makes it easy to run a school-wide competition, and
        you can run <GameLink type="trivia" /> as a league or knockout too. Scores, brackets, and who advances are all
        handled for you, so you host the event and FateRound runs it. Part of the same platform as{' '}
        <HubLink>20+ games</HubLink>.
      </p>
    </>
  ),
  gameList: {
    heading: 'Games you can run a tournament for',
    items: [
      {
        game: <GameLink type="chess" />,
        description: 'head-to-head knockout brackets — outlast every challenger to win.',
      },
      { game: <GameLink type="scrabble" />, description: '1v1 word battles with your chosen dictionary and clock.' },
      {
        game: <GameLink type="whot" />,
        description: 'Naija card brackets, plus a class-based school championship format.',
      },
      { game: <GameLink type="trivia" />, description: 'round-robin leagues or knockout rounds for the whole group.' },
    ],
  },
  faqs: [
    {
      question: 'What games can I run a tournament for?',
      answer:
        'Chess, Word Tiles, and Whot as head-to-head brackets, and Trivia as a round-robin or knockout. There’s also a school-championship format for class-based competitions.',
    },
    {
      question: 'What tournament formats are there?',
      answer:
        'Round-robin (everyone plays everyone), head-to-head brackets, single-elimination knockout, and a class-based school championship. FateRound pairs players, runs the rounds, and advances winners automatically.',
    },
    {
      question: 'How do players join a tournament?',
      answer:
        'The host creates the tournament and shares one code or link. Players join from any browser with a nickname — no app to download and no account to make.',
    },
    {
      question: 'Is it free to run an online tournament?',
      answer:
        'Yes — free forever, no sign-up and no download. Set up a bracket, share the link, and play it out in the browser.',
    },
    {
      question: 'Can schools use it for a competition?',
      answer:
        'Yes. The class-based championship format is designed for schools — run a Whot or Trivia competition across classes, with everyone joining from their own device.',
    },
  ],
  ctaHeading: 'Set up your tournament',
  ctaSubtext: 'Free forever. Pick a game, share the link, crown a champion.',
  primaryCta: { href: '/tournament/create', label: 'Create a tournament' },
  accent: '#d97706',
}

const SCHOOL: MarketingPageContent = {
  slug: 'school-whot-championship',
  breadcrumbName: 'School Whot championship',
  seoTitle: 'School Whot Championship — Free Online Games for Schools',
  seoDescription:
    'Run a School Whot championship online — students climb the class ladder from Primary 1 to Graduate. Free, no app, no sign-up. Plus Trivia, Chess & Word Tiles tournaments for schools.',
  keywords: [
    'school whot championship',
    'school whot tournament',
    'whot competition for schools',
    'school games competition online',
    'inter-house games online',
    'nigerian school games online',
    'class whot tournament',
    'school tournament online free',
    'online games for schools',
    'end of term games for students',
  ],
  heroTitle: 'School Whot Championship — climb from Primary 1 to Graduate 🎓',
  heroSubtitle:
    'The most Naija tournament there is. Students play timed Whot matches and climb the class ladder — Primary 1, JSS, SS, all the way to University 400L and Graduate. Free, no app, no sign-up. Perfect for schools, clubs, and end-of-term.',
  highlights: [
    'Climb Primary 1 → Graduate',
    'Timed Whot matches',
    'Whole class joins by link',
    'Free, no app, no sign-up',
  ],
  featureCards: [
    {
      emoji: '🎓',
      title: 'The class ladder',
      description: 'Win a match, climb a class — Primary 1 through SS3 and University 100–400L, then Graduate to win.',
    },
    {
      emoji: '⏱️',
      title: 'Quick timed matches',
      description:
        'Each round is a short Whot match (2–4 minutes) — empty your hand or hold the lowest total at time-up.',
    },
    {
      emoji: '🏫',
      title: 'Made for schools',
      description:
        'Great for inter-house competitions, ICT clubs, socials, and end-of-term — students join from any device.',
    },
    {
      emoji: '📏',
      title: 'Pick the ladder length',
      description:
        'Primary only, Primary + Secondary, or the full ladder to University 400L — set it to fit your time.',
    },
  ],
  stepsHeading: 'How it works',
  steps: [
    {
      title: 'Create a School Whot championship',
      description: 'Choose the ladder length and match time from the Tournaments page.',
    },
    {
      title: 'Share the join code',
      description: 'Students join from any phone or laptop browser with a nickname — no app, no accounts.',
    },
    {
      title: 'Climb to Graduate',
      description: 'Win a match to move up a class. The first to graduate past the top class is champion.',
    },
  ],
  body: (
    <>
      <p>
        School Whot turns the classic Naija card game into a championship every student wants to win. Everyone starts in
        Primary 1 and plays quick timed <GameLink type="whot" /> matches — win, and you climb a class; keep winning and
        you rise through JSS, SS, and University levels until you Graduate 🎓 and take the crown. Set the ladder to
        Primary only, Primary plus Secondary, or the full run to University 400L.
      </p>
      <p>
        It’s a perfect fit for schools, ICT clubs, and end-of-term socials — no app to install, no accounts, and every
        student joins from their own device with one shared code. Want more than Whot? The same Tournaments feature runs{' '}
        <GameLink type="trivia" /> leagues and knockouts, plus <GameLink type="chess" /> and{' '}
        <GameLink type="scrabble" /> brackets — see all <HubLink>the games</HubLink> and the{' '}
        <GameLink type="whot">Naija classics</GameLink>.
      </p>
    </>
  ),
  faqs: [
    {
      question: 'What is a School Whot championship?',
      answer:
        'It’s a Whot tournament built around the Nigerian school ladder. Students start in Primary 1 and climb a class each time they win a timed Whot match — through JSS, SS, and University 100–400L — until someone Graduates and wins the championship.',
    },
    {
      question: 'How does the class ladder work?',
      answer:
        'Each round is one short Whot match. The winner moves up one class; graduating past the top class wins the tournament. The host picks the ladder length: Primary only (Primary 1–6), Primary + Secondary (to SS3), or the full ladder to University 400L.',
    },
    {
      question: 'How do students join?',
      answer:
        'The host creates the championship and shares one code or link. Students join from any phone or laptop browser with a nickname — no app to download and no account to make.',
    },
    {
      question: 'Can schools run other games as tournaments too?',
      answer:
        'Yes. Beyond School Whot, the Tournaments feature runs Trivia as a round-robin league or knockout, and Chess and Word Tiles as head-to-head brackets — all free and in the browser.',
    },
    {
      question: 'Is it free?',
      answer: 'Yes — free forever, no sign-up and no download. Set up the championship, share the link, and play.',
    },
  ],
  ctaHeading: 'Start a School Whot championship',
  ctaSubtext: 'Free forever. Pick the ladder, share the link, crown a Graduate.',
  primaryCta: { href: '/tournament/create', label: 'Create a championship' },
  accent: '#15803d',
}

const SOLO_WHOT_BOT: MarketingPageContent = {
  slug: 'play-whot-vs-bot',
  breadcrumbName: 'Whot vs bot',
  seoTitle: 'Play Whot vs Bot — Free, No Sign-Up, Offline-Friendly',
  seoDescription:
    'Practice Whot against a computer opponent — full Nigerian rules (Pick 2, Pick 3, Hold On, WHOT wilds). Free, no sign-up, works on any phone. Play solo now.',
  keywords: [
    'play whot vs bot',
    'whot vs computer',
    'play whot offline',
    'nigerian whot online',
    'whot single player',
    'whot game against computer',
    'play whot alone',
    'free whot bot',
    'whot practice game',
  ],
  heroTitle: 'Play Whot vs bot — practice the Nigerian classic anytime',
  heroSubtitle:
    "No friends online, no room needed. Play Whot solo against a computer opponent that knows Pick 2, Pick 3, Hold On, General Market, and the WHOT wild. Free, in the browser, works even when it's just you.",
  highlights: [
    'Full Nigerian Whot rules',
    'Plays offline in your browser',
    'No sign-up, no download',
    'Great for practice before a real room',
  ],
  featureCards: [
    {
      emoji: '🤖',
      title: 'A bot that plays properly',
      description:
        'The Whot bot uses real rules — Pick 2 stacks, Hold On skips, General Market punishes everyone, and WHOT calls the next shape.',
    },
    {
      emoji: '⚡',
      title: 'Instant, no room to fill',
      description: "Skip the wait for other players. Tap play and you're dealing the next card.",
    },
    {
      emoji: '📚',
      title: 'Learn or brush up',
      description:
        'New to Whot? The solo bot is the fastest way to learn the shapes, the specials, and when to save a WHOT for the win.',
    },
    {
      emoji: '📶',
      title: 'Works on any connection',
      description:
        'A card game shouldn’t need five bars. Solo Whot runs in the browser and keeps going even when the room is quiet.',
    },
  ],
  stepsHeading: 'How to play Whot vs bot',
  steps: [
    { title: 'Open the game', description: 'Jump straight into a solo Whot table — no room code, no sign-up.' },
    {
      title: 'Play your shape or number',
      description: 'Match by shape or number. Circles, Triangles, Crosses, Squares, Stars — and the WHOT wild.',
    },
    {
      title: 'Beat the bot to an empty hand',
      description: 'Stack Pick 2s, dodge Pick 3s, and time your WHOT calls to be the first to zero cards.',
    },
  ],
  body: (
    <>
      <p>
        Nigerian Whot is best in a room full of trash-talking friends — but you don’t always have a room ready.{' '}
        <GameLink type="whot">Solo Whot vs bot</GameLink> gives you the same shapes, the same specials, and the same
        satisfying last-card win, on your own time. It’s the fastest way to sharpen your play before your next real-room
        match.
      </p>
      <p>
        Under the hood it’s the same Whot engine that runs multiplayer rooms on FateRound — Pick 2 and Pick 3 stacking,
        Hold On, Suspension, General Market, and the WHOT wild that lets you call the next shape. When you’re ready for
        friends, jump into a <HubLink href="/create">multiplayer room</HubLink> — the rules are the same, the trash talk
        is on you.
      </p>
    </>
  ),
  gameList: {
    heading: 'Also playable solo vs bot on FateRound',
    items: [
      {
        game: <GameLink type="uno" />,
        description: 'match colour or number — the classic party card game, solo edition.',
      },
      {
        game: <GameLink type="crazy_eights" />,
        description: 'the simple stacking card game that’s perfect for a quick round.',
      },
      { game: <GameLink type="ayo" />, description: 'the ancient Yoruba mancala — sow the seeds, capture the row.' },
    ],
  },
  faqs: [
    {
      question: 'Can I play Whot against the computer for free?',
      answer:
        'Yes. FateRound’s solo Whot vs bot is free forever — no sign-up, no download, no premium tier. Open the page and you’re playing.',
    },
    {
      question: 'Does the Whot bot use Nigerian rules?',
      answer:
        'Yes. The bot plays full Nigerian Whot — Pick 2, Pick 3, Hold On, Suspension, General Market, and the WHOT wild that lets you call the next shape.',
    },
    {
      question: 'Can I play Whot offline?',
      answer:
        'Solo Whot runs in your browser — once the page has loaded, a shaky connection won’t drop your game. It’s the closest thing to Whot offline you’ll get without an app.',
    },
    {
      question: 'How hard is the Whot bot?',
      answer:
        'The bot plays a solid mid-level game — it stacks Pick 2s, holds specials for the right moment, and calls shapes it can follow up on. Beatable, but you’ll have to play well.',
    },
    {
      question: 'Can I play Whot with friends after?',
      answer: 'Yes — create a multiplayer Whot room and share the code. Same rules, same shapes, real opponents.',
    },
  ],
  ctaHeading: 'Play a solo Whot round now',
  ctaSubtext: 'Free forever. No sign-up, no download — just you and the bot.',
  primaryCta: { href: '/play-solo/whot', label: 'Play Whot vs bot' },
  ogImage: '/og/whot.png',
  accent: '#dc2626',
}

const SOLO_MATCH_UP_BOT: MarketingPageContent = {
  slug: 'play-match-up-vs-bot',
  breadcrumbName: 'Match Up vs bot',
  seoTitle: 'Play Match Up vs Bot — Free Uno-Style Card Game Online',
  seoDescription:
    'Play Match Up (a free Uno-style matching card game) against a computer opponent — colour and number matching, wild cards, +4 draws, stacking. No sign-up, no download.',
  keywords: [
    'play uno vs computer',
    'uno vs bot',
    'play uno alone',
    'free uno alternative',
    'matching card game vs computer',
    'colour number card game online',
    'uno single player free',
    'play card game against bot',
    'match up card game',
  ],
  heroTitle: 'Play Match Up vs bot — the colour-and-number card game, solo',
  heroSubtitle:
    'Match Up is FateRound’s take on the classic matching card game (think Uno). Play solo against a computer opponent — colour matches, number matches, wild cards, +2 stacks, +4 penalties, and the last-card win. Free, no sign-up.',
  highlights: [
    'Colour + number matching',
    'Wilds, +2, +4 and stacking rules',
    'Plays instantly, no room to fill',
    'Free, no sign-up, no download',
  ],
  featureCards: [
    {
      emoji: '🎴',
      title: 'The rules you already know',
      description:
        'If you’ve played Uno, you already know Match Up — colour or number to play, wilds to change the colour, +2 and +4 to punish the next player.',
    },
    {
      emoji: '🤖',
      title: 'A bot that plays a real hand',
      description:
        'The bot stacks draws when it can, saves wilds for tight spots, and blocks you when you’re one card away.',
    },
    {
      emoji: '⚡',
      title: 'No lobby, no wait',
      description: 'No room to fill, no player to wait on. Open the page and deal.',
    },
    {
      emoji: '🎉',
      title: 'Team-Up, Stacking, 0-7',
      description: 'House rules from the multiplayer room carry over — practice the variants you’ll see with friends.',
    },
  ],
  stepsHeading: 'How to play Match Up vs bot',
  steps: [
    { title: 'Open the game', description: 'Straight into a solo Match Up table — no code, no sign-up.' },
    {
      title: 'Match the colour or the number',
      description:
        'Play any card that matches the top card’s colour or number. Out of matches? Draw one and try again.',
    },
    {
      title: 'Be first to zero cards',
      description: 'Wilds change the colour. +2 and +4 punish the next player. Last card played wins the round.',
    },
  ],
  body: (
    <>
      <p>
        Match Up is a free matching card game in the family of classic colour-and-number card games like Uno. Solo mode
        lets you play against a computer opponent whenever you like — no room, no wait, no other players needed. Same
        cards, same specials, same tension when you’re one card away and the bot slaps down a +4.
      </p>
      <p>
        When you’re ready for friends, the same rules run in{' '}
        <HubLink href="/create">multiplayer Match Up rooms</HubLink> — with optional house rules like Stacking, Team-Up,
        Jump-In, and 0-7. Practice solo, then take it to the group.
      </p>
    </>
  ),
  gameList: {
    heading: 'Also playable solo vs bot on FateRound',
    items: [
      { game: <GameLink type="whot" />, description: 'Nigerian Whot solo — shapes, specials, and the WHOT wild.' },
      {
        game: <GameLink type="crazy_eights" />,
        description: 'the classic 8s-wild card game, head-to-head with a bot.',
      },
      { game: <GameLink type="ayo" />, description: 'ancient Yoruba mancala — sow, capture, win the row.' },
    ],
  },
  faqs: [
    {
      question: 'Is Match Up the same as Uno?',
      answer:
        'Match Up is inspired by classic colour-and-number matching card games like Uno — same core rules (match colour or number, wilds, +2, +4, last card wins) with FateRound’s own cards and house-rule options. It’s our own game, not the trademarked one.',
    },
    {
      question: 'Can I play a Uno-style card game against the computer for free?',
      answer:
        'Yes. Match Up solo mode is free forever — no sign-up, no download, no premium tier. Play as many rounds as you like.',
    },
    {
      question: 'What card game rules does the bot support?',
      answer:
        'Colour and number matching, wild colour-change cards, +2 draws, +4 penalties, and last-card wins. Multiplayer rooms add optional variants like Stacking, Team-Up, Jump-In, and the 0-7 hand-swap.',
    },
    {
      question: 'How hard is the Match Up bot?',
      answer:
        'The bot plays smart — it holds wilds for the right colour, stacks +2s when it can, and blocks your last card. Winnable, but not automatic.',
    },
    {
      question: 'Can I play Match Up with friends?',
      answer:
        'Yes — create a multiplayer Match Up room and share the code. Same rules as solo, plus optional Stacking, Team-Up, and 0-7 house rules.',
    },
  ],
  ctaHeading: 'Play a solo round of Match Up',
  ctaSubtext: 'Free forever. No sign-up, no download — you vs the bot.',
  primaryCta: { href: '/play-solo/uno', label: 'Play Match Up vs bot' },
  ogImage: '/og/uno.png',
  accent: '#ef4444',
}

const SOLO_AYO_BOT: MarketingPageContent = {
  slug: 'play-ayo-vs-bot',
  breadcrumbName: 'Ayo vs bot',
  seoTitle: 'Play Ayo Ayo vs Bot — Free Yoruba Mancala Online',
  seoDescription:
    'Play Ayo (Ayo Olopon), the ancient Yoruba mancala, solo against a computer opponent. Free, no sign-up, no download — sow the seeds, capture the row, in your browser.',
  keywords: [
    'play ayo online',
    'ayo ayo game',
    'ayo olopon online',
    'yoruba mancala online',
    'play ayo vs computer',
    'ayo vs bot',
    'african mancala game',
    'awale online',
    'nigerian board game online',
  ],
  heroTitle: 'Play Ayo vs bot — the ancient Yoruba board game, solo',
  heroSubtitle:
    'Ayo (Ayo Olopon) is one of the oldest board games in the world — a Yoruba mancala of sowing and capture. Play solo against a computer opponent, learn the pattern, and win the row. Free, in the browser.',
  highlights: [
    'Real Yoruba mancala rules',
    'Play at your own pace',
    'No sign-up, no download',
    'Great way to learn the game',
  ],
  featureCards: [
    {
      emoji: '🌱',
      title: 'Sow, then capture',
      description:
        'Pick up all the seeds in a house, sow one into each cup around the board, and capture rows of two or three on the opponent’s side.',
    },
    {
      emoji: '🤖',
      title: 'A bot to learn against',
      description:
        'The bot plays a steady mancala game — forcing captures, blocking yours, and pressuring the last houses.',
    },
    {
      emoji: '🕰️',
      title: 'Play at your own pace',
      description:
        'No clock, no room to fill. Take your time to count the seeds and see the capture before you commit.',
    },
    {
      emoji: '📚',
      title: 'Learn the classic',
      description: 'New to Ayo? Solo mode is the calm, patient way to learn how sowing and captures actually work.',
    },
  ],
  stepsHeading: 'How to play Ayo vs bot',
  steps: [
    {
      title: 'Open the board',
      description: 'Two rows of six houses, four seeds each — no sign-up, straight to the board.',
    },
    {
      title: 'Sow the seeds',
      description:
        'Pick up all seeds in one of your houses and drop one into each cup counter-clockwise around the board.',
    },
    {
      title: 'Capture and win the row',
      description:
        'If your last seed lands on the opponent’s side and makes 2 or 3, you capture. Most seeds when the row empties wins.',
    },
  ],
  body: (
    <>
      <p>
        Ayo — also called Ayo Olopon in Nigeria and Awale across West Africa — is a two-player mancala with centuries of
        history. FateRound’s solo Ayo lets you play the game against a computer opponent, at your own pace, without
        waiting for another player. Learn the sowing pattern, spot the captures, and enjoy one of the oldest games in
        the world in your browser.
      </p>
      <p>
        The rules are simple to learn, hard to master: pick up all seeds from one of your houses, sow one into each cup
        counter-clockwise, and capture on the opponent’s side when your last seed makes a 2 or a 3. Ready for a real
        opponent? Take it to a <HubLink href="/create">multiplayer room</HubLink> when you’ve got the pattern down.
      </p>
    </>
  ),
  gameList: {
    heading: 'Other classic games playable solo vs bot',
    items: [
      { game: <GameLink type="whot" />, description: 'Nigerian Whot — shapes, specials, and the WHOT wild.' },
      { game: <GameLink type="uno" />, description: 'Match Up — the colour-and-number card game, solo mode.' },
      { game: <GameLink type="crazy_eights" />, description: 'Crazy Eights — the classic 8s-wild card game.' },
    ],
  },
  faqs: [
    {
      question: 'What is Ayo (Ayo Olopon)?',
      answer:
        'Ayo, also known as Ayo Olopon or Awale in other parts of West Africa, is a two-player mancala board game. Players sow seeds around a board of houses and capture on the opponent’s side when the last seed makes a group of 2 or 3.',
    },
    {
      question: 'Can I play Ayo Ayo online for free?',
      answer:
        'Yes. FateRound’s solo Ayo vs bot is free forever — no sign-up, no download. Open the page and start sowing.',
    },
    {
      question: 'How does the Ayo bot play?',
      answer:
        'The bot plays a steady mancala — setting up captures, blocking yours, and pressuring the empty houses so you have to fill them.',
    },
    {
      question: 'Is Ayo hard to learn?',
      answer:
        'The rules are quick to pick up. Solo mode against the bot is the calm way to learn: no clock, no pressure, just you counting seeds until captures start clicking.',
    },
    {
      question: 'Can I play Ayo with a friend after?',
      answer: 'Yes — create a multiplayer Ayo room and share the code. Same rules, real opponent, same board.',
    },
  ],
  ctaHeading: 'Sow the first seed',
  ctaSubtext: 'Free forever. No sign-up, no download — you vs the bot.',
  primaryCta: { href: '/play-solo/ayo', label: 'Play Ayo vs bot' },
  ogImage: '/og/ayo.png',
  accent: '#a16207',
}

const SOLO_CRAZY_8_BOT: MarketingPageContent = {
  slug: 'play-crazy-8-vs-bot',
  breadcrumbName: 'Crazy 8 vs bot',
  seoTitle: 'Play Crazy 8s vs Bot — Free Crazy Eights Online',
  seoDescription:
    'Play Crazy Eights (Crazy 8s) solo against a computer opponent — 8s are wild, match suit or rank, first to zero cards wins. Free, no sign-up, in your browser.',
  keywords: [
    'play crazy eights vs computer',
    'crazy 8s online',
    'crazy eights bot',
    'play crazy 8 alone',
    'crazy eights single player',
    'free crazy 8s game',
    'card game against computer',
    'play crazy eights offline',
    'wild card game online',
  ],
  heroTitle: 'Play Crazy 8s vs bot — the classic wild-card game, solo',
  heroSubtitle:
    'Crazy Eights is the card game everyone learns first — match suit or rank, and 8s are wild. Play solo against a computer opponent whenever you want a quick round. Free, no sign-up, in your browser.',
  highlights: [
    '8s wild, match suit or rank',
    'Fast solo rounds',
    'No sign-up, no download',
    'Great warm-up for a real game',
  ],
  featureCards: [
    {
      emoji: '🎴',
      title: 'The classic you know',
      description:
        'Play a card that matches the top card’s suit or rank. Or play an 8 to change the suit — 8s are always wild.',
    },
    {
      emoji: '🤖',
      title: 'A bot that plays smart',
      description: 'The bot saves 8s for tight spots and blocks your last card. You’ll have to earn the win.',
    },
    {
      emoji: '⚡',
      title: 'Rounds in minutes',
      description: 'A full round of Crazy Eights takes a few minutes. Perfect between meetings or before bed.',
    },
    {
      emoji: '📶',
      title: 'Runs in the browser',
      description: 'No app to install, no update to wait for — open the page, deal the hand.',
    },
  ],
  stepsHeading: 'How to play Crazy 8s vs bot',
  steps: [
    { title: 'Open the game', description: 'Straight into a solo Crazy Eights table — no code, no sign-up.' },
    {
      title: 'Match suit or rank',
      description: 'Play a card matching the top card’s suit or rank. Out of matches? Draw until you find one.',
    },
    {
      title: 'Play an 8 to change the suit',
      description: '8s are wild — play one and call the next suit. First to zero cards wins the round.',
    },
  ],
  body: (
    <>
      <p>
        Crazy Eights (or Crazy 8s) is the gateway card game — easy rules, quick rounds, satisfying wins. Solo Crazy
        Eights lets you play a round against a computer opponent any time, no room to fill or friend to wait on. Great
        as a quick warm-up before you jump into a multiplayer table.
      </p>
      <p>
        The rules haven’t changed since kitchen tables everywhere: match suit or rank, 8s are wild, and the first player
        to empty their hand wins. When you’re ready for opponents, spin up a{' '}
        <HubLink href="/create">multiplayer Crazy Eights room</HubLink> and share the code.
      </p>
    </>
  ),
  gameList: {
    heading: 'Also playable solo vs bot',
    items: [
      { game: <GameLink type="whot" />, description: 'Nigerian Whot — shapes, specials, and the WHOT wild.' },
      { game: <GameLink type="uno" />, description: 'Match Up — the colour-and-number card game, solo mode.' },
      { game: <GameLink type="ayo" />, description: 'Ayo — the Yoruba mancala, solo against the bot.' },
    ],
  },
  faqs: [
    {
      question: 'Can I play Crazy Eights against the computer for free?',
      answer: 'Yes. FateRound’s solo Crazy 8s vs bot is free forever — no sign-up, no download, no premium tier.',
    },
    {
      question: 'What are the rules of Crazy 8s?',
      answer:
        'Match the top card’s suit or rank. 8s are wild — play one to change the suit. If you can’t play, draw. First to zero cards wins the round.',
    },
    {
      question: 'How hard is the Crazy Eights bot?',
      answer:
        'The bot plays a solid game — it saves 8s for the right moment and blocks your last card. Beatable, but you’ll have to plan.',
    },
    {
      question: 'Can I play Crazy 8s offline?',
      answer: 'Solo Crazy 8s runs in your browser — once the page has loaded, a shaky connection won’t drop your game.',
    },
    {
      question: 'Can I play Crazy 8s with friends after?',
      answer: 'Yes — create a multiplayer Crazy 8s room and share the code. Same rules, real opponents.',
    },
  ],
  ctaHeading: 'Deal a round of Crazy 8s',
  ctaSubtext: 'Free forever. No sign-up, no download — you vs the bot.',
  primaryCta: { href: '/play-solo/crazy-eights', label: 'Play Crazy 8s vs bot' },
  ogImage: '/og/crazy-eights.png',
  accent: '#0891b2',
}

const WHOT_ROOM_BOTS: MarketingPageContent = {
  slug: 'whot-with-bots-online',
  breadcrumbName: 'Whot rooms with bots',
  seoTitle: 'Play Whot Online with Bots — Fill Empty Seats, Never Wait',
  seoDescription:
    'Play Whot online with friends and bots in the same room. Fill empty seats with a Whot bot so nobody waits — real Nigerian rules, free, no sign-up. Add bots to any Whot room.',
  keywords: [
    'play whot online with bots',
    'whot room with computer players',
    'whot online with friends and bots',
    'whot bot in multiplayer',
    'nigerian whot with bots',
    'fill whot room with bots',
    'whot online free',
    'add bots to whot game',
  ],
  heroTitle: 'Play Whot online — with friends, or friends plus bots',
  heroSubtitle:
    'Not enough players? Fill the empty seats with Whot bots. Same room, same rules, same trash talk — without anyone waiting for the last seat. Free, no sign-up, real Nigerian Whot.',
  highlights: [
    'Add bots to any Whot room',
    'Full Nigerian Whot rules',
    'Play from 2 to a full table',
    'Free, no sign-up',
  ],
  featureCards: [
    {
      emoji: '🪑',
      title: 'Never wait for the last seat',
      description:
        'Two friends and want a four-player table? Drop in two bots — no more sitting on a half-empty lobby.',
    },
    {
      emoji: '🤖',
      title: 'Bots that play real Whot',
      description:
        'Bots know Pick 2, Pick 3, Hold On, Suspension, General Market, and the WHOT wild — they play the game, not just fill a chair.',
    },
    {
      emoji: '👥',
      title: 'Mix humans and bots',
      description:
        'Start the room with real friends and top it up with bots. Kick a bot when a friend joins — seamless.',
    },
    {
      emoji: '⚡',
      title: 'Rooms start in seconds',
      description:
        'Create the room, share the code, add bots — the game deals as soon as everyone (human or bot) is seated.',
    },
  ],
  stepsHeading: 'How to play Whot with bots online',
  steps: [
    {
      title: 'Create a Whot room',
      description: 'Pick Whot, set the house rules, and share the room code with friends.',
    },
    {
      title: 'Add bots to the empty seats',
      description: 'Any seat that’s empty when you’re ready? Fill it with a bot in one tap.',
    },
    {
      title: 'Deal and play',
      description: 'Real Nigerian rules — stack Pick 2s, dodge Pick 3s, race to the empty hand.',
    },
  ],
  body: (
    <>
      <p>
        A Whot night shouldn’t die because one friend flaked. FateRound lets you fill any empty seat in a{' '}
        <GameLink type="whot">Whot room</GameLink> with a bot — so two friends can play a four-player table, or a
        birthday group can start the deal even if the last person is running late. Same room, same rules, no waiting.
      </p>
      <p>
        Bots play real Nigerian Whot — Pick 2 stacks, Hold On skips, Suspension, General Market, and the WHOT wild.
        They’re not perfect, and they’re not filler: they play the shapes the way the game is meant to be played. Prefer
        to warm up solo first? Try <HubLink href="/play-solo/whot">Whot vs bot</HubLink> before you open a room.
      </p>
    </>
  ),
  faqs: [
    {
      question: 'Can I add bots to a multiplayer Whot room?',
      answer:
        'Yes. When you create a Whot room, any empty seat can be filled with a bot in one tap. Kick the bot the moment a real player joins.',
    },
    {
      question: 'How do the Whot bots play?',
      answer:
        'They play full Nigerian Whot — Pick 2, Pick 3, Hold On, Suspension, General Market, and calling shapes with the WHOT wild. Not perfect players, but proper ones.',
    },
    {
      question: 'Can I play Whot online with just one friend?',
      answer: 'Yes — two humans plus one or two bots gives you a full table without waiting for anyone else.',
    },
    {
      question: 'Is playing Whot with bots free?',
      answer: 'Yes, free forever — no sign-up, no download, no premium tier for bots.',
    },
    {
      question: 'Can I play Whot solo without a room?',
      answer: 'Yes — solo Whot vs bot skips the room entirely. Just you and the computer opponent, in the browser.',
    },
  ],
  ctaHeading: 'Start a Whot room — with or without bots',
  ctaSubtext: 'Free forever. Fill empty seats with bots so nobody waits.',
  primaryCta: { href: '/create', label: 'Create a Whot room' },
  ogImage: '/og/whot.png',
  accent: '#b91c1c',
}

const ESTATE_KINGS_ROOM_BOTS: MarketingPageContent = {
  slug: 'estate-kings-with-bots-online',
  breadcrumbName: 'Estate Kings with bots',
  seoTitle: 'Play Estate Kings Online with Bots — Property Board Game, No Wait',
  seoDescription:
    'Play Estate Kings, a free online property-trading board game, with friends and bots. Fill empty seats with a bot so nobody waits. Buy, trade, and build — free, no sign-up.',
  keywords: [
    'play property board game with bots',
    'online monopoly alternative with bots',
    'estate kings online with bots',
    'estate kings online',
    'property trading board game online',
    'buy houses board game with friends',
    'online board game with computer players',
    'multiplayer property game with bots',
    'free property trading game online',
    'free monopoly alternative online',
  ],
  heroTitle: 'Play Estate Kings online — friends, bots, or both',
  heroSubtitle:
    'Estate Kings is FateRound’s free online property-trading board game — buy properties, build, trade, bankrupt. Fill empty seats with a bot so a two-player night becomes a proper four-player game.',
  highlights: [
    'Add bots to any room',
    'Full property-trading board game',
    '2 to 6 players (humans + bots)',
    'Free, no sign-up',
  ],
  featureCards: [
    {
      emoji: '🏠',
      title: 'The property board game, online',
      description:
        'Buy properties, collect rent, trade with rivals, build up your streets — the whole classic loop, in the browser.',
    },
    {
      emoji: '🤖',
      title: 'Bots that make deals',
      description:
        'Bots buy properties, negotiate trades, and drop hotels on you when you land on the wrong street. They’re real opponents, not filler.',
    },
    {
      emoji: '🪑',
      title: 'Never wait for a full table',
      description: 'Two friends but want a four-player game? Add two bots. Kick a bot the moment a real player joins.',
    },
    {
      emoji: '⏱️',
      title: 'Games that actually finish',
      description:
        'Time extensions, turn timers, and bots that don’t stall — board games that end at a reasonable hour.',
    },
  ],
  stepsHeading: 'How to play Estate Kings with bots',
  steps: [
    {
      title: 'Create an Estate Kings room',
      description: 'Set the starting cash, timer, and house rules. Share the room code.',
    },
    {
      title: 'Fill empty seats with bots',
      description: 'Any empty seat becomes a bot in one tap — no waiting for the last person.',
    },
    { title: 'Buy, build, trade, win', description: 'Bankrupt every opponent, human or bot, to take the game.' },
  ],
  body: (
    <>
      <p>
        Estate Kings is FateRound’s free online property-trading board game — our own take on the classic buy-
        houses-and-bankrupt-your-friends property-trading genre. Add bots to any{' '}
        <GameLink type="monopoly">Estate Kings room</GameLink> and stop waiting for a full table: two friends plus two
        bots is a real four-player game, not a compromise.
      </p>
      <p>
        The bots make trades, buy properties, and drop hotels where they hurt. They’re opponents, not chair-fillers.
        Perfect for a two-friend night that wants a fuller table, or a birthday group where one person is running late.
        Same rules, same board, no waiting.
      </p>
    </>
  ),
  faqs: [
    {
      question: 'What kind of game is Estate Kings?',
      answer:
        'Estate Kings is FateRound’s own property-trading board game, inspired by the classic buy-houses-and-bankrupt-your-friends genre popularised by games like Monopoly. Same familiar loop, our own board and rules.',
    },
    {
      question: 'Can I add bots to a multiplayer property board game room?',
      answer:
        'Yes. Any empty seat in an Estate Kings room can be filled with a bot in one tap. Kick the bot the moment a real player joins.',
    },
    {
      question: 'How do the bots play?',
      answer:
        'The bots buy properties, negotiate trades, and build houses and hotels. They play a real game — you can lose to them.',
    },
    {
      question: 'How many players can play Estate Kings?',
      answer: '2 to 9 players in total (up to 9 on the expanded 48-space board) — any mix of humans and bots.',
    },
    {
      question: 'Is it free?',
      answer: 'Yes, free forever — no sign-up, no download, no premium tier for bots.',
    },
  ],
  ctaHeading: 'Start an Estate Kings room — fill the table',
  ctaSubtext: 'Free forever. Add bots so a two-friend night becomes a real board-game night.',
  primaryCta: { href: '/create', label: 'Create an Estate Kings room' },
  ogImage: '/og/monopoly.png',
  accent: '#166534',
}

const SOLO_LUDO_BOT: MarketingPageContent = {
  slug: 'play-ludo-vs-bot',
  breadcrumbName: 'Ludo vs bot',
  seoTitle: 'Play Ludo vs Bot — Free Ludo Online, Solo',
  seoDescription:
    'Play Ludo against a computer opponent — roll a 6 to bring pieces out, chase captures, race to home. Free, no sign-up, no download. Practice solo or take it to a real Ludo room after.',
  keywords: [
    'play ludo vs bot',
    'ludo vs computer',
    'play ludo offline',
    'ludo single player',
    'ludo game against computer',
    'play ludo alone',
    'free ludo bot',
    'ludo practice game',
    'online ludo solo',
    'ludo king alternative solo',
  ],
  heroTitle: 'Play Ludo vs bot — the board game classic, solo',
  heroSubtitle:
    "Nobody around for a Ludo game? Play solo against a computer opponent — roll a 6 to bring pieces out, chase captures, and race all four home. Free, in the browser, works even when it's just you.",
  highlights: [
    'Full modern Ludo rules',
    'Plays instantly, no room to fill',
    'No sign-up, no download',
    'Great warm-up before a real room',
  ],
  featureCards: [
    {
      emoji: '🎲',
      title: 'Real Ludo rules',
      description:
        'Roll a 6 to bring a piece out, capture opponents by landing on them, safe squares protect you — the game as you know it.',
    },
    {
      emoji: '🤖',
      title: 'A bot that plays properly',
      description:
        "The Ludo bot chases captures, guards its own pieces, and races the last piece home. It's a real opponent, not a placeholder.",
    },
    {
      emoji: '⚡',
      title: 'No lobby, no wait',
      description: "Skip the wait for other players. Tap play and you're rolling.",
    },
    {
      emoji: '📶',
      title: 'Works on any connection',
      description:
        "A board game shouldn't need five bars. Solo Ludo runs in the browser and keeps going even when the room is quiet.",
    },
  ],
  stepsHeading: 'How to play Ludo vs bot',
  steps: [
    { title: 'Open the board', description: 'Jump straight into a solo Ludo table — no room code, no sign-up.' },
    {
      title: 'Roll a 6 to start',
      description: 'A 6 brings a piece out of your yard and onto the track. Other rolls move the pieces already out.',
    },
    {
      title: 'Race all four home',
      description: 'Land on an opponent to send them back to their yard. First to get all four pieces home wins.',
    },
  ],
  body: (
    <>
      <p>
        Ludo is best at a real table with real trash talk — but you don\'t always have friends around.{' '}
        <GameLink type="ludo">Solo Ludo vs bot</GameLink> gives you the same board, the same 6-to-start rule, the same
        captures, on your own time. It\'s the calmest way to sharpen your play before your next real match.
      </p>
      <p>
        The bot plays a proper game — it hunts your pieces, guards its own, and knows when to race for home. Ready for
        real opponents when you\'re done? Jump into a <HubLink href="/create">multiplayer Ludo room</HubLink> and share
        the code. Same rules, four seats, live opponents.
      </p>
    </>
  ),
  gameList: {
    heading: 'Also playable solo vs bot on FateRound',
    items: [
      { game: <GameLink type="yahtzee" />, description: 'Five Dice — our Yahtzee-style dice game, solo edition.' },
      { game: <GameLink type="whot" />, description: 'Nigerian Whot — shapes, specials, and the WHOT wild.' },
      { game: <GameLink type="ayo" />, description: 'Ayo — the Yoruba mancala, sow and capture.' },
      { game: <GameLink type="uno" />, description: 'Match Up — our Uno-style card game, solo mode.' },
    ],
  },
  faqs: [
    {
      question: 'Can I play Ludo against the computer for free?',
      answer:
        "Yes. FateRound's solo Ludo vs bot is free forever — no sign-up, no download, no premium tier. Open the page and you're playing.",
    },
    {
      question: 'What are the Ludo rules the bot uses?',
      answer:
        'Modern Ludo — roll a 6 to bring a piece out, move by the die roll, land on an opponent to send them back to their yard, safe squares protect pieces, first player to get all four pieces home wins.',
    },
    {
      question: 'How hard is the Ludo bot?',
      answer:
        "The bot plays a solid game — it captures when it can, guards vulnerable pieces, and races the last piece home. Winnable, but you'll have to play well.",
    },
    {
      question: 'Can I play Ludo offline?',
      answer:
        "Solo Ludo runs in your browser — once the page has loaded, a shaky connection won't drop your game. It's the closest thing to Ludo offline you'll get without an app.",
    },
    {
      question: 'Is this a Ludo King alternative?',
      answer:
        "Yes. FateRound's Ludo is a free browser-based alternative to Ludo King — no app to install, no ads, no account. See our full [Ludo King alternative](/free-ludo-king-alternative) page for the comparison.",
    },
    {
      question: 'Can I play Ludo with friends after?',
      answer: 'Yes — create a multiplayer Ludo room and share the code. Same rules, four seats, real opponents.',
    },
  ],
  ctaHeading: 'Play a solo Ludo round now',
  ctaSubtext: 'Free forever. No sign-up, no download — just you and the bot.',
  primaryCta: { href: '/play-solo/ludo', label: 'Play Ludo vs bot' },
  ogImage: '/og/ludo.png',
  accent: '#0284c7',
}

const SOLO_FIVE_DICE_BOT: MarketingPageContent = {
  slug: 'play-five-dice-vs-bot',
  breadcrumbName: 'Five Dice vs bot',
  seoTitle: 'Play Five Dice vs Bot — Free Yahtzee-Style Dice Game Online',
  seoDescription:
    'Play Five Dice (a free Yahtzee-style dice game) solo against a computer opponent — three rolls per turn, thirteen categories, Yahtzee-style bonus and Joker rule. Free, no sign-up, no download.',
  keywords: [
    'play yahtzee vs computer',
    'yahtzee vs bot',
    'play yahtzee alone',
    'free yahtzee alternative',
    'yahtzee single player free',
    'yahtzee against computer',
    'five dice game online',
    'yahtzee style dice game',
    'roll and hold dice game',
    'yahtzee bot online',
  ],
  heroTitle: 'Play Five Dice vs bot — the Yahtzee-style dice classic, solo',
  heroSubtitle:
    "Five Dice is FateRound's take on the classic five-dice scoring game (think Yahtzee). Play solo against a computer opponent — three rolls per turn, thirteen categories, the 63-point upper bonus, and 50-point five-of-a-kind. Free, no sign-up.",
  highlights: [
    'Five dice, three rolls per turn',
    'All 13 Yahtzee-style categories',
    '63-point upper bonus + Joker rule',
    'Free, no sign-up, no download',
  ],
  featureCards: [
    {
      emoji: '🎲',
      title: 'The rules you already know',
      description:
        "If you've played Yahtzee, you already know Five Dice — roll five dice up to three times, hold what you want, fill the scorecard category by category.",
    },
    {
      emoji: '🤖',
      title: 'A bot that plays the score',
      description:
        "The bot chases the 63-point upper bonus, plays Chance as a safety net, and won't waste a Yahtzee on a bad category. It plays to score, not to fill.",
    },
    {
      emoji: '📝',
      title: 'Scorecard tracked for you',
      description: 'Every category, both bonuses, running total — no pencil, no maths, no smudged scorecards.',
    },
    {
      emoji: '⚡',
      title: 'No lobby, no wait',
      description: 'No room to fill, no friend to nudge. Open the page and roll.',
    },
  ],
  stepsHeading: 'How to play Five Dice vs bot',
  steps: [
    { title: 'Open the game', description: 'Straight into a solo Five Dice table — no code, no sign-up.' },
    {
      title: 'Roll, hold, roll again',
      description: 'Roll all five dice, hold the ones you want, re-roll the rest. Up to three rolls per turn.',
    },
    {
      title: 'Score a category',
      description: 'Fill one of the 13 categories. Beat the bot on total score after all 13 turns each.',
    },
  ],
  body: (
    <>
      <p>
        Five Dice is a free five-dice scoring game in the family of classic Yahtzee-style dice games. Solo mode lets you
        play against a computer opponent whenever you like — no room, no wait, no other players needed. Same dice, same
        categories, same tension when you\'re one bonus point away and the bot lands a Yahtzee.
      </p>
      <p>
        When you\'re ready for friends, the same rules run in{' '}
        <HubLink href="/create">multiplayer Five Dice rooms</HubLink>. Practice solo, then take the scorecard to the
        group.
      </p>
    </>
  ),
  gameList: {
    heading: 'Also playable solo vs bot on FateRound',
    items: [
      { game: <GameLink type="ludo" />, description: 'Ludo — roll a 6, chase captures, race all four home.' },
      { game: <GameLink type="whot" />, description: 'Nigerian Whot — shapes, specials, and the WHOT wild.' },
      { game: <GameLink type="uno" />, description: 'Match Up — our Uno-style card game.' },
      { game: <GameLink type="ayo" />, description: 'Ayo — the Yoruba mancala, sow and capture.' },
    ],
  },
  faqs: [
    {
      question: 'Is Five Dice the same as Yahtzee?',
      answer:
        'Five Dice is inspired by classic five-dice scoring games like Yahtzee — same 5 dice, same 3 rolls per turn, same 13 categories (Ones through Sixes, plus Three of a Kind, Four of a Kind, Full House 25, Small Straight 30, Large Straight 40, Yahtzee 50, and Chance), same 63-point upper bonus, same Joker rule for extra fives-of-a-kind. It’s our own game, not the trademarked one.',
    },
    {
      question: 'Can I play a Yahtzee-style dice game against the computer for free?',
      answer:
        'Yes. Five Dice solo mode is free forever — no sign-up, no download, no premium tier. Play as many rounds as you like.',
    },
    {
      question: 'What are the categories on the scorecard?',
      answer:
        'Upper section: Ones, Twos, Threes, Fours, Fives, Sixes (sum of matching dice, +35 bonus if the upper total hits 63). Lower section: Three of a Kind (sum of all dice), Four of a Kind (sum of all dice), Full House (25), Small Straight (30), Large Straight (40), Yahtzee/five-of-a-kind (50), and Chance (sum of all dice).',
    },
    {
      question: 'How hard is the Five Dice bot?',
      answer:
        "The bot plays a real scoring game — it chases the upper bonus, holds fives when a Yahtzee is on, and won't waste a good roll on a bad category. Winnable, but the maths matters.",
    },
    {
      question: 'Can I play Five Dice with friends?',
      answer:
        'Yes — create a multiplayer Five Dice room and share the code. Same rules, real opponents, scorecard tracked for everyone.',
    },
  ],
  ctaHeading: 'Roll a solo Five Dice round',
  ctaSubtext: 'Free forever. No sign-up, no download — you vs the bot.',
  primaryCta: { href: '/play-solo/yahtzee', label: 'Play Five Dice vs bot' },
  ogImage: '/og/yahtzee.png',
  accent: '#7c3aed',
}

export const MARKETING_PAGES: Record<string, MarketingPageContent> = {
  [JACKBOX.slug]: JACKBOX,
  [NAIJA.slug]: NAIJA,
  [TOURNAMENTS.slug]: TOURNAMENTS,
  [SCHOOL.slug]: SCHOOL,
  [LUDO_KING.slug]: LUDO_KING,
  [WHOT_UNO.slug]: WHOT_UNO,
  [CHRISTMAS.slug]: CHRISTMAS,
  [VIDEO_CALL.slug]: VIDEO_CALL,
  [LONG_DISTANCE.slug]: LONG_DISTANCE,
  [DISCORD.slug]: DISCORD,
  [PARTY_HUB.slug]: PARTY_HUB,
  [KAHOOT.slug]: KAHOOT,
  [TEAM.slug]: TEAM,
  [GAME_NIGHT.slug]: GAME_NIGHT,
  [BORED.slug]: BORED,
  [HOUSEPARTY.slug]: HOUSEPARTY,
  [SOLO_WHOT_BOT.slug]: SOLO_WHOT_BOT,
  [SOLO_MATCH_UP_BOT.slug]: SOLO_MATCH_UP_BOT,
  [SOLO_AYO_BOT.slug]: SOLO_AYO_BOT,
  [SOLO_CRAZY_8_BOT.slug]: SOLO_CRAZY_8_BOT,
  [WHOT_ROOM_BOTS.slug]: WHOT_ROOM_BOTS,
  [ESTATE_KINGS_ROOM_BOTS.slug]: ESTATE_KINGS_ROOM_BOTS,
  [SOLO_LUDO_BOT.slug]: SOLO_LUDO_BOT,
  [SOLO_FIVE_DICE_BOT.slug]: SOLO_FIVE_DICE_BOT,
}

export const ALL_MARKETING_SLUGS = Object.keys(MARKETING_PAGES)

export function getMarketingPage(slug: string): MarketingPageContent | null {
  return MARKETING_PAGES[slug] ?? null
}

/** Next.js Metadata for a marketing landing route. Returns `{}` for an unknown slug. */
export function marketingMetadata(slug: string): Metadata {
  const content = getMarketingPage(slug)
  if (!content) return {}
  const ogImage = content.ogImage ? { url: content.ogImage, width: 1200, height: 630, alt: content.seoTitle } : OG_IMAGE
  return {
    title: content.seoTitle,
    description: content.seoDescription,
    keywords: content.keywords,
    alternates: { canonical: `/${content.slug}` },
    openGraph: {
      title: `${content.seoTitle} | ${SITE_NAME}`,
      description: content.seoDescription,
      url: `/${content.slug}`,
      images: [ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${content.seoTitle} | ${SITE_NAME}`,
      description: content.seoDescription,
      images: [ogImage.url],
    },
  }
}
