'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

/**
 * "Trophies in this game" — a link from inside a room straight to that game's trophies.
 *
 * Resolves the game type client-side from the code, so the row can live in the settings sheet
 * without every caller having to thread `gameType` down to it. Renders nothing until it knows,
 * because a link that lands on the wrong game is worse than one that appears a beat late.
 */
export function TrophiesForThisGameLink({ gameCode, className }: { gameCode: string | null; className?: string }) {
  const [gameType, setGameType] = useState<string | null>(null)

  useEffect(() => {
    if (!gameCode) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase.from('games').select('game_type').eq('id', gameCode).maybeSingle()
      if (!cancelled && data?.game_type) setGameType(data.game_type as string)
    })()
    return () => {
      cancelled = true
    }
  }, [gameCode])

  if (!gameType) return null

  return (
    <Link href={`/profile/${encodeURIComponent(gameType)}`} className={className}>
      🏆 Trophies in this game
    </Link>
  )
}
