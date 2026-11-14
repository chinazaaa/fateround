import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const ANSWERS = ['crane', 'pilot', 'sound']
const GAME = { id: 'ABCD', status: 'active', session_started_at: new Date().toISOString(), timer_seconds: 600 }
const ROUND = { id: 'r1', wordle_room_metadata: { word_count: 3 } }

vi.mock('@/lib/game-admin', () => ({
  assertPlayer: async () => ({ player: { id: 'p1', spectator: false, joined_at: new Date(0).toISOString() } }),
}))
vi.mock('@/lib/viewers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/viewers')>()),
  playerIsViewer: () => false,
}))
vi.mock('@/lib/wordle-room', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/wordle-room')>()),
  parseWordleRoomMetadata: () => ({ word_count: 3 }),
  parseWordleRoomSolutionWords: () => ({ words: ANSWERS }),
  validateWordleRoomGuess: (word: string, answer: string) => ({
    ok: true,
    normalized: word,
    states: [...answer].map((c, i) => (word[i] === c ? 'correct' : 'absent')),
  }),
}))
vi.mock('@/lib/game-finish', () => ({ markGameFinished: async () => {} }))

const admin = {
  rpc: async () => ({ data: { guess_id: 'g1' }, error: null }),
  from: (table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => {
        if (table === 'games') return { data: GAME, error: null }
        if (table === 'rounds') return { data: ROUND, error: null }
        if (table === 'wordle_room_solutions') return { data: { words: ANSWERS }, error: null }
        return { data: null, error: null }
      },
    }
    return chain
  },
}
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => admin }))

async function guess(word: string) {
  const { POST } = await import('./route')
  return POST(
    new NextRequest('https://x.test/api/wordle-room/guess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'abcd', resumeToken: 'TOKEN-1', word }),
    })
  )
}

describe('POST /api/wordle-room/guess', () => {
  it('never leaks the current answer on a wrong guess', async () => {
    const res = await guess('zzzzz')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).not.toHaveProperty('nextWord')
    const raw = JSON.stringify(json)
    for (const a of ANSWERS) expect(raw).not.toContain(a)
  })

  it('never leaks the next answer after a correct guess', async () => {
    const res = await guess('crane')
    const json = await res.json()
    expect(json.solved).toBe(true)
    expect(json).not.toHaveProperty('nextWord')
    const raw = JSON.stringify(json)
    for (const a of ANSWERS) expect(raw).not.toContain(a)
  })
})
