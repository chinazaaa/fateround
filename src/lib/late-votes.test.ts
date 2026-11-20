import { describe, expect, it } from 'vitest'
import type { Vote } from '@/types'
import { createLateVoteTracker, loadFinishedRoundResults, mergeVotesById } from './late-votes'

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
    expect(t.begin('r1', t.ticket())).not.toBeNull()
    expect(t.merge('r1', [vote('a')]).map((v) => v.id)).toEqual(['a', 'late'])
  })

  describe('loaders that start out of order', () => {
    it('refuses a loader that started earlier but reaches begin() after a newer loader took over', () => {
      const t = createLateVoteTracker()
      const olderPoll = t.ticket() // started while r1 was the finished round
      const realtime = t.ticket() // r2 finished and began loading its results
      expect(t.begin('r2', realtime)).not.toBeNull()
      // the older poll's response arrives late: it must not take the tracker back to r1
      expect(t.begin('r1', olderPoll)).toBeNull()
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
      expect(t.begin('r1', t.ticket())).not.toBeNull()
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
      expect(t.begin('r1', first)).not.toBeNull()
      expect(t.merge('r1', [vote('a')]).map((v) => v.id)).toEqual(['a', 'late'])
    })

    it('remembers the newest owner across same-round calls, so an older loader for another round is still refused', () => {
      const t = createLateVoteTracker()
      const stale = t.ticket()
      const mid = t.ticket()
      const newest = t.ticket()
      t.begin('r2', mid)
      t.begin('r2', newest)
      expect(t.begin('r1', stale)).toBeNull()
    })
  })

  describe('owns', () => {
    it('is true for repeated loads of one round and false once the tracked round was switched', () => {
      const t = createLateVoteTracker()
      const a = t.begin('r1', t.ticket())!
      const b = t.begin('r1', t.ticket())! // another load of the same round
      expect(t.owns(a)).toBe(true)
      expect(t.owns(b)).toBe(true)
      t.begin('r2', t.ticket())
      expect(t.owns(a)).toBe(false)
      expect(t.owns(b)).toBe(false)
    })

    it('treats a switch away and back to the same round as a new ownership period', () => {
      const t = createLateVoteTracker()
      const first = t.begin('r1', t.ticket())!
      t.begin('r2', t.ticket())
      t.begin('r1', t.ticket()) // back to r1
      expect(t.owns(first)).toBe(false)
    })
  })
})

/** A fetch whose completion the test controls, to interleave loaders. */
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('loadFinishedRoundResults (loaders finishing out of order)', () => {
  type Res = { votes: Vote[]; tag: string }

  function setup() {
    const tracker = createLateVoteTracker()
    const applied: { roundId: string; tag: string; ids: string[] }[] = []
    const load = (roundId: string, ticket: number, fetchResults: () => Promise<Res | null>) =>
      loadFinishedRoundResults(tracker, roundId, ticket, fetchResults, (r) =>
        applied.push({ roundId, tag: r.tag, ids: r.votes.map((v) => v.id) })
      )
    return { tracker, applied, load }
  }

  it('applies nothing for an older loader that passed begin() but finishes after a newer round applied its results', async () => {
    const { tracker, applied, load } = setup()
    const r1Fetch = deferred<Res>()
    const olderTicket = tracker.ticket()
    const older = load('r1', olderTicket, () => r1Fetch.promise) // r1 loader: passed begin(), awaiting its votes

    const newerTicket = tracker.ticket()
    const newer = await load('r2', newerTicket, async () => ({ votes: [vote('b', 'r2')], tag: 'r2' }))
    expect(newer).toBe('applied')

    r1Fetch.resolve({ votes: [vote('a')], tag: 'r1' }) // the r1 fetch completes last
    expect(await older).toBe('stale')
    expect(applied.map((a) => a.tag)).toEqual(['r2']) // r1's older results were never applied over r2's
  })

  it('applies nothing for an old loader of a round that was switched away from and back to', async () => {
    const { tracker, applied, load } = setup()
    const slow = deferred<Res>()
    const old = load('r1', tracker.ticket(), () => slow.promise)
    await load('r2', tracker.ticket(), async () => ({ votes: [], tag: 'r2' }))
    await load('r1', tracker.ticket(), async () => ({ votes: [vote('fresh')], tag: 'r1-new' }))
    slow.resolve({ votes: [vote('stale')], tag: 'r1-old' })
    expect(await old).toBe('stale')
    expect(applied.map((a) => a.tag)).toEqual(['r2', 'r1-new'])
  })

  it('merges a late INSERT that arrives while the fetch is in flight into what is applied', async () => {
    const { tracker, applied, load } = setup()
    const f = deferred<Res>()
    const p = load('r1', tracker.ticket(), () => f.promise)
    tracker.add(vote('late')) // lands mid-fetch, after the snapshot was read
    f.resolve({ votes: [vote('a')], tag: 'r1' })
    expect(await p).toBe('applied')
    expect(applied[0].ids).toEqual(['a', 'late'])
  })

  it('lets two overlapping loads of the same round both apply, in whatever order they finish', async () => {
    const { tracker, applied, load } = setup()
    const f1 = deferred<Res>()
    const f2 = deferred<Res>()
    const p1 = load('r1', tracker.ticket(), () => f1.promise)
    const p2 = load('r1', tracker.ticket(), () => f2.promise)
    f2.resolve({ votes: [vote('a')], tag: 'second' })
    f1.resolve({ votes: [vote('a')], tag: 'first' })
    expect([await p1, await p2]).toEqual(['applied', 'applied'])
    expect(applied.map((a) => a.tag)).toEqual(['second', 'first'])
  })

  it('reports a failed fetch without applying anything', async () => {
    const { tracker, applied, load } = setup()
    expect(await load('r1', tracker.ticket(), async () => null)).toBe('failed')
    expect(applied).toEqual([])
  })

  it('does not run the fetch at all for a loader refused at begin()', async () => {
    const { tracker, load } = setup()
    const stale = tracker.ticket()
    await load('r2', tracker.ticket(), async () => ({ votes: [], tag: 'r2' }))
    let fetched = false
    expect(
      await load('r1', stale, async () => {
        fetched = true
        return { votes: [], tag: 'r1' }
      })
    ).toBe('stale')
    expect(fetched).toBe(false)
  })
})
