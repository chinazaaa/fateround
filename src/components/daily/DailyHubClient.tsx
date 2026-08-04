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

  const completedCount = games.filter((g) => g.played).length

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold gradient-title inline-block">Daily Challenge</h1>
        <p className="text-muted mt-1">Same puzzle for everyone. One shot, one score.</p>
        {challengeNumber > 0 && <p className="label-caps mt-2">Day #{challengeNumber}</p>}
        {!loading && completedCount > 0 && (
          <div className="mt-3">
            <div className="inline-flex items-center gap-2 glass-card px-4 py-1.5 text-sm">
              <span className="text-muted">{completedCount}/5 completed</span>
              <div className="flex gap-0.5">
                {DAILY_CHALLENGE_GAME_TYPES.map((gt) => {
                  const played = games.find((g) => g.gameType === gt)?.played
                  return <div key={gt} className={`w-2 h-2 rounded-full ${played ? 'bg-primary' : 'surface-inset'}`} />
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 animate-stagger">
        {loading
          ? DAILY_CHALLENGE_GAME_TYPES.map((gt) => <div key={gt} className="glass-card animate-pulse h-[88px]" />)
          : DAILY_CHALLENGE_GAME_TYPES.map((gt) => {
              const status = games.find((g) => g.gameType === gt)
              const played = status?.played ?? false
              const score = status?.score ?? null
              const slug = DAILY_GAME_TYPE_TO_SLUG[gt]
              const metric = DAILY_GAME_PRIMARY_METRIC[gt]

              return (
                <Link
                  key={gt}
                  href={`/daily/${slug}`}
                  className={`glass-card glass-card-interactive flex items-center gap-4 px-5 py-4 ${played ? 'border-primary/20' : ''}`}
                >
                  <div
                    className="text-3xl shrink-0"
                    style={{
                      filter: 'drop-shadow(0 4px 10px color-mix(in srgb, var(--primary) 20%, transparent))',
                    }}
                  >
                    {DAILY_GAME_EMOJIS[gt]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm">{DAILY_GAME_LABELS[gt]}</h3>
                    <p className="text-faint text-xs mt-0.5">
                      {metric === 'time' ? 'Fastest time wins' : 'Highest score wins'}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {played && score !== null ? (
                      <div className="text-right">
                        <div className="text-primary font-bold text-sm">{score} pts</div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-green-500 mt-0.5">
                          Done
                        </div>
                      </div>
                    ) : (
                      <div className="btn-primary text-xs px-4 py-1.5 rounded-xl">Play</div>
                    )}
                  </div>
                </Link>
              )
            })}
      </div>

      <div className="text-center mt-8">
        <Link
          href="/daily/sudoku/leaderboard"
          className="btn-secondary text-sm px-5 py-2 rounded-xl inline-flex items-center gap-2"
        >
          View Leaderboards
        </Link>
      </div>
    </div>
  )
}
