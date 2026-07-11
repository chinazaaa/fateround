import { useEffect, useState } from 'react'
import type { GamePlayerLimitsMap } from '@fateround/shared/lobby-limits'
import { getCodeDefaultLimits } from '@fateround/shared/lobby-limits'
import { fetchGamePlayerLimits } from '@/lib/game-api'

export function useGamePlayerLimits() {
  const [limits, setLimits] = useState<GamePlayerLimitsMap>(() => getCodeDefaultLimits())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void fetchGamePlayerLimits()
      .then((next) => {
        if (!cancelled) setLimits(next)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { limits, loading }
}
