import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, codeParams, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * `uno_wd4_challenge_penalty` used to validate and 200 without ever being written — the host
 * changed the Wild Draw Four challenge penalty in the lobby, saw success, and the game kept
 * playing with the old value. These pin the write itself: what lands in the `games` update
 * payload, and (just as importantly) that the column is left alone when the field is absent.
 */

vi.mock('server-only', () => ({}))

let game: Record<string, unknown> | null = gameRow({ status: 'waiting', game_type: 'uno' })
let lastGamesUpdate: Record<string, unknown> | null = null

const supabase = makeSupabaseStub({
  games: ({ op, payload }) => {
    if (op === 'update') {
      lastGamesUpdate = payload as Record<string, unknown>
      return { data: { ...(game ?? {}), ...(payload as Record<string, unknown>) }, error: null }
    }
    return { data: game, error: null }
  },
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => supabase }))

type Post = typeof import('./route').POST
let POST: Post

// Same rationale as the host-auth characterization: the route pulls in a large dependency
// graph, so the one-time import gets its own budget.
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  game = gameRow({ status: 'waiting', game_type: 'uno' })
  lastGamesUpdate = null
})

const post = (body: Record<string, unknown>) =>
  POST(jsonRequest(`/api/games/${GAME_CODE}/lobby-settings`, { hostToken: HOST_TOKEN, ...body }), codeParams())

describe('POST /api/games/[code]/lobby-settings — uno_wd4_challenge_penalty', () => {
  it('writes 4 when the host picks the milder 4-card penalty', async () => {
    const res = await post({ uno_wd4_challenge_penalty: 4 })
    expect(res.status).toBe(200)
    expect(lastGamesUpdate).toMatchObject({ uno_wd4_challenge_penalty: 4 })
  })

  it('writes 6 when the host picks the standard 6-card penalty', async () => {
    const res = await post({ uno_wd4_challenge_penalty: 6 })
    expect(res.status).toBe(200)
    expect(lastGamesUpdate).toMatchObject({ uno_wd4_challenge_penalty: 6 })
  })

  // The schema is `z.coerce.number().int()`, so anything integral gets through validation.
  // Creation collapses everything but 4 to 6 (`Number(raw) === 4 ? 4 : 6`) and `parseUnoRules`
  // reads it back the same way, so the lobby must collapse identically — otherwise the same
  // stored setting would mean different things depending on where it was set.
  it.each([2, 0, 10, -4])('collapses the out-of-range value %i to 6, exactly like create', async (value) => {
    const res = await post({ uno_wd4_challenge_penalty: value })
    expect(res.status).toBe(200)
    expect(lastGamesUpdate).toMatchObject({ uno_wd4_challenge_penalty: 6 })
  })

  it('coerces a numeric string the way create does', async () => {
    const res = await post({ uno_wd4_challenge_penalty: '4' })
    expect(res.status).toBe(200)
    expect(lastGamesUpdate).toMatchObject({ uno_wd4_challenge_penalty: 4 })
  })

  // The most likely way to break existing games: an unrelated lobby edit resetting the
  // column to a default. Omitting the field must leave it out of the update payload.
  it('leaves the column untouched when the field is absent', async () => {
    const res = await post({ uno_stacking: true })
    expect(res.status).toBe(200)
    expect(lastGamesUpdate).toMatchObject({ uno_stacking: true })
    expect(lastGamesUpdate).not.toHaveProperty('uno_wd4_challenge_penalty')
  })

  it('is enough on its own to get past the "Nothing to update" gate', async () => {
    const res = await post({ uno_wd4_challenge_penalty: 4 })
    expect(res.status).toBe(200)
  })

  it('rejects the field on a non-UNO game with the shared house-rules error', async () => {
    game = gameRow({ status: 'waiting', game_type: 'whot' })
    const res = await post({ uno_wd4_challenge_penalty: 4 })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'House rules only apply to UNO games' })
    expect(lastGamesUpdate).toBeNull()
  })
})
