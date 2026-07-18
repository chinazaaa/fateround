import { describe, it, expect } from 'vitest'
import {
  computeRoundResults,
  tallyLandmineScores,
  pickMines,
  buildReviewerAssignments,
  buildLandmineInitialRound,
  landmineAnsweringPlayerIds,
  parseLandmineMineSource,
  clampLandmineRoundCount,
} from './landmine'
import type { LandmineAnswer, LandmineMark, LandmineMetadata, Player } from '@/types'

function answer(player_id: string, text: string): LandmineAnswer {
  return {
    id: `a-${player_id}`,
    game_id: 'G',
    round_id: 'R',
    player_id,
    answer: text,
    submitted_at: '2026-07-16T00:00:00Z',
    points: null,
    outcome: null,
    mine_hit: null,
    is_original: null,
  }
}

function mark(marker: string, target: string, valid: boolean): LandmineMark {
  return {
    id: `m-${marker}`,
    game_id: 'G',
    round_id: 'R',
    marker_player_id: marker,
    target_player_id: target,
    valid,
    marked_at: 'now',
  }
}

describe('landmine scoring', () => {
  it('mine hit scores 0, valid non-mine scores 10, +5 when original', () => {
    const answers = [answer('a', 'pencil'), answer('b', 'protractor'), answer('c', 'pencil')]
    // b marks a valid, a marks b valid, c marks... (marks are by target)
    const marks = [mark('x', 'a', true), mark('y', 'b', true), mark('z', 'c', true)]
    const results = computeRoundResults(answers, marks, ['pencil'], { originalityBonus: true })
    const byId = Object.fromEntries(results.map((r) => [r.player_id, r]))

    // 'pencil' is the mine → a and c hit it → 0
    expect(byId.a.outcome).toBe('mine')
    expect(byId.a.points).toBe(0)
    expect(byId.c.mine_hit).toBe(true)
    // 'protractor' is valid, unique → 10 + 5 originality
    expect(byId.b.outcome).toBe('original')
    expect(byId.b.points).toBe(15)
  })

  it('an answer that contains the mine word as a whole word still detonates', () => {
    // "egusi soup" must still hit the "egusi" mine — you can't dodge it by appending a word.
    const answers = [answer('a', 'egusi soup'), answer('b', 'cartoon')]
    const marks = [mark('x', 'a', true), mark('y', 'b', true)]
    const results = computeRoundResults(answers, marks, ['egusi', 'art'], { originalityBonus: false })
    const byId = Object.fromEntries(results.map((r) => [r.player_id, r]))
    // 'egusi soup' contains the whole word 'egusi' → mine.
    expect(byId.a.outcome).toBe('mine')
    expect(byId.a.mine_hit).toBe(true)
    // 'cartoon' merely contains the letters of the 'art' mine, not the whole word → valid.
    expect(byId.b.outcome).toBe('valid')
    expect(byId.b.mine_hit).toBe(false)
  })

  it('a multi-word mine matches only as a whole phrase inside the answer', () => {
    const answers = [answer('a', 'hot jollof rice please'), answer('b', 'rice jollof')]
    const marks = [mark('x', 'a', true), mark('y', 'b', true)]
    const results = computeRoundResults(answers, marks, ['jollof rice'], { originalityBonus: false })
    const byId = Object.fromEntries(results.map((r) => [r.player_id, r]))
    expect(byId.a.outcome).toBe('mine')
    // 'rice jollof' is the phrase reversed → not a match.
    expect(byId.b.outcome).toBe('valid')
  })

  it('voided answers score 0 regardless of the mine', () => {
    const answers = [answer('a', 'bathtub')]
    const marks = [mark('x', 'a', false)]
    const results = computeRoundResults(answers, marks, ['pencil'], { originalityBonus: true })
    expect(results[0].outcome).toBe('void')
    expect(results[0].points).toBe(0)
  })

  it('originality bonus OFF: a unique valid answer scores 10, not 15', () => {
    const answers = [answer('a', 'protractor')]
    const marks = [mark('x', 'a', true)]
    const withBonus = computeRoundResults(answers, marks, ['pencil'], { originalityBonus: true })
    const withoutBonus = computeRoundResults(answers, marks, ['pencil'], { originalityBonus: false })
    // Same input, the ONLY difference is the setting → 15 vs 10 proves the toggle drives scoring.
    expect(withBonus[0].points).toBe(15)
    expect(withoutBonus[0].points).toBe(10)
    expect(withoutBonus[0].outcome).toBe('valid')
  })

  it('duplicate valid answers score 10 but no originality bonus', () => {
    const answers = [answer('a', 'pen'), answer('b', 'pen')]
    const marks = [mark('x', 'a', true), mark('y', 'b', true)]
    const results = computeRoundResults(answers, marks, ['pencil'], { originalityBonus: true })
    expect(results.every((r) => r.points === 10 && !r.is_original)).toBe(true)
  })

  it('empty answers are always 0 / empty', () => {
    const results = computeRoundResults([answer('a', '')], [], ['pencil'], { originalityBonus: true })
    expect(results[0].outcome).toBe('empty')
  })

  it('tally ranks alive players above eliminated', () => {
    const players: Player[] = [
      { id: 'a', name: 'Ada', is_eliminated: true } as Player,
      { id: 'b', name: 'Ben', is_eliminated: false } as Player,
    ]
    const answers = [
      { ...answer('a', 'x'), points: 30 },
      { ...answer('b', 'y'), points: 10 },
    ]
    const rows = tallyLandmineScores(answers, players)
    // Ben (alive) ranks first even with fewer points.
    expect(rows[0].id).toBe('b')
    expect(rows[1].id).toBe('a')
  })
})

describe('landmine helpers', () => {
  it('pickMines draws the requested count from the pool', () => {
    const mines = pickMines(['pencil', 'pen', 'book'], 2)
    expect(mines).toHaveLength(2)
    expect(new Set(mines).size).toBe(2)
  })

  it('pickMines prefers the least-used word so the mine varies across games', () => {
    const entries = ['apple', 'banana', 'cherry']
    const usage = { apple: 3, banana: 2 } // cherry never used → must be chosen
    for (let i = 0; i < 25; i++) {
      expect(pickMines(entries, 1, { usage })).toEqual(['cherry'])
    }
  })

  it('pickMines falls back to the full pool when there are not enough fresh words', () => {
    const entries = ['apple', 'banana', 'cherry']
    const usage = { apple: 0, banana: 5, cherry: 5 } // only 1 fresh but 2 needed
    const mines = pickMines(entries, 2, { usage })
    expect(mines).toHaveLength(2)
    expect(new Set(mines).size).toBe(2)
  })

  it('pickMines with all words equally used treats the whole pool as fresh', () => {
    const entries = ['apple', 'banana', 'cherry']
    const usage = { apple: 2, banana: 2, cherry: 2 }
    const seen = new Set<string>()
    for (let i = 0; i < 60; i++) seen.add(pickMines(entries, 1, { usage })[0]!)
    // No word is excluded once usage is level again.
    expect(seen.size).toBeGreaterThan(1)
  })

  it('reviewer assignments never map a player to themselves', () => {
    const ids = ['a', 'b', 'c', 'd']
    const map = buildReviewerAssignments(ids, 1)
    for (const id of ids) expect(map[id]).not.toBe(id)
  })
})

describe('landmine manual mode', () => {
  it('parseLandmineMineSource defaults to system, accepts manual', () => {
    expect(parseLandmineMineSource(undefined)).toBe('system')
    expect(parseLandmineMineSource('anything')).toBe('system')
    expect(parseLandmineMineSource('manual')).toBe('manual')
  })

  it('landmineAnsweringPlayerIds drops the setter only in manual mode', () => {
    const ids = ['a', 'b', 'c']
    // System mode: everyone answers (setter arg ignored).
    expect(landmineAnsweringPlayerIds(ids, 'a', false)).toEqual(['a', 'b', 'c'])
    // Manual mode: the setter sits out.
    expect(landmineAnsweringPlayerIds(ids, 'a', true)).toEqual(['b', 'c'])
    // Manual mode with no setter id: nobody dropped.
    expect(landmineAnsweringPlayerIds(ids, null, true)).toEqual(['a', 'b', 'c'])
  })

  it('manual initial round keeps the first setter out of the marking ring', () => {
    const order = ['a', 'b', 'c']
    const row = buildLandmineInitialRound({ gameId: 'G', playerOrder: order, mineCount: 1, now: 'now', manual: true })
    const meta = row.landmine_metadata as LandmineMetadata
    // 'a' is the setter → they neither mark nor are marked.
    expect(meta.reviewer_assignments.a).toBeUndefined()
    expect(Object.values(meta.reviewer_assignments)).not.toContain('a')
    // The remaining two mark each other.
    expect(Object.keys(meta.reviewer_assignments).sort()).toEqual(['b', 'c'])
  })

  it('system initial round includes the caller in the marking ring', () => {
    const order = ['a', 'b', 'c']
    const row = buildLandmineInitialRound({ gameId: 'G', playerOrder: order, mineCount: 1, now: 'now' })
    const meta = row.landmine_metadata as LandmineMetadata
    expect(Object.keys(meta.reviewer_assignments).sort()).toEqual(['a', 'b', 'c'])
  })

  it('clampLandmineRoundCount accepts manual cycle counts (1, 2) and auto counts, rejects junk', () => {
    // Manual "rounds" (cycles) can be as low as 1 — must survive the shared clamp.
    expect(clampLandmineRoundCount(1)).toBe(1)
    expect(clampLandmineRoundCount(2)).toBe(2)
    // Auto round counts still pass through.
    expect(clampLandmineRoundCount(8)).toBe(8)
    // Out-of-set values fall back to the default.
    expect(clampLandmineRoundCount(7)).toBe(5)
    expect(clampLandmineRoundCount(undefined)).toBe(5)
  })
})
