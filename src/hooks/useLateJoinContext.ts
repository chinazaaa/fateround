'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchLateJoinContext, type LateJoinContext } from '@/lib/late-join-context'
import { supabase } from '@/lib/supabase'
import type { Game } from '@/types'

export function useLateJoinContext(
  gameCode: string,
  game: Pick<Game, 'game_type' | 'status' | 'current_round_number' | 'rounds_count'> | null,
  enabled: boolean,
  /** Bumps context when mid-game stats change (e.g. bingo calls). */
  refreshKey?: number | string
) {
  const [context, setContext] = useState<LateJoinContext | null>(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!game || game.status !== 'active') {
      setContext(null)
      return
    }
    setLoading(true)
    try {
      const ctx = await fetchLateJoinContext(supabase, gameCode, game)
      setContext(ctx)
    } finally {
      setLoading(false)
    }
  }, [gameCode, game])

  useEffect(() => {
    if (!enabled || !game) {
      setContext(null)
      return
    }
    void reload()
  }, [enabled, game, reload, refreshKey])

  return { context, loading, reload }
}
