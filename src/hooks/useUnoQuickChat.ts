'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { unoQuickMessage } from '@/lib/uno-quick-messages'

/**
 * UNO Team-Up quick messages — a partner-private "emote" channel.
 *
 * A player flicks a preset (colour / value / action) to their teammate; it
 * arrives as a transient bubble on the partner's screen and nowhere else.
 * Ephemeral: broadcast-only (no DB), mirrors the ReactionBar / anonymous-
 * reactions pattern. Delivery is targeted by `toId` — every seat is on the
 * same channel, but a message only surfaces for the addressed teammate.
 */
export interface UnoQuickChatIncoming {
  /** unique key so re-sending the same preset re-triggers the bubble */
  key: number
  fromName: string
  messageId: string
}

interface QuickChatPayload {
  fromId: string
  fromName: string
  toId: string
  messageId: string
}

/** How long an incoming bubble stays on screen before auto-dismissing. */
const BUBBLE_MS = 4500

export function useUnoQuickChat(gameCode: string, myPlayerId: string | null, enabled: boolean) {
  const [incoming, setIncoming] = useState<UnoQuickChatIncoming | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const myIdRef = useRef<string | null>(myPlayerId)
  myIdRef.current = myPlayerId
  const seqRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showBubble = useCallback((fromName: string, messageId: string) => {
    seqRef.current += 1
    setIncoming({ key: seqRef.current, fromName, messageId })
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setIncoming(null), BUBBLE_MS)
  }, [])

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setIncoming(null)
  }, [])

  useEffect(() => {
    if (!enabled || !gameCode) return

    const channel = supabase.channel(`uno-quickchat:${gameCode}`, {
      config: { broadcast: { self: false } },
    })

    channel.on('broadcast', { event: 'quick-msg' }, ({ payload }) => {
      const { fromName, toId, messageId } = (payload ?? {}) as QuickChatPayload
      if (!toId || !messageId || !unoQuickMessage(messageId)) return
      // Partner-only: ignore anything not addressed to me.
      if (toId !== myIdRef.current) return
      showBubble(typeof fromName === 'string' && fromName ? fromName : 'Partner', messageId)
    })

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') channelRef.current = channel
    })

    return () => {
      channelRef.current = null
      if (timerRef.current) clearTimeout(timerRef.current)
      void supabase.removeChannel(channel)
    }
  }, [enabled, gameCode, showBubble])

  const send = useCallback((toId: string, fromName: string, messageId: string) => {
    const channel = channelRef.current
    if (!channel || !myIdRef.current || !unoQuickMessage(messageId)) return
    const payload: QuickChatPayload = { fromId: myIdRef.current, fromName, toId, messageId }
    void channel.send({ type: 'broadcast', event: 'quick-msg', payload })
  }, [])

  return { incoming, send, dismiss }
}
