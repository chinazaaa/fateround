'use client'

import { useEffect, useState } from 'react'
import { useProfileAttribution } from '@/hooks/useProfileAttribution'
import { supabase } from '@/lib/supabase'

/** supabase-js reuses channels by topic and throws on a duplicate, so keep each mount distinct. */
let channelSeq = 0

/**
 * Runs the award pass for whoever is on this game page — player or host.
 *
 * WHY IT LIVES IN THE CHROME. Attribution used to run inside `useGameViewBootstrap` and
 * `useGameSession`, which sounded central and wasn't:
 *   - the HOST page uses neither, so a host who plays their own game never earned anything —
 *     and "host + play" is a normal way to use this app, not an edge case;
 *   - three player views (codewords, mahjong, anonymous messages) use neither either.
 * The two game chromes are rendered by the route layouts, so they are the only things that are
 * genuinely on every game page in both roles. One mount point, no gaps, and no view has to
 * know that trophies exist.
 */
export function GameAttribution({ gameCode }: { gameCode: string | null }) {
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!gameCode) return
    let cancelled = false

    const read = async () => {
      const { data } = await supabase.from('games').select('status').eq('id', gameCode).maybeSingle()
      if (!cancelled && data?.status) setStatus(data.status as string)
    }
    void read()

    // The page may already be open when the game ends, so watch for the transition rather than
    // relying on the player reloading.
    const channel = supabase
      .channel(`attribution-${gameCode}-${++channelSeq}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` }, () =>
        read()
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [gameCode])

  useProfileAttribution({ gameCode: gameCode ?? '', status })
  return null
}
