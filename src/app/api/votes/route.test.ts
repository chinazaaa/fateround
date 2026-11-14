import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const ROUND_ID = '11111111-1111-4111-8111-111111111111'
const PLAYER = { id: 'p-1', spectator: false, is_eliminated: false, joined_at: null }

let game: Record<string, unknown> = {}
let round: Record<string, unknown> = {}
let animeMetadata: unknown = null
let ownVote: { picked_number: number | null } | null = null
let ownVoteError: { message: string } | null = null
const upserts: unknown[] = []
const roundUpdates: unknown[] = []

function makeClient() {
  return {
    from: (table: string) => {
      let updating = false
      const chain: Record<string, unknown> = {
        select: () => chain,
        not: () => chain,
        neq: () => chain,
        eq: () => chain,
        update: (v: unknown) => {
          updating = true
          roundUpdates.push(v)
          return chain
        },
        upsert: (row: unknown) => {
          upserts.push(row)
          return Promise.resolve({ error: null })
        },
        maybeSingle: async () => {
          if (table === 'games') return { data: game, error: null }
          if (table === 'rounds') return { data: { ...round, anime_metadata: animeMetadata }, error: null }
          if (table === 'votes') return { data: ownVote, error: ownVoteError }
          return { data: null, error: null }
        },
        then: (resolve: (v: unknown) => void) =>
          resolve(updating ? { error: null } : { data: [], count: 0, error: null }),
      }
      return chain
    },
  }
}

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => makeClient() }))
vi.mock('@/lib/game-admin', () => ({ assertPlayer: async () => ({ player: PLAYER }) }))

import { POST } from './route'

function send(extra: Record<string, unknown>) {
  return POST(
    new NextRequest('https://x.test/api/votes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'ABCD', resumeToken: 'TOKEN-1234', roundId: ROUND_ID, ...extra }),
    })
  )
}

beforeEach(() => {
  upserts.length = 0
  roundUpdates.length = 0
  ownVote = null
  ownVoteError = null
  animeMetadata = null
  game = { game_type: 'would_you_rather', status: 'active', timer_seconds: 30, custom_questions: null }
  round = {
    status: 'active',
    participant_ids: ['a', 'b'],
    submitter_player_id: null,
    quote_text: null,
    started_at: '2026-01-01T00:00:00.000Z',
    quote_submitted_at: null,
  }
})

describe('POST /api/votes status checks', () => {
  it('accepts a vote on an active round of an active game', async () => {
    expect((await send({ wyrChoice: 'a' })).status).toBe(200)
    expect(upserts).toHaveLength(1)
  })

  it('lets a player change their vote on an active round', async () => {
    expect((await send({ wyrChoice: 'a' })).status).toBe(200)
    expect((await send({ wyrChoice: 'b' })).status).toBe(200)
    expect(upserts).toHaveLength(2)
  })

  it.each(['pending', 'finished'])('rejects a vote on a %s round', async (status) => {
    round.status = status
    const res = await send({ wyrChoice: 'a' })
    expect(res.status).toBe(400)
    expect(upserts).toHaveLength(0)
  })

  it.each(['waiting', 'finished'])('rejects a vote when the game is %s', async (status) => {
    game.status = status
    expect((await send({ wyrChoice: 'a' })).status).toBe(400)
    expect(upserts).toHaveLength(0)
  })
})

describe('POST /api/votes Pick a Number', () => {
  const POOL = ['Q one', 'Q two', 'Q three']
  beforeEach(() => {
    game = { game_type: 'pick_a_number', status: 'active', timer_seconds: 30, custom_questions: POOL }
    round.submitter_player_id = PLAYER.id
  })

  it('lets the picker pick once and reveals the question', async () => {
    const res = await send({ pickedNumber: 2 })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, pickedNumber: 2, revealedQuestion: 'Q two' })
    expect(roundUpdates).toEqual([{ mlt_question: 'Q two' }])
  })

  it('rejects a second, different pick and leaves the question alone', async () => {
    ownVote = { picked_number: 2 }
    const res = await send({ pickedNumber: 3 })
    expect(res.status).toBe(400)
    expect(roundUpdates).toHaveLength(0)
    expect(upserts).toHaveLength(0)
  })

  it('treats re-sending the same pick as an idempotent retry', async () => {
    ownVote = { picked_number: 2 }
    const res = await send({ pickedNumber: 2 })
    expect(res.status).toBe(200)
    expect((await res.json()).revealedQuestion).toBe('Q two')
    expect(roundUpdates).toHaveLength(0)
  })

  it('fails closed when the existing-pick lookup errors, instead of treating it as no pick', async () => {
    ownVote = null
    ownVoteError = { message: 'db down' }
    const res = await send({ pickedNumber: 3 })
    expect(res.status).toBe(500)
    expect(roundUpdates).toHaveLength(0)
    expect(upserts).toHaveLength(0)
  })

  it('rejects a pre-pick on a pending round and a re-pick on a finished round', async () => {
    round.status = 'pending'
    expect((await send({ pickedNumber: 1 })).status).toBe(400)
    round.status = 'finished'
    expect((await send({ pickedNumber: 1 })).status).toBe(400)
    expect(roundUpdates).toHaveLength(0)
  })
})

describe('POST /api/votes Who Said This', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'))
    game = { game_type: 'who_said_this', status: 'active', timer_seconds: 30, custom_questions: null }
    round.quote_text = 'a quote'
    round.submitter_player_id = 'author'
  })
  afterEach(() => vi.useRealTimers())

  it('accepts a normal player-round vote', async () => {
    expect((await send({ targetParticipantId: 'a' })).status).toBe(200)
  })

  it('rejects the author voting on their own quote', async () => {
    round.submitter_player_id = PLAYER.id
    expect((await send({ targetParticipantId: 'a' })).status).toBe(400)
    animeMetadata = { choices: ['x', 'y'], correct_character: 'x' }
    expect((await send({ animeChoice: 'x' })).status).toBe(400)
    expect(upserts).toHaveLength(0)
  })

  it('scores an anime vote from the round start time', async () => {
    animeMetadata = { choices: ['x', 'y'], correct_character: 'x' }
    expect((await send({ animeChoice: 'x' })).status).toBe(200)
    expect(upserts[0]).toMatchObject({ response_ms: 5000 })
  })

  it('rejects an anime vote when the round has no start time', async () => {
    animeMetadata = { choices: ['x', 'y'], correct_character: 'x' }
    round.started_at = null
    expect((await send({ animeChoice: 'x' })).status).toBe(400)
    expect(upserts).toHaveLength(0)
  })
})
