'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminGamesTable } from '@/components/admin/AdminGamesTable'
import { AdminTournamentsTable } from '@/components/admin/AdminTournamentsTable'
import { AdminRoomsTable } from '@/components/admin/AdminRoomsTable'
import { Chip } from '@/components/ui/PageShell'
import { formatPlayDuration } from '@/lib/admin-play-time'
import { addDays, addMonths, monthBounds, watToday, weekBounds } from '@/lib/community-dates'
import { GAME_TYPE_CONFIG } from '@/lib/game-types'

type StatsResponse = {
  totals: {
    games: number
    sessions: number
    replays: number
    gamesToday: number
    gamesThisMonth: number
    gamesLastMonth: number
    tournaments: number
    activeTournaments: number
    finishedTournaments: number
    rooms: number
    players: number
    uniqueProfiles: number
    activeProfiles: number
    profilesWithTrophies: number
    avgPlayersPerGame: number
    votes: number
    feedback: number
    finishedGames: number
    activeGames: number
    gamesLast7Days: number
    gamesPrev7Days: number
    weekOverWeekGrowth: number | null
    monthOverMonthGrowth: number | null
    typicalPlayTimeSeconds: number | null
    typicalPlayTimeSampleCount: number
    dau: number
    wau: number
    mau: number
  }
  gamesByStatus: Record<string, number>
  gamesByType: Record<string, number>
  gamesByType7d: Record<string, number>
  gamesByType30d: Record<string, number>
  sessionsByType?: Record<string, number>
  tournamentsByStatus: Record<string, number>
  feedbackByCategory: Record<string, number>
  topReplayed: { id: string; type: string; sessions: number }[]
  dailyActivity: { date: string; games: number }[]
  userGrowth: { week: string; cumulative: number; newUsers: number }[]
  dauTrend: { date: string; dau: number }[]
  playersByCountry: Record<string, number>
  usersByCountry: Record<string, number>
  uniqueCountries: number
  dailyChallengeStats: {
    challenges: number
    submissions: number
    uniquePlayers: number
    submissionsToday: number
    avgScore: number
    byGameType: Record<string, { challenges: number; submissions: number }>
  }
  soloPlayStats?: {
    total: number
    last7Days: number
    last30Days: number
    byGameType: Record<string, number>
    byGameType7d: Record<string, number>
  }
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

function GrowthBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-faint">—</span>
  const positive = value >= 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
        positive ? 'bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-red-500/15 text-red-600 dark:text-red-400'
      }`}
    >
      {positive ? '↑' : '↓'} {Math.abs(value)}%
    </span>
  )
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

  const dc = stats.dailyChallengeStats ?? {
    challenges: 0,
    submissions: 0,
    uniquePlayers: 0,
    submissionsToday: 0,
    avgScore: 0,
    byGameType: {},
  }

  const solo = stats.soloPlayStats ?? {
    total: 0,
    last7Days: 0,
    last30Days: 0,
    byGameType: {},
    byGameType7d: {},
  }

  const typicalPlayTimeLabel =
    stats.totals.typicalPlayTimeSeconds != null ? formatPlayDuration(stats.totals.typicalPlayTimeSeconds) : '—'

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight gradient-title">Dashboard</h1>
        <p className="text-muted text-sm mt-1">Platform overview and key metrics</p>
      </div>

      {/* ── Hero KPI row ──────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total games played"
          value={stats.totals.sessions.toLocaleString()}
          detail={
            stats.totals.replays > 0
              ? `${stats.totals.games.toLocaleString()} unique games · ${stats.totals.replays.toLocaleString()} replayed`
              : `${stats.totals.games.toLocaleString()} unique games`
          }
        />
        <KpiCard
          label="Registered users"
          value={stats.totals.uniqueProfiles.toLocaleString()}
          detail={`${stats.totals.activeProfiles.toLocaleString()} active last 7 days`}
          badge={
            stats.totals.uniqueProfiles > 0 ? (
              <span className="text-xs text-muted">
                {Math.round((stats.totals.activeProfiles / stats.totals.uniqueProfiles) * 100)}% retention
              </span>
            ) : null
          }
        />
        <KpiCard
          label="Avg. players per game"
          value={stats.totals.avgPlayersPerGame.toString()}
          detail={`${stats.totals.players.toLocaleString()} total player joins`}
        />
        <KpiCard
          label="Avg. session duration"
          value={typicalPlayTimeLabel}
          detail={
            stats.totals.typicalPlayTimeSampleCount > 0
              ? `Median of ${stats.totals.typicalPlayTimeSampleCount.toLocaleString()} sessions`
              : 'No finished sessions yet'
          }
        />
      </div>

      {/* ── Growth indicators ─────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-faint text-xs uppercase tracking-wide">Games today</p>
          </div>
          <p className="text-3xl font-black mt-2">{stats.totals.gamesToday.toLocaleString()}</p>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-faint text-xs uppercase tracking-wide">Last 7 days</p>
            <GrowthBadge value={stats.totals.weekOverWeekGrowth} />
          </div>
          <p className="text-3xl font-black mt-2">{stats.totals.gamesLast7Days.toLocaleString()}</p>
          <p className="text-muted text-xs mt-1">vs {stats.totals.gamesPrev7Days.toLocaleString()} prior week</p>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-faint text-xs uppercase tracking-wide">This month</p>
            <GrowthBadge value={stats.totals.monthOverMonthGrowth} />
          </div>
          <p className="text-3xl font-black mt-2">{stats.totals.gamesThisMonth.toLocaleString()}</p>
          <p className="text-muted text-xs mt-1">
            vs {stats.totals.gamesLastMonth.toLocaleString()} same period last month
          </p>
        </div>
        <div className="glass-card p-5">
          <p className="text-faint text-xs uppercase tracking-wide">Active right now</p>
          <p className="text-3xl font-black mt-2">{stats.totals.activeGames.toLocaleString()}</p>
          <p className="text-muted text-xs mt-1">live games in progress</p>
        </div>
      </div>

      {/* ── DAU / WAU / MAU ─────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card p-5">
          <p className="text-faint text-xs uppercase tracking-wide">DAU (today)</p>
          <p className="text-3xl font-black mt-2">{stats.totals.dau.toLocaleString()}</p>
          <p className="text-muted text-xs mt-1">daily active users</p>
        </div>
        <div className="glass-card p-5">
          <p className="text-faint text-xs uppercase tracking-wide">WAU (7 days)</p>
          <p className="text-3xl font-black mt-2">{stats.totals.wau.toLocaleString()}</p>
          <p className="text-muted text-xs mt-1">weekly active users</p>
        </div>
        <div className="glass-card p-5">
          <p className="text-faint text-xs uppercase tracking-wide">MAU (30 days)</p>
          <p className="text-3xl font-black mt-2">{stats.totals.mau.toLocaleString()}</p>
          <p className="text-muted text-xs mt-1">monthly active users</p>
        </div>
      </div>

      {/* ── User growth chart ─────────────────────────────────────── */}
      <UserGrowthChart data={stats.userGrowth} />

      {/* ── DAU trend + 30-day game activity ──────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DauTrendChart data={stats.dauTrend} />
        <ActivityChart data={stats.dailyActivity} />
      </div>

      {/* ── Games played explorer ─────────────────────────────────── */}
      <GamesPlayedExplorer />

      {/* ── Game popularity ───────────────────────────────────────── */}
      <GamesByTypeCard allTime={stats.gamesByType} last7d={stats.gamesByType7d} last30d={stats.gamesByType30d} />

      {/* ── Most replayed games ───────────────────────────────────── */}
      {stats.topReplayed.length > 0 && (
        <div className="glass-card-strong p-5 space-y-4">
          <h2 className="font-bold">Most replayed games</h2>
          <div className="space-y-2">
            {stats.topReplayed.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono bg-[var(--surface-inset-bg)] px-1.5 py-0.5 rounded">{g.id}</code>
                  <span className="text-muted">{formatGameType(g.type)}</span>
                </div>
                <span className="font-semibold">{g.sessions} sessions</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Secondary breakdowns ──────────────────────────────────── */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatMiniCard label="Total game codes" value={stats.totals.games} />
        <StatMiniCard label="Finished games" value={stats.totals.finishedGames} />
        <StatMiniCard label="Tournaments" value={stats.totals.tournaments} />
        <StatMiniCard label="Rooms created" value={stats.totals.rooms} />
        <StatMiniCard label="Votes cast" value={stats.totals.votes} />
        <StatMiniCard label="Feedback received" value={stats.totals.feedback} />
        <StatMiniCard label="Users with trophies" value={stats.totals.profilesWithTrophies} />
        <StatMiniCard label="Countries reached" value={stats.uniqueCountries} />
        <StatMiniCard
          label="Active tournaments"
          value={stats.totals.activeTournaments}
          detail={`${stats.totals.finishedTournaments} finished`}
        />
      </div>

      {/* ── Country breakdown ────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <BarBreakdownCard
          title="Users by country"
          items={stats.usersByCountry}
          formatLabel={(code) => {
            try {
              return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code
            } catch {
              return code
            }
          }}
        />
        <BarBreakdownCard
          title="Game joins by country"
          items={stats.playersByCountry}
          formatLabel={(code) => {
            try {
              return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code
            } catch {
              return code
            }
          }}
        />
      </div>

      {/* ── Daily challenges ─────────────────────────────────────── */}
      <div className="glass-card-strong p-5 space-y-4">
        <h2 className="font-bold">Daily challenges</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className="text-2xl font-black">{dc.challenges}</p>
            <p className="text-xs uppercase tracking-wide text-muted">Puzzles generated</p>
          </div>
          <div>
            <p className="text-2xl font-black">{dc.submissions}</p>
            <p className="text-xs uppercase tracking-wide text-muted">Total submissions</p>
          </div>
          <div>
            <p className="text-2xl font-black">{dc.uniquePlayers}</p>
            <p className="text-xs uppercase tracking-wide text-muted">Unique players</p>
          </div>
          <div>
            <p className="text-2xl font-black">{dc.submissionsToday}</p>
            <p className="text-xs uppercase tracking-wide text-muted">Submissions today</p>
          </div>
          <div>
            <p className="text-2xl font-black">{dc.avgScore}</p>
            <p className="text-xs uppercase tracking-wide text-muted">Avg. score (0–1000)</p>
          </div>
        </div>
        {Object.keys(dc.byGameType).length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-muted mb-2">By game type</h3>
            <div className="space-y-1.5 text-sm">
              {Object.entries(dc.byGameType)
                .sort((a, b) => b[1].submissions - a[1].submissions)
                .map(([gt, data]) => (
                  <div key={gt} className="flex items-center justify-between gap-3">
                    <span className="capitalize">{formatGameType(gt)}</span>
                    <span className="text-muted">
                      {data.challenges} puzzles · {data.submissions} submissions
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Solo (vs bot) practice ────────────────────────────────── */}
      {/* Solo games run entirely client-side (no games/players row), so these
          counts come from the dedicated solo_plays log table — one row per
          game started. See migration 20260927120000_solo_plays.sql. */}
      <div className="glass-card-strong p-5 space-y-4">
        <div>
          <h2 className="font-bold">Solo (vs bot) practice</h2>
          <p className="text-muted text-xs mt-1">
            Games started from /play-solo. No room, no account — logged only for adoption tracking.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-2xl font-black">{solo.total.toLocaleString()}</p>
            <p className="text-xs uppercase tracking-wide text-muted">All-time plays</p>
          </div>
          <div>
            <p className="text-2xl font-black">{solo.last7Days.toLocaleString()}</p>
            <p className="text-xs uppercase tracking-wide text-muted">Last 7 days</p>
          </div>
          <div>
            <p className="text-2xl font-black">{solo.last30Days.toLocaleString()}</p>
            <p className="text-xs uppercase tracking-wide text-muted">Last 30 days</p>
          </div>
        </div>
        {Object.keys(solo.byGameType).length > 0 ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-muted mb-2">By game type</h3>
            <div className="space-y-1.5 text-sm">
              {Object.entries(solo.byGameType)
                .sort((a, b) => b[1] - a[1])
                .map(([gt, count]) => (
                  <div key={gt} className="flex items-center justify-between gap-3">
                    <span>{formatGameType(gt)}</span>
                    <span className="text-muted">
                      {count.toLocaleString()} all-time · {(solo.byGameType7d[gt] ?? 0).toLocaleString()} last 7d
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <p className="text-muted text-sm">No solo plays recorded yet.</p>
        )}
      </div>

      {/* ── Other breakdowns ──────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <BreakdownCard title="Games by status" items={stats.gamesByStatus} />
        <BreakdownCard title="Tournaments by status" items={stats.tournamentsByStatus} />
        {Object.keys(stats.feedbackByCategory).length > 0 && (
          <BreakdownCard title="Feedback by category" items={stats.feedbackByCategory} />
        )}
      </div>

      {/* ── Data tables ───────────────────────────────────────────── */}
      <AdminGamesTable onGamesChanged={() => setStatsVersion((v) => v + 1)} />
      <AdminTournamentsTable onTournamentsChanged={() => setStatsVersion((v) => v + 1)} />
      <AdminRoomsTable onRoomsChanged={() => setStatsVersion((v) => v + 1)} />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════ */
/*  Inline components                                                */
/* ══════════════════════════════════════════════════════════════════ */

function KpiCard({
  label,
  value,
  detail,
  badge,
}: {
  label: string
  value: string
  detail?: string
  badge?: React.ReactNode
}) {
  return (
    <div className="glass-card-strong p-6">
      <p className="text-faint text-xs uppercase tracking-wide">{label}</p>
      <p className="text-4xl font-black mt-2 tracking-tight">{value}</p>
      {detail && <p className="text-muted text-xs mt-2">{detail}</p>}
      {badge && <div className="mt-1">{badge}</div>}
    </div>
  )
}

function StatMiniCard({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div className="glass-card p-4">
      <p className="text-faint text-xs uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-black mt-1">{value.toLocaleString()}</p>
      {detail && <p className="text-muted text-xs mt-1">{detail}</p>}
    </div>
  )
}

function ActivityChart({ data }: { data: { date: string; games: number }[] }) {
  if (data.length === 0) return null
  const max = Math.max(...data.map((d) => d.games), 1)
  const total = data.reduce((s, d) => s + d.games, 0)
  const avg = Math.round(total / data.length)

  return (
    <div className="glass-card-strong p-5 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-bold">Activity — last 30 days</h2>
        <div className="flex gap-4 text-xs text-muted">
          <span>{total.toLocaleString()} total</span>
          <span>{avg}/day avg</span>
        </div>
      </div>
      <div className="relative" style={{ height: '144px' }}>
        <div className="absolute inset-0 flex items-end gap-[3px]">
          {data.map((d) => {
            const ratio = max > 0 ? d.games / max : 0
            const barHeight = d.games === 0 ? 0 : Math.max(Math.round(ratio * 140), 3)
            return (
              <div key={d.date} className="flex-1 group relative min-w-0 h-full flex items-end">
                <div
                  className="w-full rounded-t bg-[var(--primary)] group-hover:brightness-110 transition-all"
                  style={{ height: `${barHeight}px` }}
                />
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[var(--card-strong)] border border-[var(--border-strong)] text-xs px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                  {d.date}: {d.games}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-faint">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  )
}

function UserGrowthChart({ data }: { data: { week: string; cumulative: number; newUsers: number }[] }) {
  if (data.length === 0) return null
  const maxCumulative = Math.max(...data.map((d) => d.cumulative), 1)
  const maxNew = Math.max(...data.map((d) => d.newUsers), 1)
  const latest = data[data.length - 1]

  return (
    <div className="glass-card-strong p-5 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-bold">User growth — last 4 weeks</h2>
        <span className="text-xs text-muted">{latest?.cumulative ?? 0} total users</span>
      </div>
      <div className="relative" style={{ height: '160px' }}>
        <div className="absolute inset-0 flex items-end gap-[3px]">
          {data.map((d, i) => {
            const cumHeight = maxCumulative > 0 ? Math.round((d.cumulative / maxCumulative) * 155) : 0
            const newHeight = maxNew > 0 ? Math.max(Math.round((d.newUsers / maxNew) * 155), d.newUsers > 0 ? 3 : 0) : 0
            return (
              <div key={i} className="flex-1 group relative min-w-0 h-full flex items-end">
                <div
                  className="absolute bottom-0 w-full rounded-t bg-[var(--primary)] opacity-20"
                  style={{ height: `${cumHeight}px` }}
                />
                <div className="relative w-full rounded-t bg-[var(--primary)]" style={{ height: `${newHeight}px` }} />
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[var(--card-strong)] border border-[var(--border-strong)] text-xs px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                  {d.week}: +{d.newUsers} new ({d.cumulative} total)
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-[10px] text-faint">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-[var(--primary)]" /> New users
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-[var(--primary)] opacity-20" /> Cumulative
          </span>
        </div>
        <span className="text-[10px] text-faint">
          {data[0]?.week} → {latest?.week}
        </span>
      </div>
    </div>
  )
}

function DauTrendChart({ data }: { data: { date: string; dau: number }[] }) {
  if (data.length === 0) return null
  const max = Math.max(...data.map((d) => d.dau), 1)
  const total = data.reduce((s, d) => s + d.dau, 0)
  const avg = total > 0 ? (total / data.length).toFixed(1) : '0'

  return (
    <div className="glass-card-strong p-5 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-bold">Daily active users — 30 days</h2>
        <span className="text-xs text-muted">{avg} avg/day</span>
      </div>
      <div className="relative" style={{ height: '144px' }}>
        <div className="absolute inset-0 flex items-end gap-[3px]">
          {data.map((d) => {
            const barHeight = d.dau === 0 ? 0 : Math.max(Math.round((d.dau / max) * 140), 3)
            return (
              <div key={d.date} className="flex-1 group relative min-w-0 h-full flex items-end">
                <div
                  className="w-full rounded-t bg-emerald-500 dark:bg-emerald-400 group-hover:brightness-110 transition-all"
                  style={{ height: `${barHeight}px` }}
                />
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[var(--card-strong)] border border-[var(--border-strong)] text-xs px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                  {d.date}: {d.dau} users
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-faint">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
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
        <h2 className="font-bold">Games played explorer</h2>
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

type GamesByTypePeriod = '7d' | '30d' | 'all'

function GamesByTypeCard({
  allTime,
  last7d,
  last30d,
}: {
  allTime: Record<string, number>
  last7d: Record<string, number>
  last30d: Record<string, number>
}) {
  const [period, setPeriod] = useState<GamesByTypePeriod>('30d')
  const items = period === '7d' ? last7d : period === '30d' ? last30d : allTime
  const periodLabel = period === '7d' ? 'Last 7 days' : period === '30d' ? 'Last 30 days' : 'All time'
  const tabs: { key: GamesByTypePeriod; label: string }[] = [
    { key: '7d', label: '7 days' },
    { key: '30d', label: '30 days' },
    { key: 'all', label: 'All time' },
  ]

  const entries = Object.entries(items).sort((a, b) => b[1] - a[1])
  const max = entries.length > 0 ? entries[0][1] : 1
  const total = entries.reduce((s, [, v]) => s + v, 0)

  return (
    <div className="glass-card-strong p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold">Games by type</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">{total.toLocaleString()} total</span>
          <div className="flex gap-2">
            {tabs.map((t) => (
              <Chip key={t.key} active={period === t.key} onClick={() => setPeriod(t.key)}>
                {t.label}
              </Chip>
            ))}
          </div>
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="text-muted text-sm">No games in this period</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {entries.map(([key, count]) => {
            const pct = max > 0 ? (count / max) * 100 : 0
            const share = total > 0 ? Math.round((count / total) * 100) : 0
            return (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="capitalize truncate">{formatGameType(key)}</span>
                  <span className="font-semibold shrink-0">
                    {count.toLocaleString()} <span className="text-faint font-normal">({share}%)</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--surface-inset-bg)] overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--primary)] opacity-70" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
      <p className="text-faint text-xs">{periodLabel}</p>
    </div>
  )
}

function BarBreakdownCard({
  title,
  items,
  formatLabel,
}: {
  title: string
  items: Record<string, number>
  formatLabel?: (key: string) => string
}) {
  const entries = Object.entries(items).sort((a, b) => b[1] - a[1])
  const max = entries.length > 0 ? entries[0][1] : 1
  const total = entries.reduce((s, [, v]) => s + v, 0)

  return (
    <div className="glass-card-strong p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-bold">{title}</h2>
        <span className="text-xs text-muted">{total.toLocaleString()} total</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-muted text-sm">No data yet</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {entries.map(([key, count]) => {
            const pct = max > 0 ? (count / max) * 100 : 0
            const share = total > 0 ? Math.round((count / total) * 100) : 0
            return (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="capitalize truncate">{formatLabel ? formatLabel(key) : key}</span>
                  <span className="font-semibold shrink-0">
                    {count.toLocaleString()} <span className="text-faint font-normal">({share}%)</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--surface-inset-bg)] overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--primary)] opacity-70" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
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
              <span className="font-semibold">{count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
