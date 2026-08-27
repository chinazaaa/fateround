import type { Metadata } from 'next'
import { SoloCheckersClient } from './SoloCheckersClient'
import { SoloSeoFooter } from '../SoloSeoFooter'

/**
 * Solo Checkers — practice vs a bot, no room, no realtime.
 *
 * Same shape as `/play-solo/ayo`: fully client-driven, no `games` row, no host
 * token, no realtime. American 8×8 rules (forced captures, kings, 40-move draw,
 * threefold repetition). Progress persists to sessionStorage so a reload
 * continues the same game.
 */

export const metadata: Metadata = {
  title: 'Play Checkers vs Bot — Practice American Draughts on FateRound',
  description:
    'Practice American Checkers (8×8 draughts) against a computer opponent. Forced captures, kings, three difficulty levels. Free, no sign-up, works on any device.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Play Checkers vs Bot — Practice American Draughts on FateRound',
    description: 'Practice American Checkers against a computer opponent. Free, no sign-up.',
    url: '/play-solo/checkers',
    images: [{ url: '/og/checkers.png', width: 1200, height: 630, alt: 'Play Checkers vs bot on FateRound' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Play Checkers vs Bot — Practice American Draughts on FateRound',
    description: 'American Checkers against the computer. Free, no sign-up.',
    images: ['/og/checkers.png'],
  },
}

export default function PlaySoloCheckersPage() {
  return (
    <>
      <SoloCheckersClient />
      <SoloSeoFooter
        heading="Learn more about Checkers"
        links={[
          { href: '/games/checkers', label: 'Checkers game page' },
          { href: '/play-solo/checkers-international', label: 'Play International Draughts vs bot' },
          { href: '/play-solo/checkers-nigeria', label: 'Play Nigerian Draughts vs bot' },
          { href: '/play-solo', label: 'More solo games' },
        ]}
      />
    </>
  )
}
