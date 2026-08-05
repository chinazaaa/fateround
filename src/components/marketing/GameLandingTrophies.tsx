'use client'

import { useEffect, useState } from 'react'
import type { PublicTrophy } from '@/lib/trophies/public'
import { Glyph } from '@/components/icons/Glyph'
import { ChampionIcon, CrownIcon, LockIcon, StarIcon } from '@hugeicons/core-free-icons'

const TIER_ICONS = {
  bronze: StarIcon,
  silver: StarIcon,
  gold: CrownIcon,
  platinum: ChampionIcon,
}

/**
 * The "Trophies" strip on a game landing page.
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
      <h2 className="sec-title-fr" style={{ color: 'var(--accent)' }}>
        Trophies
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {trophies.map((trophy) => {
          const IconComponent = trophy.hidden
            ? LockIcon
            : (TIER_ICONS[trophy.tier as keyof typeof TIER_ICONS] ?? ChampionIcon)
          return (
            <div
              key={trophy.id}
              className="fr-gamecard cursor-default flex items-start gap-3"
              style={{ '--accent': 'var(--accent)' } as React.CSSProperties}
            >
              <span className={`fr-glyph mt-0.5 ${trophy.hidden ? 'opacity-50' : ''}`}>
                <Glyph icon={IconComponent} size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="fr-gamecard__title text-[15px]">{trophy.title}</h3>
                <p className="fr-gamecard__tagline text-[13.5px] leading-[1.5]">{trophy.description}</p>
                <p className="mt-1.5 text-[12.5px]" style={{ color: 'var(--text-faint)' }}>
                  {trophy.points} pt{trophy.points === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
