'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  DAILY_CHALLENGE_GAME_TYPES,
  DAILY_GAME_LABELS,
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
import { dailyChallengeIcon } from '@/lib/game-glyphs'
import { Glyph } from '@/components/icons/Glyph'
import { Calendar03Icon } from '@hugeicons/core-free-icons'
import { useExpiryRefresh } from '@/hooks/useExpiryRefresh'

interface GameStatus {
  gameType: DailyChallengeGameType
  available: boolean
  played: boolean
  score: number | null
  rank: number | null
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
        const res = await fetch('/api/daily-challenges/status', {
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

  // Dormant before launch — the code can ship early without the challenge going live.
  if (!isDailyChallengeLive()) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="flex justify-center text-[var(--primary)] mb-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]">
            <Glyph icon={Calendar03Icon} size={24} />
          </span>
        </div>
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
        <h1 className="fr-display text-[2rem]">Daily Challenge</h1>
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
            <span style={{ color: 'var(--text-muted)' }}>
              {completedCount}/{DAILY_CHALLENGE_GAME_TYPES.length} completed
            </span>
            <div className="flex gap-1">
              {DAILY_CHALLENGE_GAME_TYPES.map((gameType) => {
                const played = games.find((game) => game.gameType === gameType)?.played
                return (
                  <div
                    key={gameType}
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
        {DAILY_CHALLENGE_GAME_TYPES.map((gameType) => {
          const status = games.find((game) => game.gameType === gameType)
          const played = status?.played ?? false
          const score = status?.score ?? null
          const rank = status?.rank ?? null
          const startedAt = status?.challengeId ? startedAtById[status.challengeId] : undefined
          // In progress = time still left; expired = time's up but never submitted (opening it
          // just finalizes the result).
          const inProgress = startedAt != null && now < startedAt + DAILY_GAME_TIMER[gameType] * 1000
          const expired = startedAt != null && !inProgress
          const slug = DAILY_GAME_TYPE_TO_SLUG[gameType]
          const metric = DAILY_GAME_PRIMARY_METRIC[gameType]

          return (
            <Link
              key={gameType}
              href={`/daily-challenges/${slug}`}
              className="fr-card fr-card--interactive flex items-center gap-4 !px-5 !py-4 no-underline"
              style={played ? { borderColor: 'var(--border-primary)', borderWidth: 1 } : undefined}
            >
              <span className="fr-glyph fr-glyph--sm">
                <Glyph icon={dailyChallengeIcon(gameType)} size={22} />
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold" style={{ fontSize: 'var(--text-sm)' }}>
                  {DAILY_GAME_LABELS[gameType]}
                </h3>
                <p className="mt-0.5" style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
                  {metric === 'time' ? 'Fastest time wins' : 'Highest score wins'}
                </p>
              </div>
              {/* Height is reserved on every branch so the grid does not shift
                  when /api/daily-challenges/status resolves. */}
              <div className="flex h-[38px] shrink-0 items-center">
                {loading ? (
                  <span
                    className="block h-[26px] w-[52px] animate-pulse rounded-full"
                    style={{ background: 'var(--surface-sunken)' }}
                  />
                ) : played && score !== null ? (
                  <div className="text-right">
                    <span className="fr-badge fr-badge--soft">{score} pts</span>
                    {rank ? (
                      <span className="mt-1 block text-xs font-bold" style={{ color: 'var(--primary)' }}>
                        #{rank}
                      </span>
                    ) : (
                      <span className="mt-1 block text-xs font-semibold" style={{ color: 'var(--success)' }}>
                        Completed
                      </span>
                    )}
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
        <Link href="/daily-challenges/sudoku/leaderboard" className="fr-btn fr-btn--secondary fr-btn--sm">
          View Leaderboards
        </Link>
      </div>

      {/* SEO content */}
      <section className="mt-16 space-y-10" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        <div>
          <h2 className="font-bold mb-4" style={{ fontSize: 'var(--text-lg)', color: 'var(--foreground)' }}>
            How it works
          </h2>
          <ol className="list-decimal list-inside space-y-3">
            <li>
              <strong style={{ color: 'var(--foreground)' }}>One puzzle a day, the same for every player.</strong>{' '}
              Everyone gets identical content, so the leaderboard is a fair comparison — not a different randomised
              puzzle per person.
            </li>
            <li>
              <strong style={{ color: 'var(--foreground)' }}>One attempt.</strong> You get one shot at each day&apos;s
              challenge. No retries, no do-overs — that&apos;s what makes finishing it feel earned.
            </li>
            <li>
              <strong style={{ color: 'var(--foreground)' }}>Compete on the leaderboard.</strong> See how your time and
              score stack up against everyone else who played today.
            </li>
            <li>
              <strong style={{ color: 'var(--foreground)' }}>Come back tomorrow.</strong> A new puzzle goes live every
              day, so there&apos;s always a fresh challenge and a fresh leaderboard waiting.
            </li>
          </ol>
        </div>

        <div>
          <h2 className="font-bold mb-3" style={{ fontSize: 'var(--text-lg)', color: 'var(--foreground)' }}>
            Why play a daily puzzle
          </h2>
          <p className="leading-relaxed">
            A few minutes a day is enough to notice a difference. Crosswords and word puzzles are associated with
            sharper recall and vocabulary; Sudoku and trivia keep pattern recognition and general knowledge in shape.
            And because everyone plays the same puzzle each day, it&apos;s genuinely competitive — you&apos;re on the
            same leaderboard as every other player.
          </p>
        </div>

        <div>
          <h2 className="font-bold mb-4" style={{ fontSize: 'var(--text-lg)', color: 'var(--foreground)' }}>
            Frequently asked questions
          </h2>
          <dl className="space-y-4">
            <div>
              <dt className="font-semibold" style={{ color: 'var(--foreground)' }}>
                Is FateRound&apos;s daily challenge free?
              </dt>
              <dd className="mt-1">
                Yes — every daily puzzle is free to play, every day, for every player. No sign-up and no download
                required.
              </dd>
            </div>
            <div>
              <dt className="font-semibold" style={{ color: 'var(--foreground)' }}>
                Do I need an account to play?
              </dt>
              <dd className="mt-1">No — you can play today&apos;s puzzle straight away, no account needed.</dd>
            </div>
            <div>
              <dt className="font-semibold" style={{ color: 'var(--foreground)' }}>
                What time does the daily challenge reset?
              </dt>
              <dd className="mt-1">
                Every puzzle refreshes at midnight UTC, so everyone worldwide gets the same challenge on the same day.
              </dd>
            </div>
            <div>
              <dt className="font-semibold" style={{ color: 'var(--foreground)' }}>
                Is there a leaderboard?
              </dt>
              <dd className="mt-1">
                Yes — every daily puzzle has its own leaderboard showing how your score and time compare to everyone who
                played that day.
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  )
}
