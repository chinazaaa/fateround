import { describe, expect, it } from 'vitest'
import { CHECKERS_STARTING_BOARD } from '@/lib/checkers'
import { DRAUGHTS10_STARTING_BOARD } from '@/lib/draughts10'
import type { FactsContext } from './index'
import { checkersFacts } from './checkers'

/**
 * The builder self-detects the board by which of the two session tables holds the row, then
 * reads `variant` off a 10x10 row. The mock answers exactly one table so each case pins down
 * both the detection and the variant gating — a mis-gated counter is a silently unearnable
 * trophy, indistinguishable from a typo.
 */
function db(table: string, row: unknown) {
  return {
    from(name: string) {
      const data = name === table ? row : null
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data }) }) }) }
    },
  } as never
}

const CTX: FactsContext = {
  timerSeconds: 600,
  questionSource: null,
  theme: null,
  seated: ['me', 'rival'],
  winners: [],
}

/** Trim the black side of a board down to `keep` pieces, to exercise the capture fallback. */
function reduceBlack(board: string, keep: number): string {
  let seen = 0
  return board
    .split('')
    .map((ch) => {
      if (ch === 'b' || ch === 'B') {
        seen += 1
        return seen <= keep ? ch : '.'
      }
      return ch
    })
    .join('')
}

async function factsFor(supabase: never, ctx: FactsContext = CTX, id = 'me') {
  const map = await checkersFacts(supabase, 'G', ctx)
  return map.get(id) ?? {}
}

const BASE_8 = {
  player_red_id: 'me',
  player_black_id: 'rival',
  board: CHECKERS_STARTING_BOARD, // Red still holds all 12 — untouched-eligible on a win.
  result_reason: 'capture_all',
  winner_player_id: 'me',
  is_draw: false,
  red_time_ms: 8_000,
  black_time_ms: 0,
  red_stats: {},
  black_stats: {},
}

describe('checkersFacts — American 8x8', () => {
  it('reads a strong winning game end to end', async () => {
    const row = {
      ...BASE_8,
      red_stats: {
        captures: 6,
        kings_made: 2,
        enemy_kings_captured: 1,
        best_chain: 4,
        peak_kings: 3,
        max_deficit: 5,
        turns: 10,
        back_streak_max: 16,
        trades: 2,
        reached_endgame: 1,
      },
    }
    const f = await factsFor(db('checkers_sessions', row), { ...CTX, timerSeconds: 180, winners: ['me'] })
    // Lifetime tallies
    expect(f.checkers_captures).toBe(6)
    expect(f.checkers_kings_made).toBe(2)
    expect(f.checkers_enemy_kings_captured).toBe(1)
    // Per-game flags
    expect(f.checkers_five_down_games).toBe(1)
    expect(f.checkers_double_jump_games).toBe(1)
    expect(f.checkers_triple_jump_games).toBe(1)
    expect(f.checkers_quad_jump_games).toBe(1)
    expect(f.checkers_king_me_twice_games).toBe(1)
    expect(f.checkers_kings_court_games).toBe(1)
    expect(f.checkers_back_row_games).toBe(1)
    expect(f.checkers_trade_games).toBe(1)
    // Win flags
    expect(f.checkers_total_victory_wins).toBe(1)
    expect(f.checkers_clock_watcher_wins).toBe(1)
    expect(f.checkers_untouched_wins).toBe(1)
    expect(f.checkers_comeback_wins).toBe(1)
    expect(f.checkers_quick_win_wins).toBe(1)
    expect(f.checkers_endgame_master_wins).toBe(1)
    expect(f.checkers_blitz_wins).toBe(1)
    // Not a blockade (that reason is capture_all), not a draw
    expect(f.checkers_blockade_wins).toBeUndefined()
    expect(f.checkers_draw_games).toBeUndefined()
    // 8x8 never emits any 10x10 / Nigeria counter, even with the stats present
    expect(f.checkers_flying_king_games).toBeUndefined()
    expect(f.checkers_majority_rule_games).toBeUndefined()
    expect(f.checkers_seed_master_games).toBeUndefined()
    expect(f.checkers_street_rules_wins).toBeUndefined()
  })

  it('does not emit 10x10 counters even when the blob carries them', async () => {
    const row = { ...BASE_8, red_stats: { flying_king_max: 9, best_chain: 6, captures: 20 } }
    const f = await factsFor(db('checkers_sessions', row), { ...CTX, winners: ['me'] })
    expect(f.checkers_flying_king_games).toBeUndefined()
    expect(f.checkers_majority_rule_games).toBeUndefined()
    expect(f.checkers_seed_master_games).toBeUndefined()
  })

  it('falls back to the final board for captures when the blob is missing it', async () => {
    // Red kept all 12; Black is down to 3, so Red must have taken 9.
    const row = { ...BASE_8, board: reduceBlack(CHECKERS_STARTING_BOARD, 3), red_stats: {}, winner_player_id: null }
    const f = await factsFor(db('checkers_sessions', row))
    expect(f.checkers_captures).toBe(9)
    expect(f.checkers_five_down_games).toBe(1)
  })

  it('withholds win flags when the award pass did not score it as a win', async () => {
    // winner_player_id names 'me', but ctx.winners is empty — the pass declined the win.
    const row = { ...BASE_8, red_stats: { captures: 6, turns: 5, reached_endgame: 1 } }
    const f = await factsFor(db('checkers_sessions', row), CTX)
    expect(f.checkers_captures).toBe(6) // non-win facts still emitted
    expect(f.checkers_five_down_games).toBe(1)
    expect(f.checkers_untouched_wins).toBeUndefined()
    expect(f.checkers_quick_win_wins).toBeUndefined()
    expect(f.checkers_total_victory_wins).toBeUndefined()
  })

  it('credits a draw to both seats and no one a win', async () => {
    const row = {
      ...BASE_8,
      result_reason: 'threefold',
      winner_player_id: null,
      is_draw: true,
      red_stats: { captures: 2 },
      black_stats: { captures: 3 },
    }
    const map = await checkersFacts(db('checkers_sessions', row), 'G', CTX)
    expect(map.get('me')?.checkers_draw_games).toBe(1)
    expect(map.get('rival')?.checkers_draw_games).toBe(1)
    expect(map.get('me')?.checkers_untouched_wins).toBeUndefined()
    // Black's own capture tally is credited to Black, not Red.
    expect(map.get('rival')?.checkers_captures).toBe(3)
    expect(map.get('me')?.checkers_captures).toBe(2)
  })
})

describe('checkersFacts — 10x10 variants', () => {
  const BASE_10 = {
    player_red_id: 'me',
    player_black_id: 'rival',
    board: DRAUGHTS10_STARTING_BOARD,
    result_reason: 'capture_all',
    winner_player_id: 'me',
    is_draw: false,
    red_time_ms: 300_000,
    black_time_ms: 0,
    red_stats: { flying_king_max: 5, best_chain: 5, captures: 16 },
    black_stats: {},
  }

  it('International emits flying-king and majority, but never seeds or Street Rules', async () => {
    const row = { ...BASE_10, variant: 'international', huffing_enabled: false }
    const f = await factsFor(db('checkers10_sessions', row), { ...CTX, winners: ['me'] })
    expect(f.checkers_flying_king_games).toBe(1)
    expect(f.checkers_majority_rule_games).toBe(1)
    expect(f.checkers_seed_master_games).toBeUndefined()
    expect(f.checkers_street_rules_wins).toBeUndefined()
  })

  it('Nigeria adds seeds and Street Rules on top', async () => {
    const row = { ...BASE_10, variant: 'nigeria', huffing_enabled: true }
    const f = await factsFor(db('checkers10_sessions', row), { ...CTX, winners: ['me'] })
    expect(f.checkers_flying_king_games).toBe(1)
    expect(f.checkers_majority_rule_games).toBe(1)
    expect(f.checkers_seed_master_games).toBe(1) // 16 >= 15 seeds
    expect(f.checkers_street_rules_wins).toBe(1) // won with huffing enabled
  })

  it('Nigeria without Street Rules on does not award it', async () => {
    const row = { ...BASE_10, variant: 'nigeria', huffing_enabled: false }
    const f = await factsFor(db('checkers10_sessions', row), { ...CTX, winners: ['me'] })
    expect(f.checkers_street_rules_wins).toBeUndefined()
    expect(f.checkers_seed_master_games).toBe(1)
  })

  it('returns nothing when neither table holds the game', async () => {
    const map = await checkersFacts(db('nothing', null), 'G', CTX)
    expect(map.size).toBe(0)
  })
})
