'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { GameType } from '@/types'
import { gameTypeCreateParam } from '@/lib/game-types'

const MarketingGameTypeModal = dynamic(
  () => import('@/components/MarketingGameTypeModal').then((m) => m.MarketingGameTypeModal),
  { ssr: false }
)

const displayFont = { fontFamily: 'var(--font-display)' }

type Props = {
  joinInputId: string
}

export function HomePageJoinPanel({ joinInputId }: Props) {
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

        <div className="fr-code-field">
          <input
            id={joinInputId}
            ref={joinRef}
            className="fr-input fr-input--code fr-code-field__input"
            placeholder="CODE"
            maxLength={6}
            aria-label="Game room code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && join()}
          />
          <button type="button" className="fr-code-go" disabled={!canJoin} onClick={join} aria-label="Join game">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 min-[460px]:grid-cols-2">
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
            className="relative flex min-w-0 items-center gap-3 overflow-hidden rounded-[var(--radius-lg)] p-3.5 no-underline"
            style={{ background: 'var(--rose-600)', color: '#fff', boxShadow: 'var(--shadow-md)' }}
          >
            <span className="text-[26px] leading-none">🏆</span>
            <div className="min-w-0">
              <b className="block text-[15px]" style={displayFont}>
                Tournaments
              </b>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.9)' }}>
                Bracket night
              </span>
            </div>
          </Link>
        </div>

        <Link href="/browse" className="fr-card fr-card--interactive mt-3 flex items-center gap-3 !p-3.5 no-underline">
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

      {showGameTypes && (
        <MarketingGameTypeModal
          open={showGameTypes}
          onClose={() => setShowGameTypes(false)}
          onSelect={(type: GameType) => router.push(`/create?type=${gameTypeCreateParam(type)}`)}
        />
      )}
    </>
  )
}
