import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { reopenSecretMessageBoard } from './anonymous-messages'

/** A reopened Secret Message board is a new session: the previous finish reason must not survive (the join guard reads it). */
describe('reopenSecretMessageBoard', () => {
  it('clears the previous session finish reason in the same update that reopens the game', async () => {
    const updates: Array<Record<string, unknown>> = []
    const supabase = {
      from: () => ({
        delete: () => ({ eq: async () => ({ error: null }) }),
        update: (patch: Record<string, unknown>) => {
          updates.push(patch)
          return { eq: async () => ({ error: null }) }
        },
      }),
      rpc: async () => ({ data: null, error: null }),
    } as unknown as SupabaseClient
    expect(await reopenSecretMessageBoard(supabase, 'ABCD')).toEqual({ error: null })
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({ status: 'active', result_reason: null })
  })
})
