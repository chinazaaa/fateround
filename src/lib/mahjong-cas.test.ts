import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MahjongPlayerState, MahjongSession } from '@/types'

vi.mock('@/lib/game-finish', () => ({
  markGameFinished: vi.fn(async () => ({ error: null })),
}))

import {
  processMahjongClaim,
  processMahjongDiscard,
  processMahjongDraw,
  processMahjongPass,
  processMahjongRiichi,
} from '@/lib/mahjong'

const PLAYERS = ['east-player', 'south-player', 'west-player', 'north-player']
const SEATS = ['east', 'south', 'west', 'north'] as const
const NOW = '2026-01-01T00:00:00.000Z'
const CONFLICT = 'Mahjong table changed; please retry'

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
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: session, error: null }) }) }),
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
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { timer_seconds: 0 }, error: null }) }) }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  } as unknown as SupabaseClient
  return { client, rpcCalls, directWrites }
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
    // The discard itself, then the next player's auto-draw (nobody can claim).
    rpcCount: 2,
    expectFirstCall: (call) => {
      expect(call.args.p_session_patch).toMatchObject({ phase: 'claim', last_action: 'discard' })
      expect(call.args.p_state_writes).toHaveLength(1)
      expect(call.args.p_state_writes[0]?.id).toBe('south-player-state')
      expect(call.args.p_state_writes[0]?.patch.hand).not.toContain('m6')
      expect(call.args.p_state_writes[0]?.patch.discarded).toEqual(['m1', 'm6'])
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

  it('discard: a follow-up auto-draw chains on the updated_at returned by the first rpc', async () => {
    const scenario = scenarios[0]!
    const fake = fakeSupabase(scenario.session, scenario.states, () => true)
    await scenario.run(fake.client)
    expect(fake.rpcCalls[1]?.args.p_expected_updated_at).toBe('NEW-VERSION')
    expect(fake.rpcCalls[1]?.args.p_session_patch).toMatchObject({ phase: 'discard' })
    expect(fake.rpcCalls[1]?.args.p_state_writes[0]?.id).toBe('west-player-state')
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
