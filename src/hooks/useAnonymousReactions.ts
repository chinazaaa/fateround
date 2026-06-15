'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface ReactionEvent {
  messageId: string
  emoji: string
  playerName: string
  action: 'add' | 'remove'
}

type ReactionMap = Map<string, Map<string, Set<string>>>

function applyReactionEvent(prev: ReactionMap, event: ReactionEvent): ReactionMap {
  const { messageId, emoji, playerName, action } = event
  const next = new Map(prev)
  const msgReactions = new Map(next.get(messageId) ?? new Map<string, Set<string>>())
  const players = new Set(msgReactions.get(emoji) ?? new Set<string>())

  if (action === 'add') {
    players.add(playerName)
  } else {
    players.delete(playerName)
  }

  if (players.size > 0) {
    msgReactions.set(emoji, players)
  } else {
    msgReactions.delete(emoji)
  }

  if (msgReactions.size > 0) {
    next.set(messageId, msgReactions)
  } else {
    next.delete(messageId)
  }

  return next
}

export function useAnonymousReactions(gameCode: string, enabled: boolean) {
  const [reactions, setReactions] = useState<ReactionMap>(new Map())
  const channelRef = useRef<RealtimeChannel | null>(null)

  const applyReaction = useCallback((event: ReactionEvent) => {
    setReactions((prev) => applyReactionEvent(prev, event))
  }, [])

  useEffect(() => {
    if (!enabled || !gameCode) return

    const channel = supabase.channel(`anon-reactions:${gameCode}`, {
      config: { broadcast: { self: false } },
    })

    channel.on('broadcast', { event: 'message-reaction' }, ({ payload }) => {
      const { messageId, emoji, playerName, action } = payload as ReactionEvent
      if (!messageId || !emoji || !playerName || (action !== 'add' && action !== 'remove')) return
      applyReaction({ messageId, emoji, playerName, action })
    })

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channelRef.current = channel
      }
    })

    return () => {
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [enabled, gameCode, applyReaction])

  const broadcastReaction = useCallback(
    (messageId: string, emoji: string, playerName: string, action: 'add' | 'remove') => {
      const event: ReactionEvent = { messageId, emoji, playerName, action }

      // Show immediately for the person who reacted
      applyReaction(event)

      const channel = channelRef.current
      if (!channel) return

      void channel.send({
        type: 'broadcast',
        event: 'message-reaction',
        payload: event,
      })
    },
    [applyReaction]
  )

  const getReactionsForMessage = useCallback(
    (messageId: string): Map<string, Set<string>> => {
      return reactions.get(messageId) ?? new Map()
    },
    [reactions]
  )

  return { reactions, broadcastReaction, getReactionsForMessage }
}
