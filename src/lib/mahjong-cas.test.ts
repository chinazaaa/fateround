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
type Fake = {
  client: SupabaseClient
  stateWrites: StateWrite[]
  sessionWrites: Record<string, unknown>[]
  order: string[]
}

/**
 * Fake Supabase client. `casWins(call)` decides whether the compare-and-swap on the session row
 * (`.eq('updated_at', ...)`) matches a row. `order` records the table of every write, in order.
 */
function fakeSupabase(
  session: MahjongSession,
  states: MahjongPlayerState[],
  casWins: (expectedUpdatedAt: string) => boolean
): Fake {
  const stateWrites: StateWrite[] = []
  const sessionWrites: Record<string, unknown>[] = []
  const order: string[] = []
  const client = {
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
                order.push(table)
                const win = casWins(expected)
                sessionWrites.push(patch)
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
            eq: async (_col: string, id: string) => {
              order.push(table)
              stateWrites.push({ id, patch })
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
  return { client, stateWrites, sessionWrites, order }
}

type Scenario = {
  name: string
  session: MahjongSession
  states: MahjongPlayerState[]
  run: (client: SupabaseClient) => Promise<{ error?: string }>
  expectWinnerWrites: (writes: StateWrite[]) => void
}

const scenarios: Scenario[] = [
  {
    name: 'discard',
    session: makeSession(),
    states: tableWith(['m6', 'm9', 'p2', 'p4', 'p6', 's1', 's3', 's5', 'we', 'we', 'wn', 'wn', 'dr', 'dg']),
    run: (c) => processMahjongDiscard(c, 'MJCAS', 'south-player', 'm6'),
    expectWinnerWrites: (writes) => {
      // The discarder's write, then the next player's auto-draw (nobody can claim).
      expect(writes).toHaveLength(2)
      expect(writes[0]?.id).toBe('south-player-state')
      expect(writes[0]?.patch.hand).not.toContain('m6')
      expect(writes[0]?.patch.discarded).toEqual(['m1', 'm6'])
    },
  },
  {
    name: 'draw',
    session: makeSession({ phase: 'draw' }),
    states: tableWith(FILLER),
    run: (c) => processMahjongDraw(c, 'MJCAS', 'south-player'),
    expectWinnerWrites: (writes) => {
      expect(writes).toHaveLength(1)
      expect(writes[0]?.patch.hand).toContain('m4')
      expect(writes[0]?.patch.last_drawn_tile).toBe('m4')
    },
  },
  {
    name: 'concealed kong',
    session: makeSession({ wall: ['p9', 'p8', 'p7', 'p6'] }),
    states: tableWith(['m5', 'm5', 'm5', 'm5', 'p1', 'p2', 'p4', 's1', 's3', 's5', 'we', 'wn', 'dr', 'dg']),
    run: (c) => processMahjongClaim(c, 'MJCAS', 'south-player', 'kong', ['m5']),
    expectWinnerWrites: (writes) => {
      // The meld write comes first, then the replacement draw.
      expect(writes).toHaveLength(2)
      expect(writes[0]?.patch.melds).toHaveLength(1)
      expect(writes[1]?.patch.last_drawn_tile).toBeTruthy()
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
    expectWinnerWrites: (writes) => {
      expect(writes).toHaveLength(1)
      expect(writes[0]?.patch.melds).toHaveLength(1)
    },
  },
  {
    name: 'riichi',
    session: makeSession({ ruleset: 'riichi' }),
    states: tableWith(['m1', 'm2', 'm3', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'we', 'we', 'wn', 'wn']),
    run: (c) => processMahjongRiichi(c, 'MJCAS', 'south-player'),
    expectWinnerWrites: (writes) => {
      expect(writes).toEqual([{ id: 'south-player-state', patch: { riichi_declared: true, riichi_discard_index: 1 } }])
    },
  },
]

describe('Mahjong session compare-and-swap ordering', () => {
  for (const scenario of scenarios) {
    it(`${scenario.name}: loser of the session CAS never writes player state`, async () => {
      const fake = fakeSupabase(scenario.session, scenario.states, () => false)
      const result = await scenario.run(fake.client)
      expect(result.error).toBe(CONFLICT)
      expect(fake.sessionWrites).toHaveLength(1)
      expect(fake.stateWrites).toEqual([])
    })

    it(`${scenario.name}: winner claims the session first, then writes player state`, async () => {
      const fake = fakeSupabase(scenario.session, scenario.states, () => true)
      const result = await scenario.run(fake.client)
      expect(result.error).toBeUndefined()
      expect(fake.order[0]).toBe('mahjong_sessions')
      scenario.expectWinnerWrites(fake.stateWrites)
    })
  }

  it('discard: session patch carries the discard', async () => {
    const scenario = scenarios[0]!
    const fake = fakeSupabase(scenario.session, scenario.states, () => true)
    await scenario.run(fake.client)
    expect(fake.sessionWrites[0]).toMatchObject({ phase: 'claim', last_action: 'discard' })
  })

  it('concurrent discards of different tiles by one player: exactly one hand write lands', async () => {
    const scenario = scenarios[0]!
    // One shared session row: the first CAS to arrive wins, every later one matches 0 rows.
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
    // The winner's discard write plus the next player's auto-draw; the two losers wrote nothing.
    expect(fake.stateWrites.filter((w) => w.id === 'south-player-state')).toHaveLength(1)
  })

  it('pass (riichi win pass): loser does not set temporary furiten, winner does', async () => {
    const session = makeSession({
      ruleset: 'riichi',
      phase: 'claim',
      current_turn_index: 0,
      last_discard: { tile: 'we', player_id: 'east-player', discard_index: 0 },
      discard_pile: [{ tile: 'we', player_id: 'east-player' }],
    })
    // South waits on 'we' (m123 p123 s123 + we we + wn wn wn?) -> use a clear 13-tile tenpai.
    const states = tableWith(['m1', 'm2', 'm3', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'we', 'we', 'wn', 'wn'])
    const loser = fakeSupabase(session, states, () => false)
    expect((await processMahjongPass(loser.client, 'MJCAS', 'south-player')).error).toBe(CONFLICT)
    expect(loser.stateWrites).toEqual([])

    const winner = fakeSupabase(session, states, () => true)
    expect((await processMahjongPass(winner.client, 'MJCAS', 'south-player')).error).toBeUndefined()
    expect(winner.order[0]).toBe('mahjong_sessions')
    expect(winner.stateWrites).toEqual([{ id: 'south-player-state', patch: { temporary_furiten: true } }])
  })
})
