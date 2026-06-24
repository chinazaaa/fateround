'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { CodewordsMessage, CodewordsTeam, Player } from '@/types'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { stripBidiControls } from '@/lib/validation'

type RawCodewordsMessage = Omit<CodewordsMessage, 'player_name'> & {
  players?: { name: string } | { name: string }[] | null
}

function playerNameFromRow(row: RawCodewordsMessage, nameById: Map<string, string>): string {
  const nested = row.players
  if (nested) {
    const name = Array.isArray(nested) ? nested[0]?.name : nested.name
    if (name) return name
  }
  return nameById.get(row.player_id) ?? 'Unknown'
}

function normalizeMessage(row: RawCodewordsMessage, nameById: Map<string, string>): CodewordsMessage {
  const { players: _players, ...rest } = row
  return {
    ...rest,
    text: stripBidiControls(rest.text ?? ''),
    player_name: stripBidiControls(playerNameFromRow(row, nameById)),
  }
}

export function useCodewordsChat(
  gameCode: string,
  team: CodewordsTeam,
  enabled: boolean,
  players: Pick<Player, 'id' | 'name'>[] = []
) {
  const [messages, setMessages] = useState<CodewordsMessage[]>([])
  const [loading, setLoading] = useState(true)

  const nameById = useCallback(() => new Map(players.map((p) => [p.id, p.name])), [players])

  const mergeMessage = useCallback(
    (message: RawCodewordsMessage) => {
      if (message.team !== team) return
      const normalized = normalizeMessage(message, nameById())
      setMessages((prev) => (prev.some((m) => m.id === normalized.id) ? prev : [...prev, normalized]))
    },
    [nameById, team]
  )

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  const loadMessages = useCallback(async (): Promise<boolean> => {
    const res = await supabase
      .from('codewords_messages')
      .select('id, game_id, player_id, team, text, created_at, players(name)')
      .eq('game_id', gameCode)
      .eq('team', team)
      .order('created_at', { ascending: true })

    if (!supabasePollOk(res)) return false
    const names = nameById()
    setMessages((res.data ?? []).map((row) => normalizeMessage(row as RawCodewordsMessage, names)))
    setLoading(false)
    return true
  }, [gameCode, nameById, team])

  useEffect(() => {
    if (!enabled) {
      setMessages([])
      setLoading(false)
      return
    }
    setLoading(true)
    loadMessages()
  }, [enabled, loadMessages])

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel(`codewords-chat-${gameCode}-${team}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'codewords_messages',
          filter: `game_id=eq.${gameCode}`,
        },
        (payload) => mergeMessage(payload.new as RawCodewordsMessage)
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'codewords_messages',
          filter: `game_id=eq.${gameCode}`,
        },
        () => clearMessages()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clearMessages, enabled, gameCode, mergeMessage, team])

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

  return { messages, loading }
}
