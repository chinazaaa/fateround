'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface ReactionEvent {
  messageId: string
  emoji: string
  playerName: string
  action: 'add' | 'remove'
}

type ReactionMap = Map<string, Map<string, Set<string>>>

export function useAnonymousReactions(gameCode: string, enabled: boolean) {
  const [reactions, setReactions] = useState<ReactionMap>(new Map())
  const lastBroadcastRef = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel(`reactions:${gameCode}`)
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        const { messageId, emoji, playerName, action } = payload as ReactionEvent
        setReactions((prev) => {
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
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled, gameCode])

  const broadcastReaction = useCallback(
    (messageId: string, emoji: string, playerName: string, action: 'add' | 'remove') => {
      const now = Date.now()
      if (now - lastBroadcastRef.current < 500) return
      lastBroadcastRef.current = now

      supabase.channel(`reactions:${gameCode}`).send({
        type: 'broadcast',
        event: 'reaction',
        payload: { messageId, emoji, playerName, action } satisfies ReactionEvent,
      })
    },
    [gameCode]
  )

  const getReactionsForMessage = useCallback(
    (messageId: string): Map<string, Set<string>> => {
      return reactions.get(messageId) ?? new Map()
    },
    [reactions]
  )

  return { reactions, broadcastReaction, getReactionsForMessage }
}
