'use client'

import { useParams } from 'next/navigation'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { GameRulesLoader } from '@/components/GameRulesLoader'
import { GameRulesProvider, useGameRules } from '@/contexts/GameRulesContext'

function HostRulesBar() {
  const { gameType } = useGameRules()
  if (!gameType) return null

  return (
    <div className="fixed top-3 right-4 z-50 pointer-events-auto">
      <GameRulesLink gameType={gameType} variant="header" />
    </div>
  )
}

export function HostRulesChrome() {
  const params = useParams()
  const code = typeof params?.code === 'string' ? params.code : null
  if (!code) return null

  return (
    <GameRulesProvider>
      <GameRulesLoader />
      <HostRulesBar />
    </GameRulesProvider>
  )
}
