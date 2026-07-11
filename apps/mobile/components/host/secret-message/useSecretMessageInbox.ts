import { useCallback, useEffect, useState } from 'react'
import { uniqueTopic } from '@/lib/realtime'
import { getSupabase } from '@/lib/supabase'
import type { AnonymousMessage } from '@fateround/shared'

const MESSAGE_SELECT =
  'id, game_id, player_id, text, created_at, reply_to_id, reply_to_text, message_type, media_url'

/**
 * Host inbox for a Secret Message board. Loads received anonymous messages
 * (oldest → newest) and keeps them live via realtime INSERT/DELETE on
 * `anonymous_messages`. Colocated on purpose so it can't collide with the
 * shared web hook. Sender identity is intentionally never surfaced — the host
 * only sees the text and timestamp.
 */
export function useSecretMessageInbox(gameCode: string, enabled: boolean) {
  const code = gameCode.toUpperCase()
  const [messages, setMessages] = useState<AnonymousMessage[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data, error } = await getSupabase()
      .from('anonymous_messages')
      .select(MESSAGE_SELECT)
      .eq('game_id', code)
      .order('created_at', { ascending: true })
    if (!error) setMessages((data as AnonymousMessage[]) ?? [])
    setLoading(false)
  }, [code])

  const removeMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId))
  }, [])

  useEffect(() => {
    if (!enabled) return
    void load()
  }, [enabled, load])

  useEffect(() => {
    if (!enabled) return
    const supabase = getSupabase()
    const channel = supabase
      .channel(uniqueTopic(`host-secret-inbox-${code}`))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'anonymous_messages', filter: `game_id=eq.${code}` },
        (payload) => {
          const next = payload.new as AnonymousMessage
          setMessages((prev) => (prev.some((m) => m.id === next.id) ? prev : [...prev, next]))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'anonymous_messages', filter: `game_id=eq.${code}` },
        (payload) => {
          const removed = payload.old as { id?: string }
          if (removed.id) removeMessage(removed.id)
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enabled, code, removeMessage])

  return { messages, loading, reload: load, removeMessage }
}
