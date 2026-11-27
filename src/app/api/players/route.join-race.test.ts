import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// A concurrent join that passed this route's own pre-checks can still be refused by the
// players_enforce_join_rules trigger (PJ001 lobby full / PJ002 name taken). The route must turn that into
// the same 400 its pre-checks return — never a 500 — in every join branch.

vi.mock('server-only', () => ({}))
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  enforceRateLimit: async () => null,
}))
vi.mock('@/lib/identity-server', () => ({ getProfileFromRequest: async () => null }))
vi.mock('@/lib/push', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/push')>()),
  maybeNotifyHostPlayerJoined: async () => {},
}))

type InsertResult = { data: Record<string, unknown> | null; error: { code?: string; message: string } | null }

let GAME: Record<string, unknown> = {}
// One entry is consumed per `players` insert; the last one repeats.
let INSERT_RESULTS: InsertResult[] = []
const inserts: Record<string, unknown>[] = []

function nextInsertResult(row: Record<string, unknown>): InsertResult {
  const result = INSERT_RESULTS.length > 1 ? INSERT_RESULTS.shift()! : INSERT_RESULTS[0]
  if (result.error) return result
  return { data: { id: 'p-new', gender: 'both', identity_gender: null, resume_token: 'TOK', ...row }, error: null }
}

function makeClient() {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        neq: () => chain,
        ilike: () => chain,
        update: () => chain,
        delete: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: table === 'games' ? GAME : null, error: null }),
        insert: (row: Record<string, unknown>) => {
          if (table === 'players') inserts.push(row)
          return {
            select: () => ({
              single: async () =>
                table === 'players' ? nextInsertResult(row) : { data: { id: 'x', ...row }, error: null },
            }),
          }
        },
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], count: 0, error: null }),
      }
      return chain
    },
  }
}

const client = makeClient()
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => client }))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => client }))

type Post = typeof import('./route').POST
let POST: Post

async function join(body: Record<string, unknown> = {}) {
  return POST(
    new NextRequest('https://x.test/api/players', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameCode: 'abcd', playerName: 'Ann', ...body }),
    })
  )
}

const FULL = { code: 'PJ001', message: 'players_join_lobby_full' }
const TAKEN = { code: 'PJ002', message: 'players_join_name_taken' }

beforeEach(async () => {
  POST ??= (await import('./route')).POST
  inserts.length = 0
  INSERT_RESULTS = [{ data: null, error: FULL }]
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function game(game_type: string, extra: Record<string, unknown> = {}) {
  GAME = { id: 'ABCD', status: 'waiting', game_type, max_players: 4, ...extra }
}

describe('POST /api/players — a join the database trigger refuses', () => {
  // [game type, message the branch returns for a full lobby, message for a taken name]
  const branches: [string, string, string][] = [
    ['uno', 'This game is full', 'That name is already taken'],
    ['whot', 'This game is full', 'That name is already taken'],
    ['monopoly', 'This game is full', 'That name is already taken'],
    ['yahtzee', 'This game is full', 'That name is already taken'],
    ['ludo', 'This game is full', 'That name is already taken'],
    ['chess', 'This game is full', 'That name is already taken'],
    ['scrabble', 'This game is full', 'That name is already taken'],
    ['codewords', 'This game is full', 'That name is already taken'],
    ['describe_it', 'This game is full', 'That name is already taken'],
    ['word_rush', 'This game is full', 'That name is already taken'],
    ['bingo', 'This bingo room is full', 'That name is already taken'],
    ['two_truths', 'This room is full', 'That name is already taken in this game'],
  ]

  it.each(branches)('%s: lobby full becomes the same 400 as the pre-check', async (type, full) => {
    game(type)
    INSERT_RESULTS = [{ data: null, error: FULL }]
    const res = await join({ monopolyToken: 'car' })
    expect(res.status).toBe(400)
    // allow_viewers defaults on, so the "watch instead" flag is present, as seatFullGate returns it.
    await expect(res.json()).resolves.toEqual({ error: full, full: true })
    expect(inserts).toHaveLength(1)
  })

  it.each(branches)('%s: name taken becomes the same 400 as the pre-check', async (type, _full, taken) => {
    game(type)
    INSERT_RESULTS = [{ data: null, error: TAKEN }]
    const res = await join({ monopolyToken: 'car' })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: taken })
  })

  it('omits the watch-instead flag when the game does not allow viewers (plain full error)', async () => {
    game('uno', { allow_viewers: false })
    const res = await join()
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'This game is full' })
  })

  it('still answers 500 for an unrelated insert failure', async () => {
    game('uno')
    INSERT_RESULTS = [{ data: null, error: { code: '23503', message: 'insert violates foreign key' } }]
    const res = await join()
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Something went wrong. Please try again.' })
  })

  it('anonymous room: full lobby is the room-full 400', async () => {
    game('anonymous_messages')
    INSERT_RESULTS = [{ data: null, error: FULL }]
    const res = await join({ playerName: undefined })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: 'This room is full' })
  })

  it('anonymous room: a generated name that lost a race is regenerated and the join succeeds', async () => {
    game('anonymous_messages')
    INSERT_RESULTS = [
      { data: null, error: TAKEN },
      { data: null, error: null },
    ]
    const res = await join({ playerName: undefined })
    expect(res.status).toBe(200)
    expect(inserts).toHaveLength(2)
  })

  it('anonymous room: gives up with the name-taken 400 after repeated collisions', async () => {
    game('anonymous_messages')
    INSERT_RESULTS = [{ data: null, error: TAKEN }]
    const res = await join({ playerName: undefined })
    expect(res.status).toBe(400)
    expect(inserts).toHaveLength(4)
  })
})
