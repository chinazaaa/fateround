'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useGameRules } from '@/contexts/GameRulesContext'
import { supabase } from '@/lib/supabase'
import { parseGameType } from '@/lib/game-types'

export function GameRulesLoader() {
  const params = useParams()
  const { setGameType } = useGameRules()
  const code = typeof params?.code === 'string' ? params.code.toUpperCase() : null

  useEffect(() => {
    if (!code) {
      setGameType(null)
      return
    }

    let cancelled = false

    void supabase
      .from('games')
      .select('game_type')
      .eq('id', code)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setGameType(data?.game_type ? parseGameType(data.game_type) : null)
      })

    return () => {
      cancelled = true
      setGameType(null)
    }
  }, [code, setGameType])

  return null
}
