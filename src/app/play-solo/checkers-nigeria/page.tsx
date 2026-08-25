import type { Metadata } from 'next'
import { SoloDraughts10Client } from '@/components/solo/SoloDraughts10Client'
import { SoloSeoFooter } from '../SoloSeoFooter'

export const metadata: Metadata = {
  title: 'Play Nigerian Draughts vs Bot — Practice Naija Draughts on FateRound',
  description:
    'Practice Nigerian Draughts (10×10) against a computer opponent. Flying kings, forced captures, three difficulty levels. Free, no sign-up, works on any device.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Play Nigerian Draughts vs Bot — Practice Naija Draughts on FateRound',
    description: 'Practice Nigerian Draughts against a computer opponent. Free, no sign-up.',
    url: '/play-solo/checkers-nigeria',
    images: [
      { url: '/og/checkers-nigeria.png', width: 1200, height: 630, alt: 'Play Nigerian Draughts vs bot on FateRound' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Play Nigerian Draughts vs Bot — FateRound',
    description: 'Nigerian 10×10 draughts against the computer. Free, no sign-up.',
    images: ['/og/checkers-nigeria.png'],
  },
}

export default function PlaySoloNigeriaPage() {
  return (
    <>
      <SoloDraughts10Client
        variant="nigeria"
        gameType="checkers_nigeria"
        scoreboardKey="checkers_nigeria"
        storageKey="solo-checkers-nigeria-state-v1"
        difficultyKey="solo-checkers-nigeria-difficulty-v1"
        title="Nigerian Draughts — solo vs bot"
        createHref="/create?type=checkers_nigeria"
      />
      <SoloSeoFooter
        heading="Learn more about Nigerian Draughts"
        links={[
          { href: '/games/checkers-nigeria', label: 'Nigerian Draughts game page' },
          { href: '/play-solo/checkers', label: 'Play American Checkers vs bot' },
          { href: '/play-solo/checkers-international', label: 'Play International Draughts vs bot' },
          { href: '/play-solo', label: 'More solo games' },
        ]}
      />
    </>
  )
}
