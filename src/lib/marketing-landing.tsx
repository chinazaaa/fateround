import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { GameLink, HubLink } from '@/components/marketing/GameLink'
import { SITE_NAME, OG_IMAGE } from '@/lib/seo'

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
  /** Optional override for the primary CTA button (defaults to "Create a free room" → /create).
   *  Used e.g. by the tournaments page to funnel to /tournament/create. */
  primaryCta?: { href: string; label: string }
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
      description: "Monopoly, Whot, Trivia, Would You Rather — whatever the group's in the mood for.",
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
        link, your group joins from wherever they are, and you jump between <GameLink type="custom">20+ games</GameLink>{' '}
        in the same room.
      </p>
      <p>
        And Fate Round isn&apos;t just party trivia. The same room runs <GameLink type="monopoly" />,{' '}
        <GameLink type="yahtzee" />, <GameLink type="whot" />, <GameLink type="uno" />, <GameLink type="ludo" />,{' '}
        <GameLink type="scrabble" />, and <GameLink type="chess" /> — plus quick word and voting games like{' '}
        <GameLink type="codewords" />, <GameLink type="would_you_rather" />, and <GameLink type="trivia" />. It&apos;s
        the whole game night behind one link — not one pack at a time. Perfect over a Discord or Zoom call, on a couch,
        or across the country.
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
    {
      question: 'Is there a free version of Quiplash?',
      answer:
        'Fate Round has Quiplash — the same write-funny-answers, vote-for-your-favourite format — completely free, no pack to buy. Share a code and everyone plays from their phone.',
    },
    {
      question: 'What games are like Jackbox but free?',
      answer:
        'Fate Round gives you 20+ party games for free — including Quiplash, trivia, voting games like Would You Rather and Most Likely To, plus board and card classics like Monopoly and Whot.',
    },
    {
      question: 'Can I play Jackbox-style games on my phone without buying packs?',
      answer:
        'Yes. Fate Round is free with no packs to unlock. Every game is available from day one — just share a link and everyone joins from their phone browser.',
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
        <GameLink type="monopoly" />, <GameLink type="whot" />, <GameLink type="ludo" />, or <GameLink type="trivia" />.
        Long-distance friends, a Discord server, a family spread across three time zones — same link, everyone&apos;s
        in.
      </p>
    </>
  ),
  gameList: {
    heading: 'Best Fate Round games for a video call',
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
    heading: 'Best Fate Round games for long distance (just the two of you)',
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

const DISCORD: MarketingPageContent = {
  slug: 'discord-games',
  breadcrumbName: 'Discord games',
  seoTitle: 'Free Discord Games — No Bot, No Download, Just a Link',
  seoDescription:
    'Add games to any Discord server without a bot or download. Fate Round runs in the browser — drop one link in the channel and everyone plays from their phone. Free, no sign-up. 20+ games.',
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
    'Skip the bot setup and the permissions headache. Drop one Fate Round link in your channel and everyone plays from their own phone while you stay in voice. Free, no sign-up, 20+ games.',
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
        slash commands before anyone plays. Fate Round skips all of it: paste one link in a channel and the whole server
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
    heading: 'Best Fate Round games for Discord',
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
      answer: 'No. Fate Round runs in the browser — paste a link, with no bot to invite or authorize.',
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
    'Play 20+ free online party games in one place — Smash Marry Kill, Would You Rather, Trivia, Monopoly, Whot and more. Share a link, everyone joins from their phone. No sign-up, no download.',
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
      description: 'Monopoly, Yahtzee, Whot, Scrabble, Chess, Ludo — a full game night, no board required.',
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
        Fate Round packs <HubLink>20+ multiplayer games</HubLink> into a single browser tab — no sign-up, no download,
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
        '20+ modes — Smash Marry Kill, Would You Rather, Most Likely To, and Never Have I Ever, plus board and card games like Monopoly, Whot, and Yahtzee, and word/trivia games like Codewords and Trivia.',
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
    "Kahoot's free tier caps your players and nudges you to pay. Fate Round doesn't lock the essentials behind a paywall — host trivia and 20+ other games with no login, up to 40 players a room. Share a code, everyone joins from their phone. Free forever.",
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
        Kahoot is great for a classroom quiz — until the free plan caps your players and the paywall appears. Fate Round
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
    heading: 'How Fate Round compares to Kahoot',
    columns: ['Fate Round', 'Kahoot (free)'],
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
        The best virtual icebreaker doesn&apos;t need a download, an account, or an IT approval. Fate Round runs in the
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
    heading: 'Best Fate Round games for teams',
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
    'Different cities, same game night. Share one Fate Round link and the whole group plays from their own couch — party votes, board classics, and trivia, all free. No app, no sign-up.',
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
      description: 'Open with Would You Rather, escalate to Smash Marry Kill, finish on a Monopoly marathon.',
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
        A virtual game night lives or dies on how easy it is to join. Fate Round makes it one tap: share a link and
        every guest plays from their own phone, from their own house, in real time. Keep a video call open so you can
        see and hear each other, and let the games carry the night — no app to install, no account to make.
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
        'Share one Fate Round link. Everyone joins from their own phone and plays in real time — keep a video call open so you can see and hear each other.',
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
        'Bingo, Trivia, Monopoly, Ludo, and Would You Rather are family-friendly; save Smash Marry Kill and Never Have I Ever for grown-up groups.',
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
    'Bored? Fate Round has 20+ free games to play with friends online — share one link and start in seconds. No sign-up, no download. Party votes, board games, trivia and more.',
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
    'Group chat gone quiet? Share one Fate Round link and pick from 20+ games — party votes, board classics, trivia, word games. Everyone plays from their phone. Free, no sign-up.',
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
        The fastest fix for a bored group chat is a single link everyone can tap. Fate Round gives you exactly that:
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
        'Share a Fate Round link and pick any of 20+ games — Would You Rather and Smash Marry Kill for quick chaos, Monopoly or Whot for a longer session, Trivia for a big group.',
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
    'Miss Houseparty? Fate Round brings back games with friends over a video call — share one link, everyone plays from their phone. Free, no sign-up, 20+ games. Works with any video app.',
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
    "Houseparty shut down, but the thing you loved — casual games over a video call — didn't have to. Fate Round brings it back: one link, everyone plays from their phone. Free, no sign-up, 20+ games.",
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
    { title: 'Share a Fate Round link', description: 'One code in the chat. Friends join from any browser.' },
    { title: 'Play like the old days', description: 'Trivia, Would You Rather, Monopoly and more — live, together.' },
  ],
  body: (
    <>
      <p>
        Houseparty — the video-chat app with built-in games — shut down in 2021, and nothing quite replaced the easy
        &ldquo;jump on and play&rdquo; feeling. Fate Round brings back the games-with-friends part and pairs it with
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
        'Houseparty, the video-chat app with built-in games, shut down in 2021. Fate Round brings back the games-with-friends part and works alongside any video app you already use.',
    },
    {
      question: 'Is Fate Round like Houseparty?',
      answer:
        "It's the games layer Houseparty was loved for — but you keep your own video call (FaceTime, Zoom, Discord) and get 20+ games instead of a handful.",
    },
    {
      question: 'Do we need to download an app?',
      answer: 'No. Fate Round runs in the browser — share a link and everyone joins with a display name.',
    },
    {
      question: 'Does it have video chat built in?',
      answer:
        "No — and that's on purpose. Keep the video app you already use and play Fate Round beside it, so nobody has to switch platforms.",
    },
    {
      question: 'Is it free?',
      answer: 'Yes, free forever — no sign-up, no download, no premium tier.',
    },
    {
      question: 'What apps are like Houseparty in 2026?',
      answer:
        'Fate Round plus your existing video app (FaceTime, Zoom, Discord) replaces what Houseparty did. You get casual games with friends over a call — 20+ of them — without needing one all-in-one app.',
    },
    {
      question: 'Can I play games over FaceTime like Houseparty?',
      answer:
        'Yes. Keep FaceTime open and share a Fate Round link — everyone plays from their phone browser right alongside the call. Trivia, Would You Rather, Monopoly, and more.',
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
        whole vibe. Fate Round brings it online without losing the spirit: everyone plays from their own phone, over one
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
        'Fate Round has Whot (with real Naija house rules), Ludo, Draughts (Checkers), Snakes & Ladders, and Stop / Name-Place-Animal-Thing, plus classics like Monopoly. All free, all in the browser — no app to download.',
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
        "Ayo (also called Ayoayo or Ayo Olopon) is a traditional Nigerian mancala board game from Yoruba culture. Two players take turns sowing seeds anti-clockwise around a wooden board with 12 houses. You capture seeds when your last sown seed lands in an opponent's house containing 2 or 3 seeds. Play it free on Fate Round — no board needed.",
    },
    {
      question: 'What African games can I play online?',
      answer:
        'Fate Round has a growing collection of African games you can play free in your browser: Whot (the Nigerian card game), Ludo, Draughts (Checkers), Ayo (Yoruba mancala), Snakes & Ladders, and Stop (Name, Place, Animal, Thing). All multiplayer, all real-time — just share a link.',
    },
    {
      question: 'How do I play Nigerian games with family in the diaspora?',
      answer:
        'Start a video call on WhatsApp or Zoom, create a game on Fate Round, and share the short link in your family group chat. Everyone joins from their phone — Lagos, London, Houston, Toronto, wherever. No app to download, no account needed. Works on any phone browser.',
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
    heading: 'How Fate Round compares to Ludo King',
    columns: ['Fate Round', 'Ludo King'],
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
        'Yes — Fate Round’s Ludo plays right in your browser, free, with no app to install and no sign-up. Share one link and 2 to 4 players join from any phone or laptop.',
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
    'Whot vs Uno: how the two card classics compare, and where to play both free online. Whot uses shapes and WHOT wilds; Uno uses colours and Wild cards. Play both free on Fate Round — no app, no sign-up.',
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
        'Fate Round has real Whot and real Uno — plus Crazy Eights, the classic where 8s are wild — free, in the browser.',
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
      description: 'Play Whot or Uno on Fate Round — share a link and your crew joins.',
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
        The best part: you don’t have to choose. Fate Round has proper Naija <GameLink type="whot" /> and real{' '}
        <GameLink type="uno">Uno</GameLink> — plus <GameLink type="crazy_eights">Crazy Eights</GameLink>, the classic
        where 8s are wild — all free, all in the browser, no app to download. Share a link and your crew joins from any
        phone. Part of the <HubLink>Naija game night</HubLink> lineup.
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
      { label: 'Play free online', a: 'Yes — on Fate Round', b: 'Yes — on Fate Round (plus Crazy Eights)' },
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
      question: 'Can I play Whot and Uno online free?',
      answer:
        'Yes — both Whot and Uno are free on Fate Round, plus Crazy Eights (the classic where 8s are wild). They all run in the browser with no app and no sign-up.',
    },
    {
      question: 'Which should I play?',
      answer:
        'If you want the Naija classic with shapes and General Market, play Whot. If you want the colour-matching game, play Uno (or Crazy Eights, the 8s-are-wild variant). On Fate Round you can jump between all three in the same session.',
    },
  ],
  ctaHeading: 'Play Whot or Uno',
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
    'Everyone home, or scattered across the world? Either way, the game night happens. Share one Fate Round link over WhatsApp and the whole family plays from their phones — Whot, Ludo, Bingo, trivia and more. Free, no app, no sign-up.',
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
        December in Lagos or a video call with family abroad, Fate Round gets the whole family playing from their own
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
        'Fate Round has Whot, Ludo, Bingo, trivia, Monopoly, and party games like Most Likely To — all free in the browser. Share one link and the whole family joins from their phones, in one house or across the world.',
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
  seoTitle: 'Free Online Tournaments — Chess, Scrabble, Whot & Trivia',
  seoDescription:
    'Run a free online tournament for your group — Chess, Scrabble, Whot, or Trivia. Head-to-head brackets, knockout, round-robin, and school championships. Share one link, no app, no sign-up.',
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
  heroTitle: 'Run a free online tournament — Chess, Scrabble, Whot & Trivia',
  heroSubtitle:
    'Turn game night into a competition. Set up a bracket, share one link, and your group battles it out across multiple rounds — free, no app, no sign-up. Great for friends, teams, and schools.',
  highlights: [
    'Chess, Scrabble, Whot, Trivia',
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
      description: 'Chess, Scrabble, and Whot head-to-head, or Trivia for the whole group — with proper scoring.',
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
      description: 'Chess, Scrabble, Whot, or Trivia — bracket, knockout, round-robin, or school.',
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
        A tournament makes any game night feel like an event. On Fate Round you can run one free, in the browser, with
        no app and no accounts — just share a link and your group competes across multiple rounds. Choose a format that
        fits the game: head-to-head brackets for <GameLink type="chess" />, <GameLink type="scrabble" />, and{' '}
        <GameLink type="whot" />; or round-robin and knockout rounds for <GameLink type="trivia" />.
      </p>
      <p>
        It’s built for friends and teams, but also for schools — the class-based{' '}
        <GameLink type="whot">School Whot championship</GameLink> makes it easy to run a school-wide competition, and
        you can run <GameLink type="trivia" /> as a league or knockout too. Scores, brackets, and who advances are all
        handled for you, so you host the event and Fate Round runs it. Part of the same platform as{' '}
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
        'Chess, Scrabble, and Whot as head-to-head brackets, and Trivia as a round-robin or knockout. There’s also a school-championship format for class-based competitions.',
    },
    {
      question: 'What tournament formats are there?',
      answer:
        'Round-robin (everyone plays everyone), head-to-head brackets, single-elimination knockout, and a class-based school championship. Fate Round pairs players, runs the rounds, and advances winners automatically.',
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
    'Run a School Whot championship online — students climb the class ladder from Primary 1 to Graduate. Free, no app, no sign-up. Plus Trivia, Chess & Scrabble tournaments for schools.',
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
        'Yes. Beyond School Whot, the Tournaments feature runs Trivia as a round-robin league or knockout, and Chess and Scrabble as head-to-head brackets — all free and in the browser.',
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
}

export const ALL_MARKETING_SLUGS = Object.keys(MARKETING_PAGES)

export function getMarketingPage(slug: string): MarketingPageContent | null {
  return MARKETING_PAGES[slug] ?? null
}

/** Next.js Metadata for a marketing landing route. Returns `{}` for an unknown slug. */
export function marketingMetadata(slug: string): Metadata {
  const content = getMarketingPage(slug)
  if (!content) return {}
  return {
    title: content.seoTitle,
    description: content.seoDescription,
    keywords: content.keywords,
    alternates: { canonical: `/${content.slug}` },
    openGraph: {
      title: `${content.seoTitle} | ${SITE_NAME}`,
      description: content.seoDescription,
      url: `/${content.slug}`,
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${content.seoTitle} | ${SITE_NAME}`,
      description: content.seoDescription,
      images: [OG_IMAGE.url],
    },
  }
}
