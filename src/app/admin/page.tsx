'use client'

import { useEffect, useState } from 'react'
import { AdminGamesTable } from '@/components/admin/AdminGamesTable'
import { formatPlayDuration } from '@/lib/admin-play-time'
import { GAME_TYPE_CONFIG } from '@/lib/game-types'

type StatsResponse = {
  totals: {
    games: number
    players: number
    votes: number
    feedback: number
    finishedGames: number
    activeGames: number
    gamesLast7Days: number
    averagePlayTimeSeconds: number | null
    averagePlayTimeSampleCount: number
  }
  gamesByStatus: Record<string, number>
  gamesByType: Record<string, number>
  feedbackByCategory: Record<string, number>
}

function formatGameType(type: string): string {
  return GAME_TYPE_CONFIG[type as keyof typeof GAME_TYPE_CONFIG]?.label ?? type
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to load stats')
        setStats(data)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load stats'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-muted">Loading statistics…</p>
  if (error) return <p className="text-red-500">{error}</p>
  if (!stats) return null

  const averagePlayTimeLabel =
    stats.totals.averagePlayTimeSeconds != null
      ? formatPlayDuration(stats.totals.averagePlayTimeSeconds)
      : '—'

  const statCards = [
    { label: 'Total games', value: stats.totals.games },
    { label: 'Players joined', value: stats.totals.players },
    { label: 'Votes cast', value: stats.totals.votes },
    { label: 'Feedback received', value: stats.totals.feedback },
    { label: 'Active games', value: stats.totals.activeGames },
    { label: 'Finished games', value: stats.totals.finishedGames },
    { label: 'Games (last 7 days)', value: stats.totals.gamesLast7Days },
    {
      label: 'Avg. time played',
      value: averagePlayTimeLabel,
      detail:
        stats.totals.averagePlayTimeSampleCount > 0
          ? `Based on ${stats.totals.averagePlayTimeSampleCount.toLocaleString()} finished sessions`
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
            {'detail' in card && card.detail ? (
              <p className="text-muted text-xs mt-1">{card.detail}</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BreakdownCard title="Games by status" items={stats.gamesByStatus} />
        <BreakdownCard title="Games by type" items={stats.gamesByType} formatLabel={formatGameType} />
        <BreakdownCard title="Feedback by category" items={stats.feedbackByCategory} />
      </div>

      <AdminGamesTable />
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
