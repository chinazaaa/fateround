import { beforeAll, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

vi.mock('server-only', () => ({}))

/**
 * A joiners-mode Word Rush player who has LEFT keeps the seat until the database completes the leave (it also settles a departed
 * host's handoff in that transaction). The host's participant delete must not remove that seat behind its back.
 */
const PARTICIPANT_ID = '22222222-2222-4222-8222-222222222222'
const LEAVER = 'leaver-player'
const writes: string[] = []
let leavers: string[] = []
const resolvers = new Proxy({} as Record<string, never>, {
  get: (_t, table: string) => (call: { op: string }) => {
    if (call.op !== 'select') writes.push(`${table}:${call.op}`)
    if (table === 'games')
      return { data: gameRow({ status: 'waiting', game_type: 'word_rush', participant_mode: 'joiners' }), error: null }
    if (table === 'participants') return { data: { id: PARTICIPANT_ID, game_id: 'ABCD', name: 'Leaver' }, error: null }
    if (table === 'players') return { data: { id: LEAVER, name: 'Leaver' }, error: null }
    if (table === 'word_rush_sessions') return { data: { leavers }, error: null }
    return { data: null, error: null }
  },
}) as never
const supabase = makeSupabaseStub(resolvers)
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => supabase }))

let DELETE: typeof import('./route').DELETE
beforeAll(async () => {
  DELETE = (await import('./route')).DELETE
}, 60_000)

const call = () =>
  DELETE(
    jsonRequest(
      '/api/participants',
      { gameCode: GAME_CODE, hostToken: HOST_TOKEN, participantId: PARTICIPANT_ID },
      'DELETE'
    )
  )

describe('DELETE /api/participants on a Word Rush joiners game', () => {
  it('refuses while the linked player has a recorded leave still to complete, and deletes nothing', async () => {
    leavers = [LEAVER]
    writes.length = 0
    const res = await call()
    expect(res.status).toBe(409)
    expect(writes).toEqual([])
  })

  it('a player who has not left is removed as before', async () => {
    leavers = []
    writes.length = 0
    const res = await call()
    expect(res.status).toBe(200)
    expect(writes).toContain('players:delete')
  })
})
