import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  enforceRateLimit: async () => null,
}))

const fullBoard = {
  id: 'board-1',
  game_id: 'ABCD',
  words: ['apple', 'banana', 'cherry', 'date'],
  key: ['red', 'blue', 'neutral', 'assassin'],
  revealed_indices: [1],
  current_turn: 'red',
  current_clue_word: 'fruit',
  current_clue_number: 2,
  clue_seq: 7,
  winner: null,
}

let role: { role: string } | null = null

const supabase = {
  from(table: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    b.select = () => b
    b.eq = () => b
    b.maybeSingle = async () => {
      if (table === 'codewords_boards') return { data: fullBoard, error: null }
      if (table === 'games') return { data: { status: 'active', host_token: 'host-secret' }, error: null }
      if (table === 'players') return { data: { id: 'p1' }, error: null }
      if (table === 'codewords_player_roles') return { data: role, error: null }
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

beforeEach(() => {
  role = null
})

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest('https://fateround.test/api/codewords/board', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )

describe('POST /api/codewords/board — server-side counters stay server-side', () => {
  it('never sends clue_seq to an operative, and still withholds the key', async () => {
    role = { role: 'operative' }
    const { board } = await (await post({ gameCode: 'ABCD', resumeToken: 'resume-token' })).json()
    expect(board).not.toHaveProperty('clue_seq')
    expect(board.key).toEqual([null, 'blue', null, null]) // only the revealed cell
    expect(board.current_clue_word).toBe('fruit') // everything else still reaches the client
  })

  it('never sends clue_seq to a spymaster or the host either', async () => {
    role = { role: 'spymaster' }
    const spy = await (await post({ gameCode: 'ABCD', resumeToken: 'resume-token' })).json()
    expect(spy.board).not.toHaveProperty('clue_seq')
    expect(spy.board.key).toEqual(['red', 'blue', 'neutral', 'assassin'])

    const host = await (await post({ gameCode: 'ABCD', hostToken: 'host-secret' })).json()
    expect(host.board).not.toHaveProperty('clue_seq')
    expect(host.board.key).toEqual(['red', 'blue', 'neutral', 'assassin'])
  })
})
