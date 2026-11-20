import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  enforceRateLimit: async () => null,
}))

const repair = vi.fn()
vi.mock('@/lib/codewords', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/codewords')>()),
  repairBrokenCodewordsRoster: (...args: unknown[]) => repair(...args),
}))

let boardRows: Array<Record<string, unknown>> = []
let gameStatus = 'active'

const supabase = {
  from(table: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    b.select = () => b
    b.eq = () => b
    b.maybeSingle = async () => {
      if (table === 'codewords_boards') return { data: boardRows.shift() ?? null, error: null }
      if (table === 'games') return { data: { status: gameStatus, host_token: 'host-secret' }, error: null }
      return { data: null, error: null }
    }
    return b
  },
}
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))

let POST: typeof import('./route').POST
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

const board = (over: Record<string, unknown> = {}) => ({
  id: 'b1',
  game_id: 'ABCD',
  words: ['a'],
  key: ['red'],
  revealed_indices: [],
  current_turn: 'red',
  winner: null,
  ...over,
})

beforeEach(() => {
  repair.mockReset()
  gameStatus = 'active'
})

const post = () =>
  POST(
    new NextRequest('https://fateround.test/api/codewords/board', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameCode: 'abcd' }),
    })
  )

describe('POST /api/codewords/board — roster self-heal', () => {
  it('repairs a broken roster on any participant read and returns the refreshed board', async () => {
    repair.mockResolvedValue(true)
    boardRows = [board(), board({ winner: 'blue' })]
    const res = await post()
    expect(repair).toHaveBeenCalledWith(expect.anything(), 'ABCD')
    expect((await res.json()).board.winner).toBe('blue')
  })

  it('does not run on a lobby, a finished game or a decided round', async () => {
    boardRows = [board()]
    gameStatus = 'finished'
    await post()
    boardRows = [board()]
    gameStatus = 'waiting'
    await post()
    boardRows = [board({ winner: 'red' })]
    gameStatus = 'active'
    await post()
    expect(repair).not.toHaveBeenCalled()
  })

  it('keeps the original board when nothing needed repair', async () => {
    repair.mockResolvedValue(false)
    boardRows = [board({ current_clue_word: 'same' })]
    const res = await post()
    expect((await res.json()).board.current_clue_word).toBe('same')
  })
})
