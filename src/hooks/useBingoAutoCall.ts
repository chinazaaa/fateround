'use client'

import { useEffect, useRef } from 'react'
import type { BingoCalledNumber, Game } from '@/types'
import { bingoCallIntervalFromGame, bingoCallModeFromGame } from '@/lib/bingo'
import { bingoAutoCallPollIntervalMs, shouldRequestBingoCall, type BingoDriverRole } from '@/lib/bingo-driver'
import { usePolling } from '@/hooks/usePolling'

/**
 * Standby driver for bingo's automatic calling.
 *
 * The production deploy's in-process ticker (`src/lib/game-tick.ts`) is the primary
 * clock; this hook only pokes `/api/bingo/sync` when the next number is *overdue*,
 * i.e. the ticker demonstrably has not run. See {@link file://../lib/bingo-driver.ts}
 * for the tiering and failover rule.
 *
 * On a successful call the response carries the inserted row, which is applied
 * directly via `onCalled`. The old `onSynced: load` — a full four-query client reload
 * on every 2s poll, called or not — is gone: the row arrives here for the driver, and
 * via each view's existing `bingo_called_numbers` INSERT realtime handler for everyone
 * else, with the 15s `realtimeFallback` poll as the backstop.
 */
export function useBingoAutoCall({
  gameCode,
  game,
  role,
  lastCalledAt,
  enabled = true,
  onCalled,
}: {
  gameCode: string
  game: Game | null
  /** This client's standby tier — see `bingoDriverRole`. */
  role: BingoDriverRole
  /** ISO timestamp of the newest called number, or null if none yet. */
  lastCalledAt: string | null
  enabled?: boolean
  onCalled?: (row: BingoCalledNumber) => void
}) {
  const inFlight = useRef(false)
  const onCalledRef = useRef(onCalled)
  onCalledRef.current = onCalled

  const callIntervalSeconds = game ? bingoCallIntervalFromGame(game) : 5

  const active =
    !!enabled && !!game && game.status === 'active' && bingoCallModeFromGame(game) === 'auto' && role !== 'none'

  // Nothing called yet means there is no timestamp to measure "overdue" from. Anchor on
  // the moment this client saw the game go active instead, so a game that has just
  // started is not treated as infinitely overdue.
  const baselineRef = useRef(Date.now())
  useEffect(() => {
    if (active) baselineRef.current = Date.now()
    // Re-anchor only on the active edge, not on every render.
  }, [active, gameCode])

  const lastCalledAtRef = useRef(lastCalledAt)
  lastCalledAtRef.current = lastCalledAt

  usePolling(
    async () => {
      if (inFlight.current) return true
      if (
        !shouldRequestBingoCall({
          role,
          lastCalledAt: lastCalledAtRef.current,
          baselineMs: baselineRef.current,
          callIntervalSeconds,
          now: Date.now(),
        })
      ) {
        // Not overdue — the server ticker is keeping up. Zero network, and a healthy
        // result so usePolling doesn't back off.
        return true
      }

      inFlight.current = true
      try {
        const res = await fetch('/api/bingo/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode }),
        })
        if (!res.ok) return false
        const body = (await res.json()) as { code?: string; row?: BingoCalledNumber }
        if (body.code === 'called' && body.row) onCalledRef.current?.(body.row)
        return true
      } catch {
        return false
      } finally {
        inFlight.current = false
      }
    },
    [gameCode, game?.status, game?.bingo_call_mode, role, callIntervalSeconds],
    {
      intervalMs: bingoAutoCallPollIntervalMs(callIntervalSeconds),
      enabled: active,
    }
  )
}
