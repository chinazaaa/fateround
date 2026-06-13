'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { GAME_TYPE_OPTIONS, gameTypeConfig } from '@/lib/game-types'
import { GameTypeModal } from '@/components/GameTypeModal'
import type { GameType } from '@/types'

export default function Home() {
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

  const featuredTypes = GAME_TYPE_OPTIONS.filter((t) => gameTypeConfig(t).card.featured)

  return (
    <>
      <div className="page-wrap h-dvh max-h-dvh overflow-hidden flex flex-col items-center justify-center px-4 pt-12 pb-6">
        <div className="relative z-10 w-full max-w-sm flex flex-col gap-6">
          {/* Hero */}
          <div className="text-center space-y-3 shrink-0">
            <div className="premium-badge mx-auto">
              <span>🎉</span>
              <span>Party Games</span>
            </div>

            <h1 className="text-[2.75rem] sm:text-5xl font-black tracking-tighter leading-[0.95] gradient-title">
              Vote.
              <br />
              Laugh.
              <br />
              Reveal.
            </h1>

            <p className="text-muted text-sm leading-relaxed max-w-xs mx-auto">
              Six game modes, one link. Create a room, share the code, and let the chaos begin.
            </p>
          </div>

          {/* Featured game types */}
          <div className="space-y-2.5 shrink-0">
            <p className="label-caps text-center">Popular games</p>
            <div className="grid grid-cols-3 gap-2">
              {featuredTypes.map((type) => {
                const cfg = gameTypeConfig(type)
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => startCreate(type)}
                    className="glass-card glass-card-interactive flex flex-col items-center gap-2 p-3.5 text-center"
                    style={{ '--accent': cfg.card.accent } as React.CSSProperties}
                  >
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-2xl text-2xl"
                      style={{ background: cfg.card.accentSoft }}
                    >
                      {cfg.card.emoji}
                    </span>
                    <span className="text-xs font-semibold leading-tight">
                      {cfg.label.split(' ').slice(0, 2).join(' ')}
                    </span>
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => setShowGameTypes(true)}
              className="w-full text-center text-faint text-xs hover:text-[var(--foreground)] transition-colors"
            >
              See all 5 game modes →
            </button>
          </div>

          {/* Action card */}
          <div className="glass-card-strong p-5 space-y-3.5 shrink-0">
            <button type="button" onClick={() => startCreate()} className="btn-primary">
              Create a Game
            </button>

            <div className="flex items-center gap-3">
              <div className="divider-soft" />
              <span className="text-faint text-xs font-medium tracking-widest uppercase shrink-0">or join</span>
              <div className="divider-soft" />
            </div>

            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && join()}
                placeholder="Enter code"
                maxLength={6}
                className="input-field flex-1 text-center text-xl tracking-[0.25em] font-mono font-bold"
              />
              <button type="button" onClick={join} disabled={code.length < 4} className="btn-secondary shrink-0 px-5">
                Join
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 flex items-center justify-center gap-4 text-xs text-faint">
            <button
              type="button"
              onClick={() => router.push('/history')}
              className="hover:text-[var(--foreground)] transition-colors"
            >
              Game history
            </button>
            <span>·</span>
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
