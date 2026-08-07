'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SiteChrome } from '@/components/SiteChrome'

const PODIUM_TINTS = ['#d4a017', '#8e9099', '#a4682d']

interface TrophyEntry {
  rank: number
  handle: string | null
  trophyPoints: number
  trophyLevel: number
  currentStreak: number
  longestStreak: number
}

export default function TrophyLeaderboardPage() {
  const [entries, setEntries] = useState<TrophyEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/leaderboard/trophies')
      .then((r) => r.json())
      .then((d) => setEntries(d.entries ?? []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <SiteChrome>
      <div className="fr-band fr-band--tight">
        <div className="mk-wrap">
          <div className="mb-6 space-y-2 text-center">
            <Link
              href="/leaderboard"
              className="text-xs font-semibold no-underline"
              style={{ color: 'var(--text-faint)' }}
            >
              ← Leaderboards
            </Link>
            <h1 className="fr-display m-0 text-3xl tracking-tight sm:text-4xl" style={{ color: 'var(--text)' }}>
              Trophy Leaderboard
            </h1>
            <p className="mx-auto max-w-md text-sm" style={{ color: 'var(--text-muted)' }}>
              Top players ranked by trophy points
            </p>
          </div>

          <div className="mx-auto max-w-2xl space-y-4">
            {loading ? (
              <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                Loading…
              </p>
            ) : entries.length === 0 ? (
              <div className="fr-card p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                No trophy holders yet. Play games and earn trophies to appear here!
              </div>
            ) : (
              <>
                {/* Top 3 spotlight */}
                {entries.length >= 1 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {entries.slice(0, 3).map((e) => {
                      const tint = PODIUM_TINTS[e.rank - 1]
                      return (
                        <div
                          key={e.rank}
                          className="fr-card p-5 text-center"
                          style={{
                            borderColor: `color-mix(in srgb, ${tint} 30%, var(--border))`,
                          }}
                        >
                          <span
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold mb-2"
                            style={{
                              background: `color-mix(in srgb, ${tint} 18%, transparent)`,
                              color: tint,
                            }}
                          >
                            {e.rank}
                          </span>
                          <p className="text-lg font-bold truncate" style={{ color: 'var(--text)' }}>
                            {e.handle ?? 'Anonymous'}
                          </p>
                          <p className="text-sm font-semibold" style={{ color: tint }}>
                            {e.trophyPoints} pts
                          </p>
                          <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
                            Level {e.trophyLevel}
                            {e.currentStreak > 0 && ` · ${e.currentStreak}d streak`}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Rest of the list */}
                {entries.length > 3 && (
                  <div className="fr-card divide-y" style={{ borderColor: 'var(--border)' }}>
                    {entries.slice(3).map((e) => (
                      <div key={e.rank} className="flex items-center gap-3 px-4 py-3">
                        <span
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                          style={{ color: 'var(--text-faint)' }}
                        >
                          {e.rank}
                        </span>
                        <span className="font-semibold flex-1 truncate" style={{ color: 'var(--text)' }}>
                          {e.handle ?? 'Anonymous'}
                        </span>
                        <span className="text-xs shrink-0" style={{ color: 'var(--text-faint)' }}>
                          Level {e.trophyLevel}
                          {e.currentStreak > 0 && ` · ${e.currentStreak}d`}
                        </span>
                        <span className="text-sm font-semibold shrink-0" style={{ color: 'var(--text-muted)' }}>
                          {e.trophyPoints} pts
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </SiteChrome>
  )
}
