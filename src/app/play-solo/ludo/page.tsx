import type { Metadata } from 'next'
import { SoloLudoClient } from './SoloLudoClient'
import { SoloSeoFooter } from '../SoloSeoFooter'

/**
 * Solo Ludo — practice vs a bot, no room, no realtime.
 *
 * Same shape as /play-solo/ayo and /play-solo/whot: fully client-driven, no
 * `games` row, no host token, no realtime. In-progress state persists to
 * sessionStorage so a reload continues the same game.
 */

export const metadata: Metadata = {
  title: 'Play Ludo vs Bot — Practice Ludo on FateRound',
  description:
    'Practice Ludo against a computer opponent. Modern rules — bring pieces out on a 6, chase captures, race to home. Free, no sign-up, works on any device.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Play Ludo vs Bot — Practice Ludo on FateRound',
    description: 'Practice Ludo against a computer opponent — free, no sign-up.',
    url: '/play-solo/ludo',
    images: [{ url: '/og/ludo.png', width: 1200, height: 630, alt: 'Play Ludo vs bot on FateRound' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Play Ludo vs Bot — Practice Ludo on FateRound',
    description: 'Ludo vs the computer. Free, no sign-up.',
    images: ['/og/ludo.png'],
  },
}

export default function PlaySoloLudoPage() {
  return (
    <>
      <SoloLudoClient />
      <SoloSeoFooter
        heading="Learn more about Ludo"
        links={[
          { href: '/games/ludo', label: 'Ludo game page' },
          { href: '/create?type=ludo', label: 'Start a real Ludo room' },
        ]}
      />
    </>
  )
}
