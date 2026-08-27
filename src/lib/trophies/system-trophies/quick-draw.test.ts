import { describe, it, expect } from 'vitest'
import { buildSystemCatalog } from '../system-catalog'
import { QUICK_DRAW } from './quick-draw'

/**
 * Quick Draw's own shape rules.
 *
 * Spec ↔ seed-migration parity is NOT checked here — `../system-trophy-seed-parity.test.ts`
 * now does that for every game at once, so duplicating it per game would be dead weight.
 * What is left is the part specific to this set: Quick Draw is one game type wrapping two
 * unrelated rule sets (`lie` — draw a prompt, everyone writes decoy titles, the room votes
 * for the real one; `guess` — one drawer, the rest race to type the word) that write disjoint
 * tables. A player who only plays one variant can only ever move that variant's counters, so
 * a set that accidentally leaned entirely on one track would leave half the game unrewarded.
 */
describe('Quick Draw system trophies', () => {
  const catalog = buildSystemCatalog().filter((trophy) => trophy.game_type === 'quick_draw')

  it('registers the spec under the quick_draw game type', () => {
    expect(catalog).toHaveLength(QUICK_DRAW.length)
    expect(QUICK_DRAW.length).toBeGreaterThanOrEqual(15)
  })

  it('covers both variants — neither track is empty', () => {
    const counters = QUICK_DRAW.map((spec) => spec.counter ?? '')
    // `lie` counters come from quick_draw_titles/votes; `guess` counters from the guess tables.
    const lie = counters.filter((counter) =>
      /fools|correct_reads|unmistakable|perfect_voter|drawings_submitted/.test(counter)
    )
    const guess = counters.filter((counter) =>
      /words_guessed|drawer_turns|words_landed|flawless_turn|twenty_guess/.test(counter)
    )
    expect(lie.length, 'no lie-variant trophies').toBeGreaterThanOrEqual(5)
    expect(guess.length, 'no guess-variant trophies').toBeGreaterThanOrEqual(5)
  })

  it('has unique suffixes and sort orders', () => {
    const suffixes = QUICK_DRAW.map((spec) => spec.suffix)
    expect(new Set(suffixes).size).toBe(suffixes.length)
    const orders = QUICK_DRAW.map((spec) => spec.sortOrder)
    expect(new Set(orders).size).toBe(orders.length)
  })
})
