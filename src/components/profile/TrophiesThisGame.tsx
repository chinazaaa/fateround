'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { onTrophiesEarned, type EarnedTrophy } from '@/lib/trophies/earned-events'
import { Glyph } from '@/components/icons/Glyph'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { tierIcon } from '@/lib/game-glyphs'

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

  const body = (
    <>
      {/* Bare glyph, no `.fr-glyph` plate: this renders in GameHostChrome/GamePlayerChrome,
          which have no `.fr-site` ancestor and none of the `fr-*` tokens the plate needs. */}
      <Glyph icon={tierIcon(best.tier)} size={18} />
      <span className="font-semibold">{label}</span>
      {count === 1 && <span className="text-muted">· {best.title}</span>}
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
          <span className="text-muted">
            <Glyph icon={ArrowRight01Icon} size={16} />
          </span>
        </Link>
      ) : (
        <p className="glass-card flex items-center gap-2 px-4 py-2 text-sm">{body}</p>
      )}
    </div>
  )
}
