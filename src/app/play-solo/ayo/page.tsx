import type { Metadata } from 'next'
import { SoloAyoClient } from './SoloAyoClient'
import { SoloSeoFooter } from '../SoloSeoFooter'

/**
 * Solo Ayo — practice vs a bot, no room, no realtime.
 *
 * Same shape as `/play-solo/whot`: fully client-driven, no `games` row, no
 * host token, no realtime. Progress persists to sessionStorage so a reload
 * continues the same game.
 */

export const metadata: Metadata = {
  title: 'Play Ayo vs Bot — Practice Ayo on FateRound',
  description:
    'Practice Ayo against a computer opponent. Traditional Nigerian rules — relay sowing, four-seed capture, eight-seed endgame. Free, no sign-up, works on any device.',
  robots: { index: true, follow: true },
}

export default function PlaySoloAyoPage() {
  return (
    <>
      <SoloAyoClient />
      <SoloSeoFooter
        heading="Learn more about Ayo"
        links={[
          { href: '/play-ayo-vs-bot', label: 'About Ayo vs bot' },
          { href: '/blog/ayo-ayo-rules-and-how-to-play-solo', label: 'Ayo rules and how to play solo' },
          { href: '/games/ayo', label: 'Ayo game page' },
          { href: '/nigerian-games', label: 'More Nigerian games' },
        ]}
      />
    </>
  )
}
