'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { AnonymousMessage, Player } from '@/types'
import { POLL_INTERVALS, ROOM_HEARTBEAT_MS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { createLatestResultApplier } from '@/lib/player-realtime'

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

/**
 * Secret Message boards are host-only: `anonymous_messages` is not readable by anon for them, so
 * the host reads through POST /api/anonymous-messages/list with the host token (polling only,
 * no realtime, no sender identity). Omit `hostInbox` for anonymous-room clients.
 */
export type HostInboxOptions = { hostToken: string }

/** Stable default so omitting `players` does not recreate `nameById` (and the loader) every render. */
const NO_PLAYERS: Pick<Player, 'id' | 'name'>[] = []

export function useAnonymousMessages(
  gameCode: string,
  enabled: boolean,
  players: Pick<Player, 'id' | 'name'>[] = NO_PLAYERS,
  hostInbox?: HostInboxOptions
) {
  const hostToken = hostInbox?.hostToken
  const [messages, setMessages] = useState<AnonymousMessage[]>([])
  const [loading, setLoading] = useState(true)
  // True while the most recently STARTED read has failed. Cleared by a successful read that started at or
  // after that failed one (host reads: see hostErrorRef), or by the next successful read otherwise.
  const [loadError, setLoadError] = useState(false)
  // Host reads can overlap (mount + visibility refresh). Each gets a generation; only a response newer
  // than the last applied one may replace the list, and a removal invalidates reads started before it.
  const hostRequestRef = useRef(0)
  const hostAppliedRef = useRef(0)
  // Generation of the newest host read that failed. A slower, older read that succeeds afterwards still
  // applies its messages but must not hide the failure of a read that started after it.
  const hostErrorRef = useRef(0)
  // Player-side reads overlap (poll, realtime event, mount); only the newest response may replace the feed.
  const [applyLatestMessages] = useState(createLatestResultApplier)

  const nameById = useCallback(() => new Map(players.map((p) => [p.id, p.name])), [players])

  const mergeMessage = useCallback(
    (message: RawAnonymousMessage) => {
      const normalized = normalizeMessage(message, nameById())
      setMessages((prev) => (prev.some((m) => m.id === normalized.id) ? prev : [...prev, normalized]))
    },
    [nameById]
  )

  const removeMessage = useCallback((messageId: string) => {
    // Drop host responses requested before this removal so they cannot restore the message.
    hostAppliedRef.current = hostRequestRef.current
    setMessages((prev) => prev.filter((m) => m.id !== messageId))
  }, [])

  const loadMessages = useCallback(async (): Promise<boolean> => {
    if (hostToken) {
      const generation = ++hostRequestRef.current
      try {
        const r = await fetch('/api/anonymous-messages/list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode, hostToken }),
        })
        if (!r.ok) {
          if (generation > hostAppliedRef.current) {
            hostErrorRef.current = Math.max(hostErrorRef.current, generation)
            setLoadError(true)
          }
          return false
        }
        const json = (await r.json()) as { messages?: Omit<AnonymousMessage, 'player_id'>[] }
        // Sender identity is never sent to the host; player_id stays empty.
        if (generation > hostAppliedRef.current) {
          hostAppliedRef.current = generation
          setMessages((json.messages ?? []).map((m) => ({ ...m, player_id: '' })))
          setLoading(false)
          if (generation >= hostErrorRef.current) setLoadError(false)
        }
        return true
      } catch {
        if (generation > hostAppliedRef.current) {
          hostErrorRef.current = Math.max(hostErrorRef.current, generation)
          setLoadError(true)
        }
        return false
      }
    }
    const outcome = await applyLatestMessages(
      async () => {
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
        return supabasePollOk(res) ? (res.data ?? []) : null
      },
      (rows) => {
        const names = nameById()
        setMessages(rows.map((row) => normalizeMessage(row as RawAnonymousMessage, names)).reverse())
        setLoading(false)
        setLoadError(false)
      }
    )
    // Only a CURRENT failure may set loadError and back polling off; a superseded read (even a failed
    // one) is obsolete and the newer read owns the feed and the error state.
    if (outcome === 'failed') {
      setLoadError(true)
      return false
    }
    return true
  }, [applyLatestMessages, gameCode, hostToken, nameById])

  // Host inbox: when the board closes the server clears it. Drop the cached messages and invalidate
  // reads still in flight from the closed period so only a read after reopening can fill the feed.
  useEffect(() => {
    if (enabled || !hostToken) return
    hostAppliedRef.current = hostRequestRef.current
    hostErrorRef.current = 0
    setMessages([])
    setLoading(true)
    setLoadError(false)
  }, [enabled, hostToken])

  useEffect(() => {
    // The host inbox's initial read is owned by usePolling below (it runs immediately), so running
    // it here too would send two list POSTs on every enable.
    if (!enabled || hostToken) return
    loadMessages()
  }, [enabled, hostToken, loadMessages])

  useEffect(() => {
    // Host inbox is poll-only: RLS hides these rows from anon, so realtime would deliver nothing.
    if (!enabled || hostToken) return

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
  }, [enabled, gameCode, hostToken, mergeMessage, removeMessage])

  usePolling(() => loadMessages(), [gameCode, loadMessages], {
    intervalMs: hostToken ? POLL_INTERVALS.activeGame : POLL_INTERVALS.realtimeFallback,
    enabled,
  })

  // Player feed heartbeat: the fallback poll above is suspended while realtime looks healthy, but a
  // filtered DELETE (a host removing a message) is not reliably delivered, so the removed message
  // would linger. A slow ungated read reconciles it. (The host feed already polls ungated.)
  usePolling(() => loadMessages(), [gameCode, loadMessages], {
    intervalMs: ROOM_HEARTBEAT_MS,
    enabled: enabled && !hostToken,
    runImmediately: false,
    gateOnRealtime: false,
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

  return { messages, loading, loadError, reload: loadMessages, removeMessage }
}
