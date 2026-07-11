import { useEffect, useState } from 'react'
import type { Game } from '@fateround/shared'
import { fetchLateJoinContext, type LateJoinContext } from '@/lib/late-join-context'
import { getSupabase } from '@/lib/supabase'

export function useLateJoinContext(gameCode: string, game: Game | null, enabled: boolean) {
  const [context, setContext] = useState<LateJoinContext | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || !game || game.status !== 'active') {
      setContext(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    void fetchLateJoinContext(getSupabase(), gameCode, game)
      .then((value) => {
        if (!cancelled) setContext(value)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [enabled, game, gameCode])

  return { context, loading }
}
