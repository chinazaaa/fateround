'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { AnonymousMessage, Player } from '@/types'

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

  const loadMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('anonymous_messages')
      .select(
        'id, game_id, player_id, text, created_at, reply_to_id, reply_to_text, message_type, media_url, players(name)'
      )
      .eq('game_id', gameCode)
      .order('created_at', { ascending: true })

    if (!error) {
      const names = nameById()
      setMessages((data ?? []).map((row) => normalizeMessage(row as RawAnonymousMessage, names)))
    }
    setLoading(false)
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

    const poll = setInterval(loadMessages, 3000)

    return () => {
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [enabled, gameCode, loadMessages, mergeMessage, removeMessage])

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
