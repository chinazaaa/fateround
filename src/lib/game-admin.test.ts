import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertHostGame,
  assertHostPlayerRemove,
  assertHostGameSettings,
  assertHostLateJoinSettings,
} from './game-admin'

// Stand-in for `supabase.from('games').select('*').eq('id', …).maybeSingle()`.
function mockSupabase(game: Record<string, unknown> | null): SupabaseClient {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: game }) }) }) }),
  } as unknown as SupabaseClient
}

const TOKEN = 'host-secret'
const game = (status: string) => ({ id: 'ABCD', host_token: TOKEN, status })

describe('assertHost* shared checks', () => {
  it('returns 404 when the game is missing', async () => {
    const r = await assertHostGame(mockSupabase(null), 'abcd', TOKEN)
    expect(r.status).toBe(404)
    expect(r.error).toBe('Game not found')
    expect(r.game).toBeNull()
  })
  it('returns 403 on a wrong host token', async () => {
    const r = await assertHostGame(mockSupabase(game('waiting')), 'abcd', 'wrong-token')
    expect(r.status).toBe(403)
    expect(r.error).toBe('Unauthorized')
    expect(r.game).toBeNull()
  })
  it('uppercases the game code into the queried id', async () => {
    let queriedId: unknown
    const supabase = {
      from: () => ({
        select: () => ({
          eq: (_col: string, value: unknown) => {
            queriedId = value
            return { maybeSingle: async () => ({ data: game('waiting') }) }
          },
        }),
      }),
    } as unknown as SupabaseClient
    const r = await assertHostGame(supabase, 'abcd', TOKEN)
    expect(r.id).toBe('ABCD')
    expect(queriedId).toBe('ABCD') // the Supabase query is actually filtered by the upper-cased id
  })
})

describe('per-variant allowed statuses (behaviour preserved)', () => {
  const variants = [
    { name: 'assertHostGame', fn: assertHostGame, ok: ['waiting'], reject: 'active' },
    { name: 'assertHostPlayerRemove', fn: assertHostPlayerRemove, ok: ['waiting', 'active'], reject: 'finished' },
    { name: 'assertHostGameSettings', fn: assertHostGameSettings, ok: ['waiting', 'finished'], reject: 'active' },
    {
      name: 'assertHostLateJoinSettings',
      fn: assertHostLateJoinSettings,
      ok: ['waiting', 'active', 'finished'],
      reject: 'cancelled',
    },
  ] as const

  for (const v of variants) {
    it(`${v.name} accepts ${v.ok.join('/')}`, async () => {
      for (const s of v.ok) {
        const r = await v.fn(mockSupabase(game(s)), 'abcd', TOKEN)
        expect(r.error, `${v.name} @ ${s}`).toBeNull()
        expect(r.status).toBe(200)
        expect(r.game).not.toBeNull()
      }
    })
    it(`${v.name} rejects "${v.reject}" with 400`, async () => {
      const r = await v.fn(mockSupabase(game(v.reject)), 'abcd', TOKEN)
      expect(r.status).toBe(400)
      expect(r.error).toBeTruthy()
      expect(r.game).toBeNull()
    })
  }
})
