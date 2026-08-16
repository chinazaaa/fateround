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
  title: 'Play Five Dice vs Bot — Practice Yahtzee-Style Dice on FateRound',
  description:
    "Practice Five Dice (FateRound's Yahtzee-style dice game) against a computer opponent. Three rolls per turn, thirteen categories, Yahtzee-style bonus and Joker rule included. Free, no sign-up, works on any device.",
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Play Five Dice vs Bot — Practice Yahtzee-Style Dice on FateRound',
    description: 'Practice Five Dice (our Yahtzee-style dice game) against a computer opponent — free, no sign-up.',
    url: '/play-solo/yahtzee',
    images: [{ url: '/og/yahtzee.png', width: 1200, height: 630, alt: 'Play Five Dice vs bot on FateRound' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Play Five Dice vs Bot — Practice Yahtzee-Style Dice on FateRound',
    description: 'Our Yahtzee-style dice game, vs the computer. Free, no sign-up.',
    images: ['/og/yahtzee.png'],
  },
}

export default function PlaySoloYahtzeePage() {
  return (
    <>
      <SoloYahtzeeClient />
      <SoloSeoFooter
        heading="Learn more about Five Dice (our Yahtzee-style game)"
        links={[
          { href: '/play-five-dice-vs-bot', label: 'About Five Dice vs bot' },
          { href: '/games/yahtzee', label: 'Five Dice game page' },
          { href: '/blog/how-many-dice-in-yahtzee', label: 'How many dice in Yahtzee' },
          { href: '/blog/what-is-a-full-house-in-yahtzee', label: 'What is a full house?' },
          { href: '/blog/yahtzee-scoring-guide', label: 'Full scoring guide' },
          { href: '/create?type=yahtzee', label: 'Start a real Five Dice room' },
        ]}
      />
    </>
  )
}
