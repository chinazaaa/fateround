import { describe, expect, it } from 'vitest'
import type { FactsContext } from './index'
import { scrabbleFacts } from './scrabble'

/**
 * The builder reads one table — `scrabble_player_state`, selecting (player_id, score, rack, stats)
 * — and nothing else, so the mock is just the round's rows. Every case is a rule someone could
 * write in admin: a wrong derivation makes the trophy silently unearnable, indistinguishable from
 * a typo.
 */
type Row = { player_id: string; score?: number | null; rack?: string[] | null; stats?: Record<string, number> | null }

function db(rows: Row[]) {
  return {
    from() {
      return {
        select: () => ({ eq: () => Promise.resolve({ data: rows }) }),
      }
    },
  } as never
}

const CTX: FactsContext = {
  timerSeconds: 0,
  questionSource: null,
  theme: null,
  seated: ['me', 'b', 'c', 'd'],
  winners: [],
}

async function factsFor(row: Omit<Row, 'player_id'>, ctx: FactsContext = CTX) {
  const map = await scrabbleFacts(db([{ player_id: 'me', ...row }]), 'G', ctx)
  return map.get('me') ?? {}
}

describe('scrabbleFacts', () => {
  it('fires each accumulator placement/premium flag when present', async () => {
    const f = await factsFor({
      score: 10,
      stats: {
        scrabble_opening_move: 1,
        scrabble_dl_covers: 1,
        scrabble_tl_covers: 2,
        scrabble_dw_covers: 1,
        scrabble_tw_covers: 1,
        scrabble_blanks_played: 1,
        scrabble_exchanges: 1,
        scrabble_hooks: 1,
        scrabble_high_value: 1,
        scrabble_triple_triple: 1,
        scrabble_q_no_u: 1,
      },
    })
    expect(f.scrabble_opening_move_games).toBe(1)
    expect(f.scrabble_double_letter_games).toBe(1)
    expect(f.scrabble_triple_letter_games).toBe(1)
    expect(f.scrabble_double_word_games).toBe(1)
    expect(f.scrabble_triple_word_games).toBe(1)
    expect(f.scrabble_blank_games).toBe(1)
    expect(f.scrabble_swap_games).toBe(1)
    expect(f.scrabble_hook_games).toBe(1)
    expect(f.scrabble_high_value_games).toBe(1)
    expect(f.scrabble_triple_triple_games).toBe(1)
    expect(f.scrabble_q_no_u_games).toBe(1)
  })

  it('does not fire premium flags when the cover count is zero', async () => {
    const f = await factsFor({ score: 10, stats: { scrabble_dl_covers: 0, scrabble_tw_covers: 0 } })
    expect(f.scrabble_double_letter_games).toBeUndefined()
    expect(f.scrabble_triple_word_games).toBeUndefined()
  })

  it('grades bingos at one, two and three in a single game', async () => {
    expect((await factsFor({ score: 10, stats: { scrabble_bingos: 1 } })).scrabble_bingo_games).toBe(1)
    const one = await factsFor({ score: 10, stats: { scrabble_bingos: 1 } })
    expect(one.scrabble_double_bingo_games).toBeUndefined()
    expect(one.scrabble_triple_bingo_games).toBeUndefined()

    const two = await factsFor({ score: 10, stats: { scrabble_bingos: 2 } })
    expect(two.scrabble_bingo_games).toBe(1)
    expect(two.scrabble_double_bingo_games).toBe(1)
    expect(two.scrabble_triple_bingo_games).toBeUndefined()

    const three = await factsFor({ score: 10, stats: { scrabble_bingos: 3 } })
    expect(three.scrabble_double_bingo_games).toBe(1)
    expect(three.scrabble_triple_bingo_games).toBe(1)
  })

  it('grades the best single-word score at 40 / 80 / 100', async () => {
    const forty = await factsFor({ score: 10, stats: { scrabble_best_word: 40 } })
    expect(forty.scrabble_big_play_games).toBe(1)
    expect(forty.scrabble_monster_play_games).toBeUndefined()
    expect(forty.scrabble_century_word_games).toBeUndefined()

    const hundred = await factsFor({ score: 10, stats: { scrabble_best_word: 100 } })
    expect(hundred.scrabble_big_play_games).toBe(1)
    expect(hundred.scrabble_monster_play_games).toBe(1)
    expect(hundred.scrabble_century_word_games).toBe(1)

    const small = await factsFor({ score: 10, stats: { scrabble_best_word: 39 } })
    expect(small.scrabble_big_play_games).toBeUndefined()
  })

  it('reads word-shape flags off the max-words / max-length maxima', async () => {
    const two = await factsFor({ score: 10, stats: { scrabble_max_words: 2, scrabble_max_word_len: 8 } })
    expect(two.scrabble_two_word_games).toBe(1)
    expect(two.scrabble_parallel_games).toBeUndefined()
    expect(two.scrabble_long_word_games).toBe(1)

    const three = await factsFor({ score: 10, stats: { scrabble_max_words: 3, scrabble_max_word_len: 7 } })
    expect(three.scrabble_two_word_games).toBe(1)
    expect(three.scrabble_parallel_games).toBe(1)
    expect(three.scrabble_long_word_games).toBeUndefined()
  })

  it('reads the final-total milestones straight off the persisted score', async () => {
    const fifty = await factsFor({ score: 50, rack: ['A'] })
    expect(fifty.scrabble_half_century_games).toBe(1)
    expect(fifty.scrabble_century_games).toBeUndefined()

    const big = await factsFor({ score: 400, rack: ['A'] })
    expect(big.scrabble_half_century_games).toBe(1)
    expect(big.scrabble_century_games).toBe(1)
    expect(big.scrabble_three_hundred_games).toBe(1)
    expect(big.scrabble_four_hundred_games).toBe(1)

    const low = await factsFor({ score: 49, rack: ['A'] })
    expect(low.scrabble_half_century_games).toBeUndefined()
  })

  it('scores clean rack only on an empty rack at finish', async () => {
    expect((await factsFor({ score: 20, rack: [] })).scrabble_clean_rack_games).toBe(1)
    expect((await factsFor({ score: 20, rack: ['A', 'B'] })).scrabble_clean_rack_games).toBeUndefined()
  })

  it('withholds every win flag from a player the context does not name a winner', async () => {
    const f = await factsFor({ score: 300, rack: ['A'], stats: { scrabble_max_deficit: 90 } })
    expect(f.scrabble_comeback_wins).toBeUndefined()
    expect(f.scrabble_full_table_wins).toBeUndefined()
    expect(f.scrabble_no_swap_wins).toBeUndefined()
    // Non-win facts still stand.
    expect(f.scrabble_three_hundred_games).toBe(1)
  })

  it('awards the win flags to a named winner', async () => {
    const f = await factsFor(
      { score: 300, rack: [], stats: { scrabble_max_deficit: 60, scrabble_exchanges: 0, scrabble_passes: 0 } },
      { ...CTX, seated: ['me', 'b', 'c', 'd'], winners: ['me'] }
    )
    expect(f.scrabble_comeback_wins).toBe(1) // deficit hit 60
    expect(f.scrabble_full_table_wins).toBe(1) // four seated
    expect(f.scrabble_no_swap_wins).toBe(1) // never swapped or passed
  })

  it('withholds No Swaps from a winner who exchanged or passed', async () => {
    const swapped = await factsFor(
      { score: 100, rack: ['A'], stats: { scrabble_exchanges: 1 } },
      { ...CTX, winners: ['me'] }
    )
    expect(swapped.scrabble_no_swap_wins).toBeUndefined()

    const passed = await factsFor(
      { score: 100, rack: ['A'], stats: { scrabble_passes: 2 } },
      { ...CTX, winners: ['me'] }
    )
    expect(passed.scrabble_no_swap_wins).toBeUndefined()
  })

  it('withholds Comeback and Full Table below their thresholds', async () => {
    const f = await factsFor(
      { score: 100, rack: ['A'], stats: { scrabble_max_deficit: 59 } },
      { ...CTX, seated: ['me', 'b'], winners: ['me'] }
    )
    expect(f.scrabble_comeback_wins).toBeUndefined() // 59 < 60
    expect(f.scrabble_full_table_wins).toBeUndefined() // two seated
  })

  it('reads every player of one round from a single call, and skips the unremarkable', async () => {
    const map = await scrabbleFacts(
      db([
        { player_id: 'me', score: 300, rack: [], stats: { scrabble_bingos: 2 } },
        { player_id: 'rival', score: 40, rack: ['Q'], stats: { scrabble_blanks_played: 1 } },
        { player_id: 'ghost', score: 0, rack: ['A', 'B', 'C'], stats: {} },
      ]),
      'G',
      { ...CTX, seated: ['me', 'rival'], winners: ['me'] }
    )
    expect(map.get('me')?.scrabble_double_bingo_games).toBe(1)
    expect(map.get('me')?.scrabble_three_hundred_games).toBe(1)
    expect(map.get('me')?.scrabble_clean_rack_games).toBe(1)
    expect(map.get('rival')?.scrabble_blank_games).toBe(1)
    expect(map.get('rival')?.scrabble_no_swap_wins).toBeUndefined() // not a winner
    // Ghost: score 0, non-empty rack, empty bag → nothing worth an entry.
    expect(map.get('ghost')).toBeUndefined()
  })

  it('returns nothing when there are no rows', async () => {
    const map = await scrabbleFacts(db([]), 'G', CTX)
    expect(map.size).toBe(0)
  })
})
