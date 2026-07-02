import { describe, it, expect, vi, beforeEach } from 'vitest'

const award = vi.hoisted(() => vi.fn())
vi.mock('@/lib/room-points', () => ({ awardRoomGamePoints: award }))

import { markGameFinished } from './game-finish'

// Minimal Supabase stand-in: the games update builder is chainable and awaitable,
// resolving to the rows the (optional) CAS `.select()` would return.
function makeSupabase(rows: unknown[] | null, error: unknown = null) {
  const calls = { eqs: [] as Array<[string, unknown]>, selected: false }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {}
  b.update = () => b
  b.eq = (col: string, val: unknown) => {
    calls.eqs.push([col, val])
    return b
  }
  b.select = () => {
    calls.selected = true
    return b
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  b.then = (resolve: any, reject: any) => Promise.resolve({ data: rows, error }).then(resolve, reject)
  return { supabase: { from: () => b } as never, calls }
}

beforeEach(() => award.mockReset())

describe('markGameFinished', () => {
  it('guards the active→finished transition and awards points for the winner', async () => {
    const { supabase, calls } = makeSupabase([{ id: 'GAME' }])
    const res = await markGameFinished(supabase, 'GAME', undefined, { onlyIfActive: true })
    expect(res.error).toBeNull()
    expect(calls.eqs).toContainEqual(['status', 'active'])
    expect(calls.selected).toBe(true)
    expect(award).toHaveBeenCalledTimes(1)
  })

  it('does not award when a concurrent finisher already won the CAS (no rows affected)', async () => {
    const { supabase } = makeSupabase([])
    await markGameFinished(supabase, 'GAME', undefined, { onlyIfActive: true })
    expect(award).not.toHaveBeenCalled()
  })

  it('awards unconditionally when onlyIfActive is not set (unchanged default)', async () => {
    const { supabase, calls } = makeSupabase(null)
    await markGameFinished(supabase, 'GAME')
    expect(calls.eqs).not.toContainEqual(['status', 'active'])
    expect(calls.selected).toBe(false)
    expect(award).toHaveBeenCalledTimes(1)
  })
})
