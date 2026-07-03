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
        link, your group joins from wherever they are, and you jump between <GameLink type="custom">20+ games</GameLink>{' '}
        in the same room.
      </p>
      <p>
        And Fate Round isn&apos;t just party trivia. The same room that runs <GameLink type="smash_marry_kill" /> and{' '}
        <GameLink type="would_you_rather" /> also runs <GameLink type="monopoly" />, <GameLink type="yahtzee" />,{' '}
        <GameLink type="whot" />, <GameLink type="ludo" />, <GameLink type="chess" />, <GameLink type="codewords" />,
        and <GameLink type="trivia" />. It&apos;s the whole game night behind one link — not one pack at a time. Perfect
        over a Discord or Zoom call, on a couch, or across the country.
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
  seoTitle: 'Free Kahoot Alternative — No Login, No Player Limit',
  seoDescription:
    'A free Kahoot alternative with no login and no player cap. Host trivia and 20+ games in the browser — share a code and unlimited players join from their phones. No account, no download.',
  keywords: [
    'free kahoot alternative',
    'kahoot alternative',
    'games like kahoot',
    'kahoot alternative free no login',
    'kahoot alternative unlimited players',
    'free trivia game host',
    'kahoot free version',
    'quiz game like kahoot',
  ],
  heroTitle: 'The free Kahoot alternative — no login, no player limit',
  heroSubtitle:
    "Kahoot's free tier caps your players and nudges you to pay. Fate Round doesn't — host trivia and 20+ other games with no login and no cap. Share a code, everyone joins from their phone. Free forever.",
  highlights: ['No player cap', 'No login to host or join', 'Trivia + 20 more games', 'Free forever'],
  featureCards: [
    {
      emoji: '♾️',
      title: 'No player cap',
      description: "Invite two or two hundred. There's no free-tier limit pushing you to upgrade.",
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
    { title: 'Share the code', description: 'Players join from any browser with a nickname. No login, no limit.' },
    {
      title: 'Play & climb the board',
      description: 'Fastest correct answers score the most — the leaderboard updates live.',
    },
  ],
  body: (
    <>
      <p>
        Kahoot is great for a classroom quiz — until the free plan caps your players and the paywall appears. Fate Round
        keeps the fast-finger, big-screen energy without the limits: no login to host, no cap on how many join, and no
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
      { label: 'Player limit', a: 'No cap', b: 'Capped on the free plan' },
      { label: 'Login to host', a: 'None', b: 'Account required' },
      { label: 'Players join by', a: 'Code, any browser, nickname', b: 'Code via app or browser' },
      { label: 'Game types', a: 'Trivia + 20 party/board/word games', b: 'Quiz-style only' },
      { label: 'Best for', a: 'Classrooms, teams, friends — any size', b: 'Classroom quizzes' },
    ],
    note: 'Kahoot free-tier limits vary — check kahoot.com for current player caps and pricing.',
  },
  faqs: [
    {
      question: 'Does Fate Round limit how many players can join?',
      answer:
        "No. There's no free-tier player cap — host a small group or a big crowd, and everyone joins from a code.",
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
        'Yes — no login and no cap make it easy for a class or a whole team to jump in, and speed-based scoring keeps it competitive.',
    },
    {
      question: 'Is it really free?',
      answer: 'Yes, free forever — no premium tier gating players or questions.',
    },
  ],
  ctaHeading: 'Host without the cap',
  ctaSubtext: 'Free forever. No login, no player limit — start a game in under a minute.',
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
  ],
  ctaHeading: 'Bring back game night',
  ctaSubtext: 'Free forever. One link over any video call — start in under a minute.',
  accent: '#a855f7',
}

export const MARKETING_PAGES: Record<string, MarketingPageContent> = {
  [JACKBOX.slug]: JACKBOX,
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
