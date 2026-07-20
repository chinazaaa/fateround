'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { GameType } from '@/types'
import {
  acknowledgeMature,
  hasAcknowledgedMature,
  isMatureGame,
  MATURE_NOTICE_BODY,
  MATURE_NOTICE_TITLE,
  matureGameReason,
} from '@/lib/game-maturity'

/**
 * Content warning shown before a player sees a mature game.
 *
 * Rendered as an overlay rather than a `return` guard on purpose: the game underneath stays
 * mounted, so joining, realtime subscriptions and the host's round timer all keep running
 * while the notice is up. A blocking guard would desync anyone who paused to read it.
 *
 * This is an acknowledgement, not age verification — see `game-maturity.ts` for why we do not
 * collect a date of birth. It covers hosts and joiners alike because it sits on the game
 * route every player passes through, not on the create screen only.
 */
export function MatureGameGate({ gameType }: { gameType: GameType | string | null | undefined }) {
  const router = useRouter()
  const mature = !!gameType && isMatureGame(gameType as GameType)
  // Start acknowledged so the notice never flashes before localStorage is readable on the
  // client; the effect below corrects it on mount.
  const [acked, setAcked] = useState(true)

  useEffect(() => {
    if (!mature) return
    setAcked(hasAcknowledgedMature())
  }, [mature])

  if (!mature || acked) return null

  const accept = () => {
    acknowledgeMature()
    setAcked(true)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fr-mature-title"
      className="fixed inset-0 z-[200] flex items-end justify-center p-4 sm:items-center"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(3px)' }}
    >
      <div
        className="w-full max-w-[420px] rounded-[20px] p-6 text-center"
        style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border, #e5e5e5)' }}
      >
        <span
          className="inline-flex h-12 w-12 items-center justify-center rounded-full text-2xl"
          style={{ background: 'color-mix(in srgb, var(--danger, #dc2626) 14%, transparent)' }}
          aria-hidden
        >
          🔞
        </span>
        <h2
          id="fr-mature-title"
          className="mt-3 text-xl font-bold tracking-tight"
          style={{ color: 'var(--text, #111)' }}
        >
          {MATURE_NOTICE_TITLE}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed" style={{ color: 'var(--text-muted, #555)' }}>
          {matureGameReason(gameType as GameType)}
        </p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-faint, #777)' }}>
          {MATURE_NOTICE_BODY}
        </p>

        <button
          type="button"
          onClick={accept}
          autoFocus
          className="mt-5 h-12 w-full rounded-full text-[15px] font-bold"
          style={{ background: 'var(--primary, #6d28d9)', color: 'var(--primary-contrast, #fff)' }}
        >
          I&rsquo;m 18 or older — continue
        </button>
        <button
          type="button"
          onClick={() => router.push('/games')}
          className="mt-2 h-11 w-full rounded-full text-sm font-semibold"
          style={{ color: 'var(--text-muted, #555)' }}
        >
          Take me back to the games
        </button>
      </div>
    </div>
  )
}
