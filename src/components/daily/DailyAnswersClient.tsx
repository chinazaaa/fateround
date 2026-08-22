'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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
 * Yesterday's answers for one daily game.
 *
 * A separate page rather than a panel on the results screen, for one reason that decides it:
 * the answers a player wants are for the puzzle they JUST played, and those are not available
 * until tomorrow. Showing them inline after submitting would promise the wrong thing. A page
 * titled with the date it belongs to can't be misread, is linkable, and reads the same on both
 * platforms.
 *
 * The server refuses any date that isn't strictly in the past, so this component cannot be
 * coaxed into showing a live puzzle no matter what it asks for.
 */
export function DailyAnswersClient({ gameType, slug }: { gameType: DailyChallengeGameType; slug: string }) {
  const [reveal, setReveal] = useState<DailyAnswerReveal | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'empty'>('loading')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        // No date: the route defaults to yesterday, which is the only one worth linking to.
        const res = await fetch(`/api/daily-challenges/${gameType}/answers`, { cache: 'no-store' })
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
  }, [gameType])

  const label = DAILY_GAME_LABELS[gameType]

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black sm:text-3xl">Yesterday&apos;s {label} answers</h1>
        <p className="text-muted mt-1 text-sm">
          {reveal ? formatDate(reveal.challengeDate) : 'Published a day after each puzzle closes.'}
        </p>
      </div>

      {/* Chips for every daily game, mirroring the leaderboard page. Without them, arriving here
        from the hub would strand you on whichever game the link happened to name — which is the
        same trap the hub's old hardcoded `sudoku` leaderboard link fell into. */}
      <div className="scrollbar-hide mb-4 flex flex-wrap justify-center gap-1.5 overflow-x-auto pb-2">
        {DAILY_CHALLENGE_GAME_TYPES.map((option) => (
          <Link
            key={option}
            href={`/daily-challenges/${DAILY_GAME_TYPE_TO_SLUG[option]}/answers`}
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
          <p className="text-body text-sm">No answers to show yet.</p>
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

function Section({ section }: { section: DailyAnswerSection }) {
  if (section.kind === 'grid') {
    return (
      <div className="glass-card p-4">
        {section.label ? <p className="label-caps mb-2">{section.label}</p> : null}
        {/* Scrolls inside its own box — a 9×9 grid must never widen the page on a phone. */}
        <div className="overflow-x-auto">
          <div
            className="inline-grid gap-px"
            style={{ gridTemplateColumns: `repeat(${section.rows[0]?.length ?? 1}, minmax(0, 1fr))` }}
          >
            {section.rows.flatMap((row, r) =>
              row.map((cell, c) => (
                <span
                  key={`${r}-${c}`}
                  className="surface-inset flex h-8 w-8 items-center justify-center text-sm font-bold tabular-nums"
                >
                  {cell}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-card p-4">
      {section.label ? <p className="label-caps mb-2">{section.label}</p> : null}
      <ul className="space-y-1.5">
        {section.items.map((item, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            {item.label ? <span className="text-muted min-w-0 flex-1">{item.label}</span> : null}
            <span className="text-body font-bold">{item.value}</span>
          </li>
        ))}
      </ul>
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
