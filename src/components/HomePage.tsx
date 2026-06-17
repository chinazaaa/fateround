'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { HOMEPAGE_FEATURED_GAMES, gameTypeConfig } from '@/lib/game-types'
import { gameLandingSlug } from '@/lib/game-landing'
import { GameTypeModal } from '@/components/GameTypeModal'
import { FateRoundLogo } from '@/components/FateRoundLogo'
import type { GameType } from '@/types'

export function HomePage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [showGameTypes, setShowGameTypes] = useState(false)

  const join = () => {
    const c = code.trim().toUpperCase()
    if (c.length >= 4) router.push(`/game/${c}`)
  }

  const startCreate = (type?: GameType) => {
    if (type) {
      router.push(`/create?type=${type}`)
    } else {
      setShowGameTypes(true)
    }
  }

  const featuredTypes = HOMEPAGE_FEATURED_GAMES

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-40 flex items-center px-4 py-3 pointer-events-none">
        <Link href="/" className="pointer-events-auto">
          <FateRoundLogo className="h-8 w-auto max-w-[9.5rem] sm:max-w-[11rem]" />
        </Link>
      </header>

      <div className="relative z-10 flex flex-col items-center px-4 pt-11 sm:pt-12 pb-2">
        <div className="w-full max-w-sm flex flex-col gap-2 sm:gap-2.5">
          <div className="text-center space-y-1 shrink-0">
            <h1 className="text-[1.875rem] sm:text-[2.25rem] font-black tracking-tighter leading-[0.92] gradient-title">
              Vote.
              <br />
              Laugh.
              <br />
              Reveal.
            </h1>

            <p className="text-muted text-xs sm:text-sm leading-snug max-w-xs mx-auto">
              Six game modes, one link. Create a room, share the code, and let the chaos begin.
            </p>
          </div>

          <div className="glass-card-strong p-3 sm:p-4 space-y-2 shrink-0">
            <button type="button" onClick={() => startCreate()} className="btn-primary">
              Create a Game
            </button>

            <div className="flex items-center gap-2">
              <div className="divider-soft" />
              <span className="text-faint text-[10px] sm:text-xs font-medium tracking-widest uppercase shrink-0">or join</span>
              <div className="divider-soft" />
            </div>

            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && join()}
                placeholder="Enter code"
                maxLength={6}
                aria-label="Game room code"
                className="input-field flex-1 text-center text-lg sm:text-xl tracking-[0.2em] font-mono font-bold py-2.5"
              />
              <button type="button" onClick={join} disabled={code.length < 4} className="btn-secondary shrink-0 px-4 sm:px-5">
                Join
              </button>
            </div>
          </div>

          <div className="space-y-1.5 shrink-0">
            <p className="label-caps text-center text-[10px] sm:text-xs">Popular games</p>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {featuredTypes.map((type) => {
                const cfg = gameTypeConfig(type)
                const slug = gameLandingSlug(type)
                return (
                  <Link
                    key={type}
                    href={`/games/${slug}`}
                    className="glass-card glass-card-interactive flex flex-col items-center gap-1 p-2 sm:p-3.5 text-center no-underline"
                    style={{ '--accent': cfg.card.accent } as React.CSSProperties}
                  >
                    <span
                      className="flex h-8 w-8 sm:h-11 sm:w-11 items-center justify-center rounded-xl sm:rounded-2xl text-lg sm:text-2xl"
                      style={{ background: cfg.card.accentSoft }}
                    >
                      {cfg.card.emoji}
                    </span>
                    <span className="text-[0.625rem] sm:text-xs font-semibold leading-tight text-balance">
                      {cfg.label}
                    </span>
                  </Link>
                )
              })}
            </div>
            <Link
              href="/games"
              className="block w-full text-center text-faint text-[11px] sm:text-xs hover:text-[var(--foreground)] transition-colors pt-0.5"
            >
              See all game modes →
            </Link>
          </div>

          <div className="shrink-0 flex items-center justify-center gap-3 sm:gap-4 text-[11px] sm:text-xs text-faint pt-0.5">
            <button
              type="button"
              onClick={() => router.push('/history')}
              className="hover:text-[var(--foreground)] transition-colors"
            >
              Game history
            </button>
            <span aria-hidden>·</span>
            <Link href="/updates" className="hover:text-[var(--foreground)] transition-colors">
              What&apos;s new
            </Link>
            <span aria-hidden>·</span>
            <span>No sign-up required</span>
          </div>
        </div>
      </div>

      <GameTypeModal
        open={showGameTypes}
        onClose={() => setShowGameTypes(false)}
        onSelect={(type) => router.push(`/create?type=${type}`)}
      />
    </>
  )
}
