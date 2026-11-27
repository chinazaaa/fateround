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

import { adminEndGame, cleanupFinishedSession, completeHostLeftCleanup } from './admin-end-game'

type Recorded = {
  gameUpdates: Array<Record<string, unknown>>
  /** Kinds of session wipe requested ('anonymous' | 'codewords'). */
  deletes: string[]
  /** The finished_at each session wipe is bound to (decided in the database). */
  deleteBounds: string[]
  roundUpdates: number
  /** `started_at <=` bounds of the round updates. */
  roundBounds: string[]
}

const FINISHED_AT = '2026-01-01T00:00:00.000Z'

function mockSupabase(
  opts: {
    deleteError?: { message: string }
    roundError?: { message: string }
    roundStatus?: string
    gameRow?: Record<string, unknown>
  } = {}
): {
  supabase: SupabaseClient
  recorded: Recorded
} {
  const recorded: Recorded = { gameUpdates: [], deletes: [], deleteBounds: [], roundUpdates: 0, roundBounds: [] }
  const supabase = {
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => {
        if (table === 'games') recorded.gameUpdates.push(patch)
        if (table === 'rounds') recorded.roundUpdates += 1
        const chain: Record<string, unknown> = {}
        chain.eq = () => chain
        chain.is = () => chain
        chain.lte = (_col: string, v: string) => (recorded.roundBounds.push(v), chain)
        // Awaitable at any point in the chain — the rounds update ends on `.eq`, the
        // result_reason update ends on `.is`.
        chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve({ error: table === 'rounds' ? (opts.roundError ?? null) : null }).then(resolve, reject)
        return chain
      },
      // The row a lost finish / a cleanup recovery reads back.
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: opts.gameRow ?? { status: 'finished', session_started_at: null, finished_at: FINISHED_AT },
            error: null,
          }),
        }),
      }),
    }),
    // The session wipe is one database function (wipe_finished_session_rows): it records the kind of wipe and the
    // finished_at it is bound to, and fails when the test asks for a failing wipe.
    rpc: async (name: string, args: { p_kind: string; p_finished_at: string }) => {
      // The post-finish round cleanup is one database function bound to the finished session.
      if (name === 'finish_rounds_of_finished_session') {
        recorded.roundUpdates += 1
        recorded.roundBounds.push(args.p_finished_at)
        return {
          data: { status: opts.roundStatus ?? 'finished_session', round_ids: ['r1', 'r2'] },
          error: opts.roundError ?? null,
        }
      }
      if (name === 'wipe_finished_session_rows') {
        recorded.deletes.push(args.p_kind)
        recorded.deleteBounds.push(args.p_finished_at)
      }
      return { data: { status: 'wiped' }, error: opts.deleteError ?? null }
    },
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
    expect(recorded.deletes).toContain('codewords')
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
    expect(recorded.deletes).toContain('codewords')
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

describe('adminEndGame — every post-finish wipe is bound to the finished session', () => {
  it.each(['codewords', 'anonymous_messages', 'secret_message'])(
    '%s: a won finish wipes only rows created up to the finished_at it wrote',
    async (gameType) => {
      let written: string | undefined
      markGameFinished.mockImplementation(async (_s: unknown, _g: string, finishedAt?: string) => {
        // The finished_at the (mocked) finish wrote: the caller's own when it supplied one, else a fixed value.
        written = finishedAt ?? '2026-02-02T00:00:00.000Z'
        return { error: null, won: true, finishedAt: written }
      })
      const { supabase, recorded } = mockSupabase()
      await adminEndGame(supabase, { id: 'G', status: 'active', game_type: gameType })
      // Exactly ONE session wipe, bound to EXACTLY the finished_at the finish wrote (not merely "some timestamp").
      expect(written).toBeTruthy()
      expect(recorded.deleteBounds).toEqual([written])
      expect(recorded.deletes).toHaveLength(1)
    }
  )

  it.each(['codewords', 'anonymous_messages', 'secret_message'])(
    '%s: a lost finish that reads back a finished game wipes only up to that finished_at',
    async (gameType) => {
      markGameFinished.mockResolvedValue({ error: null, won: false })
      const { supabase, recorded } = mockSupabase()
      await adminEndGame(supabase, { id: 'G', status: 'active', game_type: gameType }, { onlyIfActive: true })
      expect(recorded.deleteBounds.length).toBeGreaterThan(0)
      expect(recorded.deleteBounds.every((b) => b === FINISHED_AT)).toBe(true)
    }
  )

  it.each(['codewords', 'anonymous_messages', 'secret_message'])(
    '%s: a lost finish that finds the game live again wipes nothing',
    async (gameType) => {
      markGameFinished.mockResolvedValue({ error: null, won: false })
      const { supabase, recorded } = mockSupabase({ gameRow: { status: 'active', finished_at: null } })
      await adminEndGame(supabase, { id: 'G', status: 'active', game_type: gameType }, { onlyIfActive: true })
      expect(recorded.deletes).toEqual([])
    }
  )
})

describe('adminEndGame — an unguarded end that cannot reveal says the game is still endable', () => {
  it('names the retry because nothing was finished', async () => {
    revealFinishedTtlRounds.mockResolvedValue(false)
    const { supabase } = mockSupabase()
    const result = await adminEndGame(supabase, { id: 'G', status: 'active', game_type: 'two_truths' })
    expect(result.error).toMatch(/left endable; retry/)
    expect(markGameFinished).not.toHaveBeenCalled()
  })
})

describe('cleanupFinishedSession — the one session-bound cleanup', () => {
  it('a replayed (or missing) game is not this session: its rounds are left alone and nothing is revealed', async () => {
    const { supabase } = mockSupabase({ roundStatus: 'not_current_session' })
    expect(await cleanupFinishedSession(supabase, 'G', 'two_truths', FINISHED_AT)).toBeNull()
    expect(revealFinishedTtlRounds).not.toHaveBeenCalled()
  })

  it('finishes the rounds of the finished session only, and reveals Two Truths for the same bound', async () => {
    const { supabase, recorded } = mockSupabase()
    expect(await cleanupFinishedSession(supabase, 'G', 'two_truths', FINISHED_AT)).toBeNull()
    expect(recorded.roundUpdates).toBe(1)
    expect(recorded.roundBounds).toEqual([FINISHED_AT])
    // The database confirmed this IS the current finished session, so no timestamp cutoff is applied (the round and finish clocks differ).
    expect(revealFinishedTtlRounds).toHaveBeenCalledWith(supabase, 'G', undefined, ['r1', 'r2'])
  })

  it.each([
    ['codewords', ['codewords']],
    ['anonymous_messages', ['anonymous']],
    ['secret_message', ['anonymous']],
  ])('%s: one database wipe %j bound to the finished_at', async (gameType, tables) => {
    const { supabase, recorded } = mockSupabase()
    expect(await cleanupFinishedSession(supabase, 'G', gameType as never, FINISHED_AT)).toBeNull()
    expect(recorded.deletes).toEqual(tables)
    expect(recorded.deleteBounds).toEqual(tables.map(() => FINISHED_AT))
  })

  it('a failing round update still runs the Codewords chat wipe bound to FINISHED_AT, and returns the round error', async () => {
    const { supabase, recorded } = mockSupabase({ roundError: { message: 'round update failed' } })
    const error = await cleanupFinishedSession(supabase, 'G', 'codewords', FINISHED_AT)
    expect(error).toBeTruthy()
    expect(recorded.deletes).toEqual(['codewords'])
    expect(recorded.deleteBounds).toEqual([FINISHED_AT])
  })

  it('wipes nothing for a game type that keeps no deletable session data', async () => {
    const { supabase, recorded } = mockSupabase()
    await cleanupFinishedSession(supabase, 'G', 'trivia', FINISHED_AT)
    expect(recorded.deletes).toEqual([])
  })

  it('still runs the wipe when the rounds step fails, and reports a failure in neutral words', async () => {
    revealFinishedTtlRounds.mockResolvedValue(false)
    const { supabase, recorded } = mockSupabase()
    const error = await cleanupFinishedSession(supabase, 'G', 'two_truths', FINISHED_AT)
    expect(error).toBe('Could not reveal every Two Truths round')
    expect(error).not.toMatch(/endable/)
    expect(recorded.roundUpdates).toBe(1)
  })

  it('reports a failed wipe', async () => {
    const { supabase } = mockSupabase({ deleteError: { message: 'boom' } })
    expect(await cleanupFinishedSession(supabase, 'G', 'codewords', FINISHED_AT)).toBeTruthy()
  })
})

describe('completeHostLeftCleanup — recovery bound to the finished session', () => {
  const FINISHED = {
    status: 'finished',
    game_type: 'two_truths',
    result_reason: 'host_ended',
    finished_at: FINISHED_AT,
  }

  it('runs the shared cleanup bound to the session finished_at', async () => {
    const { supabase, recorded } = mockSupabase({ gameRow: FINISHED })
    expect(await completeHostLeftCleanup(supabase, 'G')).toEqual({ finished: true, hostEnded: true, error: null })
    expect(recorded.roundBounds).toEqual([FINISHED_AT])
    expect(revealFinishedTtlRounds).toHaveBeenCalledTimes(1)
  })

  it('wipes the per-feature data of the finished session too (Codewords chat)', async () => {
    const { supabase, recorded } = mockSupabase({ gameRow: { ...FINISHED, game_type: 'codewords' } })
    await completeHostLeftCleanup(supabase, 'G')
    expect(recorded.deletes).toEqual(['codewords'])
    expect(recorded.deleteBounds).toEqual([FINISHED_AT])
  })

  it('reports a still-failing cleanup so the leave can be retried', async () => {
    revealFinishedTtlRounds.mockResolvedValue(false)
    const { supabase } = mockSupabase({ gameRow: FINISHED })
    const result = await completeHostLeftCleanup(supabase, 'G')
    expect(result.finished).toBe(true)
    expect(result.error).toBeTruthy()
  })

  it.each([
    ['a live game (Play Again started a new session)', { ...FINISHED, status: 'active' }, false],
    ['a game finished for another reason', { ...FINISHED, result_reason: 'admin_ended' }, true],
    ['a finished game with no finished_at', { ...FINISHED, finished_at: null }, true],
  ])('touches nothing for %s', async (_name, gameRow, finished) => {
    const { supabase, recorded } = mockSupabase({ gameRow })
    expect(await completeHostLeftCleanup(supabase, 'G')).toEqual({ finished, hostEnded: false, error: null })
    expect(recorded.roundUpdates).toBe(0)
    expect(recorded.deletes).toEqual([])
    expect(revealFinishedTtlRounds).not.toHaveBeenCalled()
  })
})

describe('completeHostLeftCleanup — bound to the finish the caller observed', () => {
  const row = (extra: Record<string, unknown> = {}) => ({
    status: 'finished',
    game_type: 'codewords',
    result_reason: 'host_ended',
    finished_at: FINISHED_AT,
    session_started_at: 'S1',
    sessions_played: 1,
    ...extra,
  })

  it('runs for the observed finish', async () => {
    const { supabase, recorded } = mockSupabase({ gameRow: row() })
    expect((await completeHostLeftCleanup(supabase, 'G', { finishedAt: FINISHED_AT })).error).toBeNull()
    expect(recorded.deleteBounds).toEqual([FINISHED_AT])
  })

  it('does NOT run for a later finish (F2) of the same game id', async () => {
    const { supabase, recorded } = mockSupabase({ gameRow: row({ finished_at: '2030-01-01T00:00:00.000Z' }) })
    expect(await completeHostLeftCleanup(supabase, 'G', { finishedAt: FINISHED_AT })).toEqual({
      finished: true,
      hostEnded: false,
      error: null,
      superseded: true,
    })
    expect(recorded.deletes).toEqual([])
    expect(recorded.roundUpdates).toBe(0)
  })

  it('without an observed finish, the captured session identity binds it: a replayed session is left alone', async () => {
    const mismatched = mockSupabase({ gameRow: row({ sessions_played: 2 }) })
    await completeHostLeftCleanup(mismatched.supabase, 'G', { session: { startedAt: 'S1', sessionsPlayed: 1 } })
    expect(mismatched.recorded.deletes).toEqual([])
    const matched = mockSupabase({ gameRow: row() })
    await completeHostLeftCleanup(matched.supabase, 'G', { session: { startedAt: 'S1', sessionsPlayed: 1 } })
    expect(matched.recorded.deleteBounds).toEqual([FINISHED_AT])
  })
})
