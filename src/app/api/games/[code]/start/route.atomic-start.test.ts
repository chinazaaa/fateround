import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GAME_CODE,
  HOST_TOKEN,
  codeParams,
  gameRow,
  jsonRequest,
  makeSupabaseStub,
  type ResolverContext,
} from '@/test-support/host-auth'

/**
 * UNO and Scrabble start through ONE database function that deals AND flips the game to `active` in a single
 * transaction (start_uno_game / start_scrabble_game). The route must therefore NOT flip the game a second time: a separate
 * flip is exactly what could be applied late to a round it did not deal. Every other board game still flips here.
 */

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => Promise<unknown>) => {
    void fn()
  },
}))
vi.mock('server-only', () => ({}))

const initializeScrabbleGame = vi.fn()
const initializeUnoGame = vi.fn()
const initializeWhotGame = vi.fn()
vi.mock('@/lib/scrabble', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/scrabble')>()),
  initializeScrabbleGame: (...args: unknown[]) => initializeScrabbleGame(...args),
}))
vi.mock('@/lib/uno', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/uno')>()),
  initializeUnoGame: (...args: unknown[]) => initializeUnoGame(...args),
}))
vi.mock('@/lib/whot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/whot')>()),
  initializeWhotGame: (...args: unknown[]) => initializeWhotGame(...args),
}))

let game: Record<string, unknown> = gameRow({ status: 'waiting', game_type: 'scrabble' })
const gameWrites: unknown[] = []

const seats = [
  { id: 'p1', name: 'A', spectator: false, is_bot: false, profile_id: null },
  { id: 'p2', name: 'B', spectator: false, is_bot: false, profile_id: null },
]

const supabase = makeSupabaseStub({
  games: (ctx: ResolverContext) => {
    if (ctx.op === 'update') gameWrites.push(ctx.payload)
    return { data: game, error: null }
  },
  players: () => ({ data: seats, error: null }),
})
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => supabase }))
vi.mock('@/lib/push', () => ({ notifyGameEvent: async () => {} }))

type Post = typeof import('./route').POST
let POST: Post
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  gameWrites.length = 0
  initializeScrabbleGame.mockReset().mockResolvedValue({})
  initializeUnoGame.mockReset().mockResolvedValue({})
  initializeWhotGame.mockReset().mockResolvedValue({})
})

const post = () => POST(jsonRequest(`/api/games/${GAME_CODE}/start`, { hostToken: HOST_TOKEN }), codeParams())

describe('POST /api/games/[code]/start — a start that activates in the database', () => {
  it.each([
    ['scrabble', initializeScrabbleGame],
    ['uno', initializeUnoGame],
  ])('%s: the deal is the whole start, the route writes no games flip of its own', async (type, init) => {
    game = gameRow({ status: 'waiting', game_type: type })
    const res = await post()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(init).toHaveBeenCalledTimes(1)
    expect(gameWrites).toEqual([])
  })

  it.each([
    ['scrabble', initializeScrabbleGame],
    ['uno', initializeUnoGame],
  ])('%s: a refused deal (another start won) is reported and nothing is written', async (type, init) => {
    game = gameRow({ status: 'waiting', game_type: type })
    init.mockResolvedValue({ error: 'Game already in progress' })
    const res = await post()
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Game already in progress' })
    expect(gameWrites).toEqual([])
  })

  it('a game whose initializer does not activate still gets the route flip', async () => {
    game = gameRow({ status: 'waiting', game_type: 'whot' })
    const res = await post()
    expect(res.status).toBe(200)
    expect(initializeWhotGame).toHaveBeenCalledTimes(1)
    expect(gameWrites).toHaveLength(1)
    expect(gameWrites[0]).toMatchObject({ status: 'active', current_round_number: 1 })
  })
})
