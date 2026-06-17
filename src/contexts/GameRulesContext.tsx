'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { parseGameType } from '@/lib/game-types'
import type { GameType } from '@/types'

type GameRulesContextValue = {
  gameType: GameType | null
  setGameType: (gameType: GameType | null) => void
}

const GameRulesContext = createContext<GameRulesContextValue | null>(null)

export function GameRulesProvider({ children }: { children: ReactNode }) {
  const [gameType, setGameType] = useState<GameType | null>(null)
  const value = useMemo(() => ({ gameType, setGameType }), [gameType])
  return <GameRulesContext.Provider value={value}>{children}</GameRulesContext.Provider>
}

export function useGameRules() {
  const ctx = useContext(GameRulesContext)
  if (!ctx) throw new Error('useGameRules must be used within GameRulesProvider')
  return ctx
}

export function GameRulesSync({ gameType }: { gameType: GameType | string | null | undefined }) {
  const { setGameType } = useGameRules()

  useEffect(() => {
    if (!gameType) {
      setGameType(null)
      return
    }
    setGameType(parseGameType(gameType))
    return () => setGameType(null)
  }, [gameType, setGameType])

  return null
}
