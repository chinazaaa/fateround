import type { Metadata } from 'next'
import { SoloYahtzeeClient } from './SoloYahtzeeClient'
import { SoloSeoFooter } from '../SoloSeoFooter'

/**
 * Solo Yahtzee — practice vs a bot, no room, no realtime.
 *
 * Same shape as /play-solo/ludo, /play-solo/ayo, /play-solo/whot: fully
 * client-driven, no games row, no host token, no realtime. Progress
 * persists to sessionStorage so a reload continues the same game.
 */

export const metadata: Metadata = {
  title: 'Play Yahtzee vs Bot — Practice Yahtzee on FateRound',
  description:
    'Practice Yahtzee against a computer opponent. Three rolls per turn, thirteen categories, Yahtzee bonus and Joker rule included. Free, no sign-up, works on any device.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Play Yahtzee vs Bot — Practice Yahtzee on FateRound',
    description: 'Practice Yahtzee against a computer opponent — free, no sign-up.',
    url: '/play-solo/yahtzee',
    images: [{ url: '/og/yahtzee.png', width: 1200, height: 630, alt: 'Play Yahtzee vs bot on FateRound' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Play Yahtzee vs Bot — Practice Yahtzee on FateRound',
    description: 'Yahtzee vs the computer. Free, no sign-up.',
    images: ['/og/yahtzee.png'],
  },
}

export default function PlaySoloYahtzeePage() {
  return (
    <>
      <SoloYahtzeeClient />
      <SoloSeoFooter
        heading="Learn more about Yahtzee"
        links={[
          { href: '/games/yahtzee', label: 'Yahtzee game page' },
          { href: '/create?type=yahtzee', label: 'Start a real Yahtzee room' },
        ]}
      />
    </>
  )
}
