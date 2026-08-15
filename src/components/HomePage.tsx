import Link from 'next/link'
import { GAME_TYPE_OPTIONS, HOMEPAGE_FEATURED_GAMES, gameTypeConfig } from '@/lib/game-types'
import { gameLandingSlug } from '@/lib/game-landing'
import { gameIcon } from '@/lib/game-glyphs'
import { hasSoloPlay } from '@/lib/solo-play'
import { Glyph } from '@/components/icons/Glyph'
import { HomePageJoinPanel } from '@/components/HomePageJoinPanel'
import { SectionHeading } from '@/components/SectionHeading'
import { DailyChallengeSection } from '@/components/daily/DailyChallengeSection'

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

      <DailyChallengeSection />

      <section className="fr-band">
        <div className="mk-wrap">
          <SectionHeading title="Popular games" action={{ href: '/games', label: `See all ${gameModeCount}+ modes` }} />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-4">
            {HOMEPAGE_FEATURED_GAMES.map((type) => {
              const config = gameTypeConfig(type)
              const slug = gameLandingSlug(type)
              return (
                <Link
                  key={type}
                  href={`/games/${slug}`}
                  className="fr-gamecard"
                  style={{ '--accent': config.card.accent } as React.CSSProperties}
                >
                  <span className="fr-glyph">
                    <Glyph icon={gameIcon(type)} size={28} />
                  </span>
                  <h3 className="fr-gamecard__title">{config.label}</h3>
                  <p className="fr-gamecard__tagline line-clamp-2">{config.tagline}</p>
                  <div className="fr-gamecard__meta">
                    <span className="fr-gamecard__players">{config.card.players}</span>
                    {hasSoloPlay(type) ? (
                      // "vs Bot" affordance — only rendered where a solo mode
                      // actually exists (registry: src/lib/solo-play.ts). Follows
                      // the card link to /games/<slug>, which already carries the
                      // "Practice against the bot →" CTA, so this card stays a
                      // single tap target and the landing page still sells the
                      // multiplayer version too.
                      <span className="fr-gamecard__solo" aria-label="Practice against a bot available">
                        vs Bot
                      </span>
                    ) : null}
                    <span className="fr-gamecard__vibe">{config.card.vibe}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </section>
    </>
  )
}
