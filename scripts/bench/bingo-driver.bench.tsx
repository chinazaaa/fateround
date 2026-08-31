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

  it(`counts /api/bingo/sync pokes from ${DRIVERS} clients over ${WINDOW_MS}ms`, async () => {
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
      const mounted = Array.from({ length: DRIVERS }, (_, i) =>
        renderHook(() =>
          useBingoAutoCall({
            gameCode: GAME,
            game,
            enabled: true,
            // Baseline ignores these; the branch requires them. The host tier is the one that
            // fires first, so modelling every driver as 'host' measures the branch's BEST case
            // for request volume — i.e. it cannot flatter the PR.
            role: i === 0 ? 'host' : 'player',
            lastCalledAt: null,
            onSynced: () => {},
            onCalled: () => {},
          } as LooseBingoProps)
        )
      )

      const started = Date.now()
      await sleep(WINDOW_MS)
      const elapsed = Date.now() - started
      for (const m of mounted) m.unmount()

      const syncCalls = tally.rest.filter((c) => c.url.includes('/api/bingo/sync'))
      const s = summarize(syncCalls)
      record({
        claim: '#1137 bingo /api/bingo/sync pokes',
        scenario: `${DRIVERS} driver clients, ${Math.round(elapsed / 1000)}s window, steady state (nothing overdue)`,
        requests: s.requests,
        bytes: s.bytes,
        extra: {
          windowMs: elapsed,
          reqPerSec: Number((s.requests / (elapsed / 1000)).toFixed(3)),
          serverSidePokesObserved: pokes,
          note: 'request rate measured by execution against a local stub; route Supabase cost not included',
        },
      })
    } finally {
      tally.restore()
    }
  })
})
