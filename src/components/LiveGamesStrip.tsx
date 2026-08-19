'use client'

/**
 * LiveGamesStrip — homepage "Live games" preview section (web).
 *
 * Reads the same public `GET /api/games` cursor feed the /browse page uses.
 * Renders up to 5 cards with an emoji, label, host name, count, and Join button.
 * Auto-hides when zero games are live so a fresh visitor never sees an empty
 * box. Realtime + poll fallback keep it in sync with `/browse`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { gameTypeConfig, parseGameType } from '@/lib/game-types'
import { getPlayerSession } from '@/lib/utils'
import type { PublicGame } from '@/lib/game-browse'

const PREVIEW_LIMIT = 5
const POLL_FALLBACK_MS = 15_000

export function LiveGamesStrip() {
  const [games, setGames] = useState<PublicGame[]>([])
  const [loaded, setLoaded] = useState(false)
  // Uppercased set of game codes this browser has a player session for, so we
  // can flip the CTA to "Continue" on games the viewer has already joined.
  const [joinedSet, setJoinedSet] = useState<Set<string>>(() => new Set())
  const inFlight = useRef(false)

  const load = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const res = await fetch(`/api/games?limit=${PREVIEW_LIMIT}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setGames((data.games ?? []) as PublicGame[])
    } catch {
      // Silent — the strip auto-hides on empty/error, so no error UI needed.
    } finally {
      setLoaded(true)
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('public_games_home_strip')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => {
        void load()
      })
      .subscribe()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, POLL_FALLBACK_MS)
    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [load])

  useEffect(() => {
    const compute = () => {
      const joined = new Set<string>()
      for (const g of games) {
        if (getPlayerSession(g.id)) joined.add(g.id.toUpperCase())
      }
      setJoinedSet(joined)
    }
    compute()
    const handler = () => compute()
    window.addEventListener('kmk-player-session', handler)
    return () => window.removeEventListener('kmk-player-session', handler)
  }, [games])

  // Auto-hide: never render an empty strip. On first load we wait for the fetch
  // so we don't briefly render then disappear.
  if (!loaded || games.length === 0) return null

  const shown = games.slice(0, PREVIEW_LIMIT)

  return (
    <section className="fr-band fr-band--tight">
      <div className="mk-wrap">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="m-0 text-lg font-black tracking-tight" style={{ color: 'var(--text)' }}>
            🌐 Live games
          </h2>
          <Link href="/browse" className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--primary)' }}>
            See all live games →
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((game) => {
            const cfg = gameTypeConfig(parseGameType(game.game_type))
            const count = game.max_players != null ? `${game.playerCount}/${game.max_players}` : `${game.playerCount}`
            const isLobby = game.status === 'waiting'
            const isActive = game.status === 'active'
            const isFull = game.max_players != null && game.playerCount >= game.max_players
            const lateJoinable = isActive && game.allow_late_players === true && !isFull
            const alreadyJoined = joinedSet.has(game.id.toUpperCase())
            const stateLine = isLobby
              ? isFull
                ? 'Lobby full'
                : 'In lobby'
              : lateJoinable
                ? 'Started · join or watch'
                : isFull
                  ? 'Started · full'
                  : 'Started · watch'
            const cta = alreadyJoined ? 'Continue' : isLobby && !isFull ? 'Join' : lateJoinable ? 'Join' : 'Watch'
            const ctaClass =
              alreadyJoined || (isLobby && !isFull) || lateJoinable ? 'btn-primary' : 'btn-secondary'
            return (
              <div
                key={game.id}
                className="fr-card flex items-center gap-3 !p-3"
                style={{ '--accent': cfg.card.accent } as React.CSSProperties}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-xl"
                  style={{ background: `color-mix(in srgb, ${cfg.card.accent} 16%, transparent)` }}
                >
                  {cfg.card.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold" style={{ color: 'var(--text)' }}>
                    {cfg.label}
                  </div>
                  <div className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                    {stateLine} · {count} player{game.playerCount === 1 ? '' : 's'}
                  </div>
                </div>
                <Link
                  href={`/game/${game.id}`}
                  className={`${ctaClass} btn-fit px-3 py-1.5 text-xs`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {cta}
                </Link>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
