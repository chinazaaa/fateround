/**
 * PR #1134 `perf/gate-polls-on-realtime` — "a client with healthy realtime stops polling".
 *
 * Mounts the REAL `usePolling` hook next to a REAL realtime channel on the app's own Supabase
 * singleton, and counts requests over a fixed wall-clock window. Real timers, not fake ones: the
 * thing under test IS the scheduling, so a fake clock would measure the fake clock.
 *
 * Two phases, and the second is the one that matters. A change that stops polling forever is not
 * a saving, it is a client that never recovers when realtime dies — so the degraded phase asserts
 * that polling RESUMES. A branch that scores 0 requests in BOTH phases is a correctness bug and
 * must be reported as one, not as a 100% saving.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { useEffect, useRef, useState } from 'react'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT } from '@/lib/supabase-selects'
import { POLL_INTERVALS, usePolling } from '@/hooks/usePolling'
import { cleanupGame, seedGame, seedPlayers } from './fixtures'
import { record } from './report'
import { startTally, summarize } from './tally'

const GAME = 'BNCPOL'
const HEALTHY_WINDOW_MS = Number(process.env.BENCH_WINDOW_MS ?? 180_000)
const DEGRADED_WINDOW_MS = Number(process.env.BENCH_DEGRADED_WINDOW_MS ?? 60_000)

/** What a client sitting in an active game does: one realtime channel + one fallback poll. */
function useActiveGameClient() {
  const [subscribed, setSubscribed] = useState(false)
  const pollsRef = useRef(0)

  useEffect(() => {
    // `supabase.channel` is what PR #1134 instruments to derive realtime health, so the channel
    // MUST be opened through the app's singleton — a locally constructed client would bypass the
    // very mechanism under test and make the branch look identical to the baseline.
    const channel = supabase
      .channel(`bench-${GAME}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${GAME}` }, () => {})
      .subscribe((status) => setSubscribed(status === 'SUBSCRIBED'))
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  usePolling(
    async () => {
      pollsRef.current += 1
      const res = await supabase.from('games').select(GAME_SELECT).eq('id', GAME).maybeSingle()
      return !res.error
    },
    [],
    { intervalMs: POLL_INTERVALS.realtimeFallback }
  )

  return { subscribed, pollsRef }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('#1134 poll gating on realtime health', () => {
  beforeAll(async () => {
    await seedGame(GAME)
    await seedPlayers(GAME, 3)
  })
  afterAll(async () => {
    await cleanupGame(GAME)
  })

  it(`measures requests over ${HEALTHY_WINDOW_MS}ms healthy + ${DEGRADED_WINDOW_MS}ms degraded`, async () => {
    const tally = startTally()
    try {
      const { result, unmount } = renderHook(() => useActiveGameClient())

      // Do not start the clock until realtime is actually up. Counting the window from mount
      // would include the pre-subscribe interval during which BOTH branches poll, diluting the
      // difference the bench exists to detect.
      await waitFor(() => {
        if (!result.current.subscribed) throw new Error('channel not SUBSCRIBED yet')
      }, { timeout: 30_000, interval: 250 })

      const healthyStart = Date.now()
      const restBefore = tally.rest.length
      const rtBefore = tally.rtFrames.length
      await sleep(HEALTHY_WINDOW_MS)

      const healthyRest = tally.rest.slice(restBefore)
      const healthyRt = tally.rtFrames.slice(rtBefore)
      const healthy = summarize(healthyRest.filter((c) => c.endpoint === 'games'))
      record({
        claim: '#1134 poll gating',
        scenario: 'realtime healthy',
        requests: healthy.requests,
        bytes: healthy.bytes,
        rtFrames: healthyRt.length,
        rtBytes: healthyRt.reduce((n, f) => n + f.bytes, 0),
        extra: {
          windowMs: Date.now() - healthyStart,
          allEndpoints: summarize(healthyRest).byEndpoint,
          expectedPollsAtInterval: Math.floor(HEALTHY_WINDOW_MS / POLL_INTERVALS.realtimeFallback),
        },
      })

      // --- degraded: take realtime away and see whether polling comes back -------------------
      // `disconnect()` closes the socket AND suppresses the automatic rejoin, so the client stays
      // dark for the whole window rather than healing after one reconnect and muddying the count.
      supabase.realtime.disconnect()
      const degradedStart = Date.now()
      const restBefore2 = tally.rest.length
      await sleep(DEGRADED_WINDOW_MS)

      const degraded = summarize(tally.rest.slice(restBefore2).filter((c) => c.endpoint === 'games'))
      record({
        claim: '#1134 poll gating',
        scenario: 'realtime degraded (socket closed)',
        requests: degraded.requests,
        bytes: degraded.bytes,
        extra: {
          windowMs: Date.now() - degradedStart,
          expectedPollsAtInterval: Math.floor(DEGRADED_WINDOW_MS / POLL_INTERVALS.realtimeFallback),
        },
      })

      unmount()

      // A branch that polls in neither phase has not saved anything; it has stopped recovering.
      // Fail loudly here rather than letting the results table read it as a 100% win.
      if (degraded.requests === 0) {
        throw new Error(
          'CORRECTNESS BUG: polling did not resume after realtime was taken down — ' +
            'a client whose channel dies would never refresh again.'
        )
      }
    } finally {
      tally.restore()
      supabase.realtime.connect()
    }
  })
})
