import type { Metadata } from 'next'
import { SoloWhotClient } from './SoloWhotClient'
import { SoloSeoFooter } from '../SoloSeoFooter'

/**
 * Solo Whot — practice vs a bot, no room, no realtime.
 *
 * Follows the same shape as `/daily-challenges/[gameType]`: entirely
 * client-driven, no `games` row, no host token, no realtime channels. Progress
 * lives in sessionStorage so a refresh continues the same game.
 */

export const metadata: Metadata = {
  title: 'Play Whot vs Bot — Practice Whot on FateRound',
  description:
    'Practice Whot against a computer opponent. Full rules — Pick 2, Pick 3, Hold On, WHOT wilds. Free, no sign-up, works on any device.',
  robots: { index: true, follow: true },
}

export default function PlaySoloWhotPage() {
  return (
    <>
      <SoloWhotClient />
      <SoloSeoFooter
        heading="Learn more about Whot"
        links={[
          { href: '/play-whot-vs-bot', label: 'About Whot vs bot' },
          { href: '/blog/how-to-play-whot-vs-computer', label: 'How to play Whot vs the computer' },
          { href: '/blog/whot-rules-explained', label: 'Whot rules explained' },
          { href: '/whot-with-bots-online', label: 'Play Whot online with bots' },
          { href: '/games/whot', label: 'Whot game page' },
        ]}
      />
    </>
  )
}
