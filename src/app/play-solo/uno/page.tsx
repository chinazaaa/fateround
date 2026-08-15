import type { Metadata } from 'next'
import { SoloUnoClient } from './SoloUnoClient'

/**
 * Solo UNO — practice vs a bot. Classic rules only (see uno-solo.ts): no
 * Team-Up, no Jump-In, no Multi-Play, no Zero-Seven, no Wild Draw Four
 * challenge, no UNO-call penalty. The multiplayer route keeps all the fancy
 * rules — solo is deliberately the simplest playable version.
 */

export const metadata: Metadata = {
  title: 'Play UNO vs Bot — Practice UNO on FateRound',
  description:
    'Practice UNO against a computer opponent. Classic rules — Skip, Reverse, Draw Two, Wild, Wild Draw Four. Free, no sign-up, works on any device.',
  robots: { index: true, follow: true },
}

export default function PlaySoloUnoPage() {
  return <SoloUnoClient />
}
