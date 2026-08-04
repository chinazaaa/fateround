'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  DAILY_CHALLENGE_GAME_TYPES,
  DAILY_GAME_LABELS,
  DAILY_GAME_EMOJIS,
  DAILY_GAME_TYPE_TO_SLUG,
  DAILY_GAME_PRIMARY_METRIC,
  type DailyChallengeGameType,
} from '@/lib/daily-challenge'
import { authHeaders } from '@/lib/identity'

interface GameStatus {
  gameType: DailyChallengeGameType
  available: boolean
  played: boolean
  score: number | null
}

export function DailyHubClient() {
  const [games, setGames] = useState<GameStatus[]>([])
  const [challengeNumber, setChallengeNumber] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const headers = await authHeaders()
        const res = await fetch('/api/daily/status', {
          headers: headers ?? undefined,
        })
        if (!res.ok) return
        const data = await res.json()
        setGames(data.games ?? [])
        setChallengeNumber(data.challengeNumber ?? 0)
      } catch {
        // Silent fail
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold">Daily Challenge</h1>
        <p className="text-base-content/60 mt-1">
          Same puzzle for everyone. One shot, one score.
        </p>
        {challengeNumber > 0 && (
          <p className="text-sm text-base-content/40 mt-1">Day #{challengeNumber}</p>
        )}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {DAILY_CHALLENGE_GAME_TYPES.map((gt) => (
            <div key={gt} className="card bg-base-200 animate-pulse h-32" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {DAILY_CHALLENGE_GAME_TYPES.map((gt) => {
            const status = games.find((g) => g.gameType === gt)
            const played = status?.played ?? false
            const score = status?.score ?? null
            const slug = DAILY_GAME_TYPE_TO_SLUG[gt]
            const metric = DAILY_GAME_PRIMARY_METRIC[gt]

            return (
              <Link
                key={gt}
                href={`/daily/${slug}`}
                className="card bg-base-200 hover:bg-base-300 transition-colors"
              >
                <div className="card-body flex-row items-center gap-4 py-4">
                  <div className="text-3xl">{DAILY_GAME_EMOJIS[gt]}</div>
                  <div className="flex-1">
                    <h3 className="font-bold">{DAILY_GAME_LABELS[gt]}</h3>
                    <p className="text-xs text-base-content/50">
                      {metric === 'time' ? 'Fastest time wins' : 'Highest score wins'}
                    </p>
                  </div>
                  <div>
                    {played && score !== null ? (
                      <div className="text-right">
                        <div className="badge badge-primary">{score} pts</div>
                        <div className="text-xs text-success mt-1">Completed</div>
                      </div>
                    ) : (
                      <div className="btn btn-primary btn-sm">Play</div>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Leaderboard link */}
      <div className="text-center mt-8">
        <Link href="/daily/sudoku/leaderboard" className="btn btn-outline btn-sm">
          View Leaderboards
        </Link>
      </div>
    </div>
  )
}
