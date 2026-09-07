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

import { adminEndGame } from './admin-end-game'

type Recorded = { gameUpdates: Array<Record<string, unknown>>; deletes: string[] }

function mockSupabase(): { supabase: SupabaseClient; recorded: Recorded } {
  const recorded: Recorded = { gameUpdates: [], deletes: [] }
  const supabase = {
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => {
        if (table === 'games') recorded.gameUpdates.push(patch)
        const chain: Record<string, unknown> = {}
        chain.eq = () => chain
        chain.is = () => chain
        // Awaitable at any point in the chain — the rounds update ends on `.eq`, the
        // result_reason update ends on `.is`.
        chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve({ error: null }).then(resolve, reject)
        return chain
      },
      delete: () => ({
        eq: async () => {
          recorded.deletes.push(table)
          return { error: null }
        },
      }),
    }),
  } as unknown as SupabaseClient
  return { supabase, recorded }
}

beforeEach(() => {
  markGameFinished.mockReset()
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

    expect(markGameFinished.mock.calls[0][3]).toEqual({ onlyIfActive: false })
    expect(result).toEqual({ error: null, won: true })
    expect(recorded.gameUpdates).toEqual([{ result_reason: 'admin_ended' }])
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

    expect(result).toEqual({ error: null, won: false })
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

    expect(result).toEqual({ error: null, won: true })
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
})
