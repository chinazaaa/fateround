'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

/** A table to watch. A bare string filters by `game_id`; use the object form for tables
 *  keyed differently (e.g. `games`, whose PK is `id`). */
export type WatchedTable = string | { table: string; column?: string }

/**
 * Push instead of poll for the per-game views.
 *
 * Subscribes to Supabase Realtime for a game's own tables and calls `reload` (debounced)
 * whenever any matching row changes — replacing the ~38 hand-rolled
 * `supabase.channel().on('postgres_changes', …).subscribe()` blocks copy-pasted across the
 * game views. Each view passes the tables it cares about; the `usePolling` fallback can stay
 * as a safety net.
 *
 * @param gameCode  the game id
 * @param tables    tables to watch — `'scrabble_sessions'` (→ `game_id=eq.`) or
 *                  `{ table: 'games', column: 'id' }` (→ `id=eq.`)
 * @param reload    re-fetch callback; the latest one is always used (no resubscribe)
 * @param opts.enabled  gate the subscription (default true)
 */
export function useGameTableSync(
  gameCode: string,
  tables: readonly WatchedTable[],
  reload: () => void | Promise<unknown>,
  opts?: { enabled?: boolean }
) {
  const reloadRef = useRef(reload)
  reloadRef.current = reload

  const enabled = opts?.enabled ?? true
  const norm = tables.map((t) =>
    typeof t === 'string' ? { table: t, column: 'game_id' } : { table: t.table, column: t.column ?? 'game_id' }
  )
  const key = norm.map((t) => `${t.table}:${t.column}`).join(',')

  useEffect(() => {
    if (!enabled || !gameCode || norm.length === 0) return

    let debounce: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (debounce) clearTimeout(debounce)
      // Coalesce bursts (a single turn often writes several rows) into one reload.
      // Wrap in a promise so a sync throw or rejected async reload can't become an
      // unhandled rejection — a failed background refresh is non-fatal (the safety-net
      // poll retries).
      debounce = setTimeout(() => {
        void Promise.resolve()
          .then(() => reloadRef.current())
          .catch(() => {})
      }, 90)
    }

    let channel = supabase.channel(`sync-${gameCode}`)
    for (const { table, column } of norm) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `${column}=eq.${gameCode}` },
        schedule
      )
    }
    channel.subscribe()

    return () => {
      if (debounce) clearTimeout(debounce)
      supabase.removeChannel(channel)
    }
    // `key` stabilises the tables array; `reload` is read via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameCode, enabled, key])
}
