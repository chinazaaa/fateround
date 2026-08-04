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
        <h1 className="font-bold" style={{ fontSize: 'var(--text-xl)' }}>
          Daily {DAILY_GAME_LABELS[gameType]} Leaderboard
        </h1>
      </div>

      {/* Game type chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5 scrollbar-hide">
        {DAILY_CHALLENGE_GAME_TYPES.map((gt) => (
          <Link
            key={gt}
            href={`/daily/${DAILY_GAME_TYPE_TO_SLUG[gt]}/leaderboard`}
            className={`shrink-0 fr-btn fr-btn--sm ${gt === gameType ? 'fr-btn--primary' : 'fr-btn--ghost'}`}
          >
            {DAILY_GAME_EMOJIS[gt]} {DAILY_GAME_LABELS[gt]}
          </Link>
        ))}
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 p-1 mb-5"
        style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)' }}
      >
        <button
          className="flex-1 font-medium py-2 transition-all"
          style={{
            fontSize: 'var(--text-sm)',
            borderRadius: 'var(--radius-sm)',
            ...(tab === 'today' ? { background: 'var(--primary)', color: '#fff' } : { color: 'var(--text-muted)' }),
          }}
          onClick={() => setTab('today')}
        >
          Today
        </button>
        <button
          className="flex-1 font-medium py-2 transition-all"
          style={{
            fontSize: 'var(--text-sm)',
            borderRadius: 'var(--radius-sm)',
            ...(tab === 'alltime' ? { background: 'var(--primary)', color: '#fff' } : { color: 'var(--text-muted)' }),
          }}
          onClick={() => setTab('alltime')}
        >
          All Time
        </button>
      </div>

      {/* Date navigation (today tab only) */}
      {tab === 'today' && (
        <div className="flex items-center justify-between mb-4">
          <button className="fr-btn fr-btn--ghost fr-btn--sm" onClick={() => step(-1)}>
            &larr;
          </button>
          <span className="font-medium" style={{ fontSize: 'var(--text-sm)' }}>
            {isToday ? 'Today' : formatDayLabel(date)}
          </span>
          <button className="fr-btn fr-btn--ghost fr-btn--sm" onClick={() => step(1)} disabled={isToday}>
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
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
          <p>No scores yet{tab === 'today' ? ' for this day' : ''}.</p>
          <Link href={`/daily/${slug}`} className="fr-btn fr-btn--primary fr-btn--sm mt-4 inline-block">
            Play now
          </Link>
        </div>
      )}

      {/* Entries */}
      {!loading && entries.length > 0 && (
        <div className="space-y-1.5">
          {entries.map((entry) => {
            const score = entry.normalizedScore ?? entry.bestScore ?? 0
            const time = entry.timeSeconds ?? entry.bestTime ?? 0
            const isTop3 = entry.rank <= 3
            return (
              <div
                key={entry.profileId}
                className="flex items-center gap-3 px-4 py-3 transition-all"
                style={{
                  borderRadius: 'var(--radius-md)',
                  ...(isTop3 ? { background: 'var(--surface-sunken)', border: '1px solid var(--border)' } : {}),
                }}
              >
                <div className="w-8 text-center font-bold shrink-0" style={{ fontSize: 'var(--text-sm)' }}>
                  {isTop3 ? MEDALS[entry.rank - 1] : `#${entry.rank}`}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className="font-semibold truncate"
                    style={{
                      fontSize: 'var(--text-sm)',
                      ...(entry.rank === 1 ? { color: 'var(--primary)' } : {}),
                    }}
                  >
                    {entry.handle || 'Guest'}
                  </div>
                  {entry.username && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>@{entry.username}</div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold" style={{ fontSize: 'var(--text-sm)', fontFeatureSettings: '"tnum"' }}>
                    {score}
                  </div>
                  <div
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', fontFeatureSettings: '"tnum"' }}
                  >
                    {formatTime(time)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Total count */}
      {!loading && total > entries.length && (
        <div className="text-center mt-4" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
          Showing {entries.length} of {total} players
        </div>
      )}

      {/* My rank sticky footer */}
      {myRank && myScore !== null && (
        <div
          className="sticky bottom-4 mt-4 px-4 py-3 flex items-center justify-between"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <span className="font-semibold" style={{ fontSize: 'var(--text-sm)' }}>
            Your rank: #{myRank}
          </span>
          <span className="font-bold" style={{ color: 'var(--primary)' }}>
            {myScore} pts
          </span>
        </div>
      )}
    </div>
  )
}
