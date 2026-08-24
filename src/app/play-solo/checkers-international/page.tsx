import type { Metadata } from 'next'
import { SoloDraughts10Client } from '@/components/solo/SoloDraughts10Client'
import { SoloSeoFooter } from '../SoloSeoFooter'

export const metadata: Metadata = {
  title: 'Play International Draughts vs Bot — Practice 10×10 Draughts on FateRound',
  description:
    'Practice International Draughts (10×10) against a computer opponent. Flying kings, majority-capture rule, three difficulty levels. Free, no sign-up, works on any device.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Play International Draughts vs Bot — Practice 10×10 Draughts on FateRound',
    description: 'Practice International Draughts against a computer opponent. Free, no sign-up.',
    url: '/play-solo/checkers-international',
    images: [
      { url: '/og/checkers-international.png', width: 1200, height: 630, alt: 'Play International Draughts vs bot on FateRound' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Play International Draughts vs Bot — FateRound',
    description: 'International 10×10 draughts against the computer. Free, no sign-up.',
    images: ['/og/checkers-international.png'],
  },
}

export default function PlaySoloInternationalPage() {
  return (
    <>
      <SoloDraughts10Client
        variant="international"
        gameType="checkers_international"
        scoreboardKey="checkers_international"
        storageKey="solo-checkers-international-state-v1"
        difficultyKey="solo-checkers-international-difficulty-v1"
        title="International Draughts — solo vs bot"
        createHref="/create?type=checkers_international"
      />
      <SoloSeoFooter
        heading="Learn more about International Draughts"
        links={[
          { href: '/games/checkers-international', label: 'International Draughts game page' },
          { href: '/play-solo/checkers', label: 'Play American Checkers vs bot' },
          { href: '/play-solo/checkers-nigeria', label: 'Play Nigerian Draughts vs bot' },
          { href: '/play-solo', label: 'More solo games' },
        ]}
      />
    </>
  )
}
