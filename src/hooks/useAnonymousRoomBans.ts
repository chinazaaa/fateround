'use client'

import { useCallback, useEffect, useState } from 'react'
import { isPlayerBanned } from '@/lib/anonymous-messages'
import { supabase } from '@/lib/supabase'
import type { AnonymousRoomBan } from '@/types'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { ANONYMOUS_ROOM_BAN_SELECT } from '@/lib/supabase-selects'

export function useAnonymousRoomBans(gameCode: string, enabled: boolean) {
  const [bans, setBans] = useState<AnonymousRoomBan[]>([])

  const activeBans = bans.filter((ban) => isPlayerBanned(ban.banned_until))

  const loadBans = useCallback(async (): Promise<boolean> => {
    const res = await supabase.from('anonymous_room_bans').select(ANONYMOUS_ROOM_BAN_SELECT).eq('game_id', gameCode)
    if (!supabasePollOk(res)) return false
    setBans((res.data ?? []).filter((ban) => isPlayerBanned(ban.banned_until)))
    return true
  }, [gameCode])

  const banForPlayer = useCallback(
    (playerId: string) => activeBans.find((ban) => ban.player_id === playerId) ?? null,
    [activeBans]
  )

  useEffect(() => {
    if (!enabled) {
      setBans([])
      return
    }
    loadBans()
  }, [enabled, loadBans])

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel(`anon-bans-${gameCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'anonymous_room_bans', filter: `game_id=eq.${gameCode}` },
        () => {
          void loadBans()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled, gameCode, loadBans])

  usePolling(() => loadBans(), [gameCode, loadBans], {
    intervalMs: POLL_INTERVALS.realtimeFallback,
    enabled,
  })

  return { bans: activeBans, banForPlayer, reload: loadBans }
}
