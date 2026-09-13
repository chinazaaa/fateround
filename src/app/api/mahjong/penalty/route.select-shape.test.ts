import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResolverContext } from '@/test-support/host-auth'
import {
  GAME_CODE,
  GAME_ID,
  HOST_TOKEN,
  PLAYER_ID,
  gameRow,
  jsonRequest,
  makeSupabaseStub,
  projectRow,
} from '@/test-support/host-auth'

/**
 * Pins the `games` read POST /api/mahjong/penalty actually issues.
 *
 * `route.host-auth.test.ts` next door executes this handler and covers the
 * `isMahjongGame(...)` branch, but it answers every query with the whole row and never
 * looks at the query — so it would stay green if the `columns: 'game_type'` narrowing were
 * dropped, while a real request would come back with no `game_type` and the route would
 * answer "Not a Mahjong game". `game-admin.test.ts` pins that options bag at the HELPER
 * level; this file pins the same string at the ROUTE level, where the bag is written.
 *
 * The stub here projects the row down to the columns the query asked for, the way PostgREST
 * does, so "narrowed to the wrong list" fails as a behaviour change on top of the literal
 * select assertion that catches "narrowing removed".
 */

vi.mock('server-only', () => ({}))

const seen: ResolverContext[] = []
let game: Record<string, unknown> | null = gameRow({ status: 'active', game_type: 'mahjong' })

const supabase = makeSupabaseStub({
  games: (ctx) => {
    seen.push(ctx)
    return { data: projectRow(game, ctx.selects[0]), error: null }
  },
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))

// The penalty engine is out of scope here, as in the host-auth suite.
vi.mock('@/lib/mahjong', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mahjong')>()
  return { ...actual, processMahjongPenalty: async () => ({ error: null }) }
})

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  seen.length = 0
  game = gameRow({ status: 'active', game_type: 'mahjong' })
})

const post = (body: unknown) => POST(jsonRequest('/api/mahjong/penalty', body))

const valid = { gameId: GAME_CODE, hostToken: HOST_TOKEN, playerId: PLAYER_ID, penaltyType: 'chombo' }

describe('POST /api/mahjong/penalty — games select shape', () => {
  it('reads `games` once, by id, selecting exactly `game_type, host_token, status`', async () => {
    const res = await post(valid)
    expect(res.status).toBe(200)
    expect(seen).toHaveLength(1)
    expect(seen[0].table).toBe('games')
    expect(seen[0].op).toBe('select')
    expect(seen[0].filterCalls).toEqual([{ method: 'eq', args: ['id', GAME_ID] }])
    // `game_type` is the caller's; `host_token` and `status` are appended by the helper.
    // Asserted literally: a substring match would survive exactly the widening this guards.
    expect(seen[0].selects).toEqual(['game_type, host_token, status'])
  })

  it('carries `game_type` through the projection, so the type gate still sees it', async () => {
    const ok = await post(valid)
    expect(ok.status).toBe(200)
    await expect(ok.json()).resolves.toEqual({ success: true })

    game = gameRow({ status: 'active', game_type: 'smash_marry_kill' })
    const wrongType = await post(valid)
    expect(wrongType.status).toBe(400)
    await expect(wrongType.json()).resolves.toEqual({ error: 'Not a Mahjong game' })
  })
})
