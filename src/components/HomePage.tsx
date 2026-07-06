'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { GAME_TYPE_OPTIONS, HOMEPAGE_FEATURED_GAMES, gameTypeConfig, gameTypeCreateParam } from '@/lib/game-types'
import { gameLandingSlug } from '@/lib/game-landing'
import { MarketingGameTypeModal } from '@/components/MarketingGameTypeModal'

const displayFont = { fontFamily: 'var(--font-display)' }

export function HomePage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [showGameTypes, setShowGameTypes] = useState(false)
  const joinRef = useRef<HTMLInputElement>(null)

  const join = () => {
    const c = code.trim().toUpperCase()
    if (c.length >= 4) router.push(`/game/${c}`)
  }

  const canJoin = code.trim().length >= 4

  return (
    <>
      <div className="mk-wrap pt-2 pb-4">
        {/* Hero */}
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
              {GAME_TYPE_OPTIONS.length}+ game modes, one link. Create a game, share the code, and let the games begin —
              everyone joins from their own phone.
            </p>

            <div className="mt-6 hidden flex-wrap gap-3 lg:flex">
              <button
                type="button"
                className="fr-btn fr-btn--primary fr-btn--lg"
                onClick={() => setShowGameTypes(true)}
              >
                Create a Game
              </button>
              <button
                type="button"
                className="fr-btn fr-btn--secondary fr-btn--lg"
                onClick={() => joinRef.current?.focus()}
              >
                I have a code
              </button>
            </div>
          </div>

          {/* Start-playing card */}
          <div className="fr-card fr-card--xl" style={{ boxShadow: 'var(--shadow-lg)' }}>
            <p
              className="mb-3.5 text-xl tracking-[-0.02em]"
              style={{ ...displayFont, fontWeight: 800, color: 'var(--text)' }}
            >
              Start playing in seconds
            </p>

            <button
              type="button"
              className="fr-btn fr-btn--primary fr-btn--lg fr-btn--block"
              onClick={() => setShowGameTypes(true)}
            >
              Create a Game
            </button>

            <div className="my-3 flex items-center gap-3">
              <span className="h-px flex-1" style={{ background: 'var(--border)' }} />
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: 'var(--text-faint)' }}
              >
                or join
              </span>
              <span className="h-px flex-1" style={{ background: 'var(--border)' }} />
            </div>

            <div className="flex gap-2.5">
              <input
                ref={joinRef}
                className="fr-input fr-input--code min-w-0 flex-1"
                placeholder="ENTER CODE"
                maxLength={6}
                aria-label="Game room code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && join()}
              />
              <button
                type="button"
                className="fr-btn fr-btn--secondary fr-btn--lg shrink-0"
                disabled={!canJoin}
                onClick={join}
              >
                Join
              </button>
            </div>

            {/* Rooms + Tournaments */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Link
                href="/rooms"
                className="fr-card fr-card--interactive flex min-w-0 items-center gap-3 !p-3.5 no-underline"
              >
                <span className="text-[26px] leading-none">🏠</span>
                <div className="min-w-0">
                  <b className="block text-sm" style={{ color: 'var(--text)' }}>
                    Game Rooms
                  </b>
                  <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                    A space for your crew
                  </span>
                </div>
              </Link>
              <Link
                href="/tournament"
                className="relative flex min-w-0 items-center gap-2 overflow-hidden rounded-[var(--radius-lg)] p-3.5 no-underline"
                style={{ background: 'var(--rose-600)', color: '#fff', boxShadow: 'var(--shadow-md)' }}
              >
                <span className="text-[22px] leading-none">🏆</span>
                <div className="min-w-0">
                  <b className="block text-[13px]" style={displayFont}>
                    Tournaments
                  </b>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.9)' }}>
                    Bracket night
                  </span>
                </div>
              </Link>
            </div>

            <Link
              href="/browse"
              className="fr-card fr-card--interactive mt-3 flex items-center gap-3 !p-3.5 no-underline"
            >
              <span className="text-[26px] leading-none">🌐</span>
              <div className="min-w-0 flex-1">
                <b className="block text-sm" style={{ color: 'var(--text)' }}>
                  Browse public games
                </b>
                <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                  Jump into games happening now
                </span>
              </div>
            </Link>
          </div>
        </section>

        {/* Popular games */}
        <div className="mt-10 mb-4 flex items-baseline justify-between">
          <h2
            className="m-0 text-[22px] tracking-[-0.02em]"
            style={{ ...displayFont, fontWeight: 800, color: 'var(--text)' }}
          >
            Popular games
          </h2>
          <Link href="/games" className="text-sm font-semibold no-underline" style={{ color: 'var(--primary-strong)' }}>
            See all {GAME_TYPE_OPTIONS.length}+ modes →
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

      <MarketingGameTypeModal
        open={showGameTypes}
        onClose={() => setShowGameTypes(false)}
        onSelect={(type) => router.push(`/create?type=${gameTypeCreateParam(type)}`)}
      />
    </>
  )
}
