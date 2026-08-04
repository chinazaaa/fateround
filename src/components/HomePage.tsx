import Link from 'next/link'
import { GAME_TYPE_OPTIONS, HOMEPAGE_FEATURED_GAMES, gameTypeConfig } from '@/lib/game-types'
import { gameLandingSlug } from '@/lib/game-landing'
import { HomePageHeroActions } from '@/components/HomePageHeroActions'
import { HomePageJoinPanel } from '@/components/HomePageJoinPanel'
import { DailyChallengeSection } from '@/components/daily/DailyChallengeSection'

const displayFont = { fontFamily: 'var(--font-display)' }
const JOIN_INPUT_ID = 'home-join-code'

export function HomePage() {
  const gameModeCount = GAME_TYPE_OPTIONS.length

  return (
    <div className="mk-wrap pt-2 pb-4">
      <section className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 pt-6 lg:pt-10">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="fr-badge fr-badge--soft fr-badge--caps">No sign-up</span>
            <span className="fr-badge fr-badge--soft fr-badge--caps">No download</span>
            <span className="fr-badge fr-badge--soft fr-badge--caps">Free forever</span>
          </div>

          <h1
            className="m-0 text-[3.25rem] leading-[0.94] tracking-[-0.035em] sm:text-[4rem] lg:text-[4.75rem]"
            style={{ ...displayFont, fontWeight: 800, color: 'var(--text)' }}
          >
            Play.
            <br />
            Compete.
            <br />
            <span style={{ color: 'var(--primary-strong)' }}>Win.</span>
          </h1>

          <p
            className="mt-5 max-w-[30rem] text-[1.0625rem] leading-[1.55] lg:text-lg"
            style={{ color: 'var(--text-muted)' }}
          >
            {gameModeCount}+ game modes, one link. Create a game, share the code, and let the games begin — everyone
            joins from their own phone.
          </p>

          <HomePageHeroActions joinInputId={JOIN_INPUT_ID} />
        </div>

        <HomePageJoinPanel joinInputId={JOIN_INPUT_ID} />
      </section>

      <DailyChallengeSection />

      <div className="mt-10 mb-4 flex items-baseline justify-between">
        <h2
          className="m-0 text-[22px] tracking-[-0.02em]"
          style={{ ...displayFont, fontWeight: 800, color: 'var(--text)' }}
        >
          Popular games
        </h2>
        <Link href="/games" className="text-sm font-semibold no-underline" style={{ color: 'var(--primary-strong)' }}>
          See all {gameModeCount}+ modes →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-4">
        {HOMEPAGE_FEATURED_GAMES.map((type) => {
          const cfg = gameTypeConfig(type)
          const slug = gameLandingSlug(type)
          return (
            <Link
              key={type}
              href={`/games/${slug}`}
              className="fr-gamecard"
              style={{ '--accent': cfg.card.accent } as React.CSSProperties}
            >
              <span className="fr-gamecard__emoji">{cfg.card.emoji}</span>
              <h3 className="fr-gamecard__title">{cfg.label}</h3>
              <p className="fr-gamecard__tagline line-clamp-2">{cfg.tagline}</p>
              <div className="fr-gamecard__meta">
                <span className="fr-gamecard__players">{cfg.card.players}</span>
                <span className="fr-gamecard__vibe">{cfg.card.vibe}</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
