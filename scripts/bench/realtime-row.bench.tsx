/**
 * How many bytes does ONE `games` UPDATE actually cost, per realtime subscriber?
 *
 * The REST row and the realtime frame are NOT the same number, and the difference is not a
 * rounding error — the `postgres_changes` wire format carries a `columns` array of
 * `{name,type}` for every column in the table, in addition to the row itself, on every single
 * event. That metadata is invariant to how much of the row actually changed.
 *
 * Measured on a fixture game this bench owns, not on whatever game happens to be in the shared
 * database, and repeated N times so the report can carry a spread rather than a single sample
 * that a concurrent writer could have perturbed.
 */
import { afterAll, beforeAll, describe, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { GAME_SELECT } from '@/lib/supabase-selects'
import { cleanupGame, seedGame } from './fixtures'
import { record } from './report'
import { startTally } from './tally'

const GAME = 'BNCROW'
const SAMPLES = Number(process.env.BENCH_SAMPLES ?? 5)
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('games realtime row cost', () => {
  beforeAll(async () => {
    await seedGame(GAME)
  })
  afterAll(async () => {
    await cleanupGame(GAME)
  })

  it(`measures the wire cost of ${SAMPLES} games UPDATEs`, async () => {
    const tally = startTally()
    // A dedicated client, not the app singleton: this bench measures the PROTOCOL, and it must
    // give the same answer whether or not the branch under test has instrumented `.channel()`.
    const sb = createClient(URL_BASE, ANON)
    try {
      const frames: number[] = []
      const payloads: { cols: number; parsedBytes: number }[] = []
      let pgBound = false

      const channel = sb
        .channel(`bench-row-${GAME}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${GAME}` },
          (p) => {
            const rec = (p.new ?? {}) as Record<string, unknown>
            payloads.push({ cols: Object.keys(rec).length, parsedBytes: Buffer.byteLength(JSON.stringify(p)) })
          }
        )
      await new Promise<void>((res, rej) => {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') res()
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') rej(new Error(status))
        })
        setTimeout(() => rej(new Error('subscribe timed out')), 30_000)
      })
      // `SUBSCRIBED` means the CHANNEL joined; the server sends a separate "Subscribed to
      // PostgreSQL" system message when the postgres_changes binding is live. Updating before
      // that lands produces zero events and a bench that reports realtime as free.
      for (let i = 0; i < 200 && !pgBound; i++) {
        pgBound = tally.rtFrames.some((f) => f.channel.includes(`bench-row-${GAME}`) && f.event === 'system')
        if (!pgBound) await sleep(100)
      }
      if (!pgBound) throw new Error('postgres_changes binding never confirmed — measurement would be vacuous')
      await sleep(500)

      for (let i = 0; i < SAMPLES; i++) {
        const before = tally.rtFrames.length
        await fetch(`${URL_BASE}/rest/v1/games?id=eq.${GAME}`, {
          method: 'PATCH',
          headers: { apikey: SRV, Authorization: `Bearer ${SRV}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_round_number: i + 1 }),
        })
        for (let w = 0; w < 60; w++) {
          const got = tally.rtFrames.slice(before).filter((f) => f.table === 'games')
          if (got.length > 0) {
            frames.push(got[0].bytes)
            break
          }
          await sleep(100)
        }
      }
      void sb.removeChannel(channel)

      if (frames.length !== SAMPLES) {
        throw new Error(`only ${frames.length}/${SAMPLES} realtime frames arrived — too lossy to report`)
      }

      // The same row over REST, for the side-by-side the cost question actually needs.
      const restRes = await fetch(`${URL_BASE}/rest/v1/games?id=eq.${GAME}&select=${GAME_SELECT.replace(/\s/g, '')}`, {
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
      })
      const restBytes = (await restRes.arrayBuffer()).byteLength

      const min = Math.min(...frames)
      const max = Math.max(...frames)
      record({
        claim: 'games realtime row',
        scenario: `one games UPDATE, per subscriber (n=${SAMPLES})`,
        rtFrames: SAMPLES,
        rtBytes: Math.round(frames.reduce((a, b) => a + b, 0) / SAMPLES),
        extra: {
          wireBytesPerUpdate: { min, max, spread: max - min, samples: frames },
          parsedPayloadBytes: payloads[0]?.parsedBytes,
          columnsDelivered: payloads[0]?.cols,
          restRowBytesGameSelect: restBytes,
          restStatus: restRes.status,
        },
      })
    } finally {
      tally.restore()
    }
  })
})
