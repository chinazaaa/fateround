import type { Metadata } from 'next'
import { GAME_TYPE_OPTIONS, gameTypeConfig } from '@/lib/game-types'
import { appOrigin } from '@/lib/site'

export const SITE_NAME = 'Fate Round'

export const OG_IMAGE = {
  url: '/og.png',
  width: 1200,
  height: 630,
  alt: `${SITE_NAME} — Free online party games with friends`,
} as const

export const DEFAULT_DESCRIPTION =
  'Play free online party games with friends. Smash Marry Kill, Red Flag Green Flag, Smash or Pass, Would You Rather, Most Likely To, Who Said This, Hot Seat, and custom modes. Create a room, share the code, no sign-up required.'

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

export function homeMetadata(): Metadata {
  return {
    title: 'Free Online Party Games — Smash Marry Kill, WYR & More',
    description: DEFAULT_DESCRIPTION,
    alternates: { canonical: '/' },
    openGraph: {
      title: `${SITE_NAME} — Free Online Party Games`,
      description: DEFAULT_DESCRIPTION,
      url: '/',
      images: [OG_IMAGE],
    },
  }
}

export function createMetadata(): Metadata {
  return {
    title: 'Create a Game',
    description:
      'Start a free Fate Round room — pick Smash Marry Kill, Would You Rather, Most Likely To, or another party game mode and share the code with friends.',
    alternates: { canonical: '/create' },
    openGraph: {
      title: `Create a Game | ${SITE_NAME}`,
      description:
        'Start a free online party game room and share the code with friends. No sign-up required.',
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
