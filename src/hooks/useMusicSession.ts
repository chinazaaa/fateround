'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { usePolling, POLL_INTERVALS } from '@/hooks/usePolling'
import type { MusicSession } from '@/lib/music'

const MUSIC_SELECT = 'game_id,track_uri,track_name,artist,album_art,duration_ms,is_playing,position_ms,updated_at'

/**
 * Load + live-subscribe a game's music state: the per-room `music_enabled` flag and the
 * current `music_sessions` row. Realtime-first (via `useGameTableSync`) with a slow poll
 * fallback, matching every other game view. Shared by the host controls and the player bar.
 */
export function useMusicSession(gameCode: string) {
  const [session, setSession] = useState<MusicSession | null>(null)
  const [musicEnabled, setMusicEnabled] = useState(false)

  const load = useCallback(async () => {
    const [gameRes, musicRes] = await Promise.all([
      supabase.from('games').select('music_enabled').eq('id', gameCode).maybeSingle(),
      supabase.from('music_sessions').select(MUSIC_SELECT).eq('game_id', gameCode).maybeSingle(),
    ])
    if (gameRes.data) setMusicEnabled(Boolean(gameRes.data.music_enabled))
    // Only overwrite on a clean read — a transient Supabase error must not blank out an
    // actively-playing session (the realtime push / next poll reconciles).
    if (!musicRes.error) setSession((musicRes.data as MusicSession | null) ?? null)
  }, [gameCode])

  useEffect(() => {
    setTimeout(() => void load(), 0)
  }, [load])

  useGameTableSync(
    gameCode,
    [
      { table: 'music_sessions', column: 'game_id' },
      { table: 'games', column: 'id' },
    ],
    load,
    // Distinct channel so we don't collide with the game view's own `sync-<code>` channel.
    { channelKey: 'music' }
  )
  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  return { session, musicEnabled }
}
