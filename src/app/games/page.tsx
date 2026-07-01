import Link from 'next/link'
import type { Metadata } from 'next'
import { FateRoundLogo } from '@/components/FateRoundLogo'
import { GAME_TYPE_DISPLAY_ORDER, gameTypeConfig } from '@/lib/game-types'
import { GAME_LANDING_CONTENT, gameLandingSlug } from '@/lib/game-landing'
import { SITE_NAME, OG_IMAGE, gamesItemListJsonLd, breadcrumbJsonLd } from '@/lib/seo'
import { GamesGrid } from '@/components/GamesGrid'
import { SiteFooter } from '@/components/SiteFooter'

export const metadata: Metadata = {
  title: 'All Party Games',
  description:
    'Browse free online party games on Fate Round — Smash Marry Kill, Would You Rather, Most Likely To, Red Flag Green Flag, and more.',
  alternates: { canonical: '/games' },
  openGraph: {
    title: `All Party Games | ${SITE_NAME}`,
    description:
      'Browse free online party games on Fate Round — Smash Marry Kill, Would You Rather, Most Likely To, Red Flag Green Flag, and more.',
    url: '/games',
    images: [OG_IMAGE],
  },
}

export default function GamesIndexPage() {
  const games = GAME_TYPE_DISPLAY_ORDER.map((type) => ({
    type,
    slug: gameLandingSlug(type),
    content: GAME_LANDING_CONTENT[type],
    cfg: gameTypeConfig(type),
  }))

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: gamesItemListJsonLd() }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'All games', path: '/games' },
          ]),
        }}
      />

      <header className="fixed top-0 inset-x-0 z-40 flex items-center px-4 py-3 pointer-events-none">
        <Link href="/" className="pointer-events-auto">
          <FateRoundLogo className="h-8 w-auto max-w-[9.5rem] sm:max-w-[11rem]" />
        </Link>
      </header>

      <div className="page-wrap min-h-dvh px-4 pt-20 pb-16">
        <div className="relative mx-auto max-w-3xl space-y-10">
          <div
            className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[120%] h-64 opacity-30"
            style={{
              background: 'radial-gradient(ellipse 60% 80% at 50% 0%, rgba(244, 63, 94, 0.15) 0%, transparent 70%)',
            }}
            aria-hidden
          />

          <div className="relative text-center space-y-4">
            <p className="label-caps">{SITE_NAME}</p>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight gradient-title">Party games</h1>
            <p className="text-muted text-sm sm:text-base max-w-md mx-auto leading-relaxed">
              Pick a mode, create a game, share the code. Every game is free and runs in the browser.
            </p>
            <Link href="/create" className="btn-primary btn-fit">
              Create any game
            </Link>
          </div>

          <GamesGrid games={games} />

          <section className="border-t border-theme pt-8 space-y-4 text-muted text-sm sm:text-base leading-relaxed">
            <h2 className="text-lg font-bold text-body">Free online party games — {games.length}+ modes, one place</h2>
            <p>
              {SITE_NAME} brings {games.length}+ multiplayer games into a single browser tab — no sign-up, no download,
              and free forever. Pick a mode, create a game, and share the room code so friends can join from any phone
              or laptop. Everything syncs in real time, so it works over a video call, a Discord server, or a group
              chat.
            </p>
            <p>
              You&apos;ll find classic party games like Smash Marry Kill, Would You Rather, Most Likely To, Red Flag
              Green Flag, Never Have I Ever, and Hot Seat; board and card games including Monopoly, Yahtzee, Whot, Ludo,
              Chess, Checkers, Crazy Eights, Snakes and Ladders, and Scrabble; plus word, trivia, and puzzle games such
              as Codewords, Trivia, Word Hunt, Sudoku, Tic-Tac-Toe, and Bingo. Many modes let you upload your own
              questions or participant lists, so any theme works for birthdays, icebreakers, team socials, or family
              game night.
            </p>
          </section>
        </div>
      </div>

      <SiteFooter />
    </>
  )
}
