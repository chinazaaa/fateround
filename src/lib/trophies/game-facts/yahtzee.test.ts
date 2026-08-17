import { describe, expect, it } from 'vitest'
import { YAHTZEE_UPPER_BONUS_THRESHOLD, emptyCategoryPoints } from '@/lib/yahtzee'
import type { YahtzeeCategoryPoints } from '@/types'
import type { FactsContext } from './index'
import { yahtzeeFacts } from './yahtzee'

/**
 * The facts builder reads one table and nothing else, so the mock is the round's scorecards.
 * Every case here is a rule someone could write in admin — if the derivation is wrong the trophy
 * is silently unearnable, which is indistinguishable from a typo.
 */
function db(rows: { player_id: string; scores: { categories: YahtzeeCategoryPoints } }[]) {
  return {
    from() {
      return {
        select: () => ({ eq: () => Promise.resolve({ data: rows }) }),
      }
    },
  } as never
}

const CTX: FactsContext = {
  timerSeconds: 60,
  questionSource: null,
  theme: null,
  seated: ['me', 'b', 'c', 'd'],
  winners: [],
}

/** A finished card: every cell non-null, defaults chosen so nothing accidentally trips a flag. */
function cats(overrides: Partial<YahtzeeCategoryPoints> = {}): YahtzeeCategoryPoints {
  const base: YahtzeeCategoryPoints = {
    ...emptyCategoryPoints(),
    ones: 1,
    twos: 2,
    threes: 3,
    fours: 4,
    fives: 5,
    sixes: 6,
    three_kind: 15,
    four_kind: 16,
    full_house: 25,
    small_straight: 30,
    large_straight: 40,
    yahtzee: 0,
    chance: 18,
  }
  return { ...base, ...overrides }
}

/** One player ('me') holding the given card. */
function card(overrides: Partial<YahtzeeCategoryPoints> = {}) {
  return db([{ player_id: 'me', scores: { categories: cats(overrides) } }])
}

/** The facts for 'me' out of a one-player-shaped call. */
async function factsFor(supabase: never, ctx: FactsContext = CTX) {
  const map = await yahtzeeFacts(supabase, 'G', ctx)
  return map.get('me') ?? {}
}

/** A strong card: upper 105 (bonus), lower 30+30+25+30+40+50+30 = 235 → 375 total. */
const STRONG: Partial<YahtzeeCategoryPoints> = {
  ones: 5,
  twos: 10,
  threes: 15,
  fours: 20,
  fives: 25,
  sixes: 30,
  three_kind: 30,
  four_kind: 30,
  yahtzee: 50,
  chance: 30,
}

describe('yahtzeeFacts', () => {
  it('reads a strong complete card end to end', async () => {
    const f = await factsFor(card(STRONG), { ...CTX, winners: ['me'] })
    expect(f.yahtzee_upper_bonus_games).toBe(1)
    expect(f.yahtzee_upper_70_plus).toBe(1)
    expect(f.yahtzee_sixes_24_plus).toBe(1)
    expect(f.yahtzee_four_kind_27_plus).toBe(1)
    expect(f.yahtzee_chance_25_plus).toBe(1)
    expect(f.yahtzee_chance_perfect_30).toBe(1)
    expect(f.yahtzee_both_straights_games).toBe(1)
    expect(f.yahtzee_lower_sweep_games).toBe(1)
    expect(f.yahtzee_no_zero_games).toBe(1)
    expect(f.yahtzee_flawless_card_games).toBe(1)
    expect(f.yahtzee_games_200_plus).toBe(1)
    expect(f.yahtzee_games_250_plus).toBe(1)
    expect(f.yahtzee_games_300_plus).toBe(1)
    expect(f.yahtzee_multiplayer_wins).toBe(1)
    expect(f.yahtzee_big_table_wins).toBe(1)
  })

  it('a single scratched box loses the clean-card flags', async () => {
    // A finished card has no nulls, so a 0 is a deliberate scratch — not "never reached".
    // Everything else about this card is identical to the flawless one above.
    const f = await factsFor(
      card({
        ones: 5,
        twos: 10,
        threes: 15,
        fours: 20,
        fives: 25,
        sixes: 30,
        yahtzee: 50,
        full_house: 0, // the only difference
      })
    )
    expect(f.yahtzee_no_zero_games).toBeUndefined()
    expect(f.yahtzee_flawless_card_games).toBeUndefined()
    expect(f.yahtzee_lower_sweep_games).toBeUndefined()
    expect(f.yahtzee_full_house_scored).toBeUndefined()
    // The bonus is unaffected — it only reads the upper section.
    expect(f.yahtzee_upper_bonus_games).toBe(1)
  })

  it('earns the upper bonus at exactly the threshold and not one below it', async () => {
    const at = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 } // 63
    expect(at.ones + at.twos + at.threes + at.fours + at.fives + at.sixes).toBe(YAHTZEE_UPPER_BONUS_THRESHOLD)

    const earned = await factsFor(card(at))
    const missed = await factsFor(card({ ...at, ones: 2 })) // 62
    expect(earned.yahtzee_upper_bonus_games).toBe(1)
    expect(missed.yahtzee_upper_bonus_games).toBeUndefined()
    // 63 and 62 both sit below the separate 70 mark.
    expect(earned.yahtzee_upper_70_plus).toBeUndefined()
  })

  it('counts a scored Yahtzee only when the box actually holds the 50', async () => {
    // The brief says "roll five of a kind", but a roll taken elsewhere leaves no trace — a
    // scratched Yahtzee box (0) is the same shape as never rolling one.
    const took = await factsFor(card({ yahtzee: 50 }))
    const scratched = await factsFor(card({ yahtzee: 0 }))
    expect(took.yahtzee_scored_yahtzee).toBe(1)
    expect(scratched.yahtzee_scored_yahtzee).toBeUndefined()
  })

  it('emits the category-scored tallies only for boxes taken above zero', async () => {
    const f = await factsFor(
      card({ three_kind: 20, four_kind: 0, full_house: 25, small_straight: 30, large_straight: 0 })
    )
    expect(f.yahtzee_three_kind_scored).toBe(1)
    expect(f.yahtzee_full_house_scored).toBe(1)
    expect(f.yahtzee_small_straight_scored).toBe(1)
    expect(f.yahtzee_four_kind_scored).toBeUndefined()
    expect(f.yahtzee_large_straight_scored).toBeUndefined()
    expect(f.yahtzee_both_straights_games).toBeUndefined()
  })

  it('still scores a solo game, but never as a win', async () => {
    // Yahtzee allows one player, and the award pass refuses to call that a win — so `winners` is
    // empty here. Score trophies must not be collateral damage of that decision.
    const solo: FactsContext = { ...CTX, seated: ['me'], winners: [] }
    const f = await factsFor(card(STRONG), solo)
    expect(f.yahtzee_games_300_plus).toBe(1)
    expect(f.yahtzee_flawless_card_games).toBe(1)
    expect(f.yahtzee_scored_yahtzee).toBe(1)
    expect(f.yahtzee_multiplayer_wins).toBeUndefined()
    expect(f.yahtzee_big_table_wins).toBeUndefined()
  })

  it('does not call a small table a big one', async () => {
    const f = await factsFor(card(), { ...CTX, seated: ['me', 'b'], winners: ['me'] })
    expect(f.yahtzee_multiplayer_wins).toBe(1)
    expect(f.yahtzee_big_table_wins).toBeUndefined()
  })

  it('derives every player of one round from a single call', async () => {
    // The point of the once-per-round shape: two cards read together, each player judged on their
    // own, and only the winner picking up the win counter.
    const map = await yahtzeeFacts(
      db([
        { player_id: 'me', scores: { categories: cats(STRONG) } },
        { player_id: 'rival', scores: { categories: cats({ yahtzee: 0, full_house: 0 }) } },
      ]),
      'G',
      { ...CTX, seated: ['me', 'rival'], winners: ['me'] }
    )
    expect(map.size).toBe(2)
    expect(map.get('me')?.yahtzee_games_300_plus).toBe(1)
    expect(map.get('me')?.yahtzee_multiplayer_wins).toBe(1)
    expect(map.get('rival')?.yahtzee_games_300_plus).toBeUndefined()
    expect(map.get('rival')?.yahtzee_scored_yahtzee).toBeUndefined()
    expect(map.get('rival')?.yahtzee_multiplayer_wins).toBeUndefined()
    // The loser is still credited for what they did do.
    expect(map.get('rival')?.yahtzee_both_straights_games).toBe(1)
  })

  it('returns nothing when the player has no scorecard', async () => {
    const map = await yahtzeeFacts(db([]), 'G', CTX)
    expect(map.size).toBe(0)
    expect(map.get('ghost')).toBeUndefined()
  })
})
