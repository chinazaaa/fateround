import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/mafia/[code]/vigilante-action parses its body inside a try/catch but destructures
 * it OUTSIDE:
 *
 *   try { body = await req.json() } catch { return 400 'Invalid body' }
 *   const { resumeToken, targetPlayerId, action } = body
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

const { assertPlayer, markGameFinished, inserts, updates, tables } = vi.hoisted(() => ({
  assertPlayer: vi.fn(),
  markGameFinished: vi.fn(),
  inserts: vi.fn(),
  updates: vi.fn(),
  tables: {
    mafia_sessions: { data: null as unknown, error: null },
    mafia_player_states: { data: null as unknown, error: null },
    players: { data: null as unknown, error: null },
    // Result of the guarded CAS updates: .update({...}).eq(...).eq(...).select('id')
    updateSelect: { data: [{ id: 'state-1' }] as unknown, error: null },
  },
}))

// Faithful to the real call chains in the route:
//   admin.from('mafia_sessions').select('*').eq('game_id', id).maybeSingle()   -> { data, error }
//   admin.from('mafia_player_states').select('*').eq('game_id', id)            -> { data, error }
//   admin.from('players').select('id, name').eq('game_id', id)                 -> { data, error }
//   admin.from(t).update({...}).eq(...)[.eq(...)][.select('id')]               -> { data, error }
//   admin.from('mafia_chat_messages').insert({...})                            -> { error }
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: async () => tables[table as 'mafia_sessions'],
          then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(tables[table as 'players']).then(resolve, reject),
        }
        return chain
      },
      update: (row: unknown) => {
        updates(table, row)
        const chain = {
          eq: () => chain,
          select: () => ({
            then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
              Promise.resolve(tables.updateSelect).then(resolve, reject),
          }),
          then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve({ data: null, error: null }).then(resolve, reject),
        }
        return chain
      },
      insert: async (row: unknown) => {
        inserts(table, row)
        return { error: null }
      },
    }),
  }),
}))

// Real signature: (supabase, gameCode, resumeToken, opts?) =>
//   Promise<{ error, status, player, id }> — error/player are mutually exclusive.
vi.mock('@/lib/game-admin', () => ({ assertPlayer }))

// Real signature: (supabase, gameId, finishedAt?, { onlyIfActive }?) => Promise<FinishGameResult>.
// Mocked because the real module pulls in room-points/tournament/trophies; the route ignores
// its return value.
vi.mock('@/lib/game-finish', () => ({ markGameFinished }))

// @/lib/mafia is deliberately NOT mocked: checkMafiaWinCondition / mafiaRoleTeam /
// resolveWolfCubRevenge are pure-ish helpers over the player states we supply.

type Post = typeof import('./route').POST
let POST: Post

// p1 vigilante shoots p2 (mafia). Afterwards 1 mafia vs 2 others → no win condition.
const VIG = {
  id: 'state-1',
  player_id: 'p1',
  is_alive: true,
  role: 'vigilante',
  seat_number: 1,
  vigilante_shots_used: 0,
  vigilante_reveal_used: false,
}
const TARGET = { id: 'state-2', player_id: 'p2', is_alive: true, role: 'mafia', seat_number: 2 }
const OTHERS = [
  { id: 'state-3', player_id: 'p3', is_alive: true, role: 'mafia', seat_number: 3 },
  { id: 'state-4', player_id: 'p4', is_alive: true, role: 'villager', seat_number: 4 },
]

type State = {
  id: string
  player_id: string
  is_alive: boolean
  role: string
  seat_number: number
  vigilante_shots_used?: number
  vigilante_reveal_used?: boolean
}

function states(): State[] {
  return [{ ...VIG }, { ...TARGET }, ...OTHERS.map((o) => ({ ...o }))]
}

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  assertPlayer.mockReset()
  assertPlayer.mockResolvedValue({ error: null, status: 200, player: { id: 'p1' }, id: 'ABCD' })
  markGameFinished.mockReset()
  markGameFinished.mockResolvedValue({ error: null, won: true })
  inserts.mockReset()
  updates.mockReset()
  tables.mafia_sessions = {
    data: { game_id: 'ABCD', phase: 'day', day_number: 2, vigilante_day_kill_player_id: null },
    error: null,
  }
  tables.mafia_player_states = { data: states(), error: null }
  tables.players = {
    data: [
      { id: 'p1', name: 'Ann' },
      { id: 'p2', name: 'Bee' },
      { id: 'p3', name: 'Cid' },
      { id: 'p4', name: 'Dee' },
    ],
    error: null,
  }
  tables.updateSelect = { data: [{ id: 'state-1' }], error: null }
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/mafia/ABCD/vigilante-action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    { params: Promise.resolve({ code: 'abcd' }) }
  )
}

describe('POST /api/mafia/[code]/vigilante-action — null JSON body', () => {
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
    ['a valid body missing resumeToken', '{"targetPlayerId":"p2","action":"shoot"}'],
    ['a valid body missing targetPlayerId', '{"resumeToken":"tok1","action":"shoot"}'],
  ])('answers 400 "Invalid parameters" for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid parameters' })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  it.each([
    ['a malformed body', '{"a":'],
    ['an empty body', ''],
  ])('answers 400 "Invalid body" for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid body' })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  // The distinctive extra gate: action must be exactly 'shoot' or 'reveal'.
  it.each([
    ['a missing action', '{"resumeToken":"tok1","targetPlayerId":"p2"}'],
    ['an unknown action', '{"resumeToken":"tok1","targetPlayerId":"p2","action":"stab"}'],
    ['a non-string action', '{"resumeToken":"tok1","targetPlayerId":"p2","action":1}'],
  ])('answers 400 on the action gate for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Action must be "shoot" or "reveal"' })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  // Past every gate — params, action, auth, phase, role, target — to terminal success.
  it('answers 200 { success, killed } for a fully valid shoot', async () => {
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p2","action":"shoot"}')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, killed: true })
    expect(assertPlayer).toHaveBeenCalledWith(expect.anything(), 'ABCD', 'tok1')
    expect(inserts).toHaveBeenCalledWith(
      'mafia_chat_messages',
      expect.objectContaining({ message: '🔫 #1 Ann (Vigilante) shot #2 Bee!' })
    )
    expect(markGameFinished).not.toHaveBeenCalled()
  })

  it('answers 200 with the revealed role for a fully valid reveal', async () => {
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p2","action":"reveal"}')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      revealedRole: 'mafia',
      revealedName: 'Bee',
    })
  })

  // Gate precedence: the parameter shape check runs BEFORE the action gate and before auth.
  it('answers "Invalid parameters" before the action gate when both are bad', async () => {
    assertPlayer.mockResolvedValue({ error: 'Unauthorized', status: 403, player: null, id: 'ABCD' })
    const res = await post('{"action":"stab"}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid parameters' })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  // Gate precedence: the action gate runs BEFORE auth, so a bad action with a bad token
  // answers the action failure and never touches assertPlayer.
  it('answers the action failure before auth when the action AND the token are wrong', async () => {
    assertPlayer.mockResolvedValue({ error: 'Unauthorized', status: 403, player: null, id: 'ABCD' })
    const res = await post('{"resumeToken":"bad","targetPlayerId":"p2","action":"stab"}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Action must be "shoot" or "reveal"' })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  // Gate precedence: a bad token AND a wrong phase in one request must still answer auth.
  it('answers the auth failure before the phase check when both are wrong', async () => {
    assertPlayer.mockResolvedValue({ error: 'Unauthorized', status: 403, player: null, id: 'ABCD' })
    tables.mafia_sessions = { data: { game_id: 'ABCD', phase: 'night', day_number: 2 }, error: null }
    const res = await post('{"resumeToken":"bad","targetPlayerId":"p2","action":"shoot"}')
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('answers 400 outside day/voting', async () => {
    tables.mafia_sessions = { data: { game_id: 'ABCD', phase: 'night', day_number: 2 }, error: null }
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p2","action":"shoot"}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Vigilante can only act during the day' })
  })

  it('answers 403 when the caller is not an alive Vigilante', async () => {
    const s = states()
    s[0].role = 'villager'
    tables.mafia_player_states = { data: s, error: null }
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p2","action":"shoot"}')
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Only an alive Vigilante can use this action' })
  })

  it('answers 400 when the target is not alive', async () => {
    const s = states()
    s[1].is_alive = false
    tables.mafia_player_states = { data: s, error: null }
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p2","action":"shoot"}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Target must be an alive player' })
  })

  it('answers 400 when the vigilante targets themselves', async () => {
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p1","action":"shoot"}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Cannot target yourself' })
  })

  it('answers 400 when the shot is already used', async () => {
    const s = states()
    s[0].vigilante_shots_used = 1
    tables.mafia_player_states = { data: s, error: null }
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p2","action":"shoot"}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'You have already used your shot' })
  })
})
