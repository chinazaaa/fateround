import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * `adminEndGame` is the single funnel every force-finish path uses, and since the
 * active→finished flip became a compare-and-set the *outcome* of that CAS matters as
 * much as its error: a request that lost the race gets `error: null` and an empty row
 * set, which is indistinguishable from a real finish unless the `won` flag is carried
 * back out. Callers act on it (the idle reaper counts and stamps a closed game), so
 * these tests pin the propagation — including through the delegating finishers, where
 * it would otherwise be easy to drop the signal on one branch only.
 */

const markGameFinished = vi.hoisted(() => vi.fn())
vi.mock('@/lib/game-finish', () => ({ markGameFinished }))
const revealFinishedTtlRounds = vi.hoisted(() => vi.fn())
vi.mock('@/lib/two-truths-advance', () => ({ revealFinishedTtlRounds }))

import { adminEndGame } from './admin-end-game'

type Recorded = { gameUpdates: Array<Record<string, unknown>>; deletes: string[]; roundUpdates: number }

function mockSupabase(opts: { deleteError?: { message: string }; gameStatus?: string } = {}): {
  supabase: SupabaseClient
  recorded: Recorded
} {
  const recorded: Recorded = { gameUpdates: [], deletes: [], roundUpdates: 0 }
  const supabase = {
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => {
        if (table === 'games') recorded.gameUpdates.push(patch)
        if (table === 'rounds') recorded.roundUpdates += 1
        const chain: Record<string, unknown> = {}
        chain.eq = () => chain
        chain.is = () => chain
        // Awaitable at any point in the chain — the rounds update ends on `.eq`, the
        // result_reason update ends on `.is`.
        chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve({ error: null }).then(resolve, reject)
        return chain
      },
      // The status re-read a lost finish does before deciding whether the wipe is still owed.
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { status: opts.gameStatus ?? 'finished', session_started_at: null, finished_at: null },
            error: null,
          }),
        }),
      }),
      delete: () => ({
        eq: async () => {
          recorded.deletes.push(table)
          return { error: opts.deleteError ?? null }
        },
      }),
    }),
  } as unknown as SupabaseClient
  return { supabase, recorded }
}

beforeEach(() => {
  markGameFinished.mockReset()
  revealFinishedTtlRounds.mockReset()
  revealFinishedTtlRounds.mockResolvedValue(true)
})

describe('adminEndGame — finish outcome propagation', () => {
  it('reports won and stamps result_reason when this request flipped the row', async () => {
    markGameFinished.mockResolvedValue({ error: null, won: true })
    const { supabase, recorded } = mockSupabase()

    const result = await adminEndGame(
      supabase,
      { id: 'AAAA', status: 'active', game_type: 'trivia' },
      { onlyIfActive: true }
    )

    expect(result).toEqual({ error: null, won: true })
    expect(recorded.gameUpdates).toEqual([{ result_reason: 'admin_ended' }])
  })

  it('reports a lost CAS as won:false without an error, and writes no result_reason', async () => {
    // Another request finished this game first. Nothing went wrong — but labelling it
    // `admin_ended` would overwrite the real reason of a finish we did not perform.
    markGameFinished.mockResolvedValue({ error: null, won: false })
    const { supabase, recorded } = mockSupabase()

    const result = await adminEndGame(
      supabase,
      { id: 'AAAA', status: 'active', game_type: 'trivia' },
      { onlyIfActive: true }
    )

    expect(result).toEqual({ error: null, won: false })
    expect(recorded.gameUpdates).toEqual([])
  })

  it('keeps the unguarded default reporting won:true, so existing callers are unchanged', async () => {
    markGameFinished.mockResolvedValue({ error: null, won: true })
    const { supabase, recorded } = mockSupabase()

    const result = await adminEndGame(supabase, { id: 'AAAA', status: 'active', game_type: 'trivia' })

    expect(markGameFinished.mock.calls[0][3]).toEqual({ onlyIfActive: false, trackBookkeeping: false })
    expect(result).toEqual({ error: null, won: true })
    expect(recorded.gameUpdates).toEqual([{ result_reason: 'admin_ended' }])
  })

  it("makes Word Rush's post-finish bookkeeping durable (Play Again deletes the rows it reads), and only Word Rush's", async () => {
    markGameFinished.mockResolvedValue({ error: null, won: true })
    const { supabase } = mockSupabase()

    await adminEndGame(supabase, { id: 'AAAA', status: 'active', game_type: 'word_rush' }, { onlyIfActive: true })
    expect(markGameFinished.mock.calls[0][3]).toEqual({ onlyIfActive: true, trackBookkeeping: true })
    markGameFinished.mockClear()
    await adminEndGame(supabase, { id: 'BBBB', status: 'active', game_type: 'trivia' }, { onlyIfActive: true })
    expect(markGameFinished.mock.calls[0][3]).toEqual({ onlyIfActive: true, trackBookkeeping: false })
  })

  it('rejects an already-finished game as an error, never as a win', async () => {
    const { supabase } = mockSupabase()
    const result = await adminEndGame(supabase, { id: 'AAAA', status: 'finished', game_type: 'trivia' })
    expect(result).toEqual({ error: 'Only waiting or active games can be ended', won: false })
    expect(markGameFinished).not.toHaveBeenCalled()
  })
})

describe('adminEndGame — delegating finishers carry the outcome too', () => {
  // Codewords does not go through the generic tail: it delegates to
  // finishCodewordsGame, which has its own return. The signal has to survive that hop.
  it('propagates a lost CAS out through finishCodewordsGame', async () => {
    markGameFinished.mockResolvedValue({ error: null, won: false })
    const { supabase, recorded } = mockSupabase()

    const result = await adminEndGame(
      supabase,
      { id: 'CODE', status: 'active', game_type: 'codewords' },
      { onlyIfActive: true }
    )

    expect(result).toEqual({ error: null, won: false, cleanupError: null })
    // Delegated, not handled by the generic path.
    expect(recorded.deletes).toContain('codewords_messages')
    expect(recorded.gameUpdates).toEqual([])
  })

  it('propagates a won CAS out through finishCodewordsGame', async () => {
    markGameFinished.mockResolvedValue({ error: null, won: true })
    const { supabase } = mockSupabase()

    const result = await adminEndGame(
      supabase,
      { id: 'CODE', status: 'active', game_type: 'codewords' },
      { onlyIfActive: true }
    )

    expect(result).toEqual({ error: null, won: true, cleanupError: null })
  })

  it('reports a finish failure from a delegating finisher as won:false', async () => {
    markGameFinished.mockResolvedValue({ error: { message: 'db down' }, won: false })
    const { supabase } = mockSupabase()

    const result = await adminEndGame(
      supabase,
      { id: 'CODE', status: 'active', game_type: 'codewords' },
      { onlyIfActive: true }
    )

    expect(result.won).toBe(false)
    expect(result.error).toBeTruthy()
  })

  /**
   * The finish and the post-finish data wipe are two different things. The wipe runs
   * after the row is already `finished`, so a wipe failure cannot un-finish the game —
   * but it used to come back in `error`, which made every caller (the idle reaper
   * above all) treat a completed close as a failure and skip the work that follows a
   * win. Cleanup status now travels in its own field.
   */
  it('reports a failed post-finish cleanup as cleanupError, keeping won:true and error:null', async () => {
    markGameFinished.mockResolvedValue({ error: null, won: true })
    const { supabase, recorded } = mockSupabase({ deleteError: { message: 'chat wipe failed' } })

    const result = await adminEndGame(
      supabase,
      { id: 'CODE', status: 'active', game_type: 'codewords' },
      { onlyIfActive: true }
    )

    expect(result.won).toBe(true)
    expect(result.error).toBeNull()
    expect(result.cleanupError).toBeTruthy()
    // The wipe was still attempted, and its failure did not abort the finish.
    expect(recorded.deletes).toContain('codewords_messages')
  })

  it('keeps a lost CAS a lost CAS even when the cleanup also fails', async () => {
    markGameFinished.mockResolvedValue({ error: null, won: false })
    const { supabase } = mockSupabase({ deleteError: { message: 'chat wipe failed' } })

    const result = await adminEndGame(
      supabase,
      { id: 'CODE', status: 'active', game_type: 'codewords' },
      { onlyIfActive: true }
    )

    expect(result.won).toBe(false)
    expect(result.error).toBeNull()
    expect(result.cleanupError).toBeTruthy()
  })
})

const GUARD = { statuses: ['waiting', 'active'], hostPlayerNullOr: 'P1' }

describe('adminEndGame — a rejected finishGuard leaves the live game untouched', () => {
  for (const gameType of ['codewords', 'anonymous_messages', 'secret_message', 'trivia', 'two_truths']) {
    it(`${gameType}: wipes nothing and finishes no rounds when the guarded finish lost and the game is still active`, async () => {
      markGameFinished.mockResolvedValue({ error: null, won: false })
      const { supabase, recorded } = mockSupabase({ gameStatus: 'active' })

      const result = await adminEndGame(
        supabase,
        { id: 'G', status: 'active', game_type: gameType },
        { finishGuard: GUARD }
      )

      expect(result.won).toBe(false)
      expect(result.error).toBeNull()
      expect(recorded.deletes).toEqual([])
      expect(recorded.roundUpdates).toBe(0)
      expect(revealFinishedTtlRounds).not.toHaveBeenCalled()
    })
  }

  for (const gameType of ['codewords', 'anonymous_messages', 'secret_message']) {
    it(`${gameType}: still wipes on a retry of a game another request already finished`, async () => {
      markGameFinished.mockResolvedValue({ error: null, won: false })
      const { supabase, recorded } = mockSupabase({ gameStatus: 'finished' })

      await adminEndGame(supabase, { id: 'G', status: 'active', game_type: gameType }, { finishGuard: GUARD })

      expect(recorded.deletes.length).toBeGreaterThan(0)
    })
  }

  it('finishes the rounds (and reveals Two Truths) only after the guarded finish won', async () => {
    markGameFinished.mockResolvedValue({ error: null, won: true })
    const { supabase, recorded } = mockSupabase()

    const result = await adminEndGame(
      supabase,
      { id: 'G', status: 'active', game_type: 'two_truths' },
      { finishGuard: GUARD }
    )

    expect(result).toEqual({ error: null, won: true })
    expect(recorded.roundUpdates).toBe(1)
    expect(revealFinishedTtlRounds).toHaveBeenCalledTimes(1)
  })

  it('reports a failed reveal after a won guarded finish as cleanupError, not as a failed finish', async () => {
    markGameFinished.mockResolvedValue({ error: null, won: true })
    revealFinishedTtlRounds.mockResolvedValue(false)
    const { supabase } = mockSupabase()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await adminEndGame(
      supabase,
      { id: 'G', status: 'active', game_type: 'two_truths' },
      { finishGuard: GUARD }
    )

    expect(result.won).toBe(true)
    expect(result.error).toBeNull()
    expect(result.cleanupError).toBeTruthy()
  })

  it('without a guard the rounds still finish BEFORE the game flip (a failure leaves it endable)', async () => {
    revealFinishedTtlRounds.mockResolvedValue(false)
    const { supabase } = mockSupabase()

    const result = await adminEndGame(supabase, { id: 'G', status: 'active', game_type: 'two_truths' })

    expect(result.won).toBe(false)
    expect(result.error).toBeTruthy()
    expect(markGameFinished).not.toHaveBeenCalled()
  })
})
