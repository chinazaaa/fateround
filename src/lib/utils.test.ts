import { describe, it, expect } from 'vitest'
import { generateNRounds } from './utils'

describe('generateNRounds', () => {
  it('produces the requested number of rounds, each of the pool size', () => {
    const people = ['a', 'b', 'c', 'd', 'e']
    const rounds = generateNRounds(people, 6, 3)
    expect(rounds).toHaveLength(6)
    for (const group of rounds) {
      expect(group).toHaveLength(3)
      expect(new Set(group).size).toBe(3) // distinct within a round
      for (const id of group) expect(people).toContain(id) // only real participants
    }
  })

  it('returns an empty schedule when there are fewer people than the pool size', () => {
    expect(generateNRounds(['a', 'b'], 5, 3)).toEqual([])
    expect(generateNRounds([], 3, 2)).toEqual([])
  })

  it('balances appearances roughly evenly across many rounds', () => {
    const people = ['a', 'b', 'c', 'd']
    const rounds = generateNRounds(people, 20, 2)
    const counts = new Map<string, number>(people.map((p) => [p, 0]))
    for (const g of rounds) for (const id of g) counts.set(id, (counts.get(id) ?? 0) + 1)
    const values = [...counts.values()]
    // 20 rounds × 2 slots = 40 appearances over 4 people → ~10 each; allow some slack.
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(3)
  })
})
