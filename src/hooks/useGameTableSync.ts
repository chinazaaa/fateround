'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

/** A table to watch. A bare string filters by `game_id`; use the object form for tables
 *  keyed differently (e.g. `games`, whose PK is `id`) or to apply pushed rows directly. */
export type WatchedTable =
  | string
  | {
      table: string
      column?: string
      /**
       * Called synchronously with the changed row (`payload.new`) on INSERT/UPDATE, so the
       * view can put the pushed data on screen immediately instead of waiting out the
       * debounce + refetch round-trip. The debounced `reload` still runs afterwards as
       * reconciliation, and remains the only signal for DELETEs (which carry no new row).
       * Only useful for tables whose select is plain columns (no embedded relations).
       */
      apply?: (row: Record<string, unknown>) => void
    }

/** The slice of the Realtime payload we consume; typed loosely to survive client upgrades. */
type ChangePayload = { eventType?: string; new?: Record<string, unknown> | null }

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
    typeof t === 'string'
      ? { table: t, column: 'game_id', apply: undefined }
      : { table: t.table, column: t.column ?? 'game_id', apply: t.apply }
  )
  const key = norm.map((t) => `${t.table}:${t.column}`).join(',')

  // `apply` callbacks change identity every render; read the latest through a ref so the
  // subscription (keyed on table names only) never has to be torn down and rebuilt.
  const applyRef = useRef(new Map<string, ((row: Record<string, unknown>) => void) | undefined>())
  applyRef.current = new Map(norm.map((t) => [t.table, t.apply]))

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
        (payload: ChangePayload) => {
          const apply = applyRef.current.get(table)
          if (apply && payload?.eventType !== 'DELETE' && payload?.new && Object.keys(payload.new).length > 0) {
            try {
              apply(payload.new)
            } catch {
              // a bad pushed row must not kill the channel — the reload reconciles
            }
          }
          schedule()
        }
      )
    }
    channel.subscribe()

    return () => {
      if (debounce) clearTimeout(debounce)
      supabase.removeChannel(channel)
    }
    // `key` stabilises the tables array; `reload`/`apply` are read via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameCode, enabled, key])
}
