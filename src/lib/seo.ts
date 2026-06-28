import type { Metadata } from 'next'
import { GAME_TYPE_OPTIONS, gameTypeConfig } from '@/lib/game-types'
import type { GameLandingContent, GameLandingFaq } from '@/lib/game-landing'
import { gameLandingSlug } from '@/lib/game-landing'
import { appOrigin } from '@/lib/site'
import type { GameType } from '@/types'

export const SITE_NAME = 'Fate Round'

export const OG_IMAGE = {
  url: '/og.png',
  width: 1200,
  height: 630,
  alt: `${SITE_NAME} — Free online party games with friends`,
} as const

export const DEFAULT_DESCRIPTION =
  'Play free online party games with friends. Smash Marry Kill, Red Flag Green Flag, Smash or Pass, Would You Rather, Most Likely To, Who Said This, Hot Seat, and custom modes. Create a game, share the code, no sign-up required.'

export const DEFAULT_KEYWORDS = [
  'party games online',
  'smash marry kill online',
  'smash marry kill game',
  'would you rather online',
  'most likely to game',
  'red flag green flag game',
  'smash or pass game',
  'who said this game',
  'free party games',
  'no sign up party games',
  'Fate Round',
  'fateround',
]

export function rootMetadata(): Metadata {
  const origin = appOrigin()

  return {
    metadataBase: new URL(origin),
    title: {
      default: `${SITE_NAME} — Free Online Party Games`,
      template: `%s | ${SITE_NAME}`,
    },
    description: DEFAULT_DESCRIPTION,
    applicationName: SITE_NAME,
    keywords: DEFAULT_KEYWORDS,
    authors: [{ name: SITE_NAME, url: origin }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    formatDetection: { email: false, address: false, telephone: false },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: origin,
      siteName: SITE_NAME,
      title: `${SITE_NAME} — Free Online Party Games`,
      description: DEFAULT_DESCRIPTION,
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${SITE_NAME} — Free Online Party Games`,
      description: DEFAULT_DESCRIPTION,
      images: [OG_IMAGE.url],
    },
    icons: {
      icon: [{ url: '/icon.png', type: 'image/png' }],
      apple: [{ url: '/icon.png', type: 'image/png' }],
    },
    alternates: {
      canonical: '/',
    },
  }
}

const HOME_DESCRIPTION =
  'Play Yahtzee, Whot, Monopoly, Codewords and 25+ party games free with friends. Create a game, share the code — no sign-up, no download.'

export function homeMetadata(): Metadata {
  return {
    title: 'Free Online Party Games — Yahtzee, Whot, Monopoly & More',
    description: HOME_DESCRIPTION,
    alternates: { canonical: '/' },
    openGraph: {
      title: `${SITE_NAME} — Free Online Party Games`,
      description: HOME_DESCRIPTION,
      url: '/',
      images: [OG_IMAGE],
    },
  }
}

export function createMetadata(): Metadata {
  return {
    title: 'Create a Game',
    description:
      'Start a free Fate Round game — pick Smash Marry Kill, Would You Rather, Most Likely To, or another party game mode and share the code with friends.',
    alternates: { canonical: '/create' },
    openGraph: {
      title: `Create a Game | ${SITE_NAME}`,
      description: 'Start a free online party game and share the code with friends. No sign-up required.',
      url: '/create',
      images: [OG_IMAGE],
    },
  }
}

export function noIndexMetadata(title: string): Metadata {
  return {
    title,
    robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  }
}

const JOIN_GAME_FALLBACK_DESCRIPTION =
  "You're invited to a free party game on Fate Round. Tap to join — no sign-up needed."

function joinGameRobots(): Metadata['robots'] {
  return { index: false, follow: false, googleBot: { index: false, follow: false } }
}

/** Share-preview metadata for `/game/[code]` invite links. */
export function gameJoinMetadata(code: string, gameType: GameType | null): Metadata {
  const gameCode = code.trim().toUpperCase()
  const path = `/game/${gameCode}`

  if (!gameType) {
    const title = `Join Game — ${gameCode}`
    return {
      title,
      description: JOIN_GAME_FALLBACK_DESCRIPTION,
      robots: joinGameRobots(),
      openGraph: {
        title: `${title} | ${SITE_NAME}`,
        description: JOIN_GAME_FALLBACK_DESCRIPTION,
        url: path,
        images: [OG_IMAGE],
      },
      twitter: {
        card: 'summary_large_image',
        title: `${title} | ${SITE_NAME}`,
        description: JOIN_GAME_FALLBACK_DESCRIPTION,
        images: [OG_IMAGE.url],
      },
    }
  }

  const cfg = gameTypeConfig(gameType)
  const slug = gameLandingSlug(gameType)
  const ogPath = gameLandingOgPath(slug)
  const description = `You're invited to play ${cfg.label} on Fate Round. Tap to join with code ${gameCode} — no sign-up needed.`
  const title = `Join ${cfg.label} — ${gameCode}`

  return {
    title,
    description,
    robots: joinGameRobots(),
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: path,
      images: [
        {
          url: ogPath,
          width: 1200,
          height: 630,
          alt: `${cfg.label} — join on ${SITE_NAME}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${SITE_NAME}`,
      description,
      images: [ogPath],
    },
  }
}

export function webApplicationJsonLd(): string {
  const origin = appOrigin()
  const gameNames = GAME_TYPE_OPTIONS.map((type) => gameTypeConfig(type).label)

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    url: origin,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Web browser',
    browserRequirements: 'Requires JavaScript',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    description: DEFAULT_DESCRIPTION,
    featureList: gameNames,
    inLanguage: 'en',
  })
}

export function organizationJsonLd(): string {
  const origin = appOrigin()

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: origin,
    logo: `${origin}/icon.png`,
  })
}

export function websiteJsonLd(): string {
  const origin = appOrigin()

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: origin,
    description: DEFAULT_DESCRIPTION,
    publisher: { '@type': 'Organization', name: SITE_NAME, url: origin },
  })
}

export function gameJsonLd(content: GameLandingContent): string {
  const cfg = gameTypeConfig(content.gameType)
  const url = `${appOrigin()}/games/${content.slug}`

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Game',
    name: cfg.label,
    description: content.seoDescription,
    url,
    applicationCategory: 'Game',
    operatingSystem: 'Web Browser',
    gamePlatform: 'Web browser',
    numberOfPlayers: cfg.card.players,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: appOrigin() },
  })
}

export function faqPageJsonLd(faqs: GameLandingFaq[]): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  })
}

/** Static OG art per game landing page (1200×630 PNG in /public/og/). */
export const GAME_LANDING_OG_BY_SLUG: Record<string, string> = {
  'smash-marry-kill': '/og/smash-marry-kill.png',
  'smash-or-pass': '/og/smash-or-pass.png',
  'red-flag-green-flag': '/og/red-flag-green-flag.png',
  'most-likely-to': '/og/most-likely-to.png',
  'anonymous-room': '/og/anonymous-room.png',
  bingo: '/og/bingo.png',
  codewords: '/og/codewords.png',
  'secret-message': '/og/secret-message.png',
  trivia: '/og/trivia.png',
  'two-truths-and-a-lie': '/og/two-truths-and-a-lie.png',
  'pick-a-number': '/og/pick-a-number.png',
  'this-or-that': '/og/this-or-that.png',
  monopoly: '/og/monopoly.png',
  yahtzee: '/og/yahtzee.png',
  whot: '/og/whot.png',
  ludo: '/og/ludo.png',
  'i-call-on': '/og/i-call-on.png',
  'date-my-kid': '/og/date-my-kid.png',
  'would-you-rather': '/og/would-you-rather.png',
  'never-have-i-ever': '/og/never-have-i-ever.png',
  'who-said-this': '/og/who-said-this.png',
  'hot-seat': '/og/hot-seat.png',
  'custom-game': '/og/custom-game.png',
  sudoku: '/og/sudoku.png',
  'tic-tac-toe': '/og/tic-tac-toe.png',
  'word-hunt': '/og/word-hunt.png',
  chess: '/og/chess.png',
  scrabble: '/og/scrabble.png',
  'text-charades': '/og/text-charades.png',
  'snakes-and-ladders': '/og/snakes-and-ladders.png',
}

export function gameLandingOgPath(slug: string): string {
  return GAME_LANDING_OG_BY_SLUG[slug] ?? OG_IMAGE.url
}
