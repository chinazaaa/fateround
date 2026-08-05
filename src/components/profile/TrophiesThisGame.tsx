'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { onTrophiesEarned, type EarnedTrophy } from '@/lib/trophies/earned-events'
import { Glyph } from '@/components/icons/Glyph'
import { ChampionIcon, CrownIcon, StarIcon } from '@hugeicons/core-free-icons'

const TIER_ICONS = {
  bronze: StarIcon,
  silver: StarIcon,
  gold: CrownIcon,
  platinum: ChampionIcon,
}

export function TrophiesThisGame() {
  const [trophies, setTrophies] = useState<EarnedTrophy[]>([])
  const [gameType, setGameType] = useState<string | undefined>()

  useEffect(() => {
    return onTrophiesEarned((earned, type) => {
      setTrophies(earned)
      setGameType(type)
    })
  }, [])

  if (!trophies.length) return null

  const order = ['platinum', 'gold', 'silver', 'bronze']
  const best = [...trophies].sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier))[0]
  const count = trophies.length
  const label = `${count} ${count === 1 ? 'trophy' : 'trophies'} this game`
  const BestIcon = TIER_ICONS[best.tier as keyof typeof TIER_ICONS] ?? ChampionIcon

  const body = (
    <>
      <span className="fr-glyph text-[var(--primary)]">
        <Glyph icon={BestIcon} size={18} />
      </span>
      <span className="font-semibold">{label}</span>
      {count === 1 && <span className="text-[var(--text-muted)]">· {best.title}</span>}
    </>
  )

  return (
    <div className="mt-4 flex justify-center">
      {gameType ? (
        <Link
          href={`/profile/${encodeURIComponent(gameType)}`}
          className="glass-card flex items-center gap-2 px-4 py-2 text-sm transition hover:brightness-105 no-underline"
        >
          {body}
          <span aria-hidden className="text-[var(--text-muted)]">
            →
          </span>
        </Link>
      ) : (
        <p className="glass-card flex items-center gap-2 px-4 py-2 text-sm">{body}</p>
      )}
    </div>
  )
}
