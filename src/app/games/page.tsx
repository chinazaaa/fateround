import Link from 'next/link'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { GAME_TYPE_DISPLAY_ORDER, gameTypeConfig } from '@/lib/game-types'
import { GAME_LANDING_CONTENT, gameLandingSlug } from '@/lib/game-landing'
import { SITE_NAME, OG_IMAGE, gamesItemListJsonLd, breadcrumbJsonLd } from '@/lib/seo'
import { GamesGrid } from '@/components/GamesGrid'
import { Glyph } from '@/components/icons/Glyph'
import { UI_ICONS } from '@/lib/game-glyphs'
import { MarketingHeader } from '@/components/MarketingHeader'
import { SiteFooter } from '@/components/SiteFooter'

export const metadata: Metadata = {
  title: 'All Party Games',
  description:
    'Browse free online party games on FateRound — Smash Marry Kill, Would You Rather, Most Likely To, Red Flag Green Flag, and more.',
  alternates: { canonical: '/games' },
  openGraph: {
    title: `All Party Games | ${SITE_NAME}`,
    description:
      'Browse free online party games on FateRound — Smash Marry Kill, Would You Rather, Most Likely To, Red Flag Green Flag, and more.',
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

        <main className="flex-1">
          {/* Same band structure as the homepage: full-bleed sections whose
              contents stop at the shared measure, rather than one narrow column
              floating under a full-width header. */}
          <section className="fr-band fr-band--tight">
            <div className="mk-wrap">
              <div className="text-center mb-6">
                <span className="fr-glyph">
                  <Glyph icon={UI_ICONS.games} size={26} />
                </span>
                <h1
                  className="mx-0 mb-0 mt-3 text-[2.25rem] tracking-[-0.035em] sm:text-5xl"
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text)' }}
                >
                  Party games
                </h1>
                <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                  47+ party, board, and word games for your group. Create a room, share the link, and play in seconds.
                </p>
              </div>

              <Suspense fallback={null}>
                <GamesGrid games={games} />
              </Suspense>
            </div>
          </section>
        </main>

        <SiteFooter />
      </div>
    </>
  )
}
