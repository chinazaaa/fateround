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
    t.begin('r1', t.ticket()) // fetch starts
    expect(t.add(vote('late'))).toBe(true) // INSERT lands mid-fetch
    // the snapshot was read before the row existed
    expect(t.merge('r1', [vote('a')]).map((v) => v.id)).toEqual(['a', 'late'])
  })

  it('tracks the round for every loader, so an INSERT after a bootstrap or polling load is not ignored', () => {
    const t = createLateVoteTracker()
    t.begin('r1', t.ticket()) // bootstrap / polling path starts tracking too
    t.merge('r1', [vote('a')])
    expect(t.add(vote('late'))).toBe(true)
    // a later polling snapshot that still predates the row keeps it
    expect(t.merge('r1', [vote('a')]).map((v) => v.id)).toEqual(['a', 'late'])
  })

  it('does not duplicate a late vote the snapshot already contains', () => {
    const t = createLateVoteTracker()
    t.begin('r1', t.ticket())
    t.add(vote('late'))
    expect(t.merge('r1', [vote('a'), vote('late')]).map((v) => v.id)).toEqual(['a', 'late'])
  })

  it('ignores votes for other rounds and before anything is tracked', () => {
    const t = createLateVoteTracker()
    expect(t.add(vote('x'))).toBe(false)
    t.begin('r1', t.ticket())
    expect(t.add(vote('y', 'r2'))).toBe(false)
    expect(t.merge('r1', [])).toEqual([])
  })

  it('forgets late votes when a different round starts being tracked', () => {
    const t = createLateVoteTracker()
    t.begin('r1', t.ticket())
    t.add(vote('late'))
    t.begin('r2', t.ticket())
    expect(t.merge('r2', [vote('b', 'r2')]).map((v) => v.id)).toEqual(['b'])
    expect(t.merge('r1', [vote('a')]).map((v) => v.id)).toEqual(['a'])
  })

  it('keeps late votes when the same round is begun again (every poll)', () => {
    const t = createLateVoteTracker()
    t.begin('r1', t.ticket())
    t.add(vote('late'))
    expect(t.begin('r1', t.ticket())).toBe(true)
    expect(t.merge('r1', [vote('a')]).map((v) => v.id)).toEqual(['a', 'late'])
  })

  describe('loaders that finish out of order', () => {
    it('refuses a loader that started earlier but reaches begin() after a newer loader took over', () => {
      const t = createLateVoteTracker()
      const olderPoll = t.ticket() // started while r1 was the finished round
      const realtime = t.ticket() // r2 finished and began loading its results
      expect(t.begin('r2', realtime)).toBe(true)
      // the older poll's response arrives late: it must not take the tracker back to r1
      expect(t.begin('r1', olderPoll)).toBe(false)
      expect(t.current()).toBe('r2')
    })

    it('keeps the newer round tracked, so its late INSERT is still recorded and merged', () => {
      const t = createLateVoteTracker()
      const olderPoll = t.ticket()
      const realtime = t.ticket()
      t.begin('r2', realtime)
      t.begin('r1', olderPoll) // refused
      expect(t.add(vote('late', 'r2'))).toBe(true)
      // the in-flight r2 snapshot predates that INSERT
      expect(t.merge('r2', [vote('b', 'r2')]).map((v) => v.id)).toEqual(['b', 'late'])
    })

    it('still lets a loader that started later, even for an older round id (a replayed game), take over', () => {
      const t = createLateVoteTracker()
      t.begin('r2', t.ticket())
      t.add(vote('late', 'r2'))
      expect(t.begin('r1', t.ticket())).toBe(true)
      expect(t.current()).toBe('r1')
      expect(t.merge('r1', [vote('a')]).map((v) => v.id)).toEqual(['a'])
    })

    it('lets a slower loader for the SAME round keep applying (repeated loads of one round)', () => {
      const t = createLateVoteTracker()
      const first = t.ticket()
      const second = t.ticket()
      t.begin('r1', second)
      t.add(vote('late'))
      // the first loader finishes after the second began: same round, so it is not stale and nothing is cleared
      expect(t.begin('r1', first)).toBe(true)
      expect(t.merge('r1', [vote('a')]).map((v) => v.id)).toEqual(['a', 'late'])
    })

    it('remembers the newest owner across same-round calls, so an older loader for another round is still refused', () => {
      const t = createLateVoteTracker()
      const stale = t.ticket()
      const mid = t.ticket()
      const newest = t.ticket()
      t.begin('r2', mid)
      t.begin('r2', newest)
      expect(t.begin('r1', stale)).toBe(false)
    })
  })
})
