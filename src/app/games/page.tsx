import Link from 'next/link'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { GAME_TYPE_DISPLAY_ORDER, gameTypeConfig } from '@/lib/game-types'
import { GAME_LANDING_CONTENT, gameLandingSlug } from '@/lib/game-landing'
import { SITE_NAME, OG_IMAGE, gamesItemListJsonLd, breadcrumbJsonLd } from '@/lib/seo'
import { GamesGrid } from '@/components/GamesGrid'
import { MarketingHeader } from '@/components/MarketingHeader'
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

      <div className="fr-site flex min-h-dvh flex-col">
        <MarketingHeader />

        <main className="mk-wrap flex-1 pb-4">
          {/* Hero */}
          <div className="pt-9 pb-7 text-center">
            <p className="label-caps">{SITE_NAME}</p>
            <h1
              className="mx-0 mb-2.5 mt-3 text-[2.25rem] tracking-[-0.035em] sm:text-5xl"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text)' }}
            >
              Party games
            </h1>
            <p className="mx-auto mb-5 max-w-[30rem] text-base leading-[1.55]" style={{ color: 'var(--text-muted)' }}>
              Pick a mode, create a game, share the code. Every game is free and runs in the browser.
            </p>
            <Link href="/create" className="fr-btn fr-btn--primary fr-btn--lg">
              Create any game
            </Link>
          </div>

          <Suspense fallback={null}>
            <GamesGrid games={games} />
          </Suspense>
        </main>

        <section className="mk-seo">
          <div className="mk-wrap">
            <div className="blk">
              <h2>Free online party games — {games.length}+ modes, one place</h2>
              <p>
                {SITE_NAME} brings {games.length}+ multiplayer games into a single browser tab — no sign-up, no
                download, and free forever. Pick a mode, create a game, and share the room code so friends can join from
                any phone or laptop. Everything syncs in real time, so it works over a video call, a Discord server, or
                a group chat.
              </p>
            </div>
            <div className="blk">
              <p>
                You&apos;ll find classic party games like Smash Marry Kill, Would You Rather, Most Likely To, Red Flag
                Green Flag, Never Have I Ever, and Hot Seat; board and card games including Monopoly, Yahtzee, Whot,
                Ludo, Chess, Checkers, Crazy Eights, UNO, Snakes and Ladders, and Scrabble; plus word, trivia, and
                puzzle games such as Codewords, Trivia, Word Hunt, Sudoku, Tic-Tac-Toe, and Bingo. Many modes let you
                upload your own questions or participant lists, so any theme works for birthdays, icebreakers, team
                socials, or family game night.
              </p>
            </div>
          </div>
        </section>

        <SiteFooter />
      </div>
    </>
  )
}
