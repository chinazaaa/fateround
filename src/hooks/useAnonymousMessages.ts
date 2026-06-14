'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { AnonymousMessage } from '@/types'

export function useAnonymousMessages(gameCode: string, enabled: boolean) {
  const [messages, setMessages] = useState<AnonymousMessage[]>([])
  const [loading, setLoading] = useState(true)

  const mergeMessage = useCallback((message: AnonymousMessage) => {
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
  }, [])

  const removeMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId))
  }, [])

  const loadMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('anonymous_messages')
      .select('id, game_id, text, created_at, reply_to_id, reply_to_text')
      .eq('game_id', gameCode)
      .order('created_at', { ascending: true })

    if (!error) setMessages(data ?? [])
    setLoading(false)
  }, [gameCode])

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
        (payload) => mergeMessage(payload.new as AnonymousMessage)
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

  return { messages, loading, reload: loadMessages, removeMessage }
}
