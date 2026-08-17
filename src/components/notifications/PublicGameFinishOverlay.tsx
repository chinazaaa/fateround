'use client'

/**
 * PublicGameFinishOverlay — floating post-join Subscribe nudge for the web.
 *
 * Sits on the shared /game/[code] route (src/app/game/[code]/page.tsx) so every
 * web game gets the same one-shot finish-screen nudge without editing each
 * per-game view (Ludo/Monopoly/PingPong/…). Polls the game's status + type,
 * renders a small floating card once status flips to 'finished', and stays
 * hidden forever after the user dismisses or taps Subscribe.
 *
 * One shot per browser install (localStorage-persisted). Fires regardless of
 * the home Subscribe banner state, matching mobile PostJoinSubscribeNudge.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { gameTypeConfig, parseGameType } from '@/lib/game-types'

const FIRED_KEY = 'fr:post-join-subscribe-nudge-fired'
const POLL_MS = 5000

export function PublicGameFinishOverlay({ gameCode }: { gameCode: string }) {
  const [finished, setFinished] = useState(false)
  const [gameType, setGameType] = useState<string | null>(null)
  const [hidden, setHidden] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(FIRED_KEY) === '1')
    } catch {
      setHidden(false)
    }
  }, [])

  // Poll cheaply — the shared page already talks to Supabase for other
  // reasons, so a 5-second status poll is dwarfed by the rest of the traffic.
  // Realtime would be over-engineering here: the finish transition happens
  // once, and a delayed nudge is not a bug.
  useEffect(() => {
    if (hidden !== false) return undefined
    let cancelled = false
    const check = async () => {
      const { data } = await supabase.from('games').select('status, game_type').eq('id', gameCode).maybeSingle()
      if (cancelled || !data) return
      setGameType((prev) => prev ?? (data.game_type as string | null))
      if (data.status === 'finished') setFinished(true)
    }
    void check()
    const t = setInterval(check, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [gameCode, hidden])

  if (hidden !== false || !finished || !gameType) return null

  const cfg = gameTypeConfig(parseGameType(gameType))
  const label = cfg.label

  const markFired = () => {
    setHidden(true)
    try {
      window.localStorage.setItem(FIRED_KEY, '1')
    } catch {
      // Best-effort — hiding locally is enough.
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 pointer-events-none">
      <div className="glass-card-strong flex max-w-md items-center gap-3 !p-3 pointer-events-auto">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-xl"
          style={{ background: `color-mix(in srgb, ${cfg.card.accent} 16%, transparent)` }}
        >
          {cfg.card.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-body">Want a ping when new {label} games open?</p>
          <Link
            href={`/notifications?type=${encodeURIComponent(gameType)}`}
            onClick={markFired}
            className="mt-0.5 inline-block text-xs font-semibold"
            style={{ color: 'var(--primary)' }}
          >
            Subscribe →
          </Link>
        </div>
        <button type="button" onClick={markFired} aria-label="Dismiss" className="text-xl text-muted hover:text-body">
          ×
        </button>
      </div>
    </div>
  )
}
