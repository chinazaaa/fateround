import { describe, expect, it, vi } from 'vitest'
import type {
  MahjongMeld,
  MahjongPlayerState,
  MahjongRuleset,
  MahjongScoreSummary,
  MahjongSeat,
  MahjongSession,
  MahjongWinType,
} from '@/types'

vi.mock('@/lib/game-finish', () => ({
  markGameFinished: vi.fn(async () => ({ error: null })),
}))

import { canDeclareMahjongForRuleset, scoreMahjongHandForRuleset, sortMahjongTiles } from '@/lib/mahjong'

const PLAYERS = ['east-player', 'south-player', 'west-player', 'north-player']
const NOW = '2026-01-01T00:00:00.000Z'

function session(ruleset: MahjongRuleset, overrides: Partial<MahjongSession> = {}): MahjongSession {
  return {
    id: 'mahjong-fixture-session',
    game_id: 'MJTEST',
    ruleset,
    turn_order: PLAYERS,
    dealer_index: 0,
    current_turn_index: 1,
    phase: 'discard',
    wall: ['m1'],
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
    scores: Object.fromEntries(PLAYERS.map((playerId) => [playerId, ruleset === 'riichi' ? 25000 : 0])),
    discard_pile: [
      { tile: 'm9', player_id: 'east-player' },
      { tile: 'p9', player_id: 'south-player' },
      { tile: 's9', player_id: 'west-player' },
      { tile: 'we', player_id: 'north-player' },
      { tile: 'ws', player_id: 'east-player' },
    ],
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
  }
}

type PlayerStateInput = {
  playerId?: string
  seat?: MahjongSeat
  hand: string[]
  melds?: MahjongMeld[]
  discarded?: string[]
  extra?: Partial<MahjongPlayerState>
}

function playerState({
  playerId = 'south-player',
  seat = 'south',
  hand,
  melds = [],
  discarded = ['m1'],
  extra = {},
}: PlayerStateInput): MahjongPlayerState {
  return {
    id: `${playerId}-state`,
    game_id: 'MJTEST',
    player_id: playerId,
    seat,
    hand: sortMahjongTiles(hand),
    hand_count: hand.length,
    last_drawn_tile: null,
    flowers: [],
    riichi_declared: false,
    riichi_discard_index: null,
    temporary_furiten: false,
    permanent_furiten: false,
    melds,
    discarded,
    player_order: PLAYERS.indexOf(playerId),
    created_at: NOW,
    ...extra,
  }
}

function meld(type: MahjongMeld['type'], tiles: string[], fromPlayerId: string | null = 'east-player'): MahjongMeld {
  return {
    type,
    tiles,
    claimed_tile: tiles[0] ?? null,
    from_player_id: fromPlayerId,
    concealed: !fromPlayerId,
    added: false,
  }
}

type ScoreInput = {
  ruleset: MahjongRuleset
  hand: string[]
  melds?: MahjongMeld[]
  winType?: MahjongWinType
  winningTile?: string
  player?: Partial<PlayerStateInput>
  session?: Partial<MahjongSession>
}

function score({
  ruleset,
  hand,
  melds = [],
  winType = 'discard',
  winningTile,
  player = {},
  session: sessionOverrides = {},
}: ScoreInput): MahjongScoreSummary {
  const state = playerState({ hand, melds, ...player })
  const summary = scoreMahjongHandForRuleset({
    winnerState: state,
    winType,
    ruleset,
    session: session(ruleset, sessionOverrides),
    fromPlayerId: winType === 'discard' ? 'east-player' : null,
    turnOrder: PLAYERS,
    winningTile,
  })

  expect(summary, `Expected a valid ${ruleset} score for ${hand.join(' ')}`).toBeTruthy()
  return summary as MahjongScoreSummary
}

function line(summary: MahjongScoreSummary, label: string) {
  return summary.lines.find((entry) => entry.label === label)
}

function expectLine(summary: MahjongScoreSummary, label: string, fan?: number): void {
  const found = line(summary, label)
  expect(
    found,
    `Expected scoring line "${label}" in ${summary.lines.map((entry) => entry.label).join(', ')}`
  ).toBeTruthy()
  if (fan !== undefined) expect(found?.fan).toBe(fan)
}

function expectNoLine(summary: MahjongScoreSummary, label: string): void {
  expect(line(summary, label), `Did not expect scoring line "${label}"`).toBeUndefined()
}

function paymentDelta(summary: MahjongScoreSummary, playerId: string): number {
  return summary.payments
    .filter((payment) => payment.player_id === playerId)
    .reduce((sum, payment) => sum + payment.delta, 0)
}

describe('Mahjong scoring fixtures', () => {
  it('Riichi closed pinfu tsumo scores 3 han 20 fu with nondealer payments', () => {
    const summary = score({
      ruleset: 'riichi',
      winType: 'self_draw',
      winningTile: 'p5',
      hand: ['m2', 'm3', 'm4', 'm6', 'm7', 'm8', 'p3', 'p4', 'p5', 'p6', 'p6', 's3', 's4', 's5'],
    })

    expectLine(summary, 'Menzen Tsumo', 1)
    expectLine(summary, 'Pinfu', 1)
    expectLine(summary, 'Tanyao', 1)
    expect(summary.yaku_fan).toBe(3)
    expect(summary.fu).toBe(20)
    expect(summary.base_points).toBe(640)
    expect(paymentDelta(summary, 'east-player')).toBe(-1300)
    expect(paymentDelta(summary, 'west-player')).toBe(-700)
    expect(paymentDelta(summary, 'north-player')).toBe(-700)
    expect(paymentDelta(summary, 'south-player')).toBe(2700)
  })

  it('Riichi closed riichi pinfu ron scores closed ron fu and ron payment', () => {
    const summary = score({
      ruleset: 'riichi',
      winType: 'discard',
      winningTile: 'p5',
      player: { extra: { riichi_declared: true, riichi_discard_index: 5 } },
      hand: ['m2', 'm3', 'm4', 'm6', 'm7', 'm8', 'p3', 'p4', 'p5', 'p6', 'p6', 's3', 's4', 's5'],
    })

    expectLine(summary, 'Riichi', 1)
    expectLine(summary, 'Pinfu', 1)
    expectLine(summary, 'Tanyao', 1)
    expect(summary.yaku_fan).toBe(3)
    expect(summary.fu).toBe(30)
    expect(summary.base_points).toBe(960)
    expect(paymentDelta(summary, 'east-player')).toBe(-3900)
    expect(paymentDelta(summary, 'south-player')).toBe(3900)
  })

  it('Riichi open all-chows hand does not score pinfu', () => {
    const summary = score({
      ruleset: 'riichi',
      winType: 'discard',
      winningTile: 'p5',
      hand: ['m6', 'm7', 'm8', 'p3', 'p4', 'p5', 'p6', 'p6', 's3', 's4', 's5'],
      melds: [meld('chow', ['m2', 'm3', 'm4'])],
    })

    expectNoLine(summary, 'Pinfu')
    expectLine(summary, 'Tanyao', 1)
  })

  it('Riichi thirteen-sided kokushi scores double yakuman when enabled', () => {
    const summary = score({
      ruleset: 'riichi',
      winType: 'discard',
      winningTile: 'm1',
      hand: ['m1', 'm1', 'm9', 'p1', 'p9', 's1', 's9', 'we', 'ws', 'ww', 'wn', 'dr', 'dg', 'dw'],
    })

    expectLine(summary, 'Kokushi Musou', 26)
    expect(summary.yakuman).toBe(2)
    expect(summary.limit).toBe('2x Yakuman')
    expect(summary.base_points).toBe(16000)
  })

  it('MCR seven pairs scores 24 and excludes concealed hand', () => {
    const summary = score({
      ruleset: 'mcr',
      hand: ['m1', 'm1', 'm2', 'm2', 'm3', 'm3', 'p4', 'p4', 'p5', 'p5', 's6', 's6', 's7', 's7'],
    })

    expect(summary.pattern).toBe('seven_pairs')
    expectLine(summary, 'Seven Pairs', 24)
    expectNoLine(summary, 'Concealed Hand')
  })

  it('MCR big three dragons scores 88 and applies dragon exclusions', () => {
    const summary = score({
      ruleset: 'mcr',
      hand: ['dr', 'dr', 'dr', 'dg', 'dg', 'dg', 'dw', 'dw', 'dw', 'm2', 'm3', 'm4', 'p5', 'p5'],
    })

    expectLine(summary, 'Big Three Dragons', 88)
    expectNoLine(summary, 'Dragon Pung')
    expectNoLine(summary, 'Two Dragon Pungs')
  })

  it('MCR quadruple chow scores 48 and excludes lower duplicate-chow patterns', () => {
    const summary = score({
      ruleset: 'mcr',
      hand: ['dr', 'dr'],
      melds: [
        meld('chow', ['m1', 'm2', 'm3']),
        meld('chow', ['m1', 'm2', 'm3']),
        meld('chow', ['m1', 'm2', 'm3']),
        meld('chow', ['m1', 'm2', 'm3']),
      ],
    })

    expectLine(summary, 'Quadruple Chow', 48)
    expectNoLine(summary, 'Pure Double Chow')
    expectNoLine(summary, 'Pure Triple Chow')
  })

  it('MCR two melded kongs counts only open kongs and excludes single melded kong', () => {
    const summary = score({
      ruleset: 'mcr',
      hand: ['m2', 'm3', 'm4', 'p6', 'p7', 'p8', 'dr', 'dr'],
      melds: [meld('kong', ['p2', 'p2', 'p2', 'p2']), meld('kong', ['s5', 's5', 's5', 's5'])],
    })

    expectLine(summary, 'Two Melded Kongs', 4)
    expectNoLine(summary, 'Melded Kong')
    expectNoLine(summary, 'Two Concealed Kongs')
  })

  it('MCR mixed double chow scores without requiring mixed triple chow', () => {
    const summary = score({
      ruleset: 'mcr',
      hand: ['m2', 'm3', 'm4', 'p2', 'p3', 'p4', 's5', 's6', 's7', 'm7', 'm8', 'm9', 'dr', 'dr'],
    })

    expectLine(summary, 'Mixed Double Chow', 1)
    expectNoLine(summary, 'Mixed Triple Chow')
  })

  it('MCR knitted straight special shape is recognized', () => {
    const hand = ['m1', 'm2', 'm3', 'm4', 'm7', 'p2', 'p5', 'p8', 's3', 's6', 's9', 'dr', 'dr', 'm4']

    expect(canDeclareMahjongForRuleset(hand, [], 'mcr')).toBe(true)
    const summary = score({ ruleset: 'mcr', hand })

    expect(summary.pattern).toBe('knitted_straight')
    expectLine(summary, 'Knitted Straight', 12)
  })

  it('MCR greater honors and knitted tiles official 14-single shape is recognized', () => {
    const hand = ['we', 'ws', 'ww', 'wn', 'dr', 'dg', 'dw', 'm1', 'm4', 'm7', 'p2', 'p5', 'p8', 's3']

    expect(canDeclareMahjongForRuleset(hand, [], 'mcr')).toBe(true)
    const summary = score({ ruleset: 'mcr', hand })

    expect(summary.pattern).toBe('greater_honors_knitted')
    expectLine(summary, 'Greater Honors and Knitted Tiles', 24)
    expectNoLine(summary, 'All Types')
  })

  it('MCR lesser honors and knitted tiles official 14-single shape is recognized', () => {
    const hand = ['we', 'ws', 'ww', 'wn', 'dr', 'm1', 'm4', 'm7', 'p2', 'p5', 'p8', 's3', 's6', 's9']

    expect(canDeclareMahjongForRuleset(hand, [], 'mcr')).toBe(true)
    const summary = score({ ruleset: 'mcr', hand })

    expect(summary.pattern).toBe('lesser_honors_knitted')
    expectLine(summary, 'Lesser Honors and Knitted Tiles', 12)
  })
})
