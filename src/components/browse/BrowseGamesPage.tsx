'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { FateRoundLogo } from '@/components/FateRoundLogo'
import { supabase } from '@/lib/supabase'
import { gameTypeConfig, parseGameType } from '@/lib/game-types'
import { roomGameStatusLabel } from '@/components/rooms/room-game-display'
import type { PublicGame } from '@/lib/game-browse'

const POLL_FALLBACK_MS = 15_000

export function BrowseGamesPage() {
  const [games, setGames] = useState<PublicGame[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)

  const loadGames = useCallback(async (nextCursor?: string | null) => {
    const loadingMore = !!nextCursor
    if (loadingMore) setLoadingMore(true)
    else setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '20' })
      if (nextCursor) params.set('cursor', nextCursor)
      const res = await fetch(`/api/games?${params}`)
      const d = await res.json()
      const rows: PublicGame[] = d.games ?? []
      setGames((prev) => (loadingMore ? [...prev, ...rows] : rows))
      setHasMore(!!d.hasMore)
      setCursor(d.nextCursor ?? null)
    } catch {
      if (!loadingMore) setGames([])
      setHasMore(false)
      setCursor(null)
    } finally {
      if (loadingMore) setLoadingMore(false)
      else setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadGames()
  }, [loadGames])

  // Freshness: Realtime is primary; visibility + slow poll are fallbacks. Any change to a
  // game (new public game, status flip, finish) reloads the first page — cheap and simple.
  useEffect(() => {
    const channel = supabase
      .channel('public_games_browse')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => {
        void loadGames()
      })
      .subscribe()

    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadGames()
    }
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void loadGames()
    }, POLL_FALLBACK_MS)

    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [loadGames])

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-40 flex items-center px-4 py-3 pointer-events-none">
        <Link href="/" className="pointer-events-auto">
          <FateRoundLogo className="h-8 w-auto max-w-[9.5rem] sm:max-w-[11rem]" />
        </Link>
      </header>

      <div className="mx-auto w-full max-w-[1080px] px-4 pt-16 pb-12">
        <div className="mx-auto max-w-xl text-center space-y-1">
          <div className="text-4xl">🌐</div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight gradient-title">Public Games</h1>
          <p className="text-muted text-sm">
            Games happening right now that anyone can jump into. Hosts choose to list a game publicly — private games
            stay code-only.
          </p>
        </div>

        <div className="mt-8">
          {loading ? (
            <p className="text-sm text-muted text-center py-12">Loading public games…</p>
          ) : games.length === 0 ? (
            <div className="glass-card mx-auto max-w-md p-8 text-center space-y-1">
              <p className="text-sm text-body font-semibold">No public games right now</p>
              <p className="text-sm text-muted">Create a game and set it to Public to see it here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {games.map((game) => {
                const cfg = gameTypeConfig(parseGameType(game.game_type))
                const isLobby = game.status === 'waiting'
                const title = game.title?.trim()
                const titleLine = title && title.toLowerCase() !== cfg.label.toLowerCase() ? title : null
                const count =
                  game.max_players != null ? `${game.playerCount}/${game.max_players}` : `${game.playerCount}`
                return (
                  <div
                    key={game.id}
                    className="fr-card flex flex-col gap-3 !p-4"
                    style={{ '--accent': cfg.card.accent } as React.CSSProperties}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-2xl"
                        style={{ background: `color-mix(in srgb, ${cfg.card.accent} 16%, transparent)` }}
                      >
                        {cfg.card.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-[15.5px] font-bold" style={{ color: 'var(--text)' }}>
                          {titleLine ?? cfg.label}
                        </h2>
                        <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-faint)' }}>
                          {titleLine ? cfg.label : cfg.card.vibe}
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {!isLobby && (
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
                        </span>
                      )}
                      {roomGameStatusLabel(game.status)}
                      {` · ${count} player${game.playerCount !== 1 ? 's' : ''}`}
                    </span>

                    <Link
                      href={`/game/${game.id}`}
                      className={`${isLobby ? 'btn-primary' : 'btn-secondary'} mt-auto w-full text-sm py-2`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {isLobby ? 'Join game' : 'Watch'}
                    </Link>
                  </div>
                )
              })}
            </div>
          )}

          {hasMore && !loading && (
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => void loadGames(cursor)}
                disabled={loadingMore}
                className="btn-secondary btn-fit px-6 text-sm py-2"
              >
                {loadingMore ? 'Loading…' : 'Load more games'}
              </button>
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-faint text-xs">
          <Link href="/" className="hover:text-body transition-colors">
            ← Back to home
          </Link>
        </p>
      </div>
    </>
  )
}
