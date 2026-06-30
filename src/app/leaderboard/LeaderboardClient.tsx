'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Chip } from '@/components/ui/PageShell'
import { addDays, addMonths, watToday } from '@/lib/community-dates'
import type { LeaderboardResponse, LeaderboardWindow } from '@/types/community'

const TABS: { key: LeaderboardWindow; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
]

const MEDALS = ['🥇', '🥈', '🥉']

function CrownIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M3 8l3.5 3L12 5l5.5 6L21 8l-1.5 10h-15L3 8z"
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LeaderboardClient() {
  const today = watToday()
  const [tab, setTab] = useState<LeaderboardWindow>('today')
  const [selectedDate, setSelectedDate] = useState<string>(today)
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (window: LeaderboardWindow, date: string, signal: AbortSignal) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/leaderboard?window=${window}&date=${date}`, { cache: 'no-store', signal })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load')
      if (signal.aborted) return
      setData(json as LeaderboardResponse)
    } catch (err) {
      if (signal.aborted) return
      setError(err instanceof Error ? err.message : 'Failed to load')
      setData(null)
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Abort the in-flight request when the period/date changes so a stale
    // response can't resolve last and overwrite the newer selection.
    const controller = new AbortController()
    load(tab, selectedDate, controller.signal)
    return () => controller.abort()
  }, [tab, selectedDate, load])

  const step = (dir: -1 | 1) =>
    setSelectedDate((d) =>
      tab === 'today' ? addDays(d, dir) : tab === 'week' ? addDays(d, dir * 7) : addMonths(d, dir)
    )

  // today falls inside the shown window → we're viewing the current period.
  const isCurrentWindow = !!data && data.rangeStart <= today && today <= data.rangeEnd
  const canGoNext = !!data && data.rangeEnd < today

  return (
    <div className="page-wrap flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <header className="text-center space-y-2">
          <span
            className="inline-flex h-16 w-16 items-center justify-center rounded-2xl text-3xl"
            style={{ background: 'var(--chip-active-bg)' }}
          >
            🏆
          </span>
          <h1 className="text-4xl font-black tracking-tight gradient-title">Community Leaderboard</h1>
          <p className="text-muted text-sm">Nightly champions from our community games</p>
        </header>

        <div className="flex items-center justify-center gap-2">
          {TABS.map((t) => (
            <Chip key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </Chip>
          ))}
        </div>

        {data && (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous"
                className="h-9 w-9 shrink-0 rounded-full border border-[var(--border-strong)] bg-[var(--card)] backdrop-blur flex items-center justify-center text-xl leading-none text-muted hover:text-[var(--foreground)] hover:border-[var(--primary)] transition-colors"
              >
                ‹
              </button>
              <div className="text-center min-w-[11rem]">
                <span className="block text-[10px] uppercase tracking-widest text-faint">
                  {tab === 'today' ? 'Winners for' : tab === 'week' ? 'Week of' : 'Month of'}
                </span>
                <span className="text-lg font-semibold">{data.label}</span>
              </div>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={!canGoNext}
                aria-label="Next"
                className="h-9 w-9 shrink-0 rounded-full border border-[var(--border-strong)] bg-[var(--card)] backdrop-blur flex items-center justify-center text-xl leading-none text-muted hover:text-[var(--foreground)] hover:border-[var(--primary)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-[var(--border-strong)] disabled:hover:text-muted"
              >
                ›
              </button>
            </div>
            <div className="flex items-center justify-center gap-3 text-xs">
              <label className="flex items-center gap-1.5 text-faint">
                <span className="whitespace-nowrap">Jump to date</span>
                <input
                  type="date"
                  value={selectedDate}
                  max={today}
                  onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                  className="input-field py-1 px-2 text-xs w-auto"
                />
              </label>
              {!isCurrentWindow && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(today)}
                  className="text-[var(--primary)] hover:text-[var(--primary-strong)] font-medium transition-colors"
                >
                  {tab === 'today' ? 'Back to today' : tab === 'week' ? 'This week' : 'This month'}
                </button>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-center text-muted text-sm">Loading…</p>
        ) : error ? (
          <p className="text-center text-red-500 text-sm">{error}</p>
        ) : !data ? null : tab === 'today' ? (
          <TodayView data={data} />
        ) : (
          <StandingsView data={data} />
        )}

        <p className="text-center text-xs text-faint pt-2">
          <Link href="/input" className="hover:text-[var(--foreground)] transition-colors">
            Community manager? Enter scores →
          </Link>
        </p>
      </div>
    </div>
  )
}

function TodayView({ data }: { data: LeaderboardResponse }) {
  if (data.today.length === 0) {
    return (
      <div className="glass-card p-8 text-center text-muted text-sm">No games are set up yet. Check back soon.</div>
    )
  }

  // Games with winners first; within each group keep the admin's order (stable sort).
  const ordered = [...data.today].sort((a, b) => (b.winners.length ? 1 : 0) - (a.winners.length ? 1 : 0))

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-stagger">
      {ordered.map((entry) => {
        const accent = entry.game.accent ?? 'var(--primary)'
        const hasWinners = entry.winners.length > 0
        return (
          <div
            key={entry.game.id}
            className="glass-card p-5 relative overflow-hidden"
            style={{ borderColor: hasWinners ? `color-mix(in srgb, ${accent} 25%, transparent)` : undefined }}
          >
            <div
              className="absolute inset-x-0 top-0 h-1"
              style={{ background: accent, opacity: hasWinners ? 0.9 : 0.25 }}
            />
            <div className="flex items-center gap-2 mb-3">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
              <span className="text-sm font-semibold text-muted">{entry.game.name}</span>
            </div>
            {hasWinners ? (
              <div className="flex items-start gap-3">
                <CrownIcon className="h-7 w-7 shrink-0" />
                <div>
                  <p className="text-xs text-faint uppercase tracking-wide">
                    {entry.winners.length === 1 ? 'Winner' : `Winners · ${entry.winners.length}`}
                  </p>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    {entry.winners.map((w, i) => (
                      <span key={`${w.name}-${i}`} className="text-xl font-black tracking-tight">
                        {w.name}
                        {w.wins > 1 && (
                          <span className="ml-1 align-middle text-xs font-bold text-[var(--primary)]">×{w.wins}</span>
                        )}
                        {i < entry.winners.length - 1 && <span className="text-faint font-normal">,</span>}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-faint py-1">No winner announced yet</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StandingsView({ data }: { data: LeaderboardResponse }) {
  if (data.standings.length === 0) {
    return (
      <div className="glass-card p-8 text-center text-muted text-sm">No wins recorded for this {data.window} yet.</div>
    )
  }

  // getStandings() shares rank 1 across ties, so there can be more than one champion.
  const champions = data.standings.filter((s) => s.rank === 1)
  const rest = data.standings.filter((s) => s.rank !== 1)
  const joint = champions.length > 1
  const topWins = champions[0].wins

  return (
    <div className="space-y-3 animate-stagger">
      {/* Champion spotlight */}
      <div
        className="glass-card-strong p-6 relative overflow-hidden text-center"
        style={{
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--primary) 14%, var(--card-strong)), var(--card-strong))',
        }}
      >
        <div className="text-4xl mb-1">🥇</div>
        <p className="text-xs uppercase tracking-widest text-faint">
          {joint ? 'Joint champions' : 'Champion'} of the {data.window}
        </p>
        <p className="text-3xl font-black tracking-tight mt-1">{champions.map((c) => c.playerName).join(' & ')}</p>
        <p className="text-sm text-muted mt-1">
          {topWins} {topWins === 1 ? 'win' : 'wins'}
          {joint ? ' each' : champions[0].gamesWon > 1 ? ` · across ${champions[0].gamesWon} games` : ''}
        </p>
      </div>

      {rest.length > 0 && (
        <div className="glass-card divide-y divide-[var(--border)]">
          {rest.map((s) => (
            <div key={`${s.rank}-${s.playerName}`} className="flex items-center gap-3 px-4 py-3">
              <span className="w-8 text-center text-lg font-bold text-muted shrink-0">
                {s.rank <= 3 ? MEDALS[s.rank - 1] : s.rank}
              </span>
              <span className="font-semibold flex-1 truncate">{s.playerName}</span>
              <span className="text-sm text-muted shrink-0">
                {s.wins} {s.wins === 1 ? 'win' : 'wins'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
