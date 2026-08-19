import { describe, expect, it } from 'vitest'
import type { WhotCard } from '@/types'
import type { FactsContext } from './index'
import { whotFacts } from './whot'

/**
 * The builder reads one table — `whot_player_hands`, selecting (player_id, stats, cards) — and
 * nothing else, so the mock is just the round's accumulator rows plus each final hand. Every case
 * is a rule someone could write in admin: a wrong derivation makes the trophy silently unearnable,
 * indistinguishable from a typo.
 */
function db(rows: { player_id: string; stats: Record<string, number> | null; cards?: WhotCard[] | null }[]) {
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

async function factsFor(stats: Record<string, number>, ctx: FactsContext = CTX, cards: WhotCard[] = []) {
  const map = await whotFacts(db([{ player_id: 'me', stats, cards }]), 'G', ctx)
  return map.get('me') ?? {}
}

/** All five real shape bits: circle|cross|triangle|square|star. */
const ALL_SHAPES = 1 | 2 | 4 | 8 | 16

describe('whotFacts', () => {
  it('emits lifetime tallies as their real round totals', async () => {
    const f = await factsFor({
      whot_pick_twos: 3,
      whot_shape_calls: 2,
      whot_hold_ons: 1,
      whot_suspensions: 1,
      whot_general_markets: 2,
      whot_pick_threes: 1,
      whot_pick_twos_stacked: 1,
      whot_pick_threes_stacked: 1,
    })
    expect(f.whot_pick_twos).toBe(3)
    expect(f.whot_shape_calls).toBe(2)
    expect(f.whot_hold_ons).toBe(1)
    expect(f.whot_suspensions).toBe(1)
    expect(f.whot_general_markets).toBe(2)
    expect(f.whot_pick_threes).toBe(1)
    expect(f.whot_pick_twos_stacked).toBe(1)
    expect(f.whot_pick_threes_stacked).toBe(1)
  })

  it('fires the per-game flags at their thresholds and not below', async () => {
    const at = await factsFor({
      whot_turns_taken: 4,
      whot_market_visits: 5,
      whot_max_holdon_run: 3,
      whot_max_shape_run: 4,
      whot_general_markets: 2,
      whot_two_whots: 1,
      whot_max_pick2_cards: 6,
    })
    expect(at.whot_market_visits_5_games).toBe(1)
    expect(at.whot_holdon_chain_3_games).toBe(1)
    expect(at.whot_shape_run_4_games).toBe(1)
    expect(at.whot_two_markets_games).toBe(1)
    expect(at.whot_two_whots_games).toBe(1)
    expect(at.whot_stack_attack_games).toBe(1)

    const below = await factsFor({
      whot_turns_taken: 4,
      whot_market_visits: 4,
      whot_max_holdon_run: 2,
      whot_max_shape_run: 3,
      whot_general_markets: 1,
      whot_max_pick2_cards: 4, // two twos, not three
    })
    expect(below.whot_market_visits_5_games).toBeUndefined()
    expect(below.whot_holdon_chain_3_games).toBeUndefined()
    expect(below.whot_shape_run_4_games).toBeUndefined()
    expect(below.whot_two_markets_games).toBeUndefined()
    expect(below.whot_two_whots_games).toBeUndefined()
    expect(below.whot_stack_attack_games).toBeUndefined()
  })

  it('No Mercy needs all three penalty cards in the same game', async () => {
    const all = await factsFor({ whot_pick_twos: 1, whot_pick_threes: 1, whot_general_markets: 1 })
    expect(all.whot_no_mercy_games).toBe(1)
    const missing = await factsFor({ whot_pick_twos: 1, whot_general_markets: 1 })
    expect(missing.whot_no_mercy_games).toBeUndefined()
  })

  it('withholds every win flag from a player the context does not name a winner', async () => {
    const f = await factsFor({
      whot_turns_taken: 5,
      whot_cards_drawn: 0,
      whot_peak_hand_size: 12,
      whot_shapes_mask: ALL_SHAPES,
      whot_out_whot: 1,
    })
    expect(f.whot_fast_wins).toBeUndefined()
    expect(f.whot_comeback_wins).toBeUndefined()
    expect(f.whot_shape_master_wins).toBeUndefined()
    expect(f.whot_wildcard_finish_wins).toBeUndefined()
    expect(f['distinct:whot_win_counts:4']).toBeUndefined()
  })

  it('awards the win flags to a named winner, incl. the distinct player-count member', async () => {
    const f = await factsFor(
      {
        whot_turns_taken: 6,
        whot_cards_drawn: 0,
        whot_penalty_cards: 5,
        whot_peak_hand_size: 11,
        whot_shapes_mask: ALL_SHAPES,
        whot_out_whot: 1,
        whot_out_star: 1,
      },
      { ...CTX, seated: ['me', 'b', 'c', 'd', 'e', 'f'], winners: ['me'] }
    )
    expect(f.whot_fast_wins).toBe(1) // 6 turns <= 10
    expect(f.whot_survivor_wins).toBe(1) // 5 penalty cards
    expect(f.whot_comeback_wins).toBe(1) // peak 11 >= 10
    expect(f.whot_full_table_wins).toBe(1) // six seated
    expect(f.whot_shape_master_wins).toBe(1) // all five shapes
    expect(f.whot_wildcard_finish_wins).toBe(1) // out on a WHOT
    expect(f.whot_star_finish_wins).toBe(1) // out card was a star
    expect(f.whot_untouchable_wins).toBe(1) // drew nothing, 3+ players
    expect(f['distinct:whot_win_counts:6']).toBe(1) // won at a six-player count
  })

  it('Head to Head needs a two-player win with no market visits', async () => {
    const won = await factsFor(
      { whot_turns_taken: 4, whot_market_visits: 0 },
      { ...CTX, seated: ['me', 'b'], winners: ['me'] }
    )
    expect(won.whot_head_to_head_wins).toBe(1)
    const drew = await factsFor(
      { whot_turns_taken: 4, whot_market_visits: 1 },
      { ...CTX, seated: ['me', 'b'], winners: ['me'] }
    )
    expect(drew.whot_head_to_head_wins).toBeUndefined()
  })

  it('Light Hand fires only for a timed win still holding five points or fewer', async () => {
    // Winner still holds cards (a blocked/timed win) worth 4 points → fires.
    const timed = await factsFor({ whot_turns_taken: 20 }, { ...CTX, winners: ['me'] }, [
      { id: 'circle-1', shape: 'circle', number: 1 },
      { id: 'triangle-3', shape: 'triangle', number: 3 },
    ])
    expect(timed.whot_light_hand_wins).toBe(1)
    // A normal empty-hand win holds nothing → does NOT fire (would otherwise trip on every win).
    const emptied = await factsFor({ whot_turns_taken: 8, whot_out_number: 7 }, { ...CTX, winners: ['me'] }, [])
    expect(emptied.whot_light_hand_wins).toBeUndefined()
    // Holding cards but worth more than five points → does not fire.
    const heavy = await factsFor({ whot_turns_taken: 20 }, { ...CTX, winners: ['me'] }, [
      { id: 'circle-8', shape: 'circle', number: 8 },
    ])
    expect(heavy.whot_light_hand_wins).toBeUndefined()
  })

  it('gates Untouched, Untouchable and Market Forces to three or more players', async () => {
    const heads = await factsFor(
      { whot_turns_taken: 5, whot_cards_drawn: 0, whot_penalty_hits: 0, whot_cards_inflicted: 15 },
      { ...CTX, seated: ['me', 'b'], winners: ['me'] }
    )
    expect(heads.whot_untouched_games).toBeUndefined()
    expect(heads.whot_untouchable_wins).toBeUndefined()
    expect(heads.whot_market_forces_games).toBeUndefined()

    const table = await factsFor(
      { whot_turns_taken: 5, whot_cards_drawn: 0, whot_penalty_hits: 0, whot_cards_inflicted: 15 },
      { ...CTX, seated: ['me', 'b', 'c'], winners: ['me'] }
    )
    expect(table.whot_untouched_games).toBe(1)
    expect(table.whot_untouchable_wins).toBe(1)
    expect(table.whot_market_forces_games).toBe(1)
  })

  it('withholds Untouched from a player who took a penalty', async () => {
    const f = await factsFor(
      { whot_turns_taken: 5, whot_penalty_hits: 1 },
      { ...CTX, seated: ['me', 'b', 'c'], winners: ['me'] }
    )
    expect(f.whot_untouched_games).toBeUndefined()
  })

  it('never calls a player who took no turn anything — an empty bag is no entry', async () => {
    const map = await whotFacts(db([{ player_id: 'me', stats: {}, cards: [] }]), 'G', {
      ...CTX,
      seated: ['me', 'b', 'c'],
    })
    expect(map.get('me')).toBeUndefined()
  })

  it('reads every player of one round from a single call', async () => {
    const map = await whotFacts(
      db([
        { player_id: 'me', stats: { whot_turns_taken: 6, whot_pick_twos: 3, whot_out_whot: 1 }, cards: [] },
        { player_id: 'rival', stats: { whot_hold_ons: 1 }, cards: [] },
        { player_id: 'ghost', stats: null, cards: [] },
      ]),
      'G',
      { ...CTX, seated: ['me', 'rival'], winners: ['me'] }
    )
    expect(map.size).toBe(2) // ghost's null bag yields no entry
    expect(map.get('me')?.whot_pick_twos).toBe(3)
    expect(map.get('me')?.whot_wildcard_finish_wins).toBe(1)
    expect(map.get('me')?.['distinct:whot_win_counts:2']).toBe(1)
    // The loser is credited for what they did, but wins nothing.
    expect(map.get('rival')?.whot_hold_ons).toBe(1)
    expect(map.get('rival')?.whot_wildcard_finish_wins).toBeUndefined()
    expect(map.get('ghost')).toBeUndefined()
  })

  it('returns nothing when there are no hand rows', async () => {
    const map = await whotFacts(db([]), 'G', CTX)
    expect(map.size).toBe(0)
  })
})
