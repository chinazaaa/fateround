/**
 * PR #1135 `fix/bounded-chat-reads` — "chat reads are bounded".
 *
 * Measures the RESPONSE BYTES OF ONE POLL TICK at 10 / 50 / 200 messages in the room, by
 * mounting the real `useAnonymousMessages` hook against the real local Supabase and weighing
 * what PostgREST sends back. Nothing here re-implements the query: if the hook's `select` or
 * `limit` changes, this measurement changes with it.
 *
 * The prediction under test is a SHAPE, not a single number — baseline bytes should track row
 * count linearly, and the branch should flatten once the room exceeds the 50-row window. A
 * single room size could not tell those two apart, which is why all three sizes are measured.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { useAnonymousMessages } from '@/hooks/useAnonymousMessages'
import type { Player } from '@/types'
import { cleanupGame, seedAnonymousMessages, seedGame, seedPlayers } from './fixtures'
import { record } from './report'
import { startTally, summarize } from './tally'

const GAME = 'BNCHAT'
const SIZES = [10, 50, 200]

// Hoisted, NOT an inline `[]`. A fresh array literal on every render changes the hook's
// `players` identity, which invalidates its `loadMessages` callback, which re-runs the polling
// effect with `runImmediately` — turning one mount read into dozens and making `requests`
// meaningless. Real call sites pass a stable array; the bench must too.
const NO_PLAYERS: Pick<Player, 'id' | 'name'>[] = []

let playerId = ''

describe('#1135 bounded chat reads', () => {
  beforeAll(async () => {
    await seedGame(GAME, { game_type: 'anonymous_messages', anonymous: true })
    const players = (await seedPlayers(GAME, 1)) as { id: string }[]
    playerId = players[0].id
  })

  afterAll(async () => {
    await cleanupGame(GAME)
  })

  for (const size of SIZES) {
    it(`measures one read at ${size} messages`, async () => {
      await seedAnonymousMessages(GAME, playerId, size)

      const tally = startTally()
      try {
        const { result, unmount } = renderHook(() => useAnonymousMessages(GAME, true, NO_PLAYERS))
        // Wait for the mount read to LAND, not merely to be issued. Reading the tally while the
        // response is still in flight would record 0 bytes and score an unbounded query as free.
        await waitFor(() => {
          if (result.current.loading) throw new Error('still loading')
        }, { timeout: 30_000 })
        unmount()

        const reads = tally.rest.filter((c) => c.endpoint === 'anonymous_messages')
        const s = summarize(reads)
        // A room seeded with N rows that answers with 0 bytes means the seed or the grant failed,
        // and every "the branch is smaller" conclusion below would be vacuous.
        if (s.requests === 0 || s.bytes === 0) {
          throw new Error(`no anonymous_messages read observed at size ${size} — measurement is vacuous`)
        }
        record({
          claim: '#1135 bounded chat reads',
          scenario: `${size} messages in room`,
          requests: s.requests,
          bytes: s.bytes,
          extra: { rowsSeeded: size, rowsReturned: result.current.messages.length, bytesPerRead: Math.round(s.bytes / s.requests) },
        })
      } finally {
        tally.restore()
      }
    })
  }
})
