'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { GameType } from '@/types'
import { gameTypeCreateParam } from '@/lib/game-types'

const MarketingGameTypeModal = dynamic(
  () => import('@/components/MarketingGameTypeModal').then((m) => m.MarketingGameTypeModal),
  { ssr: false }
)

type Props = {
  joinInputId: string
}

/** Desktop-only hero CTAs — defers the game-type modal until "Create a Game" is clicked. */
export function HomePageHeroActions({ joinInputId }: Props) {
  const router = useRouter()
  const [showGameTypes, setShowGameTypes] = useState(false)

  const focusJoin = () => {
    document.getElementById(joinInputId)?.focus()
  }

  return (
    <>
      <div className="mt-6 hidden flex-wrap gap-3 lg:flex">
        <button type="button" className="fr-btn fr-btn--primary fr-btn--lg" onClick={() => setShowGameTypes(true)}>
          Create a Game
        </button>
        <button type="button" className="fr-btn fr-btn--secondary fr-btn--lg" onClick={focusJoin}>
          I have a code
        </button>
      </div>

      {showGameTypes && (
        <MarketingGameTypeModal
          open={showGameTypes}
          onClose={() => setShowGameTypes(false)}
          onSelect={(type: GameType) => router.push(`/create?type=${gameTypeCreateParam(type)}`)}
        />
      )}
    </>
  )
}
