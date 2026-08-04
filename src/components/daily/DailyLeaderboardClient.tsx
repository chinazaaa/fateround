'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { addDays, watToday, formatDayLabel } from '@/lib/community-dates'
import {
  DAILY_GAME_LABELS,
  DAILY_GAME_EMOJIS,
  DAILY_GAME_TYPE_TO_SLUG,
  DAILY_CHALLENGE_GAME_TYPES,
  DAILY_GAME_PRIMARY_METRIC,
  type DailyChallengeGameType,
} from '@/lib/daily-challenge'
import { authHeaders } from '@/lib/identity'

const MEDALS = ['🥇', '🥈', '🥉']
const PODIUM_BG = [
  'linear-gradient(135deg, rgba(255,215,0,0.12) 0%, rgba(255,215,0,0.04) 100%)',
  'linear-gradient(135deg, rgba(192,192,192,0.12) 0%, rgba(192,192,192,0.04) 100%)',
  'linear-gradient(135deg, rgba(205,127,50,0.12) 0%, rgba(205,127,50,0.04) 100%)',
]
const PODIUM_BORDER = ['rgba(255,215,0,0.25)', 'rgba(192,192,192,0.25)', 'rgba(205,127,50,0.25)']

type Tab = 'today' | 'alltime'

interface LeaderboardEntry {
  rank: number
  profileId: string
  handle: string
  username: string | null
  avatarUrl: string | null
  normalizedScore?: number
  rawPoints?: number
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

function InitialsAvatar({ name, rank }: { name: string; rank: number }) {
  const initials = (name || 'G').slice(0, 2).toUpperCase()
  const isTop3 = rank <= 3
  return (
    <div
      className="flex items-center justify-center rounded-full font-bold shrink-0"
      style={{
        width: isTop3 ? 40 : 32,
        height: isTop3 ? 40 : 32,
        fontSize: isTop3 ? 14 : 12,
        background: rank === 1 ? 'var(--primary)' : 'var(--surface-sunken)',
        color: rank === 1 ? '#fff' : 'var(--text-muted)',
        border: `1px solid ${rank === 1 ? 'var(--primary)' : 'var(--border)'}`,
      }}
    >
      {initials}
    </div>
  )
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
        const res = await fetch(`/api/daily-challenges/${gameType}/leaderboard?${query}`, {
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
  const metric = DAILY_GAME_PRIMARY_METRIC[gameType]

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      {/* Header */}
      <div className="text-center mb-5">
        <div className="text-3xl mb-1">{DAILY_GAME_EMOJIS[gameType]}</div>
        <h1 className="font-bold" style={{ fontSize: 'var(--text-lg)', fontFamily: 'var(--font-display)' }}>
          {DAILY_GAME_LABELS[gameType]} Leaderboard
        </h1>
      </div>

      {/* Game type chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide justify-center flex-wrap">
        {DAILY_CHALLENGE_GAME_TYPES.map((gt) => (
          <Link
            key={gt}
            href={`/daily-challenges/${DAILY_GAME_TYPE_TO_SLUG[gt]}/leaderboard`}
            className={`shrink-0 fr-btn fr-btn--sm ${gt === gameType ? 'fr-btn--primary' : 'fr-btn--ghost'}`}
            style={{ fontSize: 'var(--text-2xs)' }}
          >
            {DAILY_GAME_EMOJIS[gt]} {DAILY_GAME_LABELS[gt]}
          </Link>
        ))}
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 p-1 mb-4"
        style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)' }}
      >
        {(['today', 'alltime'] as const).map((t) => (
          <button
            key={t}
            className="flex-1 font-semibold py-2 transition-all"
            style={{
              fontSize: 'var(--text-sm)',
              borderRadius: 'var(--radius-sm)',
              ...(tab === t ? { background: 'var(--primary)', color: '#fff' } : { color: 'var(--text-muted)' }),
            }}
            onClick={() => setTab(t)}
          >
            {t === 'today' ? 'Today' : 'Best'}
          </button>
        ))}
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
        <div className="text-center py-12">
          <div className="loading loading-spinner loading-md" />
        </div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <div className="fr-card text-center py-10">
          <div className="text-4xl mb-3">🏜️</div>
          <p className="font-semibold mb-1" style={{ fontSize: 'var(--text-sm)' }}>
            {tab === 'today' && !isToday ? 'No scores for this day' : 'No scores yet'}
          </p>
          <p className="mb-4" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
            Be the first to make it on the board!
          </p>
          {tab === 'today' && isToday && (
            <Link href={`/daily-challenges/${slug}`} className="fr-btn fr-btn--primary fr-btn--sm">
              Play now
            </Link>
          )}
        </div>
      )}

      {/* Entries */}
      {!loading && entries.length > 0 && (
        <div className="space-y-1.5">
          {entries.map((entry) => {
            // Word Hunt ('score') shows raw points; today carries rawPoints, all-time carries it in
            // bestScore. Other games show the normalized/best score.
            const score =
              metric === 'score'
                ? (entry.rawPoints ?? entry.bestScore ?? 0)
                : (entry.normalizedScore ?? entry.bestScore ?? 0)
            const time = entry.timeSeconds ?? entry.bestTime ?? 0
            const isTop3 = entry.rank <= 3

            return (
              <div
                key={entry.profileId}
                className="flex items-center gap-3 px-3 py-2.5 transition-all"
                style={{
                  borderRadius: 'var(--radius-md)',
                  ...(isTop3
                    ? {
                        background: PODIUM_BG[entry.rank - 1],
                        border: `1px solid ${PODIUM_BORDER[entry.rank - 1]}`,
                      }
                    : {}),
                }}
              >
                {/* Rank */}
                <div
                  className="w-7 text-center font-bold shrink-0"
                  style={{
                    fontSize: isTop3 ? 'var(--text-lg)' : 'var(--text-2xs)',
                    color: isTop3 ? undefined : 'var(--text-faint)',
                  }}
                >
                  {isTop3 ? MEDALS[entry.rank - 1] : `#${entry.rank}`}
                </div>

                {/* Avatar */}
                <InitialsAvatar name={entry.handle || 'Guest'} rank={entry.rank} />

                {/* Name */}
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
                    <div className="truncate" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                      @{entry.username}
                    </div>
                  )}
                </div>

                {/* Score */}
                <div className="text-right shrink-0">
                  <div
                    className="font-bold"
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontFeatureSettings: '"tnum"',
                      ...(entry.rank === 1 ? { color: 'var(--primary)' } : {}),
                    }}
                  >
                    {metric === 'time' ? formatTime(time) : score}
                  </div>
                  <div
                    style={{
                      fontSize: '10px',
                      color: 'var(--text-faint)',
                      fontFeatureSettings: '"tnum"',
                    }}
                  >
                    {metric === 'time' ? `${score} pts` : formatTime(time)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Total count */}
      {!loading && total > entries.length && (
        <div className="text-center mt-4" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
          Showing top {entries.length} of {total} players
        </div>
      )}

      {/* My rank sticky footer */}
      {myRank && myScore !== null && myScore > 0 && myRank > entries.length && (
        <div
          className="sticky bottom-4 mt-4 px-4 py-3 flex items-center justify-between"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div>
            <div className="font-bold" style={{ fontSize: 'var(--text-sm)' }}>
              Your rank
            </div>
            <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
              #{myRank} of {total}
            </div>
          </div>
          <div
            className="font-bold"
            style={{
              fontSize: 'var(--text-lg)',
              color: 'var(--primary)',
              fontFeatureSettings: '"tnum"',
            }}
          >
            {myScore}
          </div>
        </div>
      )}
    </div>
  )
}
