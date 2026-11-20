import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const ROUND_ID = '11111111-1111-4111-8111-111111111111'
const PLAYER = { id: 'p-1', spectator: false, is_eliminated: false, joined_at: null }

let game: Record<string, unknown> = {}
let round: Record<string, unknown> = {}
let animeMetadata: unknown = null
let rpcResult: { data: unknown; error: { message: string } | null } = { data: { status: 'ok' }, error: null }
const rpcCalls: { fn: string; args: unknown }[] = []
const upserts: unknown[] = []
const voteCalls: Record<string, unknown>[] = []
let voteResult: { data: unknown; error: { message: string } | null } = { data: { status: 'ok' }, error: null }
const roundUpdates: unknown[] = []

function makeClient() {
  return {
    rpc: async (fn: string, args: unknown) => {
      if (fn === 'submit_vote_atomic') {
        const a = args as Record<string, unknown>
        voteCalls.push(a)
        // Only a successful save counts as a stored row.
        if ((voteResult.data as { status?: string } | null)?.status === 'ok') upserts.push(a.p_row)
        return voteResult
      }
      rpcCalls.push({ fn, args })
      return rpcResult
    },
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
        maybeSingle: async () => {
          if (table === 'games') return { data: game, error: null }
          if (table === 'rounds') return { data: { ...round, anime_metadata: animeMetadata }, error: null }
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
import { buildRoundsFromDeck } from '@/lib/who-said-this'

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
  voteCalls.length = 0
  voteResult = { data: { status: 'ok' }, error: null }
  roundUpdates.length = 0
  rpcCalls.length = 0
  rpcResult = { data: { status: 'ok', picked_number: 2 }, error: null }
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

  describe('close grace window', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:30.000Z'))
      round.status = 'finished'
    })
    afterEach(() => vi.useRealTimers())

    it('accepts a timer vote that lands just after the host closed the round', async () => {
      round.ended_at = '2026-01-01T00:00:29.000Z'
      expect((await send({ wyrChoice: 'a' })).status).toBe(200)
      expect(upserts).toHaveLength(1)
    })

    it('hands the close decision to the atomic function with the grace window', async () => {
      round.ended_at = '2026-01-01T00:00:29.000Z'
      await send({ wyrChoice: 'a' })
      expect(voteCalls[0]).toMatchObject({
        p_round_id: ROUND_ID,
        p_player_id: PLAYER.id,
        p_grace_ms: 3000,
        p_now: '2026-01-01T00:00:30.000Z',
      })
    })

    it('reports success when the function kept the vote that was already accepted', async () => {
      round.ended_at = '2026-01-01T00:00:29.000Z'
      voteResult = { data: { status: 'kept_existing', closed: true }, error: null }
      expect((await send({ wyrChoice: 'a' })).status).toBe(200)
    })

    it('rejects a vote long after the round closed', async () => {
      round.ended_at = '2026-01-01T00:00:20.000Z'
      expect((await send({ wyrChoice: 'a' })).status).toBe(400)
      expect(upserts).toHaveLength(0)
    })

    it('rejects a vote on a finished round with no ended_at', async () => {
      round.ended_at = null
      expect((await send({ wyrChoice: 'a' })).status).toBe(400)
    })

    it('never accepts a vote on a pending round', async () => {
      round.status = 'pending'
      round.ended_at = '2026-01-01T00:00:29.000Z'
      expect((await send({ wyrChoice: 'a' })).status).toBe(400)
    })
  })

  describe('round closing between the status read and the write (end-round race)', () => {
    // The route read the round as active; end-round commits before the vote is written. The
    // database function re-checks under a row lock and says so.
    it('rejects with 400 when the function finds the round already ended', async () => {
      voteResult = { data: { status: 'round_not_active' }, error: null }
      const res = await send({ wyrChoice: 'a' })
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: 'Round is not active' })
    })

    it('rejects with 400 when the function finds the game finished', async () => {
      voteResult = { data: { status: 'game_not_active' }, error: null }
      expect((await send({ wyrChoice: 'a' })).status).toBe(400)
    })

    it('returns 404 when the function cannot find the round', async () => {
      voteResult = { data: { status: 'round_not_found' }, error: null }
      expect((await send({ wyrChoice: 'a' })).status).toBe(404)
    })

    it('returns 500 on an rpc error or an unknown result, never a false success', async () => {
      voteResult = { data: null, error: { message: 'boom' } }
      expect((await send({ wyrChoice: 'a' })).status).toBe(500)
      voteResult = { data: { status: 'something_else' }, error: null }
      expect((await send({ wyrChoice: 'a' })).status).toBe(500)
    })

    it('gives Who Said This no grace even when the round is active at read time', async () => {
      game = { game_type: 'who_said_this', status: 'active', timer_seconds: 30, custom_questions: null }
      round.quote_text = 'a quote'
      round.participant_ids = ['p1', 'p2']
      await send({ targetParticipantId: 'p1' })
      expect(voteCalls[0]).toMatchObject({ p_grace_ms: null })
    })

    it('does not write the vote with a plain table upsert any more', async () => {
      await send({ wyrChoice: 'a' })
      expect(voteCalls).toHaveLength(1)
    })
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

  it('reveals and saves the pick through one atomic rpc call', async () => {
    const res = await send({ pickedNumber: 2 })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, pickedNumber: 2, revealedQuestion: 'Q two' })
    expect(rpcCalls).toEqual([
      {
        fn: 'pick_a_number_submit',
        args: {
          p_game_id: 'ABCD',
          p_round_id: ROUND_ID,
          p_player_id: PLAYER.id,
          p_picked_number: 2,
          p_question: 'Q two',
        },
      },
    ])
    expect(roundUpdates).toHaveLength(0)
    expect(upserts).toHaveLength(0)
  })

  it('treats re-sending the same pick as an idempotent retry', async () => {
    rpcResult = { data: { status: 'already_picked', picked_number: 2 }, error: null }
    const res = await send({ pickedNumber: 2 })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, pickedNumber: 2, revealedQuestion: 'Q two' })
    expect(roundUpdates).toHaveLength(0)
    expect(upserts).toHaveLength(0)
  })

  it('rejects a second, different pick', async () => {
    rpcResult = { data: { status: 'already_picked', picked_number: 2 }, error: null }
    const res = await send({ pickedNumber: 3 })
    expect(res.status).toBe(400)
    expect(roundUpdates).toHaveLength(0)
    expect(upserts).toHaveLength(0)
  })

  it('rejects with 400 when the function finds the round ended after the route check', async () => {
    rpcResult = { data: { status: 'round_not_active' }, error: null }
    const res = await send({ pickedNumber: 2 })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Round is not active')
  })

  it('rejects with 400 when the function finds the game finished after the route check', async () => {
    rpcResult = { data: { status: 'game_not_active' }, error: null }
    const res = await send({ pickedNumber: 2 })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Game is not active')
  })

  it('returns 500 when the rpc errors', async () => {
    rpcResult = { data: null, error: { message: 'db down' } }
    const res = await send({ pickedNumber: 2 })
    expect(res.status).toBe(500)
    expect(roundUpdates).toHaveLength(0)
    expect(upserts).toHaveLength(0)
  })

  it('does not call the rpc for an out-of-range number', async () => {
    expect((await send({ pickedNumber: 9 })).status).toBe(400)
    expect(rpcCalls).toHaveLength(0)
  })

  it('rejects a pre-pick on a pending round and a re-pick on a finished round', async () => {
    round.status = 'pending'
    expect((await send({ pickedNumber: 1 })).status).toBe(400)
    round.status = 'finished'
    expect((await send({ pickedNumber: 1 })).status).toBe(400)
    expect(rpcCalls).toHaveLength(0)
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

  it('rejects the lobby author on a round built by the player-authored start path', async () => {
    const [built] = buildRoundsFromDeck({
      gameId: 'ABCD',
      participantIds: ['a', 'b'],
      deck: [{ quote: 'q', options: ['x', 'y'], correctIndex: 0, playerId: PLAYER.id }],
      startIndex: 0,
      now: '2026-01-01T00:00:00.000Z',
    })
    round.submitter_player_id = built.submitter_player_id
    animeMetadata = built.anime_metadata
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
