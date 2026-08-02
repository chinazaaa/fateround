'use client'

import { useEffect, useState } from 'react'
import type { PublicTrophy } from '@/lib/trophies/public'

const TROPHY_TIER_EMOJI: Record<string, string> = { bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '🏆' }

/**
 * The "Trophies" strip on a game landing page.
 *
 * Fetched on the client, on purpose: the landing page is statically generated (ISR), so a
 * server-rendered version reads the trophies table at BUILD time — where the service-role key is
 * absent and the strip bakes empty, then never fills in reliably. Loading from /api/game-trophies
 * at view time makes it come from the live DB every time. Renders nothing until (and unless) the
 * game has active trophies, so it stays invisible rather than flashing an empty section.
 */
export function GameLandingTrophies({ gameType }: { gameType: string }) {
  const [trophies, setTrophies] = useState<PublicTrophy[] | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/game-trophies?game=${encodeURIComponent(gameType)}`)
      .then((r) => (r.ok ? r.json() : { trophies: [] }))
      .then((d) => {
        if (alive) setTrophies((d.trophies as PublicTrophy[]) ?? [])
      })
      .catch(() => {
        if (alive) setTrophies([])
      })
    return () => {
      alive = false
    }
  }, [gameType])

  if (!trophies || trophies.length === 0) return null

  return (
    <section id="trophies" className="scroll-mt-24">
      <h2 className="sec-title-fr">Trophies</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {trophies.map((trophy) => (
          <div
            key={trophy.id}
            className="flex items-start gap-3 rounded-[var(--radius-md)] p-[18px]"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderLeft: '3px solid var(--accent)',
            }}
          >
            <span className={`text-2xl ${trophy.hidden ? 'opacity-50' : ''}`} aria-hidden>
              {trophy.hidden ? '🔒' : (TROPHY_TIER_EMOJI[trophy.tier] ?? '🏅')}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="mb-1 text-[15px] font-bold" style={{ color: 'var(--text)' }}>
                {trophy.title}
              </h3>
              <p className="text-[13.5px] leading-[1.5]" style={{ color: 'var(--text-muted)' }}>
                {trophy.description}
              </p>
              <p className="mt-1.5 text-[12.5px]" style={{ color: 'var(--text-faint)' }}>
                {trophy.points} pt{trophy.points === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
