'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { addDays, watToday, formatDayLabel } from '@/lib/community-dates'
import {
  DAILY_GAME_LABELS,
  DAILY_GAME_EMOJIS,
  DAILY_GAME_TYPE_TO_SLUG,
  DAILY_CHALLENGE_GAME_TYPES,
  type DailyChallengeGameType,
} from '@/lib/daily-challenge'
import { authHeaders } from '@/lib/identity'

const MEDALS = ['🥇', '🥈', '🥉']

type Tab = 'today' | 'alltime'

interface LeaderboardEntry {
  rank: number
  profileId: string
  handle: string
  username: string | null
  avatarUrl: string | null
  normalizedScore?: number
  itemsSolved?: number
  timeSeconds?: number
  bestScore?: number
  bestTime?: number
  totalPlays?: number
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function DailyLeaderboardClient({ gameType }: { gameType: DailyChallengeGameType }) {
  const today = watToday()
  const [tab, setTab] = useState<Tab>('today')
  const [date, setDate] = useState(today)
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [total, setTotal] = useState(0)
  const [myRank, setMyRank] = useState<number | null>(null)
  const [myScore, setMyScore] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true)
      try {
        const headers = await authHeaders()
        const query = new URLSearchParams({ tab, date })
        const res = await fetch(`/api/daily/${gameType}/leaderboard?${query}`, {
          headers: headers ?? undefined,
          signal,
        })
        if (!res.ok || signal.aborted) return
        const data = await res.json()
        if (signal.aborted) return
        setEntries(data.entries ?? [])
        setTotal(data.total ?? 0)
        setMyRank(data.myRank ?? null)
        setMyScore(data.myScore ?? null)
      } catch {
        if (!signal.aborted) setEntries([])
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    },
    [gameType, tab, date]
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const step = (dir: -1 | 1) => setDate((d) => addDays(d, dir))
  const isToday = date === today
  const slug = DAILY_GAME_TYPE_TO_SLUG[gameType]

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* Header */}
      <div className="text-center mb-6">
        <div
          className="text-3xl mb-1"
          style={{
            filter: 'drop-shadow(0 4px 10px color-mix(in srgb, var(--primary) 20%, transparent))',
          }}
        >
          {DAILY_GAME_EMOJIS[gameType]}
        </div>
        <h1 className="text-xl font-bold">Daily {DAILY_GAME_LABELS[gameType]} Leaderboard</h1>
      </div>

      {/* Game type chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5 scrollbar-hide">
        {DAILY_CHALLENGE_GAME_TYPES.map((gt) => (
          <Link
            key={gt}
            href={`/daily/${DAILY_GAME_TYPE_TO_SLUG[gt]}/leaderboard`}
            className={`shrink-0 text-sm px-4 py-2 rounded-xl font-medium transition-all ${
              gt === gameType ? 'btn-primary' : 'btn-ghost'
            }`}
          >
            {DAILY_GAME_EMOJIS[gt]} {DAILY_GAME_LABELS[gt]}
          </Link>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 glass-card p-1 mb-5">
        <button
          className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all ${
            tab === 'today' ? 'bg-primary text-white' : 'text-muted hover:text-foreground'
          }`}
          onClick={() => setTab('today')}
        >
          Today
        </button>
        <button
          className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all ${
            tab === 'alltime' ? 'bg-primary text-white' : 'text-muted hover:text-foreground'
          }`}
          onClick={() => setTab('alltime')}
        >
          All Time
        </button>
      </div>

      {/* Date navigation (today tab only) */}
      {tab === 'today' && (
        <div className="flex items-center justify-between mb-4">
          <button className="btn-ghost text-sm px-3 py-1.5 rounded-lg" onClick={() => step(-1)}>
            &larr;
          </button>
          <span className="text-sm font-medium">{isToday ? 'Today' : formatDayLabel(date)}</span>
          <button className="btn-ghost text-sm px-3 py-1.5 rounded-lg" onClick={() => step(1)} disabled={isToday}>
            &rarr;
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-8">
          <div className="loading loading-spinner loading-md" />
        </div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <div className="text-center py-8 text-muted">
          <p>No scores yet{tab === 'today' ? ' for this day' : ''}.</p>
          <Link href={`/daily/${slug}`} className="btn-primary inline-block text-sm px-5 py-2 rounded-xl mt-4">
            Play now
          </Link>
        </div>
      )}

      {/* Entries */}
      {!loading && entries.length > 0 && (
        <div className="space-y-1.5 animate-stagger">
          {entries.map((entry) => {
            const score = entry.normalizedScore ?? entry.bestScore ?? 0
            const time = entry.timeSeconds ?? entry.bestTime ?? 0
            const isTop3 = entry.rank <= 3
            return (
              <div
                key={entry.profileId}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-all ${
                  isTop3 ? 'glass-card' : 'hover:bg-[var(--card-hover)]'
                }`}
              >
                <div className="w-8 text-center font-bold text-sm shrink-0">
                  {isTop3 ? MEDALS[entry.rank - 1] : `#${entry.rank}`}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={`font-semibold text-sm truncate ${entry.rank === 1 ? 'gradient-title inline-block' : ''}`}
                  >
                    {entry.handle || 'Guest'}
                  </div>
                  {entry.username && <div className="text-xs text-faint">@{entry.username}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-sm tabular-nums">{score}</div>
                  <div className="text-xs text-faint tabular-nums">{formatTime(time)}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Total count */}
      {!loading && total > entries.length && (
        <div className="text-center mt-4 text-sm text-faint">
          Showing {entries.length} of {total} players
        </div>
      )}

      {/* My rank sticky footer */}
      {myRank && myScore !== null && (
        <div className="sticky bottom-4 mt-4 glass-card-strong px-4 py-3 flex items-center justify-between border-primary/20">
          <span className="text-sm font-semibold">Your rank: #{myRank}</span>
          <span className="font-bold text-primary">{myScore} pts</span>
        </div>
      )}
    </div>
  )
}
