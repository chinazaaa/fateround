import { describe, expect, it } from 'vitest'
import type { AyoStats } from '@/types'
import type { FactsContext } from './index'
import { ayoFacts } from './ayo'

/**
 * The builder reads one `ayo_sessions` row — the running totals (captured / houses / streak) plus
 * the paired `a_stats` / `b_stats` accumulators — and maps a_stats -> player_a_id, b_stats ->
 * player_b_id. Every case here is a rule an admin could write, so a wrong derivation is a silently
 * unearnable trophy.
 */
type Session = {
  player_a_id?: string
  player_b_id?: string
  captured_a?: number
  captured_b?: number
  houses_a?: number
  houses_b?: number
  a_win_streak?: number
  b_win_streak?: number
  winner_player_id?: string | null
  is_draw?: boolean
  a_stats?: AyoStats
  b_stats?: AyoStats
}

function db(session: Session) {
  const row = {
    player_a_id: 'A',
    player_b_id: 'B',
    captured_a: 0,
    captured_b: 0,
    houses_a: 0,
    houses_b: 0,
    a_win_streak: 0,
    b_win_streak: 0,
    winner_player_id: null,
    is_draw: false,
    a_stats: {},
    b_stats: {},
    ...session,
  }
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row }) }) }),
    }),
  } as never
}

const CTX: FactsContext = { timerSeconds: 0, questionSource: null, theme: null, seated: ['A', 'B'], winners: [] }

async function factsFor(session: Session, ctx: Partial<FactsContext> = {}) {
  return ayoFacts(db(session), 'G', { ...CTX, ...ctx })
}

describe('ayoFacts — capture magnitude', () => {
  it('emits the lifetime seed tally and the escalating capture flags', async () => {
    const map = await factsFor({ captured_a: 38 })
    const a = map.get('A')!
    expect(a.ayo_seeds_captured).toBe(38)
    expect(a.ayo_ten_seed_games).toBe(1)
    expect(a.ayo_half_board_games).toBe(1)
    expect(a.ayo_dominant_games).toBe(1)
    expect(a.ayo_total_control_games).toBeUndefined() // 38 < 44
  })

  it('total control needs 44+', async () => {
    const map = await factsFor({ captured_b: 44 })
    expect(map.get('B')?.ayo_total_control_games).toBe(1)
  })

  it('no seed tally when nothing captured', async () => {
    const map = await factsFor({ captured_a: 0 })
    expect(map.get('A')?.ayo_seeds_captured).toBeUndefined()
  })
})

describe('ayoFacts — houses won', () => {
  it('emits the house-count flags for the seat that won them', async () => {
    const map = await factsFor({ houses_a: 5, houses_b: 1 })
    const a = map.get('A')!
    expect(a.ayo_two_house_games).toBe(1)
    expect(a.ayo_three_house_games).toBe(1)
    expect(a.ayo_five_house_games).toBe(1)
    const b = map.get('B')
    expect(b?.ayo_two_house_games).toBeUndefined()
  })
})

describe('ayoFacts — move-shaped facts from the accumulator', () => {
  it('seed sower needs all six houses (mask 63)', async () => {
    expect((await factsFor({ a_stats: { sown_mask: 0b111111 } })).get('A')?.ayo_all_houses_sown).toBe(1)
    expect((await factsFor({ a_stats: { sown_mask: 0b111110 } })).get('A')?.ayo_all_houses_sown).toBeUndefined()
  })

  it('big sow at 8, full lap at 12', async () => {
    const eight = await factsFor({ a_stats: { max_sown: 8 } })
    expect(eight.get('A')?.ayo_big_sow_games).toBe(1)
    expect(eight.get('A')?.ayo_full_lap_games).toBeUndefined()
    const twelve = await factsFor({ a_stats: { max_sown: 12 } })
    expect(twelve.get('A')?.ayo_full_lap_games).toBe(1)
  })
})

describe('ayoFacts — fate', () => {
  it('the non-winner (not a draw) is credited a loss; the winner is not', async () => {
    const map = await factsFor({ winner_player_id: 'A', is_draw: false }, { winners: ['A'] })
    expect(map.get('B')?.ayo_losses).toBe(1)
    expect(map.get('A')?.ayo_losses).toBeUndefined()
  })

  it('a draw credits both seats and nobody a loss', async () => {
    const map = await factsFor({ winner_player_id: null, is_draw: true })
    expect(map.get('A')?.ayo_draws).toBe(1)
    expect(map.get('B')?.ayo_draws).toBe(1)
    expect(map.get('A')?.ayo_losses).toBeUndefined()
  })
})

describe('ayoFacts — win-gated trophies', () => {
  it('untimed win only when the winner is in ctx.winners and the clock is zero', async () => {
    const won = await factsFor({ winner_player_id: 'A' }, { winners: ['A'], timerSeconds: 0 })
    expect(won.get('A')?.ayo_untimed_wins).toBe(1)
    expect(won.get('A')?.ayo_timed_wins).toBeUndefined()
    // Same board but the award pass declined to score the win — no win flag.
    const unscored = await factsFor({ winner_player_id: 'A' }, { winners: [], timerSeconds: 0 })
    expect(unscored.get('A')?.ayo_untimed_wins).toBeUndefined()
  })

  it('30-second win fires both Fast Hands and the generic timed win', async () => {
    const map = await factsFor({ winner_player_id: 'A' }, { winners: ['A'], timerSeconds: 30 })
    expect(map.get('A')?.ayo_blitz30_wins).toBe(1)
    expect(map.get('A')?.ayo_timed_wins).toBe(1)
    expect(map.get('A')?.ayo_untimed_wins).toBeUndefined()
  })

  it('clean board = win with the opponent on zero houses', async () => {
    const clean = await factsFor({ winner_player_id: 'A', houses_a: 3, houses_b: 0 }, { winners: ['A'] })
    expect(clean.get('A')?.ayo_clean_board_wins).toBe(1)
    const conceded = await factsFor({ winner_player_id: 'A', houses_a: 3, houses_b: 1 }, { winners: ['A'] })
    expect(conceded.get('A')?.ayo_clean_board_wins).toBeUndefined()
  })

  it('comeback needs a 10+ deficit and a win', async () => {
    const map = await factsFor({ winner_player_id: 'A', a_stats: { worst_deficit: 12 } }, { winners: ['A'] })
    expect(map.get('A')?.ayo_comeback_wins).toBe(1)
    const shallow = await factsFor({ winner_player_id: 'A', a_stats: { worst_deficit: 8 } }, { winners: ['A'] })
    expect(shallow.get('A')?.ayo_comeback_wins).toBeUndefined()
  })

  it('precision needs a capturing final move', async () => {
    const map = await factsFor({ winner_player_id: 'A', a_stats: { last_capture: 1 } }, { winners: ['A'] })
    expect(map.get('A')?.ayo_precision_wins).toBe(1)
  })

  it('long game counts BOTH seats moves', async () => {
    const map = await factsFor(
      { winner_player_id: 'A', a_stats: { moves: 31 }, b_stats: { moves: 30 } },
      { winners: ['A'] }
    )
    expect(map.get('A')?.ayo_long_game_wins).toBe(1)
  })

  it('streak flags fire at 3 and 5 for the winning seat', async () => {
    const three = await factsFor({ winner_player_id: 'A', a_win_streak: 3 }, { winners: ['A'] })
    expect(three.get('A')?.ayo_streak3_wins).toBe(1)
    expect(three.get('A')?.ayo_streak5_wins).toBeUndefined()
    const five = await factsFor({ winner_player_id: 'B', b_win_streak: 5 }, { winners: ['B'] })
    expect(five.get('B')?.ayo_streak3_wins).toBe(1)
    expect(five.get('B')?.ayo_streak5_wins).toBe(1)
  })

  it('perfect capture: every move captured, and a real game (3+ moves)', async () => {
    const perfect = await factsFor(
      { winner_player_id: 'A', a_stats: { moves: 4, capturing_moves: 4 } },
      { winners: ['A'] }
    )
    expect(perfect.get('A')?.ayo_perfect_capture_wins).toBe(1)
    // One move missed a capture.
    const missed = await factsFor(
      { winner_player_id: 'A', a_stats: { moves: 4, capturing_moves: 3 } },
      { winners: ['A'] }
    )
    expect(missed.get('A')?.ayo_perfect_capture_wins).toBeUndefined()
    // Too short to count.
    const blitz = await factsFor(
      { winner_player_id: 'A', a_stats: { moves: 2, capturing_moves: 2 } },
      { winners: ['A'] }
    )
    expect(blitz.get('A')?.ayo_perfect_capture_wins).toBeUndefined()
  })
})

describe('ayoFacts — robustness', () => {
  it('returns an empty map when there is no session', async () => {
    const noRow = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
    } as never
    expect((await ayoFacts(noRow, 'G', CTX)).size).toBe(0)
  })
})
