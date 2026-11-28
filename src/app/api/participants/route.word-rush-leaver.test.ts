import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

vi.mock('server-only', () => ({}))

/**
 * In a joiners-mode Word Rush game the host's removal of a participant IS a leave of the linked seat: it goes through the one
 * database function (under the games row lock; it settles a departed host's handoff in the deleting transaction), never
 * through plain row deletes that could race a leave or hide a failed read.
 */
const PARTICIPANT_ID = '22222222-2222-4222-8222-222222222222'
const LEAVER = 'leaver-player'
const writes: string[] = []
const leaves: Array<{ gameId: string; playerId: string }> = []
let outcome: { status: string; [k: string]: unknown } = { status: 'deleted' }
let gameType = 'word_rush'
vi.mock('@/lib/word-rush-server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/word-rush-server')>()),
  leaveWordRushPlayer: async (_s: unknown, gameId: string, playerId: string) => {
    leaves.push({ gameId, playerId })
    return outcome
  },
}))
const resolvers = new Proxy({} as Record<string, never>, {
  get: (_t, table: string) => (call: { op: string }) => {
    if (call.op !== 'select') writes.push(`${table}:${call.op}`)
    if (table === 'games')
      return { data: gameRow({ status: 'waiting', game_type: gameType, participant_mode: 'joiners' }), error: null }
    if (table === 'participants') return { data: { id: PARTICIPANT_ID, game_id: 'ABCD', name: 'Leaver' }, error: null }
    if (table === 'players') return { data: { id: LEAVER, name: 'Leaver' }, error: null }
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
beforeEach(() => {
  writes.length = 0
  leaves.length = 0
  outcome = { status: 'deleted' }
  gameType = 'word_rush'
})

const call = () =>
  DELETE(
    jsonRequest(
      '/api/participants',
      { gameCode: GAME_CODE, hostToken: HOST_TOKEN, participantId: PARTICIPANT_ID },
      'DELETE'
    )
  )

describe('DELETE /api/participants on a Word Rush joiners game', () => {
  it('removes the linked seat through the leave function, with no direct row delete', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(leaves).toEqual([{ gameId: 'ABCD', playerId: LEAVER }])
    expect(writes).toEqual([])
  })

  it('a leave whose seat deletion is still owed is a success the database completes (nothing is deleted from here)', async () => {
    outcome = { status: 'pending' }
    const res = await call()
    expect(res.status).toBe(200)
    expect(((await res.json()) as { pending?: boolean }).pending).toBe(true)
    expect(writes).toEqual([])
  })

  it.each([
    ['participant_ambiguous', 409],
    ['game_finished', 409],
    ['host_ended', 409],
  ])('%s is a conflict and deletes nothing', async (status, code) => {
    outcome = { status }
    const res = await call()
    expect(res.status).toBe(code)
    expect(writes).toEqual([])
  })

  it('a database error is a server error and deletes nothing', async () => {
    outcome = { status: 'error', error: 'down', internal: true }
    const res = await call()
    expect(res.status).toBe(500)
    expect(writes).toEqual([])
  })

  it('another game type still deletes the pair directly', async () => {
    gameType = 'trivia'
    const res = await call()
    expect(res.status).toBe(200)
    expect(leaves).toEqual([])
    expect(writes).toContain('players:delete')
  })
})
