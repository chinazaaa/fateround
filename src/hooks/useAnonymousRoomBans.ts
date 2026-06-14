'use client'

import { useCallback, useEffect, useState } from 'react'
import { isPlayerBanned } from '@/lib/anonymous-messages'
import { supabase } from '@/lib/supabase'
import type { AnonymousRoomBan } from '@/types'

export function useAnonymousRoomBans(gameCode: string, enabled: boolean) {
  const [bans, setBans] = useState<AnonymousRoomBan[]>([])

  const activeBans = bans.filter((ban) => isPlayerBanned(ban.banned_until))

  const loadBans = useCallback(async () => {
    const { data, error } = await supabase
      .from('anonymous_room_bans')
      .select('*')
      .eq('game_id', gameCode)

    if (!error) {
      setBans((data ?? []).filter((ban) => isPlayerBanned(ban.banned_until)))
    }
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

    const poll = setInterval(loadBans, 3000)

    return () => {
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [enabled, gameCode, loadBans])

  return { bans: activeBans, banForPlayer, reload: loadBans }
}
