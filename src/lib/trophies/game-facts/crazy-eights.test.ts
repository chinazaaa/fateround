import { describe, expect, it } from 'vitest'
import type { FactsContext } from './index'
import { crazyEightsFacts } from './crazy-eights'

/**
 * The builder reads one table — `crazy_eights_player_hands`, selecting (player_id, stats) — and
 * nothing else, so the mock is just the round's accumulator rows. Every case is a rule someone
 * could write in admin: a wrong derivation makes the trophy silently unearnable, which is
 * indistinguishable from a typo.
 */
function db(rows: { player_id: string; stats: Record<string, number> | null }[]) {
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

async function factsFor(stats: Record<string, number>, ctx: FactsContext = CTX) {
  const map = await crazyEightsFacts(db([{ player_id: 'me', stats }]), 'G', ctx)
  return map.get('me') ?? {}
}

/** All four suit bits: spades|clubs|hearts|diamonds. */
const ALL_SUITS = 1 | 2 | 4 | 8

describe('crazyEightsFacts', () => {
  it('emits lifetime tallies as their real round totals', async () => {
    const f = await factsFor({
      c8_eights_played: 2,
      c8_pick_twos_played: 3,
      c8_skips_played: 1,
      c8_reverses_played: 1,
      c8_jokers_played: 1,
      c8_pick_twos_stacked: 1,
      c8_cards_drawn: 4,
    })
    expect(f.c8_eights_played).toBe(2)
    expect(f.c8_pick_twos_played).toBe(3)
    expect(f.c8_skips_played).toBe(1)
    expect(f.c8_reverses_played).toBe(1)
    expect(f.c8_jokers_played).toBe(1)
    expect(f.c8_pick_twos_stacked).toBe(1)
    expect(f.c8_cards_drawn).toBe(4)
  })

  it('fires the per-game flags at their thresholds and not below', async () => {
    const at = await factsFor({
      c8_suit_changes: 3,
      c8_cards_drawn: 5,
      c8_eights_played: 3,
      c8_max_suit_run: 4,
      c8_max_rank_run: 3,
      c8_suits_mask: ALL_SUITS,
      c8_skips_played: 3,
      c8_reverses_played: 2,
    })
    expect(at.c8_suit_changes_3_games).toBe(1)
    expect(at.c8_drew_5_games).toBe(1)
    expect(at.c8_three_eights_games).toBe(1)
    expect(at.c8_suit_run_4_games).toBe(1)
    expect(at.c8_rank_run_3_games).toBe(1)
    expect(at.c8_all_suits_games).toBe(1)
    expect(at.c8_three_skips_games).toBe(1)
    expect(at.c8_two_queens_games).toBe(1)

    const below = await factsFor({
      c8_suit_changes: 2,
      c8_cards_drawn: 4,
      c8_eights_played: 2,
      c8_max_suit_run: 3,
      c8_max_rank_run: 2,
      c8_suits_mask: 1 | 2 | 4, // three suits, not four
      c8_skips_played: 2,
      c8_reverses_played: 1,
    })
    expect(below.c8_suit_changes_3_games).toBeUndefined()
    expect(below.c8_drew_5_games).toBeUndefined()
    expect(below.c8_three_eights_games).toBeUndefined()
    expect(below.c8_suit_run_4_games).toBeUndefined()
    expect(below.c8_rank_run_3_games).toBeUndefined()
    expect(below.c8_all_suits_games).toBeUndefined()
    expect(below.c8_three_skips_games).toBeUndefined()
    expect(below.c8_two_queens_games).toBeUndefined()
  })

  it('withholds every win flag from a player the context does not name a winner', async () => {
    // A strong game, but not marked a winner: no win flag, yet the non-win facts still stand.
    const f = await factsFor({
      c8_turns_taken: 5,
      c8_cards_drawn: 0,
      c8_peak_hand_size: 13,
      c8_suits_mask: ALL_SUITS,
      c8_eights_played: 1,
      c8_jokers_played: 1,
      c8_out_rank: 8,
    })
    expect(f.c8_quickfire_wins).toBeUndefined()
    expect(f.c8_comeback_wins).toBeUndefined()
    expect(f.c8_suit_master_wins).toBeUndefined()
    expect(f.c8_eight_finish_wins).toBeUndefined()
    // Non-win facts are unaffected by the missing win.
    expect(f.c8_all_suits_games).toBe(1)
  })

  it('awards the win flags to a named winner', async () => {
    const f = await factsFor(
      {
        c8_turns_taken: 6,
        c8_cards_drawn: 0,
        c8_peak_hand_size: 12,
        c8_suits_mask: ALL_SUITS,
        c8_eights_played: 1,
        c8_jokers_played: 1,
        c8_out_rank: 8,
      },
      { ...CTX, seated: ['me', 'b', 'c', 'd', 'e', 'f'], winners: ['me'] }
    )
    expect(f.c8_quickfire_wins).toBe(1) // 6 turns <= 8
    expect(f.c8_comeback_wins).toBe(1) // peak 12
    expect(f.c8_full_table_wins).toBe(1) // six seated
    expect(f.c8_suit_master_wins).toBe(1) // all suits + an 8
    expect(f.c8_suit_sweep_wins).toBe(1) // all suits + an 8 + a joker
    expect(f.c8_flawless_wins).toBe(1) // drew nothing, 3+ players
    expect(f.c8_eight_finish_wins).toBe(1) // out on an 8
    expect(f.c8_joker_finish_wins).toBeUndefined() // out card was the 8, not a joker
  })

  it('a timed lowest-hand win (no card played out) earns no finish flag', async () => {
    // No `c8_out_*` because the winner never emptied their hand — the clock ended it.
    const f = await factsFor({ c8_turns_taken: 20, c8_cards_drawn: 3 }, { ...CTX, winners: ['me'] })
    expect(f.c8_eight_finish_wins).toBeUndefined()
    expect(f.c8_joker_finish_wins).toBeUndefined()
    expect(f.c8_quickfire_wins).toBeUndefined() // 20 turns > 8
  })

  it('distinguishes a joker finish from an eight finish', async () => {
    const joker = await factsFor({ c8_turns_taken: 4, c8_out_joker: 1 }, { ...CTX, winners: ['me'] })
    expect(joker.c8_joker_finish_wins).toBe(1)
    expect(joker.c8_eight_finish_wins).toBeUndefined()
  })

  it('gates Untouched and Flawless to three or more players', async () => {
    // Two players: neither the no-pick-two nor the flawless flag fires even though both hold.
    const heads = await factsFor(
      { c8_turns_taken: 5, c8_cards_drawn: 0, c8_pick_twos_received: 0 },
      { ...CTX, seated: ['me', 'b'], winners: ['me'] }
    )
    expect(heads.c8_no_pick_two_games).toBeUndefined()
    expect(heads.c8_flawless_wins).toBeUndefined()

    // Three players: both fire.
    const table = await factsFor(
      { c8_turns_taken: 5, c8_cards_drawn: 0, c8_pick_twos_received: 0 },
      { ...CTX, seated: ['me', 'b', 'c'], winners: ['me'] }
    )
    expect(table.c8_no_pick_two_games).toBe(1)
    expect(table.c8_flawless_wins).toBe(1)
  })

  it('withholds Untouched from a player who took a Pick Two', async () => {
    const f = await factsFor(
      { c8_turns_taken: 5, c8_pick_twos_received: 1 },
      { ...CTX, seated: ['me', 'b', 'c'], winners: ['me'] }
    )
    expect(f.c8_no_pick_two_games).toBeUndefined()
  })

  it('never calls a player who took no turn "untouched"', async () => {
    // An empty bag is no entry at all — a seated player who never acted earns nothing.
    const map = await crazyEightsFacts(db([{ player_id: 'me', stats: {} }]), 'G', {
      ...CTX,
      seated: ['me', 'b', 'c'],
    })
    expect(map.get('me')).toBeUndefined()
  })

  it('reads every player of one round from a single call', async () => {
    const map = await crazyEightsFacts(
      db([
        { player_id: 'me', stats: { c8_turns_taken: 6, c8_eights_played: 3, c8_out_rank: 8 } },
        { player_id: 'rival', stats: { c8_pick_twos_played: 1 } },
        { player_id: 'ghost', stats: null },
      ]),
      'G',
      { ...CTX, seated: ['me', 'rival'], winners: ['me'] }
    )
    expect(map.size).toBe(2) // ghost's null bag yields no entry
    expect(map.get('me')?.c8_three_eights_games).toBe(1)
    expect(map.get('me')?.c8_eight_finish_wins).toBe(1)
    expect(map.get('me')?.c8_quickfire_wins).toBe(1)
    // The loser is credited for what they did, but wins nothing.
    expect(map.get('rival')?.c8_pick_twos_played).toBe(1)
    expect(map.get('rival')?.c8_eight_finish_wins).toBeUndefined()
    expect(map.get('ghost')).toBeUndefined()
  })

  it('returns nothing when there are no hand rows', async () => {
    const map = await crazyEightsFacts(db([]), 'G', CTX)
    expect(map.size).toBe(0)
  })
})
