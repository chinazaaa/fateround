'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { DailyAnswerReveal, DailyAnswerSection } from '@/lib/daily-answer-reveal'
import {
  DAILY_CHALLENGE_GAME_TYPES,
  DAILY_GAME_LABELS,
  DAILY_GAME_TYPE_TO_SLUG,
  type DailyChallengeGameType,
} from '@/lib/daily-challenge'
import { dailyChallengeIcon } from '@/lib/game-glyphs'
import { Glyph } from '@/components/icons/Glyph'

/**
 * Yesterday's (and previous days') answers for one daily game.
 *
 * A separate page rather than a panel on the results screen, for one reason that decides it:
 * the answers a player wants are for the puzzle they JUST played, and those are not available
 * until tomorrow. Showing them inline after submitting would promise the wrong thing. A page
 * titled with the date it belongs to can't be misread, is linkable, and reads the same on both
 * platforms.
 *
 * URL-driven date: `?date=YYYY-MM-DD` picks a specific past day; omitted defaults to yesterday.
 * The server refuses any date that isn't strictly in the past, so this component cannot be
 * coaxed into showing a live puzzle no matter what it asks for — the prev/next controls just
 * change the URL and let the server rule stand.
 */
export function DailyAnswersClient({ gameType, slug }: { gameType: DailyChallengeGameType; slug: string }) {
  const searchParams = useSearchParams()
  const rawDate = searchParams.get('date')
  // Only accept a real YYYY-MM-DD; anything else — shape mismatch, or a value
  // like 2024-02-30 that Date.parse silently normalises — and shiftDay() feeds
  // NaN into toISOString(), which throws and blanks the screen. Round-trip
  // through Date to reject impossible calendar days.
  const dateParam = rawDate && isDateSlug(rawDate) ? rawDate : null
  const [reveal, setReveal] = useState<DailyAnswerReveal | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'empty'>('loading')

  useEffect(() => {
    let cancelled = false
    setState('loading')
    setReveal(null)
    void (async () => {
      try {
        // Explicit ?date=… wins; otherwise the route defaults to yesterday.
        const url = `/api/daily-challenges/${gameType}/answers${dateParam ? `?date=${dateParam}` : ''}`
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) setState('empty')
          return
        }
        const data = (await res.json()) as DailyAnswerReveal
        if (cancelled) return
        setReveal(data)
        setState('ready')
      } catch {
        if (!cancelled) setState('empty')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [gameType, dateParam])

  const label = DAILY_GAME_LABELS[gameType]

  // Current viewing date — from URL when set, otherwise the date the server returned. Falls
  // back to yesterday if we don't know yet, so the prev/next arrows still work while loading.
  const viewingDate = dateParam ?? reveal?.challengeDate ?? yesterdayWatSlug()
  const prevDateSlug = shiftDay(viewingDate, -1)
  const nextDateSlug = shiftDay(viewingDate, +1)
  // Next-day is only linkable if the target is still strictly before today (the server
  // enforces this too, but hiding the button saves the user a click into a 403).
  const canGoNext = nextDateSlug < todayWatSlug()

  // Page title: "Yesterday's …" only when we're actually on yesterday; otherwise show the
  // date so a linked-in day never lies about which puzzle these belong to.
  const heading = viewingDate === yesterdayWatSlug() ? `Yesterday's ${label} answers` : `${label} answers`

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black sm:text-3xl">{heading}</h1>
        <div className="mt-2 flex items-center justify-center gap-2">
          <Link
            href={`/daily-challenges/${slug}/answers?date=${prevDateSlug}`}
            className="fr-btn fr-btn--ghost fr-btn--sm px-2"
            aria-label={`Previous day (${prevDateSlug})`}
          >
            ‹
          </Link>
          <p className="text-muted min-w-[10rem] text-sm">
            {reveal ? formatDate(reveal.challengeDate) : formatDate(viewingDate)}
          </p>
          {canGoNext ? (
            <Link
              href={`/daily-challenges/${slug}/answers?date=${nextDateSlug}`}
              className="fr-btn fr-btn--ghost fr-btn--sm px-2"
              aria-label={`Next day (${nextDateSlug})`}
            >
              ›
            </Link>
          ) : (
            <span className="fr-btn fr-btn--ghost fr-btn--sm text-faint px-2 opacity-40" aria-hidden>
              ›
            </span>
          )}
        </div>
      </div>

      {/* Chips for every daily game, mirroring the leaderboard page. Without them, arriving here
        from the hub would strand you on whichever game the link happened to name — which is the
        same trap the hub's old hardcoded `sudoku` leaderboard link fell into. */}
      <div className="scrollbar-hide mb-4 flex flex-wrap justify-center gap-1.5 overflow-x-auto pb-2">
        {DAILY_CHALLENGE_GAME_TYPES.map((option) => (
          <Link
            key={option}
            href={`/daily-challenges/${DAILY_GAME_TYPE_TO_SLUG[option]}/answers${dateParam ? `?date=${dateParam}` : ''}`}
            className={`shrink-0 fr-btn fr-btn--sm ${option === gameType ? 'fr-btn--primary' : 'fr-btn--ghost'}`}
            style={{ fontSize: 'var(--text-2xs)' }}
          >
            <Glyph icon={dailyChallengeIcon(option)} size={12} className="shrink-0" /> {DAILY_GAME_LABELS[option]}
          </Link>
        ))}
      </div>

      {state === 'loading' ? (
        <p className="text-faint py-12 text-center text-sm">Loading…</p>
      ) : state === 'empty' || !reveal ? (
        <div className="glass-card p-6 text-center">
          <p className="text-body text-sm">No answers to show for this date.</p>
          <p className="text-faint mt-1 text-xs">
            Answers go up the day after a puzzle closes, so today&apos;s stay secret until tomorrow.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reveal.sections.map((section, i) => (
            <Section key={i} section={section} />
          ))}
        </div>
      )}

      <div className="mt-8 space-y-2">
        <Link href={`/daily-challenges/${slug}`} className="fr-btn fr-btn--primary fr-btn--block">
          Play today&apos;s {label}
        </Link>
        <Link href="/daily-challenges" className="fr-btn fr-btn--secondary fr-btn--block">
          Back to Daily Challenges
        </Link>
      </div>
    </div>
  )
}

/** Sudoku sections use 9×9 grids — render with 3×3 block dividers rather than a flat mesh. */
const SUDOKU_SIZE = 9

/** Cycling colour palette for the word-search word-path highlights — CSS custom-props keyed on
 *  --idx so cells can compose their own background from the palette. Palette scales cleanly in
 *  both themes because it's a mix into the tile surface, not a hardcoded backdrop. */
const WORD_SEARCH_HIGHLIGHT_COLORS = [
  '#f43f5e',
  '#06b6d4',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#3b82f6',
  '#ec4899',
  '#14b8a6',
]

function Section({ section }: { section: DailyAnswerSection }) {
  const columnCount = useMemo(() => (section.kind === 'lines' ? section.items.length : 0), [section])

  if (section.kind === 'wordSearch') {
    const cols = section.grid[0]?.length ?? 1
    // For each cell, remember every placement whose path passes through — so a cell shared by
    // two crossing words shows both colours (as vertical/horizontal stripes) instead of the
    // last-write-wins problem you get from a plain override.
    const cellOwners = new Map<string, number[]>()
    section.placements.forEach((placement, pIdx) => {
      placement.cells.forEach((c) => {
        const key = `${c.row}-${c.col}`
        const list = cellOwners.get(key)
        if (list) list.push(pIdx)
        else cellOwners.set(key, [pIdx])
      })
    })

    return (
      <div className="glass-card p-4 space-y-3">
        {section.label ? <p className="label-caps">{section.label}</p> : null}
        <div className="overflow-x-auto">
          <div
            className="inline-grid gap-px bg-[var(--border-strong)]"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {section.grid.flatMap((row, r) =>
              row.map((cell, c) => {
                const owners = cellOwners.get(`${r}-${c}`) ?? []
                const color =
                  owners.length > 0
                    ? WORD_SEARCH_HIGHLIGHT_COLORS[owners[0] % WORD_SEARCH_HIGHLIGHT_COLORS.length]
                    : null
                return (
                  <span
                    key={`${r}-${c}`}
                    className="surface-inset flex h-7 w-7 items-center justify-center text-xs font-bold tabular-nums sm:h-8 sm:w-8 sm:text-sm"
                    style={
                      color
                        ? {
                            background: `color-mix(in srgb, ${color} 28%, transparent)`,
                            color: 'var(--text)',
                          }
                        : undefined
                    }
                  >
                    {cell}
                  </span>
                )
              })
            )}
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {section.placements.map((placement, i) => {
            const color = WORD_SEARCH_HIGHLIGHT_COLORS[i % WORD_SEARCH_HIGHLIGHT_COLORS.length]
            return (
              <li key={i} className="text-body inline-flex items-center gap-1.5 font-semibold">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
                {placement.word}
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  if (section.kind === 'grid') {
    const cols = section.rows[0]?.length ?? 1
    const isSudoku = cols === SUDOKU_SIZE && section.rows.length === SUDOKU_SIZE
    return (
      <div className="glass-card p-4">
        {section.label ? <p className="label-caps mb-2">{section.label}</p> : null}
        <div className="overflow-x-auto">
          <div
            className={
              isSudoku
                ? 'inline-block border-2 border-[var(--border-strong)] bg-[var(--border-strong)]'
                : 'inline-grid gap-px'
            }
            style={
              isSudoku
                ? undefined
                : { display: 'inline-grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 1 }
            }
          >
            {isSudoku ? (
              <div
                className="grid gap-px bg-[var(--border-strong)]"
                style={{ gridTemplateColumns: `repeat(${SUDOKU_SIZE}, minmax(0, 1fr))` }}
              >
                {section.rows.flatMap((row, r) =>
                  row.map((cell, c) => (
                    <span
                      key={`${r}-${c}`}
                      className="surface-inset flex h-9 w-9 items-center justify-center text-base font-bold tabular-nums sm:h-10 sm:w-10"
                      style={{
                        // Thicker rule every 3 cells to draw the 3×3 blocks.
                        marginTop: r > 0 && r % 3 === 0 ? 2 : 0,
                        marginLeft: c > 0 && c % 3 === 0 ? 2 : 0,
                      }}
                    >
                      {cell}
                    </span>
                  ))
                )}
              </div>
            ) : (
              section.rows.flatMap((row, r) =>
                row.map((cell, c) => (
                  <span
                    key={`${r}-${c}`}
                    className="surface-inset flex h-8 w-8 items-center justify-center text-sm font-bold tabular-nums"
                  >
                    {cell}
                  </span>
                ))
              )
            )}
          </div>
        </div>
      </div>
    )
  }

  // Multi-column layout kicks in for long word lists so a 162-word list doesn't stretch a
  // mile down the page. CSS multi-column keeps it responsive (1 col on phones, up to 3 on
  // wide screens) without any pagination state.
  const useColumns = columnCount > 20 && section.items.every((item) => !item.label)

  return (
    <div className="glass-card p-4">
      {section.label ? <p className="label-caps mb-2">{section.label}</p> : null}
      {useColumns ? (
        <ul
          className="text-body text-sm font-bold [column-fill:_balance]"
          style={{ columnCount: 3 as unknown as string, columnGap: '1.25rem' }}
        >
          {section.items.map((item, i) => (
            <li key={i} className="break-inside-avoid py-0.5" style={{ breakInside: 'avoid' }}>
              {item.value}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-1.5">
          {section.items.map((item, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              {item.label ? <span className="text-muted min-w-0 flex-1">{item.label}</span> : null}
              <span className="text-body font-bold">{item.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatDate(date: string): string {
  // Parsed as UTC midnight and formatted in UTC — the string is already a WAT calendar date, so
  // letting the browser's zone reinterpret it would show the wrong day either side of midnight.
  const parsed = new Date(`${date}T00:00:00Z`)
  return parsed.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

/** YYYY-MM-DD for today in WAT. */
function todayWatSlug(): string {
  // WAT is UTC+1 with no DST — shift the current instant an hour forward and take the date.
  const nowMs = Date.now() + 60 * 60 * 1000
  return new Date(nowMs).toISOString().slice(0, 10)
}

/** YYYY-MM-DD for yesterday in WAT. */
function yesterdayWatSlug(): string {
  return shiftDay(todayWatSlug(), -1)
}

/** Strict YYYY-MM-DD validator: shape check + a round-trip through Date so a value like
 *  2024-02-30 (silently normalised to 2024-03-01) or 2024-13-01 (rejected by Date, but
 *  passes the regex) is refused rather than crashing shiftDay downstream. */
function isDateSlug(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Shift a WAT YYYY-MM-DD string by N days (positive or negative). */
function shiftDay(date: string, delta: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}
