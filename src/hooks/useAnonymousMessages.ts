'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { AnonymousMessage, Player } from '@/types'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'

type RawAnonymousMessage = Omit<AnonymousMessage, 'player_name'> & {
  players?: { name: string } | { name: string }[] | null
}

function playerNameFromRow(row: RawAnonymousMessage, nameById: Map<string, string>): string {
  const nested = row.players
  if (nested) {
    const name = Array.isArray(nested) ? nested[0]?.name : nested.name
    if (name) return name
  }
  return nameById.get(row.player_id) ?? 'Unknown'
}

function normalizeMessage(row: RawAnonymousMessage, nameById: Map<string, string>): AnonymousMessage {
  const { players: _players, ...rest } = row
  return {
    ...rest,
    player_name: playerNameFromRow(row, nameById),
  }
}

/**
 * Only the most recent slice of the room is fetched on load and on every poll tick.
 * Without this the whole history (up to ANONYMOUS_ROOM_MAX_MESSAGES = 1000 rows) was
 * refetched every 15s per client. Mirrors the `.limit(50)` in
 * `src/app/api/rooms/[code]/messages/route.ts`.
 */
export const ANONYMOUS_MESSAGES_HISTORY_LIMIT = 50

export function useAnonymousMessages(gameCode: string, enabled: boolean, players: Pick<Player, 'id' | 'name'>[] = []) {
  const [messages, setMessages] = useState<AnonymousMessage[]>([])
  const [loading, setLoading] = useState(true)

  const nameById = useCallback(() => new Map(players.map((p) => [p.id, p.name])), [players])

  const mergeMessage = useCallback(
    (message: RawAnonymousMessage) => {
      const normalized = normalizeMessage(message, nameById())
      setMessages((prev) => (prev.some((m) => m.id === normalized.id) ? prev : [...prev, normalized]))
    },
    [nameById]
  )

  const removeMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId))
  }, [])

  const loadMessages = useCallback(async (): Promise<boolean> => {
    const res = await supabase
      .from('anonymous_messages')
      .select(
        'id, game_id, player_id, text, created_at, reply_to_id, reply_to_text, message_type, media_url, players(name)'
      )
      .eq('game_id', gameCode)
      // Descending + limit gives the NEWEST N rows; reversed below so the feed still
      // renders oldest-first. Ascending + limit would return the OLDEST N and new
      // messages would never appear.
      .order('created_at', { ascending: false })
      // Secondary order breaks created_at ties at the window boundary so membership
      // in the N-row window is deterministic across polls.
      .order('id', { ascending: false })
      .limit(ANONYMOUS_MESSAGES_HISTORY_LIMIT)

    if (!supabasePollOk(res)) return false
    const names = nameById()
    setMessages((res.data ?? []).map((row) => normalizeMessage(row as RawAnonymousMessage, names)).reverse())
    setLoading(false)
    return true
  }, [gameCode, nameById])

  useEffect(() => {
    if (!enabled) return
    loadMessages()
  }, [enabled, loadMessages])

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel(`anon-messages-${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'anonymous_messages', filter: `game_id=eq.${gameCode}` },
        (payload) => mergeMessage(payload.new as RawAnonymousMessage)
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'anonymous_messages', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const removed = payload.old as { id?: string }
          if (removed.id) removeMessage(removed.id)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled, gameCode, mergeMessage, removeMessage])

  usePolling(() => loadMessages(), [gameCode, loadMessages], {
    intervalMs: POLL_INTERVALS.realtimeFallback,
    enabled,
  })

  useEffect(() => {
    if (!enabled || players.length === 0) return
    const names = nameById()
    setMessages((prev) => {
      let changed = false
      const next = prev.map((message) => {
        if (message.player_name && message.player_name !== 'Unknown') return message
        const player_name = names.get(message.player_id) ?? 'Unknown'
        if (player_name === message.player_name) return message
        changed = true
        return { ...message, player_name }
      })
      return changed ? next : prev
    })
  }, [enabled, nameById, players])

  return { messages, loading, reload: loadMessages, removeMessage }
}
