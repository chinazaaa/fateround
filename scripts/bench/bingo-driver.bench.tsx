// @vitest-environment-options { "url": "http://127.0.0.1:3199" }
/**
 * PR #1137 `perf/bingo-auto-call-driver` — "client pokes to /api/bingo/sync drop from ~1.5 req/s
 * to 0 in steady state".
 *
 * The claim is about a client REQUEST RATE, so that is what this counts: how many times the real
 * `useBingoAutoCall` hook reaches for `/api/bingo/sync` over a fixed window, for the three
 * clients that drive a game on `dev` (host + two elected players).
 *
 * The endpoint is a LOCAL STUB on port 3199, not the app. Two reasons, one of them a hazard:
 * `next dev` on the default port frequently belongs to another session, and a bench pointed at
 * it would measure that branch's code while reporting it as this one's. The stub answers with
 * the same shape and status the real route does for the steady-state case (HTTP 200,
 * `{"code":"waiting"}`), which is all the hook's control flow reads. Consequently this bench
 * measures REQUEST RATE by execution; it does NOT measure the route's own Supabase cost — see
 * the report for what that costs per poke.
 */
import { renderHook } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { useBingoAutoCall } from '@/hooks/useBingoAutoCall'
import type { Game } from '@/types'
import { cleanupGame, seedGame, seedPlayers } from './fixtures'
import { record } from './report'
import { startTally, summarize } from './tally'

const GAME = 'BNCBIN'
const PORT = 3199
const WINDOW_MS = Number(process.env.BENCH_BINGO_WINDOW_MS ?? 60_000)
/** `src/lib/game-tick.ts` default — the production in-process ticker's period. */
const SERVER_TICK_MS = 2_500
/** `dev` drives a bingo game from three clients: the host plus a two-player elected quorum. */
const DRIVERS = 3

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let server: Server
let pokes = 0

/**
 * The hook's props changed shape in this PR (`onSynced` -> `onCalled`, plus new `role` and
 * `lastCalledAt`). One bench file has to mount BOTH shapes so the two runs are the same
 * measurement, so it passes the superset and casts. The cast is the point of the file, not an
 * oversight: whichever fields the branch's hook declares are the ones it will read.
 */
type LooseBingoProps = Parameters<typeof useBingoAutoCall>[0] & Record<string, unknown>

describe('#1137 bingo auto-call driver', () => {
  beforeAll(async () => {
    await seedGame(GAME, { game_type: 'bingo', bingo_call_mode: 'auto', bingo_call_interval_seconds: 5 })
    await seedPlayers(GAME, 3)
    server = createServer((req, res) => {
      if (req.url?.startsWith('/api/bingo/sync')) {
        pokes += 1
        // The real route answers 200 for `waiting` too, which is exactly why the baseline's
        // `onSynced` reload fires on every tick whether or not a number was called.
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, code: 'waiting' }))
        return
      }
      res.writeHead(404)
      res.end()
    })
    await new Promise<void>((r) => server.listen(PORT, '127.0.0.1', r))
  })

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()))
    await cleanupGame(GAME)
  })

  /**
   * One driver client. `tickerAlive` decides whether a server-side ticker is calling numbers.
   *
   * This distinction is the whole measurement. PR #1137 claims zero pokes IN STEADY STATE — that
   * is, while the production ticker is doing its job and nothing is ever overdue. Measuring only
   * the ticker-dead case would show the branch still polling and read as a refutation, when in
   * fact that traffic is the failover the PR deliberately keeps. Both are measured, separately.
   */
  function useDriver(role: 'host' | 'player', tickerAlive: boolean, game: Game) {
    const [lastCalledAt, setLastCalledAt] = useState<string | null>(
      tickerAlive ? new Date().toISOString() : null
    )
    useEffect(() => {
      if (!tickerAlive) return
      const id = setInterval(() => setLastCalledAt(new Date().toISOString()), SERVER_TICK_MS)
      return () => clearInterval(id)
    }, [tickerAlive])

    useBingoAutoCall({
      gameCode: GAME,
      game,
      enabled: true,
      // Baseline ignores these; the branch requires them.
      role,
      lastCalledAt,
      onSynced: () => {},
      onCalled: () => {},
    } as LooseBingoProps)
  }

  async function measure(scenario: string, tickerAlive: boolean) {
    const game = {
      id: GAME,
      status: 'active',
      game_type: 'bingo',
      bingo_call_mode: 'auto',
      bingo_call_interval_seconds: 5,
    } as unknown as Game

    const tally = startTally()
    pokes = 0
    try {
      // `dev` drives from three clients: the host plus a two-player elected quorum.
      const mounted = [
        renderHook(() => useDriver('host', tickerAlive, game)),
        renderHook(() => useDriver('player', tickerAlive, game)),
        renderHook(() => useDriver('player', tickerAlive, game)),
      ]
      const started = Date.now()
      await sleep(WINDOW_MS)
      const elapsed = Date.now() - started
      for (const m of mounted) m.unmount()

      const syncCalls = tally.rest.filter((c) => c.url.includes('/api/bingo/sync'))
      const s = summarize(syncCalls)
      // The stub is reached over a real socket; if the client and server disagree about how many
      // requests happened, neither number can be trusted.
      if (s.requests !== pokes) {
        throw new Error(`client counted ${s.requests} pokes but the stub served ${pokes}`)
      }
      record({
        claim: '#1137 bingo /api/bingo/sync pokes',
        scenario,
        requests: s.requests,
        bytes: s.bytes,
        extra: {
          windowMs: elapsed,
          reqPerSec: Number((s.requests / (elapsed / 1000)).toFixed(3)),
          driverClients: DRIVERS,
          note:
            'request RATE measured by execution against a local stub. Does NOT include the ' +
            'baseline`s onSynced reload (4 PostgREST GETs per poke) nor the route`s own ' +
            'per-poke Supabase reads — both are additional baseline cost, not branch cost.',
        },
      })
    } finally {
      tally.restore()
    }
  }

  it(`steady state: ${DRIVERS} clients, server ticker ALIVE`, async () => {
    await measure(`${DRIVERS} drivers, ${Math.round(WINDOW_MS / 1000)}s, server ticker ALIVE (steady state)`, true)
  })

  it(`failover: ${DRIVERS} clients, server ticker DEAD`, async () => {
    await measure(`${DRIVERS} drivers, ${Math.round(WINDOW_MS / 1000)}s, server ticker DEAD (failover)`, false)
  })
})
