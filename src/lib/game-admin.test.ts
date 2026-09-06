import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// `after()` needs a request scope; run the deferred activity bump inline instead.
const deferred: Promise<unknown>[] = []
vi.mock('next/server', () => ({
  after: (fn: () => Promise<unknown>) => {
    deferred.push(fn())
  },
}))
import {
  assertPlayer,
  assertHostGame,
  assertHostPlayerRemove,
  assertHostGameSettings,
  assertHostLateJoinSettings,
} from './game-admin'
import { resetGameActivityThrottle } from './game-activity'

// Stand-in for `supabase.from('games').select('*').eq('id', …).maybeSingle()`.
function mockSupabase(game: Record<string, unknown> | null): SupabaseClient {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: game }) }) }) }),
  } as unknown as SupabaseClient
}

const TOKEN = 'host-secret'
const game = (status: string) => ({ id: 'ABCD', host_token: TOKEN, status })

describe('assertHost* shared checks', () => {
  it('returns 404 when the game is missing', async () => {
    const r = await assertHostGame(mockSupabase(null), 'abcd', TOKEN)
    expect(r.status).toBe(404)
    expect(r.error).toBe('Game not found')
    expect(r.game).toBeNull()
  })
  it('returns 403 on a wrong host token', async () => {
    const r = await assertHostGame(mockSupabase(game('waiting')), 'abcd', 'wrong-token')
    expect(r.status).toBe(403)
    expect(r.error).toBe('Unauthorized')
    expect(r.game).toBeNull()
  })
  it('uppercases the game code into the queried id', async () => {
    let queriedId: unknown
    const supabase = {
      from: () => ({
        select: () => ({
          eq: (_col: string, value: unknown) => {
            queriedId = value
            return { maybeSingle: async () => ({ data: game('waiting') }) }
          },
        }),
      }),
    } as unknown as SupabaseClient
    const r = await assertHostGame(supabase, 'abcd', TOKEN)
    expect(r.id).toBe('ABCD')
    expect(queriedId).toBe('ABCD') // the Supabase query is actually filtered by the upper-cased id
  })
})

describe('per-variant allowed statuses (behaviour preserved)', () => {
  const variants = [
    { name: 'assertHostGame', fn: assertHostGame, ok: ['waiting'], reject: 'active' },
    { name: 'assertHostPlayerRemove', fn: assertHostPlayerRemove, ok: ['waiting', 'active'], reject: 'finished' },
    { name: 'assertHostGameSettings', fn: assertHostGameSettings, ok: ['waiting', 'finished'], reject: 'active' },
    {
      name: 'assertHostLateJoinSettings',
      fn: assertHostLateJoinSettings,
      ok: ['waiting', 'active', 'finished'],
      reject: 'cancelled',
    },
  ] as const

  for (const v of variants) {
    it(`${v.name} accepts ${v.ok.join('/')}`, async () => {
      for (const s of v.ok) {
        const r = await v.fn(mockSupabase(game(s)), 'abcd', TOKEN)
        expect(r.error, `${v.name} @ ${s}`).toBeNull()
        expect(r.status).toBe(200)
        expect(r.game).not.toBeNull()
      }
    })
    it(`${v.name} rejects "${v.reject}" with 400`, async () => {
      const r = await v.fn(mockSupabase(game(v.reject)), 'abcd', TOKEN)
      expect(r.status).toBe(400)
      expect(r.error).toBeTruthy()
      expect(r.game).toBeNull()
    })
  }
})

/**
 * `assertPlayer` is the resume-token gate on every player-authorized route. `assertHost*` above
 * was covered; this was not. Its two rejection paths return DIFFERENT messages on purpose —
 * "Missing or invalid player code" for a token that never had a chance, "Unauthorized" for one
 * that was looked up and not found — and both must be 403, never a 200 with a null player.
 */

const PLAYER_ROWS = [
  { id: 'p-alice', game_id: 'ABCD', resume_token: 'AAAA1111BBBB2222CCCC3333', name: 'Alice' },
  { id: 'p-carol', game_id: 'ZZZZ', resume_token: 'GGGG7777HHHH8888IIII9999', name: 'Carol' },
]

const rpc = vi.fn().mockResolvedValue({ data: true, error: null })

function mockPlayers(): { client: SupabaseClient; queries: number } {
  const state = { queries: 0 }
  const client = {
    rpc,
    from: () => {
      const filters: Record<string, unknown> = {}
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          filters[column] = value
          return chain
        },
        maybeSingle: async () => {
          state.queries += 1
          const row = PLAYER_ROWS.find(
            (pl) => pl.game_id === filters.game_id && pl.resume_token === filters.resume_token
          )
          return { data: row ?? null, error: null }
        },
      }
      return chain
    },
  } as unknown as SupabaseClient
  return {
    client,
    get queries() {
      return state.queries
    },
  } as { client: SupabaseClient; queries: number }
}

beforeEach(() => {
  rpc.mockClear()
  deferred.length = 0
  resetGameActivityThrottle()
})

/** Await the fire-and-forget work `after()` was handed. */
async function settle() {
  await Promise.all(deferred.splice(0))
}

describe('assertPlayer', () => {
  it('resolves a valid resume token to that player with status 200', async () => {
    const { client } = mockPlayers()
    const res = await assertPlayer(client, 'ABCD', 'AAAA1111BBBB2222CCCC3333')
    expect(res.status).toBe(200)
    expect(res.error).toBeNull()
    expect(res.player?.id).toBe('p-alice')
  })

  it('uppercases the game code into the queried id', async () => {
    const { client } = mockPlayers()
    const res = await assertPlayer(client, 'abcd', 'AAAA1111BBBB2222CCCC3333')
    expect(res.id).toBe('ABCD')
    expect(res.player?.id).toBe('p-alice')
  })

  it('normalizes case, spaces and dashes in the token', async () => {
    const { client } = mockPlayers()
    const res = await assertPlayer(client, 'ABCD', ' aaaa-1111 bbbb-2222 cccc-3333 ')
    expect(res.status).toBe(200)
    expect(res.player?.id).toBe('p-alice')
  })

  it('403s an unknown token as Unauthorized, with no player', async () => {
    const { client } = mockPlayers()
    const res = await assertPlayer(client, 'ABCD', 'NOPE0000NOPE0000NOPE0000')
    expect(res.status).toBe(403)
    expect(res.error).toBe('Unauthorized')
    expect(res.player).toBeNull()
  })

  // The IDOR case: valid in another game must not authorize here.
  it('403s a token belonging to a DIFFERENT game', async () => {
    const { client } = mockPlayers()
    const res = await assertPlayer(client, 'ABCD', 'GGGG7777HHHH8888IIII9999')
    expect(res.status).toBe(403)
    expect(res.player).toBeNull()
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['too short after normalization', '-a-b-'],
  ])('403s a %s token as "Missing or invalid player code" without querying', async (_label, token) => {
    const m = mockPlayers()
    const res = await assertPlayer(m.client, 'ABCD', token)
    expect(res.status).toBe(403)
    expect(res.error).toBe('Missing or invalid player code')
    expect(res.player).toBeNull()
    expect(m.queries).toBe(0)
  })

  it('never returns a 200 with a null player — the shape that would read as "authorized"', async () => {
    const { client } = mockPlayers()
    for (const token of [null, '', 'NOPE0000NOPE0000NOPE0000', 'GGGG7777HHHH8888IIII9999']) {
      const res = await assertPlayer(client, 'ABCD', token)
      expect(res.status === 200 && res.player === null).toBe(false)
    }
  })
})

/**
 * Turn-based gameplay writes only its own `*_sessions` tables, so `games.last_activity_at`
 * — the column every liveness check reads — never moved while a board game was being
 * played. `assertPlayer` is the one place every player-facing write passes through, so the
 * bump lives here.
 */
describe('assertPlayer marks the game as alive', () => {
  it('bumps activity for an authorized player', async () => {
    const { client } = mockPlayers()
    await assertPlayer(client, 'abcd', 'AAAA1111BBBB2222CCCC3333')
    await settle()
    expect(rpc).toHaveBeenCalledWith('touch_game_activity', expect.objectContaining({ p_game_id: 'ABCD' }))
  })

  it('does not bump for a rejected token — an impostor is not activity', async () => {
    const { client } = mockPlayers()
    await assertPlayer(client, 'ABCD', 'NOPE0000NOPE0000NOPE0000')
    await assertPlayer(client, 'ABCD', '')
    await settle()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('writes at most once per game across a burst of moves', async () => {
    const { client } = mockPlayers()
    for (let i = 0; i < 10; i++) await assertPlayer(client, 'ABCD', 'AAAA1111BBBB2222CCCC3333')
    await settle()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('still authorizes the player when the activity bump fails', async () => {
    rpc.mockRejectedValueOnce(new Error('db down'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = mockPlayers()
    const res = await assertPlayer(client, 'ABCD', 'AAAA1111BBBB2222CCCC3333')
    await expect(settle()).resolves.toBeUndefined()
    expect(res.status).toBe(200)
    expect(res.player?.id).toBe('p-alice')
    consoleError.mockRestore()
  })
})
