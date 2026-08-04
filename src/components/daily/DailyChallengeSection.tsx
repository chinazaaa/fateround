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
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Today&apos;s puzzles — one shot, one score
          </p>
        </div>
        <Link href="/daily" className="fr-btn fr-btn--ghost fr-btn--sm">
          See all &rarr;
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {DAILY_CHALLENGE_GAME_TYPES.map((gt) => {
          const status = games.find((g) => g.gameType === gt)
          const played = status?.played ?? false
          const score = status?.score ?? null
          const slug = DAILY_GAME_TYPE_TO_SLUG[gt]

          return (
            <Link
              key={gt}
              href={`/daily/${slug}`}
              className={`fr-card fr-card--interactive flex flex-col items-center text-center !p-4 gap-1.5 ${loading ? 'animate-pulse' : ''}`}
            >
              <div className="text-2xl">{DAILY_GAME_EMOJIS[gt]}</div>
              <div className="text-xs font-semibold">{DAILY_GAME_LABELS[gt]}</div>
              {!loading && (
                <div className="mt-0.5">
                  {played && score !== null ? (
                    <span className="fr-badge fr-badge--soft" style={{ fontSize: 'var(--text-2xs)' }}>
                      {score} pts
                    </span>
                  ) : (
                    <span
                      className="font-bold uppercase tracking-wider"
                      style={{ fontSize: 'var(--text-2xs)', color: 'var(--primary)' }}
                    >
                      Play
                    </span>
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
