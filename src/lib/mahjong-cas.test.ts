import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MahjongPlayerState, MahjongSession } from '@/types'

vi.mock('@/lib/game-finish', () => ({
  markGameFinished: vi.fn(async () => ({ error: null })),
}))

import { markGameFinished } from '@/lib/game-finish'
import {
  processMahjongClaim,
  processMahjongDiscard,
  processMahjongDraw,
  processMahjongExpireTurn,
  processMahjongNextHand,
  processMahjongPass,
  processMahjongRiichi,
} from '@/lib/mahjong'

const PLAYERS = ['east-player', 'south-player', 'west-player', 'north-player']
const SEATS = ['east', 'south', 'west', 'north'] as const
const NOW = '2026-01-01T00:00:00.000Z'
const CONFLICT = 'Mahjong table changed; please retry'
const GENERATION = '2026-01-01T00:00:00.000Z'

function makeSession(overrides: Record<string, unknown> = {}): MahjongSession {
  return {
    id: 'session-1',
    game_id: 'MJCAS',
    ruleset: 'hk',
    turn_order: PLAYERS,
    dealer_index: 0,
    current_turn_index: 1,
    phase: 'discard',
    wall: ['m1', 'm2', 'm3', 'm4'],
    dead_wall: [],
    dora_indicators: [],
    ura_dora_indicators: [],
    honba: 0,
    riichi_sticks: 0,
    round_wind: 'east',
    hand_number: 1,
    last_action: null,
    hand_result: null,
    rule_options: {},
    rinshan_player_id: null,
    chankan_player_id: null,
    ippatsu_eligible_player_ids: [],
    exhaustive_draw_tenpai_player_ids: [],
    scores: Object.fromEntries(PLAYERS.map((id) => [id, 25000])),
    discard_pile: [{ tile: 'm9', player_id: 'east-player' }],
    last_discard: null,
    claim_passes: [],
    status_message: null,
    winner_player_id: null,
    winner_player_ids: [],
    winning_tile: null,
    win_type: null,
    score_summary: null,
    turn_deadline_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  } as unknown as MahjongSession
}

function makeState(playerId: string, hand: string[]): MahjongPlayerState {
  const index = PLAYERS.indexOf(playerId)
  return {
    id: `${playerId}-state`,
    game_id: 'MJCAS',
    player_id: playerId,
    seat: SEATS[index],
    hand,
    hand_count: hand.length,
    last_drawn_tile: null,
    flowers: [],
    riichi_declared: false,
    riichi_discard_index: null,
    temporary_furiten: false,
    permanent_furiten: false,
    melds: [],
    discarded: ['m1'],
    player_order: index,
    created_at: NOW,
  } as unknown as MahjongPlayerState
}

const FILLER = ['m1', 'm2', 'm3', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'we', 'we', 'wn', 'wn']

function tableWith(southHand: string[]): MahjongPlayerState[] {
  return PLAYERS.map((id) => makeState(id, id === 'south-player' ? southHand : [...FILLER]))
}

type StateWrite = { id: string; patch: Record<string, unknown> }
type RpcCall = {
  fn: string
  args: {
    p_game_id: string
    p_expected_updated_at: string
    p_session_patch: Record<string, unknown>
    p_state_writes: StateWrite[]
  }
}
type Fake = {
  client: SupabaseClient
  rpcCalls: RpcCall[]
  /** Any write that bypassed the transactional RPC (direct table updates). */
  directWrites: string[]
  /** Tables in the order the loader read them. */
  reads: string[]
}

/**
 * Fake Supabase client. `casWins(expectedUpdatedAt)` decides whether the compare-and-swap inside the
 * `mahjong_apply_transition` RPC matches the session row (the RPC returns {status:'conflict'} when
 * it does not). `rpcError` makes the RPC itself fail (nothing is written by the real function then).
 * Direct table writes are recorded in `directWrites` so tests can assert none happen.
 */
function fakeSupabase(
  session: MahjongSession,
  states: MahjongPlayerState[],
  casWins: (expectedUpdatedAt: string) => boolean,
  rpcError?: string
): Fake {
  const rpcCalls: RpcCall[] = []
  const directWrites: string[] = []
  const reads: string[] = []
  const client = {
    rpc: async (fn: string, args: RpcCall['args']) => {
      rpcCalls.push({ fn, args })
      if (rpcError) return { data: null, error: { message: rpcError } }
      if (!casWins(args.p_expected_updated_at)) return { data: { status: 'conflict' }, error: null }
      return { data: { status: 'ok', updated_at: 'NEW-VERSION' }, error: null }
    },
    from(table: string) {
      if (table === 'mahjong_sessions') {
        return {
          select: () => {
            reads.push(table)
            return { eq: () => ({ maybeSingle: async () => ({ data: session, error: null }) }) }
          },
          update: (patch: Record<string, unknown>) => {
            let expected = ''
            const chain = {
              eq: (col: string, value: string) => {
                if (col === 'updated_at') expected = value
                return chain
              },
              select: async () => {
                directWrites.push(`${table}:${Object.keys(patch).join(',')}`)
                const win = casWins(expected)
                return { data: win ? [{ game_id: session.game_id, updated_at: 'NEW-VERSION' }] : [], error: null }
              },
            }
            return chain
          },
        }
      }
      if (table === 'mahjong_player_state') {
        return {
          select: () => ({ eq: () => ({ order: async () => ({ data: states, error: null }) }) }),
          update: (patch: Record<string, unknown>) => ({
            eq: async () => {
              directWrites.push(`${table}:${Object.keys(patch).join(',')}`)
              return { error: null }
            },
          }),
        }
      }
      if (table === 'players') {
        return { select: () => ({ eq: async () => ({ data: PLAYERS.map((id) => ({ id, name: id })), error: null }) }) }
      }
      if (table === 'games') {
        return {
          select: () => {
            reads.push(table)
            return {
              eq: () => ({
                maybeSingle: async () => ({ data: { timer_seconds: 0, session_started_at: GENERATION }, error: null }),
              }),
            }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  } as unknown as SupabaseClient
  return { client, rpcCalls, directWrites, reads }
}

type Scenario = {
  name: string
  session: MahjongSession
  states: MahjongPlayerState[]
  run: (client: SupabaseClient) => Promise<{ error?: string }>
  /** Number of RPC calls a winning request makes (the action itself, plus any automatic follow-up draw). */
  rpcCount: number
  expectFirstCall: (call: RpcCall) => void
}

const scenarios: Scenario[] = [
  {
    name: 'discard',
    session: makeSession(),
    states: tableWith(['m6', 'm9', 'p2', 'p4', 'p6', 's1', 's3', 's5', 'we', 'we', 'wn', 'wn', 'dr', 'dg']),
    run: (c) => processMahjongDiscard(c, 'MJCAS', 'south-player', 'm6'),
    // Nobody can claim: the discard and the next player's draw commit in ONE rpc, so a failed draw
    // cannot leave a committed 'claim' phase with the discard already removed from the hand.
    rpcCount: 1,
    expectFirstCall: (call) => {
      expect(call.args.p_session_patch).toMatchObject({ phase: 'discard', last_action: 'draw' })
      expect(call.args.p_session_patch.discard_pile).toHaveLength(2)
      expect(call.args.p_state_writes).toHaveLength(2)
      expect(call.args.p_state_writes[0]?.id).toBe('south-player-state')
      expect(call.args.p_state_writes[0]?.patch.hand).not.toContain('m6')
      expect(call.args.p_state_writes[0]?.patch.discarded).toEqual(['m1', 'm6'])
      expect(call.args.p_state_writes[1]?.id).toBe('west-player-state')
    },
  },
  {
    name: 'draw',
    session: makeSession({ phase: 'draw' }),
    states: tableWith(FILLER),
    run: (c) => processMahjongDraw(c, 'MJCAS', 'south-player'),
    rpcCount: 1,
    expectFirstCall: (call) => {
      expect(call.args.p_session_patch).toMatchObject({ phase: 'discard', wall: ['m1', 'm2', 'm3'] })
      expect(call.args.p_state_writes).toHaveLength(1)
      expect(call.args.p_state_writes[0]?.patch.hand).toContain('m4')
      expect(call.args.p_state_writes[0]?.patch.last_drawn_tile).toBe('m4')
    },
  },
  {
    name: 'concealed kong',
    session: makeSession({ wall: ['p9', 'p8', 'p7', 'p6'] }),
    states: tableWith(['m5', 'm5', 'm5', 'm5', 'p1', 'p2', 'p4', 's1', 's3', 's5', 'we', 'wn', 'dr', 'dg']),
    run: (c) => processMahjongClaim(c, 'MJCAS', 'south-player', 'kong', ['m5']),
    // The meld and the replacement draw travel in the same call as the session patch.
    rpcCount: 1,
    expectFirstCall: (call) => {
      expect(call.args.p_state_writes).toHaveLength(2)
      expect(call.args.p_state_writes[0]?.patch.melds).toHaveLength(1)
      expect(call.args.p_state_writes[1]?.patch.last_drawn_tile).toBeTruthy()
    },
  },
  {
    name: 'called pung',
    session: makeSession({
      phase: 'claim',
      current_turn_index: 0,
      last_discard: { tile: 'p5', player_id: 'east-player', discard_index: 0 },
      discard_pile: [{ tile: 'p5', player_id: 'east-player' }],
    }),
    states: tableWith(['p5', 'p5', 'm1', 'm4', 'm7', 's1', 's4', 's7', 'we', 'wn', 'dr', 'dg', 'ws']),
    run: (c) => processMahjongClaim(c, 'MJCAS', 'south-player', 'pung'),
    rpcCount: 1,
    expectFirstCall: (call) => {
      expect(call.args.p_session_patch).toMatchObject({ phase: 'discard' })
      expect(call.args.p_state_writes).toHaveLength(1)
      expect(call.args.p_state_writes[0]?.patch.melds).toHaveLength(1)
    },
  },
  {
    name: 'riichi',
    session: makeSession({ ruleset: 'riichi' }),
    states: tableWith(['m1', 'm2', 'm3', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'we', 'we', 'wn', 'wn']),
    run: (c) => processMahjongRiichi(c, 'MJCAS', 'south-player'),
    rpcCount: 1,
    expectFirstCall: (call) => {
      // The 1000-point stick and the riichi flag are written in the same transaction.
      expect(call.args.p_session_patch).toMatchObject({
        riichi_sticks: 1,
        last_action: 'riichi',
        scores: { 'south-player': 24000 },
      })
      expect(call.args.p_state_writes).toEqual([
        { id: 'south-player-state', patch: { riichi_declared: true, riichi_discard_index: 1 } },
      ])
    },
  },
]

describe('Mahjong session compare-and-swap + player state in one transaction', () => {
  for (const scenario of scenarios) {
    it(`${scenario.name}: loser of the CAS gets a conflict and nothing else is written`, async () => {
      const fake = fakeSupabase(scenario.session, scenario.states, () => false)
      const result = await scenario.run(fake.client)
      expect(result.error).toBe(CONFLICT)
      expect(fake.rpcCalls).toHaveLength(1)
      expect(fake.directWrites).toEqual([])
    })

    it(`${scenario.name}: winner makes ONE rpc carrying the session patch and the state writes`, async () => {
      const fake = fakeSupabase(scenario.session, scenario.states, () => true)
      const result = await scenario.run(fake.client)
      expect(result.error).toBeUndefined()
      expect(fake.rpcCalls).toHaveLength(scenario.rpcCount)
      expect(fake.directWrites).toEqual([])
      const first = fake.rpcCalls[0]!
      expect(first.fn).toBe('mahjong_apply_transition')
      expect(first.args.p_game_id).toBe('MJCAS')
      expect(first.args.p_expected_updated_at).toBe(NOW)
      scenario.expectFirstCall(first)
    })

    it(`${scenario.name}: rpc error is returned and nothing else is written`, async () => {
      const fake = fakeSupabase(scenario.session, scenario.states, () => true, 'boom')
      const result = await scenario.run(fake.client)
      expect(result.error).toBe('boom')
      expect(fake.rpcCalls).toHaveLength(1)
      expect(fake.directWrites).toEqual([])
    })
  }

  it('discard: a failed rpc commits nothing, so the same discard can simply be retried', async () => {
    const scenario = scenarios[0]!
    const failing = fakeSupabase(scenario.session, scenario.states, () => true, 'boom')
    expect((await scenario.run(failing.client)).error).toBe('boom')
    // The session the retry reads is unchanged (nothing was committed), and it succeeds.
    const retry = fakeSupabase(scenario.session, scenario.states, () => true)
    expect((await scenario.run(retry.client)).error).toBeUndefined()
  })

  it('discard: when a claim is possible the discard commits the claim phase on its own', async () => {
    const states = tableWith(['m6', 'm9', 'p2', 'p4', 'p6', 's1', 's3', 's5', 'we', 'we', 'wn', 'wn', 'dr', 'dg'])
    // west holds a pair of m6 and can pung the discard.
    states[2] = makeState('west-player', ['m6', 'm6', 'p1', 'p4', 'p7', 's1', 's4', 's7', 'we', 'wn', 'dr', 'dg', 'ws'])
    const fake = fakeSupabase(makeSession(), states, () => true)
    expect((await processMahjongDiscard(fake.client, 'MJCAS', 'south-player', 'm6')).error).toBeUndefined()
    expect(fake.rpcCalls).toHaveLength(1)
    expect(fake.rpcCalls[0]?.args.p_session_patch).toMatchObject({ phase: 'claim' })
  })

  it('expire: a claim phase with no possible claimant still advances to the next draw', async () => {
    const session = makeSession({
      phase: 'claim',
      current_turn_index: 1,
      last_discard: { tile: 'm6', player_id: 'south-player', discard_index: 0 },
      discard_pile: [{ tile: 'm6', player_id: 'south-player' }],
      turn_deadline_at: '2020-01-01T00:00:00.000Z',
    })
    const fake = fakeSupabase(session, tableWith([...FILLER]), () => true)
    expect((await processMahjongExpireTurn(fake.client, 'MJCAS')).error).toBeUndefined()
    expect(fake.rpcCalls).toHaveLength(1)
    expect(fake.rpcCalls[0]?.args.p_session_patch).toMatchObject({ phase: 'discard', current_turn_index: 2 })
  })

  it('concurrent discards of different tiles by one player: exactly one hand write lands', async () => {
    const scenario = scenarios[0]!
    // One shared session row: the first CAS to arrive wins, every later one reports a conflict.
    let version = NOW
    const casWins = (expected: string) => {
      if (expected !== version) return false
      version = 'NEW-VERSION'
      return true
    }
    const fake = fakeSupabase(scenario.session, scenario.states, casWins)
    const results = await Promise.all(
      ['m6', 'm9', 'p2'].map((tile) => processMahjongDiscard(fake.client, 'MJCAS', 'south-player', tile))
    )
    expect(results.filter((r) => !r.error)).toHaveLength(1)
    expect(results.filter((r) => r.error === CONFLICT)).toHaveLength(2)
    // Only the winner's rpc applied south's hand write; losers' rpcs were rejected as a whole.
    const southWrites = fake.rpcCalls.filter((c) => c.args.p_state_writes.some((w) => w.id === 'south-player-state'))
    expect(southWrites).toHaveLength(3)
    expect(fake.directWrites).toEqual([])
  })

  it('pass (riichi win pass): temporary furiten rides in the same rpc as the claim pass', async () => {
    const session = makeSession({
      ruleset: 'riichi',
      phase: 'claim',
      current_turn_index: 0,
      last_discard: { tile: 'we', player_id: 'east-player', discard_index: 0 },
      discard_pile: [{ tile: 'we', player_id: 'east-player' }],
    })
    const states = tableWith(['m1', 'm2', 'm3', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'we', 'we', 'wn', 'wn'])
    const loser = fakeSupabase(session, states, () => false)
    expect((await processMahjongPass(loser.client, 'MJCAS', 'south-player')).error).toBe(CONFLICT)
    expect(loser.directWrites).toEqual([])

    const winner = fakeSupabase(session, states, () => true)
    expect((await processMahjongPass(winner.client, 'MJCAS', 'south-player')).error).toBeUndefined()
    expect(winner.directWrites).toEqual([])
    expect(winner.rpcCalls[0]?.args.p_state_writes).toEqual([
      { id: 'south-player-state', patch: { temporary_furiten: true } },
    ])
  })
})

describe('Mahjong Kong replacement draw source', () => {
  const DEAD_WALL = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd10', 'd11', 'd12', 'd13']
  const riichi = (overrides: Record<string, unknown> = {}) =>
    makeSession({
      ruleset: 'riichi',
      wall: ['m1', 'm2', 'm3', 'm4'],
      dead_wall: DEAD_WALL,
      dora_indicators: ['d4'],
      ...overrides,
    })
  const HAND_13 = ['m1', 'm4', 'm7', 'p1', 'p4', 'p7', 's1', 's4', 's7', 'we', 'wn', 'dr', 'dg']

  function expectDeadWallDraw(call: RpcCall, playerId: string) {
    const patch = call.args.p_session_patch
    expect(patch.rinshan_player_id).toBe(playerId)
    expect(patch.last_action).toBe('kong')
    expect((patch.dead_wall as string[]).length).toBe(DEAD_WALL.length - 1)
    expect(patch.wall).toEqual(['m1', 'm2', 'm3', 'm4'])
    expect(patch.dora_indicators).toEqual(['d4', 'd5'])
    expect(patch.phase).toBe('discard')
  }

  it('called Kong (status text "called KONG") draws from the dead wall', async () => {
    const session = riichi({
      phase: 'claim',
      current_turn_index: 0,
      last_discard: { tile: 'p5', player_id: 'east-player', discard_index: 0 },
      discard_pile: [{ tile: 'p5', player_id: 'east-player' }],
    })
    const states = tableWith(['p5', 'p5', 'p5', ...HAND_13.slice(0, 10)])
    const fake = fakeSupabase(session, states, () => true)
    const result = await processMahjongClaim(fake.client, 'MJCAS', 'south-player', 'kong')
    expect(result.error).toBeUndefined()
    expect(fake.rpcCalls).toHaveLength(1)
    expectDeadWallDraw(fake.rpcCalls[0]!, 'south-player')
    expect(fake.rpcCalls[0]!.args.p_session_patch.status_message).toContain('replacement tile')
  })

  it('concealed Kong draws from the dead wall', async () => {
    const session = riichi()
    const states = tableWith(['m5', 'm5', 'm5', 'm5', 'p1', 'p2', 'p4', 's1', 's3', 's5', 'we', 'wn', 'dr', 'dg'])
    const fake = fakeSupabase(session, states, () => true)
    const result = await processMahjongClaim(fake.client, 'MJCAS', 'south-player', 'kong', ['m5'])
    expect(result.error).toBeUndefined()
    expect(fake.rpcCalls).toHaveLength(1)
    expectDeadWallDraw(fake.rpcCalls[0]!, 'south-player')
  })

  it('added Kong draws from the dead wall', async () => {
    const session = riichi()
    const states = tableWith(['m5', 'p1', 'p2', 'p4', 's1', 's3', 's5', 'we', 'wn', 'dr', 'dg', 'ws', 'ww', 'we'])
    states[1] = {
      ...states[1]!,
      melds: [{ type: 'pung', tiles: ['m5', 'm5', 'm5'], from_player_id: 'east-player' }],
    } as unknown as MahjongPlayerState
    const fake = fakeSupabase(session, states, () => true)
    const result = await processMahjongClaim(fake.client, 'MJCAS', 'south-player', 'kong', ['m5'])
    expect(result.error).toBeUndefined()
    expect(fake.rpcCalls).toHaveLength(1)
    expectDeadWallDraw(fake.rpcCalls[0]!, 'south-player')
  })

  it('a normal discard/draw never touches the dead wall or sets rinshan_player_id', async () => {
    const session = riichi({ status_message: 'Previous Kong replacement mentioned in text' })
    const states = tableWith(['m6', 'm9', 'p2', 'p4', 'p6', 's1', 's3', 's5', 'we', 'we', 'wn', 'wn', 'dr', 'dg'])
    const fake = fakeSupabase(session, states, () => true)
    expect((await processMahjongDiscard(fake.client, 'MJCAS', 'south-player', 'm6')).error).toBeUndefined()
    const patch = fake.rpcCalls[0]!.args.p_session_patch
    expect(patch.rinshan_player_id).toBeNull()
    expect(patch.last_action).toBe('draw')
    expect(patch.dead_wall).toEqual(DEAD_WALL)
    expect(patch.dora_indicators).toEqual(['d4'])
    expect((patch.wall as string[]).length).toBe(3)
  })

  it('a pass that ends the claim phase draws from the live wall', async () => {
    const session = riichi({
      phase: 'claim',
      current_turn_index: 0,
      last_discard: { tile: 'p5', player_id: 'east-player', discard_index: 0 },
      discard_pile: [{ tile: 'p5', player_id: 'east-player' }],
    })
    const states = tableWith(['p5', 'p5', 'p5', ...HAND_13.slice(0, 10)])
    const fake = fakeSupabase(session, states, () => true)
    expect((await processMahjongPass(fake.client, 'MJCAS', 'south-player')).error).toBeUndefined()
    const patch = fake.rpcCalls[0]!.args.p_session_patch
    expect(patch.rinshan_player_id).toBeNull()
    expect(patch.dead_wall).toEqual(DEAD_WALL)
  })
})

describe('Mahjong hand transitions that must be atomic', () => {
  it('next hand: the re-deal session patch and all four seats commit in ONE rpc', async () => {
    const session = makeSession({ phase: 'finished', hand_result: 'exhaustive_draw', wall: [], dead_wall: [] })
    const fake = fakeSupabase(session, tableWith([...FILLER]), () => true)
    expect((await processMahjongNextHand(fake.client, 'MJCAS')).error).toBeUndefined()
    expect(fake.rpcCalls).toHaveLength(1)
    expect(fake.directWrites).toEqual([])
    expect(fake.rpcCalls[0]!.args.p_session_patch).toMatchObject({ phase: 'discard' })
    expect(fake.rpcCalls[0]!.args.p_state_writes).toHaveLength(4)
  })

  it('next hand: a request that loses the session CAS writes no hands', async () => {
    const session = makeSession({ phase: 'finished', hand_result: 'exhaustive_draw', wall: [], dead_wall: [] })
    const fake = fakeSupabase(session, tableWith([...FILLER]), () => false)
    expect((await processMahjongNextHand(fake.client, 'MJCAS')).error).toBe(CONFLICT)
    expect(fake.directWrites).toEqual([])
  })

  it('exhaustive draw: the Wall Watcher credit rides in the hand-finishing rpc', async () => {
    const session = makeSession({ phase: 'draw', wall: [] })
    const fake = fakeSupabase(session, tableWith([...FILLER]), () => true)
    expect((await processMahjongDraw(fake.client, 'MJCAS', 'south-player')).error).toBeUndefined()
    expect(fake.rpcCalls).toHaveLength(1)
    expect(fake.directWrites).toEqual([])
    const writes = fake.rpcCalls[0]!.args.p_state_writes
    expect(writes).toHaveLength(4)
    for (const write of writes) expect(write.patch.game_counters).toMatchObject({ mahjong_exhaustive_draws_seen: 1 })
  })

  it('called Kong that aborts the hand persists the claimed discard', async () => {
    const session = makeSession({
      ruleset: 'riichi',
      phase: 'claim',
      current_turn_index: 0,
      dead_wall: ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd10', 'd11', 'd12', 'd13'],
      last_discard: { tile: 'p5', player_id: 'east-player', discard_index: 0 },
      discard_pile: [{ tile: 'p5', player_id: 'east-player' }],
    })
    const kong = (tile: string) => ({ type: 'kong', tiles: [tile, tile, tile, tile], from_player_id: null })
    const states = tableWith(['p5', 'p5', 'p5', 'm1', 'm4', 'm7', 'p1', 'p4', 'p7', 's1', 's4', 's7', 'we'])
    states[0] = { ...states[0]!, melds: [kong('m2'), kong('m3')] } as unknown as MahjongPlayerState
    states[2] = { ...states[2]!, melds: [kong('s2')] } as unknown as MahjongPlayerState
    const fake = fakeSupabase(session, states, () => true)
    expect((await processMahjongClaim(fake.client, 'MJCAS', 'south-player', 'kong')).error).toBeUndefined()
    const patch = fake.rpcCalls[0]!.args.p_session_patch
    expect(patch).toMatchObject({ phase: 'finished', hand_result: 'abortive_draw' })
    expect((patch.discard_pile as Array<Record<string, unknown>>)[0]).toMatchObject({
      claimed_by_player_id: 'south-player',
    })
  })

  describe('match finalization happens only after the deciding hand is committed', () => {
    const finalHand = () =>
      makeSession({
        ruleset: 'riichi',
        phase: 'draw',
        wall: [],
        round_wind: 'south',
        hand_number: 4,
        scores: { 'east-player': 20000, 'south-player': 40000, 'west-player': 20000, 'north-player': 20000 },
      })

    // Nobody tenpai, so the dealer does not repeat and the leader is over the return score.
    const NOTEN = ['m1', 'm4', 'm7', 'p1', 'p4', 'p7', 's1', 's4', 's7', 'we', 'wn', 'dr', 'dg']
    // Discards that rule out Nagashi Mangan (which would make the dealer a winner).
    const decidingTable = (hands: Record<string, string[]> = {}) =>
      PLAYERS.map((id) => ({ ...makeState(id, [...(hands[id] ?? NOTEN)]), discarded: ['m5'] }) as MahjongPlayerState)

    it('marks the game finished after a successful commit', async () => {
      vi.mocked(markGameFinished).mockClear()
      const states = decidingTable()
      const fake = fakeSupabase(finalHand(), states, () => true)
      expect((await processMahjongDraw(fake.client, 'MJCAS', 'south-player')).error).toBeUndefined()
      expect(fake.rpcCalls).toHaveLength(1)
      expect(markGameFinished).toHaveBeenCalledTimes(1)
      // Bound to the `games` generation the request loaded, so a stalled finalizer cannot finish a replay.
      expect(vi.mocked(markGameFinished).mock.calls[0]?.[3]).toEqual({
        onlyIfActive: true,
        onlySessionStartedAt: GENERATION,
      })
    })

    it('does not mark the game finished when the session CAS is lost', async () => {
      vi.mocked(markGameFinished).mockClear()
      // The very table that finishes the match in the test above, so a finalizer that ran before the
      // CAS would be caught here (the control above proves this fixture does reach finalization).
      const fake = fakeSupabase(finalHand(), decidingTable(), () => false)
      expect((await processMahjongDraw(fake.client, 'MJCAS', 'south-player')).error).toBe(CONFLICT)
      expect(markGameFinished).not.toHaveBeenCalled()
    })

    it('persists the match-ending decision on the hand, even with nothing to settle', async () => {
      const fake = fakeSupabase(finalHand(), decidingTable(), () => true)
      await processMahjongDraw(fake.client, 'MJCAS', 'south-player')
      expect(fake.rpcCalls[0]?.args.p_session_patch.score_summary).toMatchObject({ match_finished: true })
    })

    it('keeps the decision for a draw whose summary carries no settlement line, and retries the finish', async () => {
      vi.mocked(markGameFinished).mockClear()
      // Dealer noten, everyone else tenpai: a bailout summary exists, so no marker-only summary.
      const table = decidingTable({
        'south-player': [...FILLER],
        'west-player': [...FILLER],
        'north-player': [...FILLER],
      })
      const first = fakeSupabase(finalHand(), table, () => true)
      await processMahjongDraw(first.client, 'MJCAS', 'south-player')
      const summary = first.rpcCalls[0]?.args.p_session_patch.score_summary as {
        match_finished?: boolean
        lines: Array<{ label: string }>
      }
      expect(summary.lines.some((line) => line.label === 'Final match settlement')).toBe(false)
      expect(summary.match_finished).toBe(true)

      // The finish failed after that commit: the retry finishes the game and deals nothing.
      vi.mocked(markGameFinished).mockClear()
      const committed = makeSession({
        ...finalHand(),
        phase: 'finished',
        hand_result: 'exhaustive_draw',
        score_summary: summary,
      })
      const retry = fakeSupabase(committed, table, () => true)
      expect((await processMahjongNextHand(retry.client, 'MJCAS')).error).toBe('The match is finished')
      expect(markGameFinished).toHaveBeenCalledTimes(1)
      expect(vi.mocked(markGameFinished).mock.calls[0]?.[3]).toEqual({
        onlyIfActive: true,
        onlySessionStartedAt: GENERATION,
      })
      expect(retry.rpcCalls).toEqual([])
    })

    it('a hand that does not end the match carries no decision and still deals the next hand', async () => {
      vi.mocked(markGameFinished).mockClear()
      const mid = makeSession({ phase: 'finished', hand_result: 'exhaustive_draw', score_summary: null })
      const fake = fakeSupabase(mid, tableWith([...FILLER]), () => true)
      await processMahjongNextHand(fake.client, 'MJCAS')
      expect(markGameFinished).not.toHaveBeenCalled()
      expect(fake.rpcCalls).toHaveLength(1)
    })
  })
})

describe('Mahjong win counters commit with the finished session', () => {
  it('a self-draw win writes the winner counters in the SAME rpc as the finished session', async () => {
    const hand = ['m1', 'm1', 'm1', 'm2', 'm2', 'm2', 'p3', 'p3', 'p3', 's4', 's4', 's4', 'we', 'we']
    const fake = fakeSupabase(makeSession({ phase: 'discard', current_turn_index: 1 }), tableWith(hand), () => true)
    expect((await processMahjongClaim(fake.client, 'MJCAS', 'south-player', 'mahjong')).error).toBeUndefined()
    // One transaction: no request can observe the finished hand before its counters exist.
    expect(fake.rpcCalls).toHaveLength(1)
    expect(fake.directWrites).toEqual([])
    expect(fake.rpcCalls[0]?.args.p_session_patch).toMatchObject({ phase: 'finished', hand_result: 'win' })
    expect(fake.rpcCalls[0]?.args.p_state_writes).toEqual([
      {
        id: 'south-player-state',
        patch: { game_counters: expect.objectContaining({ mahjong_hands_won: 1, mahjong_win_streak: 1 }) },
      },
    ])
  })

  it('a win that loses the session CAS records nothing', async () => {
    const hand = ['m1', 'm1', 'm1', 'm2', 'm2', 'm2', 'p3', 'p3', 'p3', 's4', 's4', 's4', 'we', 'we']
    const fake = fakeSupabase(makeSession({ phase: 'discard', current_turn_index: 1 }), tableWith(hand), () => false)
    expect((await processMahjongClaim(fake.client, 'MJCAS', 'south-player', 'mahjong')).error).toBe(CONFLICT)
    expect(fake.directWrites).toEqual([])
  })
})

describe('Mahjong expired claim with a pending abortive draw', () => {
  const claimAfterFourWinds = () =>
    makeSession({
      ruleset: 'riichi',
      rule_options: { abortiveDraws: true },
      phase: 'claim',
      current_turn_index: 3,
      last_discard: { tile: 'we', player_id: 'north-player', discard_index: 3 },
      discard_pile: PLAYERS.map((player_id) => ({ tile: 'we', player_id })),
      turn_deadline_at: '2020-01-01T00:00:00.000Z',
    })
  const fourWindsTable = () =>
    PLAYERS.map((id) => ({ ...makeState(id, [...FILLER]), discarded: ['we'] }) as MahjongPlayerState)

  it('finishes the abortive draw instead of drawing for the next player', async () => {
    const fake = fakeSupabase(claimAfterFourWinds(), fourWindsTable(), () => true)
    expect((await processMahjongExpireTurn(fake.client, 'MJCAS')).error).toBeUndefined()
    // No hand writes ride along, so the draw is a plain session write — and no draw for the next player.
    expect(fake.rpcCalls).toEqual([])
    expect(fake.directWrites).toHaveLength(1)
    expect(fake.directWrites[0]).toMatch(/^mahjong_sessions:.*hand_result/)
  })

  it('still advances a claim phase that has no abortive draw pending', async () => {
    const states = PLAYERS.map((id) => ({ ...makeState(id, [...FILLER]), discarded: ['m6'] }) as MahjongPlayerState)
    const fake = fakeSupabase(claimAfterFourWinds(), states, () => true)
    expect((await processMahjongExpireTurn(fake.client, 'MJCAS')).error).toBeUndefined()
    expect(fake.rpcCalls[0]?.args.p_session_patch).toMatchObject({ phase: 'discard' })
  })
})

describe('Mahjong load order', () => {
  it('reads the games generation before the session, so a replay cannot slip between the two', async () => {
    const fake = fakeSupabase(makeSession({ phase: 'finished' }), tableWith([...FILLER]), () => true)
    await processMahjongNextHand(fake.client, 'MJCAS')
    // Generation first: a stale session can never be paired with a newer generation (Play Again
    // reuses the games row), which would let a finalizer finish the replayed match.
    expect(fake.reads.indexOf('games')).toBeGreaterThanOrEqual(0)
    expect(fake.reads.indexOf('games')).toBeLessThan(fake.reads.indexOf('mahjong_sessions'))
  })
})
