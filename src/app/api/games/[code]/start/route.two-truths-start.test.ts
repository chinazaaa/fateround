import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOST_TOKEN, GAME_CODE, codeParams, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * Two Truths start. The spectator flags and the status change used to be separate writes (the status write filtered on
 * the id only), so a host leave landing between them read a half-changed roster, ended the game, and the start then
 * re-activated the finished row. They are now ONE database step under the games row lock (start_two_truths_game).
 */
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => {},
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/push', () => ({ notifyGameEvent: async () => {} }))

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const C = '00000000-0000-4000-8000-00000000000c'
const D = '00000000-0000-4000-8000-00000000000d'
const stmt = (player_id: string) => ({
  id: `s-${player_id}`,
  game_id: 'ABCD',
  player_id,
  statement_a: 'a',
  statement_b: 'b',
  statement_c: 'c',
  lie_index: 1,
})

let writes: string[] = []
let rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
let startAnswer: { data: unknown; error: unknown } = { data: { status: 'started' }, error: null }

const base = makeSupabaseStub({
  games: ({ op }) => {
    if (op !== 'select') writes.push(`games:${op}`)
    return { data: gameRow({ status: 'waiting', game_type: 'two_truths' }), error: null }
  },
  players: ({ op }) => {
    if (op !== 'select') writes.push(`players:${op}`)
    return {
      data: [A, B, C, D].map((id) => ({ id, name: id, spectator: false, gender: 'both' })),
      error: null,
    }
  },
  ttl_statements: () => ({ data: [stmt(A), stmt(B), stmt(C)], error: null }),
})
const supabase = {
  ...base,
  rpc: async (name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args })
    if (name === 'start_two_truths_game') return startAnswer
    return { data: null, error: null }
  },
}
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => supabase }))

let POST: typeof import('./route').POST
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  writes = []
  rpcCalls = []
  startAnswer = { data: { status: 'started' }, error: null }
})

const start = () => POST(jsonRequest(`/api/games/${GAME_CODE}/start`, { hostToken: HOST_TOKEN }), codeParams())

describe('POST /api/games/[code]/start — Two Truths', () => {
  it('starts through ONE database call that carries the rounds, answer keys and submitters (nothing is written separately)', async () => {
    const res = await start()
    expect(res.status).toBe(200)
    const calls = rpcCalls.filter((c) => c.name === 'start_two_truths_game')
    expect(calls).toHaveLength(1)
    const args = calls[0].args
    expect(args).toMatchObject({ p_game_id: 'ABCD', p_min_submitters: 3 })
    // One round (and one answer key) per submitter.
    expect((args.p_rounds as unknown[]).length).toBe(3)
    expect((args.p_lies as unknown[]).length).toBe(3)
    // Only the players who submitted statements play; the fourth watches.
    expect([...(args.p_submitted_player_ids as string[])].sort()).toEqual([A, B, C])
    // The rounds are created INSIDE that call: the route makes no other database call for them.
    expect(rpcCalls.map((c) => c.name)).toEqual(['start_two_truths_game'])
    expect(writes).not.toContain('players:update')
    expect(writes).not.toContain('games:update')
  })

  it('a game that is no longer waiting (finished by a host leave in between) answers 409 and is never re-activated', async () => {
    startAnswer = { data: { status: 'lost', game_status: 'finished' }, error: null }
    const res = await start()
    expect(res.status).toBe(409)
    expect(writes).not.toContain('games:update')
  })

  it('a submitter who left while the game was starting answers 409 (the database wrote nothing)', async () => {
    startAnswer = { data: { status: 'submitters_changed' }, error: null }
    const res = await start()
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toMatch(/left/i)
  })

  it('a database error answers 500', async () => {
    startAnswer = { data: null, error: { message: 'boom' } }
    expect((await start()).status).toBe(500)
  })

  it('a missing game answers 404', async () => {
    startAnswer = { data: { status: 'game_missing' }, error: null }
    expect((await start()).status).toBe(404)
  })
})
