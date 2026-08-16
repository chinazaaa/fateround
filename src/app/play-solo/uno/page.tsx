import type { Metadata } from 'next'
import { SoloUnoClient } from './SoloUnoClient'
import { SoloSeoFooter } from '../SoloSeoFooter'

/**
 * Solo UNO — practice vs a bot. Classic rules only (see uno-solo.ts): no
 * Team-Up, no Jump-In, no Multi-Play, no Zero-Seven, no Wild Draw Four
 * challenge, no UNO-call penalty. The multiplayer route keeps all the fancy
 * rules — solo is deliberately the simplest playable version.
 */

export const metadata: Metadata = {
  title: 'Play Match Up vs Bot — Practice Match Up on FateRound',
  description:
    "Practice Match Up (FateRound's UNO-style card game) against a computer opponent. Classic rules — Skip, Reverse, Draw Two, Wild, Wild Draw Four. Free, no sign-up, works on any device.",
  robots: { index: true, follow: true },
}

export default function PlaySoloUnoPage() {
  return (
    <>
      <SoloUnoClient />
      <SoloSeoFooter
        heading="Learn more about Match Up"
        links={[
          { href: '/play-match-up-vs-bot', label: 'About Match Up vs bot' },
          { href: '/games/uno', label: 'Match Up game page' },
          { href: '/whot-vs-uno', label: 'Whot vs UNO comparison' },
        ]}
      />
    </>
  )
}
