import { describe, it, expect } from 'vitest'
import { computeRoundResults, tallyLandmineScores, pickMines, buildReviewerAssignments } from './landmine'
import type { LandmineAnswer, LandmineMark, Player } from '@/types'

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

  it('voided answers score 0 regardless of the mine', () => {
    const answers = [answer('a', 'bathtub')]
    const marks = [mark('x', 'a', false)]
    const results = computeRoundResults(answers, marks, ['pencil'], { originalityBonus: true })
    expect(results[0].outcome).toBe('void')
    expect(results[0].points).toBe(0)
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

  it('reviewer assignments never map a player to themselves', () => {
    const ids = ['a', 'b', 'c', 'd']
    const map = buildReviewerAssignments(ids, 1)
    for (const id of ids) expect(map[id]).not.toBe(id)
  })
})
