import type { Metadata } from 'next'
import { SoloCrazyEightsClient } from './SoloCrazyEightsClient'

/**
 * Solo Crazy Eights — practice vs a bot. Same shape as /play-solo/whot: no
 * games row, no realtime, no account. State persists to sessionStorage.
 */

export const metadata: Metadata = {
  title: 'Play Crazy Eights vs Bot — Practice Crazy 8s on FateRound',
  description:
    'Practice Crazy Eights against a computer opponent. Full rules — 8s as wilds, Pick 2, Skip, Reverse, jokers. Free, no sign-up, works on any device.',
  robots: { index: true, follow: true },
}

export default function PlaySoloCrazyEightsPage() {
  return <SoloCrazyEightsClient />
}
