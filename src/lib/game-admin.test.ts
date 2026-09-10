import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// `after()` needs a request scope; run the deferred activity bump inline instead.
const deferred: Promise<unknown>[] = []
vi.mock('next/server', () => ({
  after: (fn: () => Promise<unknown>) => {
    deferred.push(fn())
  },
}))

// `server-only` is a Next runtime guard, not an npm package — it isn't resolvable under Vitest.
vi.mock('server-only', () => ({}))
import { makeSupabaseStub, type ResolverContext } from '@/test-support/host-auth'
import {
  assertPlayer,
  assertHostGame,
  assertHostPlayerRemove,
  assertHostGameSettings,
  assertHostLateJoinSettings,
  assertHostWith,
  assertHostAny,
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
 * The two general entry points. `assertHostWith` is the fixed-status wrappers' own core, exported
 * so a route can name its own allowed statuses and 400 message; `assertHostAny` runs the
 * 404/403 ladder with no status gate at all. Both must keep the `{ error, status, game, id }`
 * shape and the ladder ORDER — missing game beats bad token beats bad status — because the
 * ~43 routes that hand-roll this check are meant to adopt them without changing a response.
 */
describe('assertHostAny (no status gate)', () => {
  const ANY_STATUS = ['waiting', 'active', 'finished', 'scheduled', 'cancelled', 'weird-future-status']

  it('authorizes the host whatever the game status is', async () => {
    for (const status of ANY_STATUS) {
      const r = await assertHostAny(mockSupabase(game(status)), 'abcd', TOKEN)
      expect(r.error, `status ${status}`).toBeNull()
      expect(r.status, `status ${status}`).toBe(200)
      expect(r.game).not.toBeNull()
    }
  })

  it('still 404s a missing game and 403s a wrong token', async () => {
    const missing = await assertHostAny(mockSupabase(null), 'abcd', TOKEN)
    expect(missing.status).toBe(404)
    expect(missing.error).toBe('Game not found')
    expect(missing.game).toBeNull()

    const wrong = await assertHostAny(mockSupabase(game('active')), 'abcd', 'wrong-token')
    expect(wrong.status).toBe(403)
    expect(wrong.error).toBe('Unauthorized')
    expect(wrong.game).toBeNull()
  })

  it('uppercases the game code into the queried id', async () => {
    let queriedId: unknown
    const supabase = {
      from: () => ({
        select: () => ({
          eq: (_col: string, value: unknown) => {
            queriedId = value
            return { maybeSingle: async () => ({ data: game('active') }) }
          },
        }),
      }),
    } as unknown as SupabaseClient
    const r = await assertHostAny(supabase, 'abcd', TOKEN)
    expect(r.id).toBe('ABCD')
    expect(queriedId).toBe('ABCD')
  })
})

describe('assertHostWith (caller-supplied status gate)', () => {
  const opts = { allowedStatuses: ['scheduled', 'waiting'], statusError: 'Only before kickoff' } as const

  it('accepts each status the caller allowed', async () => {
    for (const status of opts.allowedStatuses) {
      const r = await assertHostWith(mockSupabase(game(status)), 'abcd', TOKEN, opts)
      expect(r.error, `status ${status}`).toBeNull()
      expect(r.status).toBe(200)
      expect(r.game).not.toBeNull()
    }
  })

  it('rejects an unlisted status with 400 and the caller’s own message', async () => {
    const r = await assertHostWith(mockSupabase(game('active')), 'abcd', TOKEN, opts)
    expect(r.status).toBe(400)
    expect(r.error).toBe('Only before kickoff') // the supplied message verbatim, not a generic one
    expect(r.game).toBeNull()
  })

  it('an empty allowedStatuses list rejects everything', async () => {
    const r = await assertHostWith(mockSupabase(game('waiting')), 'abcd', TOKEN, {
      allowedStatuses: [],
      statusError: 'nope',
    })
    expect(r.status).toBe(400)
    expect(r.error).toBe('nope')
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
    const r = await assertHostWith(supabase, 'abcd', TOKEN, opts)
    expect(r.id).toBe('ABCD')
    expect(queriedId).toBe('ABCD')
  })
})

/**
 * The order matters more than any single rung: a caller with no token must not be able to tell
 * a nonexistent code from a real one, nor learn a real game's status.
 */
describe('host failure ladder order', () => {
  it('missing game beats a bad token (404, not 403)', async () => {
    for (const call of [
      assertHostAny(mockSupabase(null), 'abcd', 'wrong-token'),
      assertHostWith(mockSupabase(null), 'abcd', 'wrong-token', {
        allowedStatuses: ['waiting'],
        statusError: 'nope',
      }),
    ]) {
      const r = await call
      expect(r.status).toBe(404)
      expect(r.error).toBe('Game not found')
    }
  })

  it('bad token beats a bad status (403, not 400 — the status never leaks)', async () => {
    const r = await assertHostWith(mockSupabase(game('active')), 'abcd', 'wrong-token', {
      allowedStatuses: ['waiting'],
      statusError: 'Game has already started',
    })
    expect(r.status).toBe(403)
    expect(r.error).toBe('Unauthorized')
    expect(r.game).toBeNull()
  })
})

/**
 * The host token is compared with `secretMatches` (constant time). Its one behavioural
 * difference from `!==` is that an absent token no longer matches an absent stored value.
 * `games.host_token` is `text not null` (migration 0001, never relaxed) and every insert site
 * mints one, so this is defence in depth — but "" authorizing a host would be a total bypass,
 * so it is pinned.
 */
describe('host token comparison', () => {
  it.each([
    ['null stored', null],
    ['undefined stored', undefined],
    ['empty stored', ''],
  ])('403s an empty supplied token against a %s token', async (_label, stored) => {
    for (const supplied of ['', null, undefined]) {
      const r = await assertHostAny(
        mockSupabase({ id: 'ABCD', host_token: stored, status: 'waiting' }),
        'abcd',
        supplied
      )
      expect(r.status).toBe(403)
      expect(r.error).toBe('Unauthorized')
      expect(r.game).toBeNull()
    }
  })

  it('still authorizes an exact token match', async () => {
    const r = await assertHostAny(mockSupabase(game('waiting')), 'abcd', TOKEN)
    expect(r.status).toBe(200)
    expect(r.game).not.toBeNull()
  })

  it('rejects a token that is a prefix of the stored one', async () => {
    const r = await assertHostAny(mockSupabase(game('waiting')), 'abcd', TOKEN.slice(0, -1))
    expect(r.status).toBe(403)
  })
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
 *
 * It is a WRITE-path marker, though: read-only callers pass `{ readOnly: true }`, because a
 * poll that bumps would let an abandoned game fake liveness and dodge the idle reaper forever.
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

  it('does NOT bump on a read-only path — polling must not keep an abandoned game alive', async () => {
    const { client } = mockPlayers()
    const res = await assertPlayer(client, 'ABCD', 'AAAA1111BBBB2222CCCC3333', { readOnly: true })
    await settle()
    // Still fully authorized — only the liveness side effect is suppressed.
    expect(res.status).toBe(200)
    expect(res.player?.id).toBe('p-alice')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('bumps by default and when readOnly is explicitly false — a new route is covered for free', async () => {
    const { client } = mockPlayers()
    await assertPlayer(client, 'ABCD', 'AAAA1111BBBB2222CCCC3333', {})
    await settle()
    expect(rpc).toHaveBeenCalledTimes(1)

    rpc.mockClear()
    resetGameActivityThrottle()
    await assertPlayer(client, 'ABCD', 'AAAA1111BBBB2222CCCC3333', { readOnly: false })
    await settle()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('a read-only poll does not consume the throttle window a later write needs', async () => {
    const { client } = mockPlayers()
    for (let i = 0; i < 5; i++) await assertPlayer(client, 'ABCD', 'AAAA1111BBBB2222CCCC3333', { readOnly: true })
    await settle()
    expect(rpc).not.toHaveBeenCalled()

    await assertPlayer(client, 'ABCD', 'AAAA1111BBBB2222CCCC3333')
    await settle()
    expect(rpc).toHaveBeenCalledTimes(1)
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

/**
 * Query-shape characterization.
 *
 * The hand-rolled mocks above answer every query identically, so they cannot tell `games`
 * from any other table, `id` from `code`, or `select('*')` from a narrow column list — a
 * whole class of change this suite was blind to. `makeSupabaseStub` from
 * `@/test-support/host-auth` records the table, the `select(...)` arguments and the ordered
 * filter calls onto the resolver context, so they can be asserted.
 *
 * These pin TODAY'S shape, `select('*')` included. `assertHost` reads `*` because the ~43
 * routes adopting it go on to read wildly different columns off the row; narrowing it is a
 * deliberate follow-up, and these are the tests that make that follow-up visible instead of
 * silent.
 */
function recordingStub(table: string, row: Record<string, unknown> | null) {
  const seen: ResolverContext[] = []
  const supabase = makeSupabaseStub({
    [table]: (ctx) => {
      seen.push(ctx)
      return { data: row, error: null }
    },
  }) as unknown as SupabaseClient
  return { supabase, seen }
}

describe('assertHost query shape', () => {
  it('issues exactly one read of the `games` table', async () => {
    // A query against any other table would leave the resolver unfired and `seen` empty.
    const { supabase, seen } = recordingStub('games', game('waiting'))
    const r = await assertHostAny(supabase, 'abcd', TOKEN)
    expect(r.status).toBe(200)
    expect(seen).toHaveLength(1)
    expect(seen[0].table).toBe('games')
    expect(seen[0].op).toBe('select')
  })

  it('filters by `id` alone, on the upper-cased code', async () => {
    const { supabase, seen } = recordingStub('games', game('waiting'))
    await assertHostAny(supabase, 'abcd', TOKEN)
    expect(seen[0].filterCalls).toEqual([{ method: 'eq', args: ['id', 'ABCD'] }])
  })

  it('selects `*` — the current shape, pinned so narrowing it is a visible change', async () => {
    const { supabase, seen } = recordingStub('games', game('waiting'))
    await assertHostAny(supabase, 'abcd', TOKEN)
    expect(seen[0].selects).toEqual(['*'])
  })

  it('keeps that shape on the gated wrappers, which share the same core', async () => {
    const calls = [
      (s: SupabaseClient) => assertHostGame(s, 'abcd', TOKEN),
      (s: SupabaseClient) => assertHostWith(s, 'abcd', TOKEN, { allowedStatuses: ['waiting'], statusError: 'nope' }),
    ]
    for (const call of calls) {
      const { supabase, seen } = recordingStub('games', game('waiting'))
      await call(supabase)
      expect(seen).toHaveLength(1)
      expect(seen[0].table).toBe('games')
      expect(seen[0].selects).toEqual(['*'])
      expect(seen[0].filterCalls).toEqual([{ method: 'eq', args: ['id', 'ABCD'] }])
    }
  })
})

describe('assertPlayer query shape', () => {
  const ROW = { id: 'p-alice', game_id: 'ABCD', resume_token: 'AAAA1111BBBB2222CCCC3333' }

  it('reads `players` filtered by game_id AND resume_token', async () => {
    const { supabase, seen } = recordingStub('players', ROW)
    const res = await assertPlayer(supabase, 'abcd', ' aaaa-1111 bbbb-2222 cccc-3333 ', { readOnly: true })
    expect(res.status).toBe(200)
    expect(seen).toHaveLength(1)
    expect(seen[0].table).toBe('players')
    expect(seen[0].filterCalls).toEqual([
      { method: 'eq', args: ['game_id', 'ABCD'] },
      // The NORMALIZED token, not the raw input — this filter IS the authorization.
      { method: 'eq', args: ['resume_token', 'AAAA1111BBBB2222CCCC3333'] },
    ])
  })

  it('selects `*` — the current shape, pinned', async () => {
    const { supabase, seen } = recordingStub('players', ROW)
    await assertPlayer(supabase, 'abcd', 'AAAA1111BBBB2222CCCC3333', { readOnly: true })
    expect(seen[0].selects).toEqual(['*'])
  })
})
