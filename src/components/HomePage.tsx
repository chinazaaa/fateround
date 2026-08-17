import Link from 'next/link'
import { GAME_TYPE_OPTIONS, HOMEPAGE_FEATURED_GAMES, gameTypeConfig } from '@/lib/game-types'
import { gameLandingSlug } from '@/lib/game-landing'
import { gameIcon } from '@/lib/game-glyphs'
import { soloPlaySlug } from '@/lib/solo-play'
import { Glyph } from '@/components/icons/Glyph'
import { HomePageJoinPanel } from '@/components/HomePageJoinPanel'
import { SectionHeading } from '@/components/SectionHeading'
import { DailyChallengeSection } from '@/components/daily/DailyChallengeSection'
import { LiveGamesStrip } from '@/components/LiveGamesStrip'
import { SubscribeHomeBanner } from '@/components/notifications/SubscribeHomeBanner'

export function HomePage() {
  const gameModeCount = GAME_TYPE_OPTIONS.length

  return (
    // Each section owns its own `.mk-wrap` rather than sharing one outer
    // wrapper, so `.fr-band--sunken` can span the full viewport while the
    // content inside it still stops at the measure.
    <>
      <section className="fr-band fr-band--tight">
        <div className="mk-wrap grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div>
            <h1
              className="fr-display m-0 text-[3.25rem] leading-[0.94] sm:text-[4rem] lg:text-[4.75rem]"
              style={{ color: 'var(--text)' }}
            >
              Play.
              <br />
              Compete.
              <br />
              <span style={{ color: 'var(--primary-strong)' }}>Win.</span>
            </h1>

            <p
              className="mt-[var(--space-5)] max-w-[30rem] text-[1.0625rem] leading-[1.55] lg:text-lg"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--text-muted)' }}
            >
              {gameModeCount}+ game modes, one link. Create a game, share the code, and let the games begin.
            </p>
          </div>

          <HomePageJoinPanel />
        </div>
      </section>

      <SubscribeHomeBanner />

      <LiveGamesStrip />

      <DailyChallengeSection />

      <section className="fr-band">
        <div className="mk-wrap">
          <SectionHeading title="Popular games" action={{ href: '/games', label: `See all ${gameModeCount}+ modes` }} />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-4">
            {HOMEPAGE_FEATURED_GAMES.map((type) => {
              const config = gameTypeConfig(type)
              const slug = gameLandingSlug(type)
              const solo = soloPlaySlug(type)
              // Stretched-link pattern: the outer container isn't a link.
              // The card link is an INVISIBLE overlay stretched across the whole
              // card (`.fr-gamecard__stretched`); the "vs Bot" chip is a real
              // link sitting above it (z-index) so tapping the chip goes to
              // /play-solo/<slug> directly, while tapping anywhere else on the
              // card follows the landing link. Avoids the nested-<a> invalidity
              // of putting a Link inside a Link and needs no JavaScript.
              return (
                <div
                  key={type}
                  className="fr-gamecard fr-gamecard--stretched"
                  style={{ '--accent': config.card.accent } as React.CSSProperties}
                >
                  <Link
                    href={`/games/${slug}`}
                    className="fr-gamecard__stretched"
                    aria-label={`Learn about ${config.label}`}
                  />
                  <span className="fr-glyph">
                    <Glyph icon={gameIcon(type)} size={28} />
                  </span>
                  <h3 className="fr-gamecard__title">{config.label}</h3>
                  <p className="fr-gamecard__tagline line-clamp-2">{config.tagline}</p>
                  <div className="fr-gamecard__meta">
                    <span className="fr-gamecard__players">{config.card.players}</span>
                    {solo ? (
                      // Direct entry to the practice mode — a real link sitting
                      // above the stretched card link. Registry:
                      // src/lib/solo-play.ts.
                      <Link
                        href={`/play-solo/${solo}`}
                        className="fr-gamecard__solo"
                        aria-label={`Practice ${config.label} against a bot`}
                      >
                        vs Bot
                      </Link>
                    ) : null}
                    <span className="fr-gamecard__vibe">{config.card.vibe}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </>
  )
}
