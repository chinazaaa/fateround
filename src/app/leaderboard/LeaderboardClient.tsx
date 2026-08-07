'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { WhatsappIcon, ChampionIcon, Calendar01Icon } from '@hugeicons/core-free-icons'
import { SiteChrome } from '@/components/SiteChrome'
import { Glyph } from '@/components/icons/Glyph'
import { UI_ICONS } from '@/lib/game-glyphs'
import { addDays, addMonths, watToday } from '@/lib/community-dates'
import { DEFAULT_WHATSAPP_INVITE_URL } from '@/lib/community-constants'
import { WhatsAppChannelLink } from '@/components/WhatsAppChannelLink'
import type { LeaderboardResponse, LeaderboardWindow } from '@/types/community'

const TABS: { key: LeaderboardWindow; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
]

/**
 * Podium tints for ranks 1–3.
 */
const PODIUM_TINTS = ['#d4a017', '#8e9099', '#a4682d']

const ALL_GAMES = ''

function CustomGameSelect({
  value,
  disabled,
  options,
  onChange,
}: {
  value: string
  disabled?: boolean
  options: { slug: string; name: string }[]
  onChange: (val: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  const selectedName = value === ALL_GAMES ? 'All games' : (options.find((o) => o.slug === value)?.name ?? 'All games')

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>{selectedName}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          style={{ color: 'var(--text-faint)' }}
        >
          <path d="M2.75 4.5 6 7.75 9.25 4.5" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 min-w-[12rem] max-h-60 overflow-y-auto rounded-[14px] p-1.5 shadow-xl z-30 space-y-0.5"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
          role="listbox"
        >
          <button
            type="button"
            onClick={() => {
              onChange(ALL_GAMES)
              setOpen(false)
            }}
            className={`w-full text-left px-3 py-2 rounded-[8px] text-xs font-semibold transition-colors cursor-pointer flex items-center justify-between ${
              value === ALL_GAMES
                ? '!bg-[var(--primary)] !text-white'
                : 'hover:bg-[color-mix(in_srgb,var(--primary)_10%,var(--surface))]'
            }`}
            style={{ color: value === ALL_GAMES ? '#ffffff' : 'var(--text)' }}
          >
            <span>All games</span>
            {value === ALL_GAMES && <span className="text-xs font-bold">✓</span>}
          </button>
          {options.map((g) => {
            const isSelected = value === g.slug
            return (
              <button
                key={g.slug}
                type="button"
                onClick={() => {
                  onChange(g.slug)
                  setOpen(false)
                }}
                className={`w-full text-left px-3 py-2 rounded-[8px] text-xs font-semibold transition-colors cursor-pointer flex items-center justify-between ${
                  isSelected
                    ? '!bg-[var(--primary)] !text-white'
                    : 'hover:bg-[color-mix(in_srgb,var(--primary)_10%,var(--surface))]'
                }`}
                style={{ color: isSelected ? '#ffffff' : 'var(--text)' }}
              >
                <span>{g.name}</span>
                {isSelected && <span className="text-xs font-bold">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function CustomDatePicker({ value, max, onChange }: { value: string; max: string; onChange: (val: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const [valYear, valMonth, valDay] = value.split('-').map(Number)
  const selectedDateObj = new Date(valYear, valMonth - 1, valDay)

  const [viewYear, setViewYear] = useState(valYear)
  const [viewMonth, setViewMonth] = useState(valMonth - 1)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  function changeMonth(dir: -1 | 1) {
    const newDate = new Date(viewYear, viewMonth + dir, 1)
    setViewYear(newDate.getFullYear())
    setViewMonth(newDate.getMonth())
  }

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
  const formattedDisplay = selectedDateObj.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
        }}
        aria-expanded={open}
      >
        <span className="whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
          Jump to date:
        </span>
        <span className="font-semibold">{formattedDisplay}</span>
      </button>

      {open && (
        <div
          className="absolute left-1/2 -translate-x-1/2 sm:left-auto sm:right-0 sm:translate-x-0 mt-2 w-72 rounded-[16px] p-4 shadow-2xl z-40 space-y-3"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          {/* Calendar Header */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors cursor-pointer hover:bg-[color-mix(in_srgb,var(--primary)_15%,var(--surface))]"
              style={{ color: 'var(--text)' }}
            >
              ‹
            </button>
            <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>
              {monthName}
            </span>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors cursor-pointer hover:bg-[color-mix(in_srgb,var(--primary)_15%,var(--surface))]"
              style={{ color: 'var(--text)' }}
            >
              ›
            </button>
          </div>

          {/* Weekday headers */}
          <div
            className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold"
            style={{ color: 'var(--text-faint)' }}
          >
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {/* Blank leading slots */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {/* Month days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
              const isSelected = dateStr === value
              const isFuture = dateStr > max

              return (
                <button
                  key={dayNum}
                  type="button"
                  disabled={isFuture}
                  onClick={() => {
                    onChange(dateStr)
                    setOpen(false)
                  }}
                  className={`h-7 w-7 mx-auto rounded-full flex items-center justify-center text-xs font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? '!bg-[var(--primary)] !text-white shadow-sm font-bold'
                      : isFuture
                        ? 'opacity-25 cursor-not-allowed'
                        : 'hover:bg-[color-mix(in_srgb,var(--primary)_20%,var(--surface))]'
                  }`}
                  style={{
                    color: isSelected ? '#ffffff' : isFuture ? 'var(--text-faint)' : 'var(--text)',
                  }}
                >
                  {dayNum}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export function LeaderboardClient() {
  const today = watToday()
  const [tab, setTab] = useState<LeaderboardWindow>('today')
  const [selectedDate, setSelectedDate] = useState<string>(today)
  const [game, setGame] = useState<string>(ALL_GAMES) // community game slug; '' = all
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (window: LeaderboardWindow, date: string, gameSlug: string, signal: AbortSignal) => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ window, date })
      if (gameSlug) query.set('game', gameSlug)
      const res = await fetch(`/api/leaderboard?${query}`, { cache: 'no-store', signal })
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
    const controller = new AbortController()
    load(tab, selectedDate, game, controller.signal)
    return () => controller.abort()
  }, [tab, selectedDate, game, load])

  const [games, setGames] = useState<LeaderboardResponse['games']>([])
  useEffect(() => {
    if (data) setGames(data.games)
  }, [data])
  const gameName = games.find((g) => g.slug === game)?.name ?? null

  const step = (dir: -1 | 1) =>
    setSelectedDate((d) =>
      tab === 'today' ? addDays(d, dir) : tab === 'week' ? addDays(d, dir * 7) : addMonths(d, dir)
    )

  const isCurrentWindow = !!data && data.rangeStart <= today && today <= data.rangeEnd
  const canGoNext = !!data && data.rangeEnd < today

  return (
    <SiteChrome>
      <div className="fr-band fr-band--tight">
        <div className="mk-wrap">
          {/* ── Hero section ── */}
          <div className="mb-8 space-y-2 text-center">
            <span className="fr-glyph">
              <Glyph icon={UI_ICONS.leaderboard} size={26} />
            </span>
            <h1
              className="fr-display m-0 text-[2.5rem] leading-[0.975] tracking-[-0.045em] sm:text-5xl"
              style={{ color: 'var(--text)' }}
            >
              Community Leaderboard
            </h1>
            <p className="mx-auto max-w-md text-sm" style={{ color: 'var(--text-muted)' }}>
              Nightly champions from our community games
            </p>
            <div className="pt-1">
              <WhatsAppChannelLink className="no-underline">Join the community on WhatsApp</WhatsAppChannelLink>
            </div>
          </div>

          <div className="mx-auto max-w-2xl space-y-6">
            {/* ── Tabs & Filter ── */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <div
                className="inline-flex p-1 rounded-full"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      tab === t.key
                        ? 'bg-[var(--primary)] text-white shadow-sm'
                        : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <CustomGameSelect value={game} disabled={games.length === 0} options={games} onChange={setGame} />
            </div>

            {/* ── Date Navigator ── */}
            {data && (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    aria-label="Previous period"
                    className="h-9 w-9 shrink-0 rounded-full border border-[var(--border)] bg-transparent flex items-center justify-center text-[var(--text)] hover:text-[var(--primary)] hover:border-[var(--primary)] transition-all cursor-pointer"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M19 12H5M11 18l-6-6 6-6" />
                    </svg>
                  </button>
                  <div className="text-center min-w-[11rem]">
                    <span
                      className="block text-[10px] uppercase tracking-widest"
                      style={{ color: 'var(--text-faint)' }}
                    >
                      {tab === 'today' ? 'Winners for' : tab === 'week' ? 'Week of' : 'Month of'}
                    </span>
                    <span className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
                      {data.label}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    disabled={!canGoNext}
                    aria-label="Next period"
                    className="h-9 w-9 shrink-0 rounded-full border border-[var(--border)] bg-transparent flex items-center justify-center text-[var(--text)] hover:text-[var(--primary)] hover:border-[var(--primary)] transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-[var(--border)] disabled:hover:text-[var(--text)] cursor-pointer"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
                  <CustomDatePicker value={selectedDate} max={today} onChange={(val) => setSelectedDate(val)} />
                  {!isCurrentWindow && (
                    <button
                      type="button"
                      onClick={() => setSelectedDate(today)}
                      className="font-semibold transition-colors cursor-pointer text-[var(--primary)] hover:underline"
                    >
                      {tab === 'today' ? 'Back to today' : tab === 'week' ? 'This week' : 'This month'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Content View ── */}
            {loading ? (
              <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                Loading…
              </p>
            ) : error ? (
              <p className="text-center text-sm text-red-500">{error}</p>
            ) : !data ? null : tab === 'today' ? (
              <TodayView data={data} />
            ) : (
              <StandingsView data={data} gameName={gameName} />
            )}

            {/* ── Community manager callout ── */}
            <div className="fr-card space-y-3 text-center mx-auto max-w-lg mt-8">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                Community manager?
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Enter scores and record nightly game results for your community.
              </p>
              <Link
                href="/input"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#25D366]/40 px-3.5 py-1.5 text-xs font-semibold text-[#1a9e4e] transition-colors hover:bg-[#25D366]/10 dark:text-[#25D366] dark:hover:bg-[#25D366]/10 no-underline"
              >
                Enter scores
              </Link>
            </div>
          </div>
        </div>
      </div>
    </SiteChrome>
  )
}

function TodayView({ data }: { data: LeaderboardResponse }) {
  if (data.today.length === 0) {
    return (
      <div className="fr-card p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
        No games are set up yet. Check back soon.
      </div>
    )
  }

  const ordered = [...data.today].sort((a, b) => (b.winners.length ? 1 : 0) - (a.winners.length ? 1 : 0))

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {ordered.map((entry) => {
        const accent = entry.game.accent ?? 'var(--primary)'
        const hasWinners = entry.winners.length > 0
        return (
          <div
            key={entry.game.id}
            className="fr-gamecard cursor-default"
            style={{ '--accent': accent } as React.CSSProperties}
          >
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: accent }} />
              <h3 className="fr-gamecard__title text-sm">{entry.game.name}</h3>
            </div>
            {hasWinners ? (
              <div className="flex items-start gap-3 mt-1">
                <span className="fr-glyph shrink-0">
                  <Glyph icon={ChampionIcon} size={22} />
                </span>
                <div>
                  <p className="fr-gamecard__vibe text-[10px] uppercase tracking-wide">
                    {entry.winners.length === 1 ? 'Winner' : `Winners · ${entry.winners.length}`}
                  </p>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mt-0.5">
                    {entry.winners.map((w, i) => (
                      <span
                        key={`${w.name}-${i}`}
                        className="text-lg font-bold tracking-tight"
                        style={{ color: 'var(--text)' }}
                      >
                        {w.name}
                        {w.wins > 1 && (
                          <span className="ml-1 align-middle text-xs font-bold" style={{ color: 'var(--accent)' }}>
                            ×{w.wins}
                          </span>
                        )}
                        {i < entry.winners.length - 1 && (
                          <span className="font-normal" style={{ color: 'var(--text-faint)' }}>
                            ,
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="fr-gamecard__tagline text-xs py-1">No winner announced yet</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StandingsView({ data, gameName }: { data: LeaderboardResponse; gameName: string | null }) {
  if (data.standings.length === 0) {
    return (
      <div className="fr-card p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
        No {gameName ? `${gameName} ` : ''}wins recorded for this {data.window} yet.
      </div>
    )
  }

  const champions = data.standings.filter((s) => s.rank === 1)
  const rest = data.standings.filter((s) => s.rank !== 1)
  const joint = champions.length > 1
  const topWins = champions[0].wins

  return (
    <div className="space-y-4">
      {/* Champion spotlight */}
      <div
        className="fr-gamecard cursor-default p-6 text-center"
        style={{ '--accent': '#d4a017' } as React.CSSProperties}
      >
        <div className="flex justify-center mb-1">
          <span className="fr-glyph">
            <Glyph icon={ChampionIcon} size={28} />
          </span>
        </div>
        <p className="fr-gamecard__vibe text-xs uppercase tracking-widest">
          {joint ? 'Joint champions' : 'Champion'} of the {data.window}
          {gameName ? ` · ${gameName}` : ''}
        </p>
        <p className="fr-gamecard__title text-3xl mt-1">{champions.map((c) => c.playerName).join(' & ')}</p>
        <p className="fr-gamecard__tagline text-sm mt-1">
          {topWins} {topWins === 1 ? 'win' : 'wins'}
          {joint ? ' each' : champions[0].gamesWon > 1 ? ` · across ${champions[0].gamesWon} games` : ''}
        </p>
      </div>

      {rest.length > 0 && (
        <div className="fr-card divide-y" style={{ borderColor: 'var(--border)' }}>
          {rest.map((s) => {
            const podium = s.rank <= 3 ? PODIUM_TINTS[s.rank - 1] : null
            return (
              <div key={`${s.rank}-${s.playerName}`} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={
                    podium
                      ? {
                          background: `color-mix(in srgb, ${podium} 18%, transparent)`,
                          color: podium,
                        }
                      : { color: 'var(--text-faint)' }
                  }
                >
                  {s.rank}
                </span>
                <span className="font-semibold flex-1 truncate" style={{ color: 'var(--text)' }}>
                  {s.playerName}
                </span>
                <span className="text-sm shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {s.wins} {s.wins === 1 ? 'win' : 'wins'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
