import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, codeParams, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'
import { boardGameLobbySettingsSchema } from '@/lib/validation'

/**
 * `edition_slug` and `library_pack_id` used to be declared by `boardGameLobbySettingsSchema`
 * while the route had no code that read either one — they validated, the request 200'd, and the
 * value went nowhere (issue #1160).
 *
 * They were removed from the lobby schema rather than wired up:
 *  - `edition_slug` is coin-gated. `src/lib/coins/editions.ts` requires the ownership check to
 *    run at edition_slug write time, and `PATCH /api/games/[code]` already does exactly that
 *    (entitlement + "is this edition valid for this game type"). Applying it here would create a
 *    second entitlement-sensitive write path for a field the correct endpoint already handles.
 *  - `library_pack_id` belongs to game creation (`createGameSchema`), which is where it is read.
 *
 * Both remain in `createGameSchema`, so these tests also guard against the removal being applied
 * to the wrong schema.
 *
 * NOTE on what "removed" means at the HTTP layer: `z.object` strips unknown keys (it is not
 * `.strict()`), so a request still carrying one of these fields is accepted and the field is
 * dropped during parsing instead of after it. The status code is unchanged; what changed is that
 * the schema — and the exported `BoardGameLobbySettingsInput` — no longer advertise a setting the
 * route cannot honour.
 */

vi.mock('server-only', () => ({}))

let game: Record<string, unknown> | null = gameRow({ status: 'waiting', game_type: 'monopoly' })
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

// Same rationale as the sibling characterizations: the route pulls in a large dependency graph,
// so the one-time import gets its own budget.
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  game = gameRow({ status: 'waiting', game_type: 'monopoly' })
  lastGamesUpdate = null
})

const post = (body: Record<string, unknown>) =>
  POST(jsonRequest(`/api/games/${GAME_CODE}/lobby-settings`, { hostToken: HOST_TOKEN, ...body }), codeParams())

const parseLobby = (body: Record<string, unknown>) =>
  boardGameLobbySettingsSchema.safeParse({ gameId: 'ABCD', hostToken: HOST_TOKEN, ...body })

describe('boardGameLobbySettingsSchema — fields the lobby route never applied', () => {
  it('does not accept edition_slug as a lobby setting', () => {
    const result = parseLobby({ edition_slug: 'america' })
    expect(result.success).toBe(true)
    // Dropped at parse time, so no downstream code can mistake it for a setting to write.
    expect(result.success && result.data).not.toHaveProperty('edition_slug')
  })

  it('does not accept library_pack_id as a lobby setting', () => {
    const result = parseLobby({ library_pack_id: '22222222-2222-4222-8222-222222222222' })
    expect(result.success).toBe(true)
    expect(result.success && result.data).not.toHaveProperty('library_pack_id')
  })

  // A malformed value can no longer produce a validation error either — there is nothing left to
  // validate. This is the tell that the field is genuinely gone rather than merely unused.
  it('no longer validates a malformed library_pack_id', () => {
    const result = parseLobby({ library_pack_id: 'not-a-uuid' })
    expect(result.success).toBe(true)
    expect(result.success && result.data).not.toHaveProperty('library_pack_id')
  })

  it('still accepts the settings the route does apply', () => {
    const result = parseLobby({ max_players: 6, is_public: true })
    expect(result.success).toBe(true)
    expect(result.success && result.data).toMatchObject({ max_players: 6, is_public: true })
  })
})

describe('POST /api/games/[code]/lobby-settings — edition_slug / library_pack_id are not written', () => {
  it('never writes edition_slug, so a paid edition cannot be assigned without the entitlement check', async () => {
    const res = await post({ edition_slug: 'america', max_players: 6 })
    expect(res.status).toBe(200)
    expect(lastGamesUpdate).not.toBeNull()
    expect(lastGamesUpdate).not.toHaveProperty('edition_slug')
    // The rest of the patch still lands — the dropped field does not poison the request.
    expect(lastGamesUpdate).toMatchObject({ max_players: 6 })
  })

  it('never writes library_pack_id', async () => {
    const res = await post({ library_pack_id: '22222222-2222-4222-8222-222222222222', max_players: 6 })
    expect(res.status).toBe(200)
    expect(lastGamesUpdate).not.toBeNull()
    expect(lastGamesUpdate).not.toHaveProperty('library_pack_id')
    expect(lastGamesUpdate).toMatchObject({ max_players: 6 })
  })
})

describe('createGameSchema still owns both fields', () => {
  it('keeps edition_slug and library_pack_id on the creation schema', async () => {
    const { createGameSchema } = await import('@/lib/validation')
    const shape = createGameSchema.shape as Record<string, unknown>
    expect(shape).toHaveProperty('edition_slug')
    expect(shape).toHaveProperty('library_pack_id')
  })
})
