'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  DAILY_CHALLENGE_GAME_TYPES,
  DAILY_GAME_LABELS,
  DAILY_GAME_EMOJIS,
  DAILY_GAME_TYPE_TO_SLUG,
  type DailyChallengeGameType,
} from '@/lib/daily-challenge'
import { authHeaders } from '@/lib/identity'

interface GameStatus {
  gameType: DailyChallengeGameType
  played: boolean
  score: number | null
}

export function DailyChallengeSection() {
  const [games, setGames] = useState<GameStatus[]>([])
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
      } catch {
        // Silent fail — section just shows "Play" for everything
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <section className="mt-10 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold">Daily Challenge</h2>
          <p className="text-muted text-sm">Today&apos;s puzzles — one shot, one score</p>
        </div>
        <Link href="/daily" className="btn-secondary text-sm px-3 py-1.5 rounded-xl">
          See all &rarr;
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 animate-stagger">
        {DAILY_CHALLENGE_GAME_TYPES.map((gt) => {
          const status = games.find((g) => g.gameType === gt)
          const played = status?.played ?? false
          const score = status?.score ?? null
          const slug = DAILY_GAME_TYPE_TO_SLUG[gt]

          return (
            <Link
              key={gt}
              href={`/daily/${slug}`}
              className={`glass-card glass-card-interactive flex flex-col items-center text-center p-4 gap-1.5 ${loading ? 'animate-pulse' : ''}`}
            >
              <div
                className="text-2xl"
                style={{ filter: 'drop-shadow(0 4px 8px color-mix(in srgb, var(--primary) 20%, transparent))' }}
              >
                {DAILY_GAME_EMOJIS[gt]}
              </div>
              <div className="text-xs font-semibold">{DAILY_GAME_LABELS[gt]}</div>
              {!loading && (
                <div className="mt-0.5">
                  {played && score !== null ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                      {score} pts
                    </span>
                  ) : (
                    <span className="label-caps text-primary">Play</span>
                  )}
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
