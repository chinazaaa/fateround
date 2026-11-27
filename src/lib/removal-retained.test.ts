import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))

import { removeUnoPlayer } from '@/lib/uno'
import { removeCrazyEightsPlayer } from '@/lib/crazy-eights'
import { removeWhotPlayer } from '@/lib/whot'

/**
 * An engine that KEEPS a finisher's seat (their placement is locked in `finish_order`) must say so: the players route
 * propagates it, so a failed host handoff after such a leave is a retryable error (the seat and its resume token still
 * exist) and never "you left, the game may be hostless".
 */
function clientWithSession(session: Record<string, unknown>) {
  const writes: string[] = []
  const builder = () => {
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      update: () => (writes.push('update'), api),
      delete: () => (writes.push('delete'), api),
      maybeSingle: async () => ({ data: session, error: null }),
    }
    return api
  }
  return { client: { from: builder } as unknown as SupabaseClient, writes }
}

describe.each([
  ['uno', removeUnoPlayer],
  ['crazy eights', removeCrazyEightsPlayer],
  ['whot', removeWhotPlayer],
] as const)('%s: a player already in finish_order', (_name, remove) => {
  it('keeps the seat and reports it as retained, writing nothing', async () => {
    const { client, writes } = clientWithSession({ finish_order: ['p1'], turn_order: ['p1', 'p2'], phase: 'playing' })
    expect(await remove(client, 'G', 'p1', 'One')).toEqual({ error: null, retained: true })
    expect(writes).toEqual([])
  })
})
