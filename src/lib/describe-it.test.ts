import { describe, it, expect } from 'vitest'
import { describerForIndividualTurn, nextIndividualDescriberIndex } from './describe-it'

describe('nextIndividualDescriberIndex', () => {
  const roster = ['A', 'B', 'C'] // rounds=2 → 6 turns: A B C A B C
  const total = 6

  it('keeps the next turn when its describer is still present', () => {
    const live = new Set(roster)
    // After A's turn (index 0), index 1 is B who is present.
    expect(nextIndividualDescriberIndex(roster, 1, live, total)).toBe(1)
  })

  it('skips a turn whose describer has left, landing on the next live describer', () => {
    const live = new Set(['A', 'C']) // B left mid-game
    // From index 1 (B) → skip to index 2 (C), who is present.
    expect(nextIndividualDescriberIndex(roster, 1, live, total)).toBe(2)
    // B's round-2 slot (index 4) is also skipped → index 5 (C).
    expect(nextIndividualDescriberIndex(roster, 4, live, total)).toBe(5)
  })

  it('skips several consecutive departed describers', () => {
    const live = new Set(['A']) // only A remains
    // From index 1: B(1) and C(2) gone → A again at index 3.
    expect(nextIndividualDescriberIndex(roster, 1, live, total)).toBe(3)
  })

  it('returns totalTurns (match over) when no live describer remains', () => {
    const live = new Set<string>() // everyone left
    expect(nextIndividualDescriberIndex(roster, 1, live, total)).toBe(total)
  })

  it('returns totalTurns when the only remaining turns belong to departed players', () => {
    const live = new Set(['A']) // A already had both turns (indices 0 and 3)
    // Starting after A's final turn, only B/C slots (4, 5) remain — both gone.
    expect(nextIndividualDescriberIndex(roster, 4, live, total)).toBe(total)
  })

  it('never returns a turn whose rostered describer is absent', () => {
    const live = new Set(['B'])
    const idx = nextIndividualDescriberIndex(roster, 0, live, total)
    expect(idx).toBeLessThan(total)
    expect(describerForIndividualTurn(roster, idx)).toBe('B')
  })
})
