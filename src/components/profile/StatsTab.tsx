'use client'

import { useCallback, useEffect, useState } from 'react'
import { authHeaders } from '@/lib/identity'
import { GAME_TYPE_CONFIG } from '@/lib/game-types'
import type { GameType } from '@/types'

type GameRow = {
  gameType: string
  label: string
  emoji: string
  gamesPlayed: number
  gamesWon: number
}

type HistoryEntry = {
  id: string
  gameType: string
  finishedAt: string
  createdAt: string
  playerCount: number
  sessionsPlayed: number
  won: boolean | null
  winnerName: string | null
  allWinnerNames: string[]
}

function gameEmoji(gameType: string): string {
  return GAME_TYPE_CONFIG[gameType as GameType]?.card?.emoji ?? '🎮'
}

function gameLabel(gameType: string): string {
  return GAME_TYPE_CONFIG[gameType as GameType]?.label ?? gameType
}

function relativeDate(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const seconds = Math.floor((now - then) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function StatsTab({ games, myName }: { games: GameRow[]; myName: string | null }) {
  const totalPlayed = games.reduce((s, g) => s + g.gamesPlayed, 0)
  const totalWon = games.reduce((s, g) => s + g.gamesWon, 0)
  const winRate = totalPlayed > 0 ? Math.round((totalWon / totalPlayed) * 100) : 0

  const topGames = [...games].sort((a, b) => b.gamesPlayed - a.gamesPlayed).slice(0, 5)

  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [cursorId, setCursorId] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchHistory = useCallback(async (c?: string, cId?: string) => {
    try {
      const headers = await authHeaders()
      if (!headers) {
        setHistoryLoading(false)
        return
      }
      const params = new URLSearchParams()
      if (c) params.set('cursor', c)
      if (cId) params.set('cursorId', cId)
      const qs = params.toString()
      const url = qs ? `/api/profile/history?${qs}` : '/api/profile/history'
      const res = await fetch(url, { headers })
      if (!res.ok) return
      const json = await res.json()
      setHistory((prev) => (c ? [...prev, ...json.games] : json.games))
      setCursor(json.nextCursor)
      setCursorId(json.nextCursorId)
    } catch {
      // Network failures silently stop pagination.
    } finally {
      setHistoryLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    void fetchHistory()
  }, [fetchHistory])

  const loadMore = () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    void fetchHistory(cursor, cursorId ?? undefined)
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="glass-card p-3 text-center sm:p-4">
          <p className="text-2xl font-black sm:text-3xl">{totalPlayed}</p>
          <p className="text-faint mt-0.5 text-[11px] uppercase tracking-wide">Games played</p>
        </div>
        <div className="glass-card p-3 text-center sm:p-4">
          <p className="text-2xl font-black sm:text-3xl">{totalWon}</p>
          <p className="text-faint mt-0.5 text-[11px] uppercase tracking-wide">Games won</p>
        </div>
        <div className="glass-card p-3 text-center sm:p-4">
          <p className="text-2xl font-black sm:text-3xl">{winRate}%</p>
          <p className="text-faint mt-0.5 text-[11px] uppercase tracking-wide">Win rate</p>
        </div>
      </div>

      {topGames.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Most played</h3>
          <div className="space-y-1.5">
            {topGames.map((g) => {
              const wr = g.gamesPlayed > 0 ? Math.round((g.gamesWon / g.gamesPlayed) * 100) : 0
              return (
                <div key={g.gameType} className="surface-inset flex items-center gap-3 px-4 py-2.5">
                  <span className="text-lg" aria-hidden>
                    {g.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{g.label}</p>
                    <p className="text-faint text-xs">
                      {g.gamesPlayed} played · {wr}% won
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold">Recent games</h3>
        {historyLoading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="surface-inset h-14 animate-pulse" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="glass-card p-4 text-sm text-muted">No game history yet.</p>
        ) : (
          <div className="space-y-1.5">
            {history.map((h) => (
              <div key={`${h.id}-${h.finishedAt}`} className="surface-inset flex items-start gap-3 px-4 py-2.5">
                <span className="mt-0.5 text-lg" aria-hidden>
                  {gameEmoji(h.gameType)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{gameLabel(h.gameType)}</p>
                  {h.allWinnerNames.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {h.allWinnerNames.map((name, idx) => {
                        const isMe = myName !== null && name.toLowerCase() === myName.toLowerCase()
                        return (
                          <span
                            key={idx}
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              isMe ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-inset-bg)] text-muted'
                            }`}
                          >
                            {isMe ? `${name} (you)` : name}
                          </span>
                        )
                      })}
                    </div>
                  ) : (
                    <span className="mt-1 inline-block rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold text-muted">
                      No winner
                    </span>
                  )}
                  <p className="text-faint mt-1 text-xs">
                    {h.playerCount} player{h.playerCount !== 1 ? 's' : ''}
                    {h.sessionsPlayed > 1 ? ` · ${h.sessionsPlayed} rounds` : ''}
                    {' · '}
                    {h.id}
                  </p>
                </div>
                <p className="text-faint mt-0.5 shrink-0 text-xs">{relativeDate(h.finishedAt)}</p>
              </div>
            ))}
            {cursor && (
              <button
                type="button"
                className="btn-secondary w-full py-2 text-sm"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
