'use client'

import { useEffect, useMemo, useState } from 'react'
import { useExpiryRefresh } from '@/hooks/useExpiryRefresh'
import Link from 'next/link'
import {
  DAILY_CHALLENGE_GAME_TYPES,
  DAILY_GAME_LABELS,
  DAILY_GAME_TYPE_TO_SLUG,
  DAILY_GAME_TIMER,
  isDailyChallengeLive,
  type DailyChallengeGameType,
} from '@/lib/daily-challenge'
import { dailyChallengeIcon } from '@/lib/game-glyphs'
import { Glyph } from '@/components/icons/Glyph'
import { SectionHeading } from '@/components/SectionHeading'
import { authHeaders } from '@/lib/identity'
import { getDailyStartedAt } from '@/lib/daily-progress'

interface GameStatus {
  gameType: DailyChallengeGameType
  played: boolean
  score: number | null
  challengeId: string | null
}

/** Each daily game keeps a distinct accent so the row reads like the games grid. */
const DAILY_GAME_ACCENTS: Record<DailyChallengeGameType, string> = {
  sudoku: '#3b82f6',
  word_hunt: '#8b5cf6',
  crossword: '#14b8a6',
  mini_crossword: '#06b6d4',
  word_search: '#f59e0b',
  word_scramble: '#ec4899',
  trivia: '#10b981',
  whot_puzzle: '#e74c3c',
  word_grouping: '#f97316',
  chess_mate: '#6366f1',
  codenames_codeword: '#84cc16',
  ludo_puzzle: '#22c55e',
  wordle: '#16a34a',
}

export function DailyChallengeSection() {
  const [games, setGames] = useState<GameStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [startedAtById, setStartedAtById] = useState<Record<string, number>>({})

  useEffect(() => {
    async function load() {
      try {
        const headers = await authHeaders()
        const res = await fetch('/api/daily-challenges/status', {
          headers: headers ?? undefined,
        })
        if (!res.ok) return
        const data = await res.json()
        const loaded: GameStatus[] = data.games ?? []
        setGames(loaded)
        const map: Record<string, number> = {}
        for (const g of loaded) {
          if (!g.challengeId) continue
          const startedAt = getDailyStartedAt(g.challengeId)
          if (startedAt != null) map[g.challengeId] = startedAt
        }
        setStartedAtById(map)
      } catch {
        // Silent fail — section just shows "Play" for everything
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Compute expiry deadlines for all in-progress challenges so the card
  // state auto-updates when a timer runs out.
  const deadlines = useMemo(() => {
    const result: number[] = []
    for (const g of games) {
      if (!g.challengeId || g.played) continue
      const s = startedAtById[g.challengeId]
      if (s != null) result.push(s + DAILY_GAME_TIMER[g.gameType] * 1000)
    }
    return result
  }, [games, startedAtById])
  const now = useExpiryRefresh(deadlines)

  // Hidden from the homepage until launch day.
  if (!isDailyChallengeLive()) return null

  return (
    <section className="fr-band fr-band--sunken">
      <div className="mk-wrap">
        <SectionHeading
          title="Daily Challenge"
          subtitle="Today's puzzles. Play daily, aim for the top."
          action={{ href: '/daily-challenges', label: 'See all' }}
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {DAILY_CHALLENGE_GAME_TYPES.map((gameType) => {
            const status = games.find((game) => game.gameType === gameType)
            const played = status?.played ?? false
            const score = status?.score ?? null
            const startedAt = status?.challengeId ? startedAtById[status.challengeId] : undefined
            const inProgress = startedAt != null && now < startedAt + DAILY_GAME_TIMER[gameType] * 1000
            const expired = startedAt != null && !inProgress
            const slug = DAILY_GAME_TYPE_TO_SLUG[gameType]

            return (
              <Link
                key={gameType}
                href={`/daily-challenges/${slug}`}
                className="fr-gamecard fr-gamecard--compact"
                style={{ '--accent': DAILY_GAME_ACCENTS[gameType] } as React.CSSProperties}
              >
                <span className="fr-glyph fr-glyph--sm">
                  <Glyph icon={dailyChallengeIcon(gameType)} size={22} />
                </span>
                <h3 className="fr-gamecard__title">{DAILY_GAME_LABELS[gameType]}</h3>
                {/* The badge slot keeps its height while the status request is in
                    flight, so the grid doesn't jump when the response lands. */}
                <div className="mt-auto flex min-h-[1.5rem] items-center justify-center">
                  {loading ? (
                    <span
                      className="h-[1.125rem] w-12 animate-pulse rounded-full"
                      style={{ background: 'var(--surface-sunken)' }}
                    />
                  ) : played && score !== null ? (
                    <span className="fr-badge fr-badge--soft">{score} pts</span>
                  ) : (
                    /* Accent-tinted, not `--surface-sunken` on `--text-muted`:
                       grey-on-grey is how this system styles a *disabled*
                       control, so the one actionable state read as the dead
                       one. Mirrors `.fr-gamecard__players`, and picks up the
                       per-game accent set on the card. */
                    <span
                      className="fr-badge"
                      style={{
                        background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                        color: 'color-mix(in srgb, var(--accent) 70%, var(--text))',
                      }}
                    >
                      {inProgress ? 'Continue' : expired ? 'See result' : 'Play'}
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
