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
  useEffect(() => {
    onCalledRef.current = onCalled
  })

  const lastCalledAtRef = useRef(lastCalledAt)
  useEffect(() => {
    lastCalledAtRef.current = lastCalledAt
  })

  // A sync request outlives the game code it was issued for: if the client switches games
  // while one is in flight, the response resolves against the *new* game's refs. Applying
  // it would append the old game's called number to the new game's list (the views dedupe
  // by row id only, so a foreign row is not filtered out), and reporting its failure would
  // back off the new game's poll. The whole response-handling block is therefore skipped
  // when the code no longer matches, not just the `called` branch.
  const gameCodeRef = useRef(gameCode)
  useEffect(() => {
    gameCodeRef.current = gameCode
  })

  const callIntervalSeconds = game ? bingoCallIntervalFromGame(game) : 5

  // Whether auto-calling should be running at all — independent of which client is
  // currently elected driver. The failover baseline must anchor on this, not on the
  // election: a replacement driver being elected mid-game must not push the "overdue"
  // baseline forward, or failover is delayed exactly when the ticker and host are down.
  const autoCallActive = !!enabled && !!game && game.status === 'active' && bingoCallModeFromGame(game) === 'auto'

  const active = autoCallActive && role !== 'none'

  // Nothing called yet means there is no timestamp to measure "overdue" from. Anchor on
  // the moment this client saw the game go active instead, so a game that has just
  // started is not treated as infinitely overdue.
  const baselineRef = useRef(Date.now())
  useEffect(() => {
    if (autoCallActive) baselineRef.current = Date.now()
    // Re-anchor only on the auto-call-active edge (not driver election, not every render).
  }, [autoCallActive, gameCode])

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
      const requestedGameCode = gameCode
      try {
        const res = await fetch('/api/bingo/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode }),
        })
        // Stale response — this client has moved to another game. Drop it entirely, and
        // report healthy so it cannot back off the poll that now belongs to that game.
        if (gameCodeRef.current !== requestedGameCode) return true
        if (!res.ok) return false
        const body = (await res.json()) as { code?: string; row?: BingoCalledNumber }
        // The game can also change while the body is being parsed, so re-check here.
        if (gameCodeRef.current !== requestedGameCode) return true
        if (body.code === 'called' && body.row) onCalledRef.current?.(body.row)
        return true
      } catch {
        // A request that failed after the client moved on says nothing about the new
        // game's health, so report healthy rather than backing off its poll.
        return gameCodeRef.current !== requestedGameCode
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
