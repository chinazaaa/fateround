import { describe, expect, it } from 'vitest'
import type { Vote } from '@/types'
import { createLateVoteTracker, mergeVotesById } from './late-votes'

const vote = (id: string, roundId = 'r1'): Vote => ({ id, round_id: roundId }) as unknown as Vote

describe('mergeVotesById', () => {
  it('appends only unseen votes and keeps the base order', () => {
    expect(mergeVotesById([vote('a'), vote('b')], [vote('b'), vote('c')]).map((v) => v.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns the very same array when there is nothing to add', () => {
    const base = [vote('a')]
    expect(mergeVotesById(base, [])).toBe(base)
    expect(mergeVotesById(base, [vote('a')])).toBe(base)
  })
})

describe('createLateVoteTracker', () => {
  it('keeps a late vote that arrives while the results fetch is in flight', () => {
    const t = createLateVoteTracker()
    t.begin('r1') // fetch starts
    expect(t.add(vote('late'))).toBe(true) // INSERT lands mid-fetch
    // the snapshot was read before the row existed
    expect(t.merge('r1', [vote('a')]).map((v) => v.id)).toEqual(['a', 'late'])
  })

  it('tracks the round for every loader, so an INSERT after a bootstrap or polling load is not ignored', () => {
    const t = createLateVoteTracker()
    t.begin('r1') // bootstrap / polling path starts tracking too
    t.merge('r1', [vote('a')])
    expect(t.add(vote('late'))).toBe(true)
    // a later polling snapshot that still predates the row keeps it
    expect(t.merge('r1', [vote('a')]).map((v) => v.id)).toEqual(['a', 'late'])
  })

  it('does not duplicate a late vote the snapshot already contains', () => {
    const t = createLateVoteTracker()
    t.begin('r1')
    t.add(vote('late'))
    expect(t.merge('r1', [vote('a'), vote('late')]).map((v) => v.id)).toEqual(['a', 'late'])
  })

  it('ignores votes for other rounds and before anything is tracked', () => {
    const t = createLateVoteTracker()
    expect(t.add(vote('x'))).toBe(false)
    t.begin('r1')
    expect(t.add(vote('y', 'r2'))).toBe(false)
    expect(t.merge('r1', [])).toEqual([])
  })

  it('forgets late votes when a different round starts being tracked', () => {
    const t = createLateVoteTracker()
    t.begin('r1')
    t.add(vote('late'))
    t.begin('r2')
    expect(t.merge('r2', [vote('b', 'r2')]).map((v) => v.id)).toEqual(['b'])
    expect(t.merge('r1', [vote('a')]).map((v) => v.id)).toEqual(['a'])
  })

  it('keeps late votes when the same round is begun again (every poll)', () => {
    const t = createLateVoteTracker()
    t.begin('r1')
    t.add(vote('late'))
    t.begin('r1')
    expect(t.merge('r1', [vote('a')]).map((v) => v.id)).toEqual(['a', 'late'])
  })
})
