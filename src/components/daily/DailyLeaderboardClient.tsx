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
        <div className="text-3xl mb-1">{DAILY_GAME_EMOJIS[gameType]}</div>
        <h1 className="text-xl font-bold">Daily {DAILY_GAME_LABELS[gameType]} Leaderboard</h1>
      </div>

      {/* Game type chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {DAILY_CHALLENGE_GAME_TYPES.map((gt) => (
          <Link
            key={gt}
            href={`/daily/${DAILY_GAME_TYPE_TO_SLUG[gt]}/leaderboard`}
            className={`btn btn-sm whitespace-nowrap ${gt === gameType ? 'btn-primary' : 'btn-ghost'}`}
          >
            {DAILY_GAME_EMOJIS[gt]} {DAILY_GAME_LABELS[gt]}
          </Link>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs tabs-boxed mb-4">
        <button className={`tab ${tab === 'today' ? 'tab-active' : ''}`} onClick={() => setTab('today')}>
          Today
        </button>
        <button className={`tab ${tab === 'alltime' ? 'tab-active' : ''}`} onClick={() => setTab('alltime')}>
          All Time
        </button>
      </div>

      {/* Date navigation (today tab only) */}
      {tab === 'today' && (
        <div className="flex items-center justify-between mb-4">
          <button className="btn btn-ghost btn-sm" onClick={() => step(-1)}>
            &larr;
          </button>
          <span className="text-sm font-medium">{isToday ? 'Today' : formatDayLabel(date)}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => step(1)} disabled={isToday}>
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
        <div className="text-center py-8 text-base-content/60">
          <p>No scores yet{tab === 'today' ? ' for this day' : ''}.</p>
          <Link href={`/daily/${slug}`} className="btn btn-primary btn-sm mt-4">
            Play now
          </Link>
        </div>
      )}

      {/* Entries */}
      {!loading && entries.length > 0 && (
        <div className="space-y-1">
          {entries.map((entry) => {
            const score = entry.normalizedScore ?? entry.bestScore ?? 0
            const time = entry.timeSeconds ?? entry.bestTime ?? 0
            return (
              <div
                key={entry.profileId}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 ${entry.rank <= 3 ? 'bg-base-200' : ''}`}
              >
                <div className="w-8 text-center font-bold text-sm">
                  {entry.rank <= 3 ? MEDALS[entry.rank - 1] : `#${entry.rank}`}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{entry.handle || 'Guest'}</div>
                  {entry.username && <div className="text-xs text-base-content/40">@{entry.username}</div>}
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm">{score}</div>
                  <div className="text-xs text-base-content/50">{formatTime(time)}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Total count */}
      {!loading && total > entries.length && (
        <div className="text-center mt-4 text-sm text-base-content/50">
          Showing {entries.length} of {total} players
        </div>
      )}

      {/* My rank sticky footer */}
      {myRank && myScore !== null && (
        <div className="sticky bottom-0 mt-4 rounded-lg bg-primary/10 border border-primary/20 px-4 py-2 flex items-center justify-between">
          <span className="text-sm font-medium">Your rank: #{myRank}</span>
          <span className="font-bold">{myScore} pts</span>
        </div>
      )}
    </div>
  )
}
