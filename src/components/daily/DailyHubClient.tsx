'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  DAILY_CHALLENGE_GAME_TYPES,
  DAILY_GAME_LABELS,
  DAILY_GAME_EMOJIS,
  DAILY_GAME_TYPE_TO_SLUG,
  DAILY_GAME_PRIMARY_METRIC,
  DAILY_GAME_TIMER,
  DAILY_CHALLENGE_LAUNCH,
  isDailyChallengeLive,
  type DailyChallengeGameType,
} from '@/lib/daily-challenge'
import { formatDayLabel } from '@/lib/community-dates'
import { authHeaders } from '@/lib/identity'
import { getDailyStartedAt } from '@/lib/daily-progress'

interface GameStatus {
  gameType: DailyChallengeGameType
  available: boolean
  played: boolean
  score: number | null
  challengeId: string | null
}

export function DailyHubClient() {
  const [games, setGames] = useState<GameStatus[]>([])
  const [challengeNumber, setChallengeNumber] = useState(0)
  const [loading, setLoading] = useState(true)
  // challengeId → epoch-ms the local attempt started (localStorage), read after mount. Lets us tell
  // an in-progress attempt (time left → "Continue") from an expired one (time's up but never
  // submitted → "See result", clicking finalizes it).
  const [startedAtById, setStartedAtById] = useState<Record<string, number>>({})

  useEffect(() => {
    async function load() {
      try {
        const headers = await authHeaders()
        const res = await fetch('/api/daily/status', {
          headers: headers ?? undefined,
        })
        if (!res.ok) return
        const data = await res.json()
        const loaded: GameStatus[] = data.games ?? []
        setGames(loaded)
        setChallengeNumber(data.challengeNumber ?? 0)
        const map: Record<string, number> = {}
        for (const g of loaded) {
          if (!g.challengeId) continue
          const startedAt = getDailyStartedAt(g.challengeId)
          if (startedAt != null) map[g.challengeId] = startedAt
        }
        setStartedAtById(map)
      } catch {
        // Silent fail
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const completedCount = games.filter((g) => g.played).length

  // Dormant before launch — the code can ship early without the challenge going live.
  if (!isDailyChallengeLive()) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="text-4xl mb-3">🗓️</div>
        <h1 className="font-bold" style={{ fontSize: 'var(--text-2xl)', fontFamily: 'var(--font-display)' }}>
          Daily Challenge starts {formatDayLabel(DAILY_CHALLENGE_LAUNCH)}
        </h1>
        <p className="mt-2" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
          Five puzzles a day, same for everyone, one shot each. Come back on launch day!
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="font-bold" style={{ fontSize: 'var(--text-2xl)', fontFamily: 'var(--font-display)' }}>
          Daily Challenge
        </h1>
        <p className="mt-1" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
          Same puzzle for everyone. One shot, one score.
        </p>
        {challengeNumber > 0 && (
          <p
            className="mt-2 font-semibold uppercase tracking-wider"
            style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}
          >
            Day #{challengeNumber}
          </p>
        )}

        {/* Progress dots */}
        {!loading && completedCount > 0 && (
          <div
            className="mt-3 inline-flex items-center gap-2 fr-card !py-1.5 !px-4"
            style={{ fontSize: 'var(--text-sm)' }}
          >
            <span style={{ color: 'var(--text-muted)' }}>{completedCount}/5 completed</span>
            <div className="flex gap-1">
              {DAILY_CHALLENGE_GAME_TYPES.map((gt) => {
                const played = games.find((g) => g.gameType === gt)?.played
                return (
                  <div
                    key={gt}
                    className="w-2 h-2 rounded-full"
                    style={{ background: played ? 'var(--primary)' : 'var(--surface-sunken)' }}
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Game cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        {loading
          ? DAILY_CHALLENGE_GAME_TYPES.map((gt) => <div key={gt} className="fr-card animate-pulse h-[88px]" />)
          : DAILY_CHALLENGE_GAME_TYPES.map((gt) => {
              const status = games.find((g) => g.gameType === gt)
              const played = status?.played ?? false
              const score = status?.score ?? null
              const startedAt = status?.challengeId ? startedAtById[status.challengeId] : undefined
              // In progress = time still left; expired = time's up but never submitted (opening it
              // just finalizes the result).
              const inProgress = startedAt != null && Date.now() < startedAt + DAILY_GAME_TIMER[gt] * 1000
              const expired = startedAt != null && !inProgress
              const slug = DAILY_GAME_TYPE_TO_SLUG[gt]
              const metric = DAILY_GAME_PRIMARY_METRIC[gt]

              return (
                <Link
                  key={gt}
                  href={`/daily/${slug}`}
                  className="fr-card fr-card--interactive flex items-center gap-4 !px-5 !py-4"
                  style={played ? { borderColor: 'var(--border-primary)', borderWidth: 1 } : undefined}
                >
                  <div className="text-3xl shrink-0">{DAILY_GAME_EMOJIS[gt]}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold" style={{ fontSize: 'var(--text-sm)' }}>
                      {DAILY_GAME_LABELS[gt]}
                    </h3>
                    <p className="mt-0.5" style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
                      {metric === 'time' ? 'Fastest time wins' : 'Highest score wins'}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {played && score !== null ? (
                      <div className="text-right">
                        <div className="font-bold" style={{ color: 'var(--primary)', fontSize: 'var(--text-sm)' }}>
                          {score} pts
                        </div>
                        <div
                          className="font-semibold uppercase tracking-wider mt-0.5"
                          style={{ fontSize: '10px', color: 'var(--green-600, #16a34a)' }}
                        >
                          Done
                        </div>
                      </div>
                    ) : (
                      <span className="fr-btn fr-btn--primary fr-btn--sm">
                        {inProgress ? 'Continue' : expired ? 'See result' : 'Play'}
                      </span>
                    )}
                  </div>
                </Link>
              )
            })}
      </div>

      {/* Footer link */}
      <div className="text-center mt-8">
        <Link href="/daily/sudoku/leaderboard" className="fr-btn fr-btn--secondary fr-btn--sm">
          View Leaderboards
        </Link>
      </div>
    </div>
  )
}
