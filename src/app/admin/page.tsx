'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminGamesTable } from '@/components/admin/AdminGamesTable'
import { Chip } from '@/components/ui/PageShell'
import { formatPlayDuration } from '@/lib/admin-play-time'
import { addDays, addMonths, monthBounds, watToday, weekBounds } from '@/lib/community-dates'
import { GAME_TYPE_CONFIG } from '@/lib/game-types'

type StatsResponse = {
  totals: {
    games: number
    gamesToday: number
    gamesThisMonth: number
    rooms: number
    players: number
    votes: number
    feedback: number
    finishedGames: number
    activeGames: number
    gamesLast7Days: number
    typicalPlayTimeSeconds: number | null
    typicalPlayTimeSampleCount: number
  }
  gamesByStatus: Record<string, number>
  gamesByType: Record<string, number>
  feedbackByCategory: Record<string, number>
}

type GamesByDate = {
  date: string
  day: { count: number; label: string }
  week: { count: number; label: string }
  month: { count: number; label: string }
}

type GamesWindow = 'day' | 'week' | 'month'

function formatGameType(type: string): string {
  return GAME_TYPE_CONFIG[type as keyof typeof GAME_TYPE_CONFIG]?.label ?? type
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [statsVersion, setStatsVersion] = useState(0)

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to load stats')
        setStats(data)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load stats'))
      .finally(() => setLoading(false))
  }, [statsVersion])

  if (loading) return <p className="text-muted">Loading statistics…</p>
  if (error) return <p className="text-red-500">{error}</p>
  if (!stats) return null

  const typicalPlayTimeLabel =
    stats.totals.typicalPlayTimeSeconds != null ? formatPlayDuration(stats.totals.typicalPlayTimeSeconds) : '—'

  const statCards = [
    { label: 'Total games', value: stats.totals.games },
    { label: 'Games played today', value: stats.totals.gamesToday },
    { label: 'Games played this month', value: stats.totals.gamesThisMonth },
    { label: 'Rooms created', value: stats.totals.rooms },
    { label: 'Players joined', value: stats.totals.players },
    { label: 'Votes cast', value: stats.totals.votes },
    { label: 'Feedback received', value: stats.totals.feedback },
    { label: 'Active games', value: stats.totals.activeGames },
    { label: 'Finished games', value: stats.totals.finishedGames },
    { label: 'Games (last 7 days)', value: stats.totals.gamesLast7Days },
    {
      label: 'Typical time played',
      value: typicalPlayTimeLabel,
      detail:
        stats.totals.typicalPlayTimeSampleCount > 0
          ? `Median of ${stats.totals.typicalPlayTimeSampleCount.toLocaleString()} finished sessions`
          : 'No finished sessions yet',
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight gradient-title">Statistics</h1>
        <p className="text-muted text-sm mt-1">Overview of games, players, and activity</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="glass-card p-5">
            <p className="text-faint text-xs uppercase tracking-wide">{card.label}</p>
            <p className="text-3xl font-black mt-2">
              {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
            </p>
            {'detail' in card && card.detail ? <p className="text-muted text-xs mt-1">{card.detail}</p> : null}
          </div>
        ))}
      </div>

      <GamesPlayedExplorer />

      <div className="grid gap-6 lg:grid-cols-2">
        <BreakdownCard title="Games by status" items={stats.gamesByStatus} />
        <BreakdownCard title="Games by type" items={stats.gamesByType} formatLabel={formatGameType} />
        <BreakdownCard title="Feedback by category" items={stats.feedbackByCategory} />
      </div>

      <AdminGamesTable onGamesChanged={() => setStatsVersion((version) => version + 1)} />
    </div>
  )
}

function GamesPlayedExplorer() {
  const today = watToday()
  const [date, setDate] = useState(today)
  const [period, setPeriod] = useState<GamesWindow>('day')
  const [data, setData] = useState<GamesByDate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (forDate: string, signal: AbortSignal) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/stats/games?date=${forDate}`, { cache: 'no-store', signal })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load')
      if (signal.aborted) return
      setData(json as GamesByDate)
    } catch (err) {
      if (signal.aborted) return
      setError(err instanceof Error ? err.message : 'Failed to load')
      setData(null)
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Abort the previous request when the date changes so a stale response can't
    // overwrite the counts for the newer selection.
    const controller = new AbortController()
    load(date, controller.signal)
    return () => controller.abort()
  }, [date, load])

  const step = (dir: -1 | 1) =>
    setDate((d) => (period === 'day' ? addDays(d, dir) : period === 'week' ? addDays(d, dir * 7) : addMonths(d, dir)))

  const rangeStart = period === 'day' ? date : period === 'week' ? weekBounds(date).start : monthBounds(date).start
  const rangeEnd = period === 'day' ? date : period === 'week' ? weekBounds(date).end : monthBounds(date).end
  const canGoNext = rangeEnd < today
  const isCurrent = rangeStart <= today && today <= rangeEnd
  const current = data ? data[period] : null

  const tabs: { key: GamesWindow; label: string }[] = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
  ]

  return (
    <div className="glass-card-strong p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold">Games played</h2>
        <div className="flex gap-2">
          {tabs.map((t) => (
            <Chip key={t.key} active={period === t.key} onClick={() => setPeriod(t.key)}>
              {t.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous"
            className="h-9 w-9 shrink-0 rounded-full border border-[var(--border-strong)] bg-[var(--card)] flex items-center justify-center text-xl leading-none text-muted hover:text-[var(--foreground)] hover:border-[var(--primary)] transition-colors"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={!canGoNext}
            aria-label="Next"
            className="h-9 w-9 shrink-0 rounded-full border border-[var(--border-strong)] bg-[var(--card)] flex items-center justify-center text-xl leading-none text-muted hover:text-[var(--foreground)] hover:border-[var(--primary)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ›
          </button>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="input-field py-1.5 w-auto"
          />
          {!isCurrent && (
            <button
              type="button"
              onClick={() => setDate(today)}
              className="text-sm text-[var(--primary)] hover:text-[var(--primary-strong)] font-medium transition-colors"
            >
              {period === 'day' ? 'Today' : period === 'week' ? 'This week' : 'This month'}
            </button>
          )}
        </div>

        {error ? (
          <p className="text-red-500 text-sm">{error}</p>
        ) : (
          <div>
            <p className="text-4xl font-black leading-none">
              {loading || !current ? '—' : current.count.toLocaleString()}
            </p>
            <p className="text-muted text-sm mt-1">games played · {current ? current.label : '…'}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function BreakdownCard({
  title,
  items,
  formatLabel,
}: {
  title: string
  items: Record<string, number>
  formatLabel?: (key: string) => string
}) {
  const entries = Object.entries(items).sort((a, b) => b[1] - a[1])

  return (
    <div className="glass-card-strong p-5 space-y-4">
      <h2 className="font-bold">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-muted text-sm">No data yet</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([key, count]) => (
            <div key={key} className="flex items-center justify-between gap-3 text-sm">
              <span className="capitalize">{formatLabel ? formatLabel(key) : key}</span>
              <span className="font-semibold">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
