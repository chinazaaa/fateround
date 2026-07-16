'use client'

import { useEffect, useRef, useState } from 'react'
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
       * debounce + refetch round-trip.
       *
       * Return value controls the follow-up reconciliation reload:
       *  - return `true`  → the row was fully absorbed into local state; SKIP the debounced
       *    `reload` for this event. Use this for high-frequency writes that touch only this
       *    table and don't change the screen (e.g. an in-progress move updating the session
       *    row). This is what turns "1 write → full multi-table refetch × every client" into
       *    a cheap local patch. The `usePolling` fallback stays the periodic safety net.
       *  - return `void`/`false` → run the debounced `reload` as before (reconciliation). Use
       *    this for events that also change other tables or the derived screen (status → finished).
       *
       * DELETEs (no new row) always reload regardless. Only safe for tables whose select is
       * plain columns (no embedded relations) — the raw pushed row is applied as-is.
       */
      apply?: (row: Record<string, unknown>) => void | boolean
      /**
       * NOT-NULL column names that must be present (non-null) for the pushed row to be trusted.
       *
       * Postgres logical replication (and therefore Supabase Realtime) OMITS unchanged TOAST-ed
       * columns from UPDATE payloads — once a large jsonb/text value (a card deck, a board, a
       * Scrabble tile bag) is stored out-of-line, an update that doesn't touch it delivers it as
       * `null`. Applying such a partial row would wipe that state on screen. Because these columns
       * are NOT NULL in the DB, a null here can only mean a truncated payload: when any listed key
       * is null/undefined the `apply` fast-path is skipped and the debounced `reload` reconciles
       * from a full fetch. Leave undefined for tables with no large NOT-NULL columns.
       */
      requireKeys?: readonly string[]
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
 * @param opts.channelKey  namespace suffix for the Realtime channel. A Supabase client keys
 *   channels by topic, so two `useGameTableSync` calls for the same game on one page would
 *   otherwise share `sync-<code>` and the second's `.on()` throws "cannot add postgres_changes
 *   callbacks after subscribe()". Pass a distinct key (e.g. 'music') for a secondary subscriber.
 */
export function useGameTableSync(
  gameCode: string,
  tables: readonly WatchedTable[],
  reload: () => void | Promise<unknown>,
  opts?: { enabled?: boolean; channelKey?: string }
) {
  const reloadRef = useRef(reload)
  reloadRef.current = reload

  const enabled = opts?.enabled ?? true
  const norm = tables.map((t) =>
    typeof t === 'string'
      ? { table: t, column: 'game_id', apply: undefined, requireKeys: undefined }
      : { table: t.table, column: t.column ?? 'game_id', apply: t.apply, requireKeys: t.requireKeys }
  )
  const key = norm.map((t) => `${t.table}:${t.column}`).join(',')

  // `apply` callbacks change identity every render; read the latest through a ref so the
  // subscription (keyed on table names only) never has to be torn down and rebuilt.
  const applyRef = useRef(new Map<string, ((row: Record<string, unknown>) => void | boolean) | undefined>())
  applyRef.current = new Map(norm.map((t) => [t.table, t.apply]))
  // Per-table NOT-NULL columns that flag a TOAST-truncated partial payload (read via a ref for
  // the same reason as `apply`).
  const requireRef = useRef(new Map<string, readonly string[] | undefined>())
  requireRef.current = new Map(norm.map((t) => [t.table, t.requireKeys]))

  // Whether the Realtime channel is currently SUBSCRIBED. Returned so callers can gate their
  // safety-net poll (`usePolling(..., { enabled: !connected })`) — no redundant full reloads
  // while realtime is healthy. On a socket drop `connected` flips false and the poll re-enables;
  // callers pass `runImmediately: false`, so the first reconcile lands within one interval (the
  // backstop for a sustained outage — Supabase auto-reconnects transient drops before then).
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!enabled || !gameCode || norm.length === 0) {
      setConnected(false)
      return
    }
    setConnected(false)

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

    let channel = supabase.channel(`sync-${gameCode}${opts?.channelKey ? `-${opts.channelKey}` : ''}`)
    for (const { table, column } of norm) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `${column}=eq.${gameCode}` },
        (payload: ChangePayload) => {
          const apply = applyRef.current.get(table)
          let handled = false
          if (apply && payload?.eventType !== 'DELETE' && payload?.new && Object.keys(payload.new).length > 0) {
            const requireKeys = requireRef.current.get(table)
            // Realtime UPDATE payloads drop unchanged TOAST-ed columns (large jsonb/text), which
            // then arrive null. Those columns are NOT NULL in the DB, so a null means the payload
            // is partial: skip the fast-path and let the debounced reload refetch the full row —
            // applying a truncated row would wipe board/deck/hand state on screen.
            const complete = !requireKeys || requireKeys.every((k) => payload.new![k] != null)
            if (complete) {
              try {
                // `=== true` so a legacy void-returning apply (or a thrown one) falls through
                // to the reconciling reload exactly as before — the skip is strictly opt-in.
                handled = apply(payload.new) === true
              } catch {
                // a bad pushed row must not kill the channel — the reload reconciles
                handled = false
              }
            }
          }
          // Skip the debounced reconciliation reload only when apply fully absorbed the row.
          // DELETEs, other tables, and non-opted-in applies still reload.
          if (!handled) schedule()
        }
      )
    }
    channel.subscribe((status) => setConnected(status === 'SUBSCRIBED'))

    return () => {
      if (debounce) clearTimeout(debounce)
      setConnected(false)
      supabase.removeChannel(channel)
    }
    // `key` stabilises the tables array; `reload`/`apply` are read via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameCode, enabled, key])

  return connected
}
