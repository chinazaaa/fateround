import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const insertResult = vi.hoisted(() => ({ value: { data: { status: 'inserted' }, error: null } as unknown }))
const rpc = vi.fn(async (_name: string, _args: unknown) => insertResult.value)
const direct = vi.fn()

function chain(table: string) {
  const c: Record<string, unknown> = {
    select: () => c,
    eq: () => c,
    insert: direct,
    maybeSingle: async () => {
      if (table === 'games') return { data: { game_type: 'codewords', status: 'active' }, error: null }
      if (table === 'codewords_player_roles') return { data: { team: 'red', role: 'operative' }, error: null }
      return { data: null, error: null }
    },
  }
  return c
}
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: chain, rpc }) }))
vi.mock('@/lib/game-admin', () => ({
  assertPlayer: async () => ({ error: null, status: 200, player: { id: 'p-1' } }),
}))

type Post = typeof import('./route').POST
let POST: Post

const send = () =>
  POST(
    new NextRequest('https://x.test/api/codewords/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'abcd', resumeToken: 'TOKEN-1234', text: ' hello ' }),
    })
  )

beforeEach(async () => {
  POST ??= (await import('./route')).POST
  rpc.mockClear()
  direct.mockClear()
  insertResult.value = { data: { status: 'inserted' }, error: null }
})

describe('POST /api/codewords/chat', () => {
  it('inserts through the database function that re-checks the game is active under a lock', async () => {
    const res = await send()
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('insert_codewords_message_if_active', {
      p_game_id: 'ABCD',
      p_player_id: 'p-1',
      p_team: 'red',
      p_text: 'hello',
    })
    // Never a plain insert: that would not be ordered against the finish's wipe.
    expect(direct).not.toHaveBeenCalled()
  })

  it('rejects a message when the game finished between the status check and the insert', async () => {
    insertResult.value = { data: { status: 'game_not_active' }, error: null }
    const res = await send()
    expect(res.status).toBe(400)
  })

  it('surfaces a failed insert as a 500', async () => {
    insertResult.value = { data: null, error: { message: 'boom' } }
    const res = await send()
    expect(res.status).toBe(500)
  })
})
