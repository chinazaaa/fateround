import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/mafia/[code]/priest-action parses its body inside a try/catch but destructures it
 * OUTSIDE:
 *
 *   try { body = await req.json() } catch { return 400 'Invalid body' }
 *   const { resumeToken, targetPlayerId } = body
 *
 * `req.json()` parses a literal `null` body SUCCESSFULLY, so the `catch` never fires and
 * `body` is `null`. Destructuring `null` then throws a TypeError from OUTSIDE the try, so
 * the handler's returned promise REJECTS (an unhandled rejection → 500 in prod) instead of
 * answering a status. There is no gate before the parse: this route is reachable
 * unauthenticated.
 *
 * This suite pins the exact status/body for every body shape so the `?? {}` fix can only
 * move the `null` row.
 */

vi.mock('server-only', () => ({}))

const { assertPlayer, markGameFinished, tables } = vi.hoisted(() => ({
  assertPlayer: vi.fn(),
  markGameFinished: vi.fn(),
  tables: {
    mafiaSession: { data: null as unknown, error: null as unknown },
    playerStates: { data: null as unknown, error: null as unknown },
    players: { data: [] as unknown, error: null as unknown },
    // The holy-water CAS: .update(...).eq('id').eq('priest_holy_water_used', false).select('id')
    holyWaterCas: { data: [{ id: 'state-1' }] as unknown, error: null as unknown },
  },
}))

// Faithful to the real call chains in the route:
//   admin.from('mafia_sessions').select('*').eq('game_id', id).maybeSingle()        -> { data }
//   admin.from('mafia_player_states').select('*').eq('game_id', id)                 -> { data }
//   admin.from('mafia_player_states').update({...}).eq('id').eq(...).select('id')   -> { data }  (CAS)
//   admin.from('mafia_player_states').update({...}).eq('game_id').eq('player_id')   -> awaited
//   admin.from('players').select('id, name').eq('game_id', id)                      -> { data }
//   admin.from('players').update({...}).eq('game_id').eq('id')                      -> awaited
//   admin.from('mafia_chat_messages').insert({...})                                 -> awaited
//   admin.from('mafia_sessions').update({...}).eq('game_id', id)                    -> awaited (win only)
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      let op: 'select' | 'update' | 'insert' = 'select'
      let selectedAfterWrite = false
      const result = () => {
        if (op === 'insert') return { data: null, error: null }
        if (op === 'update') {
          // Only the holy-water CAS reads rows back from an update.
          if (table === 'mafia_player_states' && selectedAfterWrite) return tables.holyWaterCas
          return { data: null, error: null }
        }
        if (table === 'mafia_sessions') return tables.mafiaSession
        if (table === 'mafia_player_states') return tables.playerStates
        if (table === 'players') return tables.players
        return { data: [], error: null }
      }
      const chain: Record<string, unknown> = {
        select: () => {
          if (op !== 'select') selectedAfterWrite = true
          return chain
        },
        eq: () => chain,
        is: () => chain,
        in: () => chain,
        update: () => {
          op = 'update'
          return chain
        },
        insert: () => {
          op = 'insert'
          return chain
        },
        maybeSingle: async () => result(),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(result()).then(resolve, reject),
      }
      return chain
    },
  }),
}))

// Real signature: (supabase, gameCode, resumeToken, opts?) =>
//   Promise<{ error, status, player, id }> — error/player are mutually exclusive.
vi.mock('@/lib/game-admin', () => ({ assertPlayer }))

// Real signature: (supabase, gameId, finishedAt?, { onlyIfActive }?) =>
//   Promise<{ error: string | null; won: boolean; cleanupError?: string | null }>.
// Only reached when checkMafiaWinCondition fires; the fixtures below keep a mafioso
// alive so it does not, but the mock keeps the heavy finish chain out of the suite.
vi.mock('@/lib/game-finish', () => ({ markGameFinished }))

// @/lib/mafia is deliberately NOT mocked — checkMafiaWinCondition is pure and is the
// real gate on whether the game-over branch runs.

type Post = typeof import('./route').POST
let POST: Post

const PRIEST = { id: 'state-1', player_id: 'p1', seat_number: 1, role: 'priest', is_alive: true }
const INNOCENT = { id: 'state-2', player_id: 'p2', seat_number: 2, role: 'villager', is_alive: true }
const MAFIOSO = { id: 'state-3', player_id: 'p3', seat_number: 3, role: 'mafia', is_alive: true }
const VILLAGER = { id: 'state-4', player_id: 'p4', seat_number: 4, role: 'villager', is_alive: true }

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  assertPlayer.mockReset()
  assertPlayer.mockResolvedValue({ error: null, status: 200, player: { id: 'p1' }, id: 'ABCD' })
  markGameFinished.mockReset()
  markGameFinished.mockResolvedValue({ error: null, won: true })
  tables.mafiaSession = { data: { game_id: 'ABCD', phase: 'day', day_number: 2 }, error: null }
  // Fresh copies each test: the route mutates playerStates in place.
  tables.playerStates = { data: [{ ...PRIEST }, { ...INNOCENT }, { ...MAFIOSO }, { ...VILLAGER }], error: null }
  tables.players = {
    data: [
      { id: 'p1', name: 'Priest' },
      { id: 'p2', name: 'Innocent' },
      { id: 'p3', name: 'Mafioso' },
      { id: 'p4', name: 'Villager' },
    ],
    error: null,
  }
  tables.holyWaterCas = { data: [{ id: 'state-1' }], error: null }
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/mafia/ABCD/priest-action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    { params: Promise.resolve({ code: 'abcd' }) }
  )
}

describe('POST /api/mafia/[code]/priest-action — null JSON body', () => {
  it('answers 400 "Invalid parameters" for a literal null body, exactly like {}', async () => {
    const res = await post('null')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid parameters' })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty object body', '{}'],
    ['a numeric scalar body', '5'],
    ['a string scalar body', '"str"'],
    ['an array body', '[]'],
    ['a valid body missing targetPlayerId', '{"resumeToken":"tok1"}'],
    ['a valid body missing resumeToken', '{"targetPlayerId":"p2"}'],
  ])('answers 400 "Invalid parameters" for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid parameters' })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  it.each([
    ['a malformed body', '{"resumeToken":'],
    ['an empty body', ''],
  ])('answers 400 "Invalid body" for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid body' })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  // Past the gates, not into them: an innocent target kills the Priest, and with a
  // mafioso still alive no win condition fires.
  it('answers 200 for a valid submission that clears every gate (innocent target)', async () => {
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p2"}')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, targetWasMafia: false })
    expect(assertPlayer).toHaveBeenCalledWith(expect.anything(), 'ABCD', 'tok1')
    expect(markGameFinished).not.toHaveBeenCalled()
  })

  it('answers 200 with targetWasMafia true for a mafia target', async () => {
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p3"}')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, targetWasMafia: true })
    // Killing the only mafioso ends the game for the village.
    expect(markGameFinished).toHaveBeenCalledWith(expect.anything(), 'ABCD')
  })

  // Gate precedence: a bad token AND a bad phase in one request must still answer the
  // auth failure, so a swap cannot silently reorder auth behind game-state checks.
  it('answers the auth failure before the phase check when both are wrong', async () => {
    assertPlayer.mockResolvedValue({ error: 'Unauthorized', status: 403, player: null, id: 'ABCD' })
    tables.mafiaSession = { data: { game_id: 'ABCD', phase: 'night', day_number: 2 }, error: null }
    const res = await post('{"resumeToken":"bad","targetPlayerId":"p2"}')
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  // Gate precedence: phase is checked before the "alive Priest" role check.
  it('answers the phase failure before the role check when both are wrong', async () => {
    tables.mafiaSession = { data: { game_id: 'ABCD', phase: 'night', day_number: 2 }, error: null }
    tables.playerStates = {
      data: [{ ...PRIEST, role: 'villager' }, { ...INNOCENT }, { ...MAFIOSO }, { ...VILLAGER }],
      error: null,
    }
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p2"}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Priest can only act during the day' })
  })

  it('answers 403 for a valid authorized request from a non-Priest', async () => {
    tables.playerStates = {
      data: [{ ...PRIEST, role: 'villager' }, { ...INNOCENT }, { ...MAFIOSO }, { ...VILLAGER }],
      error: null,
    }
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p2"}')
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Only an alive Priest can use this action' })
  })

  it('answers 400 "Holy water already used" when the CAS matches no row', async () => {
    tables.holyWaterCas = { data: [], error: null }
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p2"}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Holy water already used' })
  })
})
