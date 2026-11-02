import { describe, expect, it } from 'vitest'
import { generateLudoFromContent, generateLudoPuzzle } from './daily-ludo-puzzle'
import { solveLudoPuzzleSteps, type LudoPuzzlePieceState } from './ludo-puzzle-solver'
import { getBankStats } from './daily-batch-generator'

const fin = { zone: 'finished' as const, pos: 0 }
const home = (id: number, pos: number) => ({ id, zone: 'home' as const, pos })

describe('daily ludo target (optimalRolls)', () => {
  it('follows the forced-move rule, not free skipping', () => {
    // Two pieces at the start of the home lane (5 steps each), dice 1,5,5,4.
    // If a roll could always be skipped, the 1 would be skipped and two 5s finish both in 3 rolls.
    // In the game the 1 must be played (a piece can use it), which strands a piece: the best is 4.
    const puzzle = {
      startingPieces: [home(0, 0), home(1, 0), { id: 2, ...fin }, { id: 3, ...fin }],
      diceSequence: [1, 5, 5, 4],
      obstacles: [],
    }
    const result = generateLudoFromContent(puzzle, 1, 60)
    expect(result?.puzzleData.optimalRolls).toBe(4)
    expect(result?.puzzleData.solution.optimalRolls).toBe(4)
  })

  it('rejects curated content that cannot be won, so the caller falls back to the built-in bank', () => {
    // A track piece at 20 needs exactly 36 steps; these dice only make multiples of 5, or that plus 2.
    const unwinnable = {
      startingPieces: [
        { id: 0, zone: 'track', pos: 20 },
        { id: 1, ...fin },
        { id: 2, ...fin },
        { id: 3, ...fin },
      ],
      diceSequence: [5, 5, 5, 5, 5, 5, 5, 2, 5, 5, 5, 5, 5],
      obstacles: [],
    }
    expect(generateLudoFromContent(unwinnable, 1, 60)).toBeNull()
  })

  it('keeps an already-solved puzzle as a zero-roll puzzle rather than rejecting it', () => {
    const solved = {
      startingPieces: [0, 1, 2, 3].map((id) => ({ id, ...fin })),
      diceSequence: [3, 4],
      obstacles: [],
    }
    expect(generateLudoFromContent(solved, 1, 60)?.puzzleData.optimalRolls).toBe(0)
  })
})

describe('built-in ludo bank', () => {
  it('only serves puzzles that can be won, with a target the shared solver agrees with', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 400; seed++) {
      const { puzzleData } = generateLudoPuzzle(seed, 60)
      const key = JSON.stringify(puzzleData.startingPieces) + puzzleData.diceSequence.join()
      if (seen.has(key)) continue
      seen.add(key)
      const solution = solveLudoPuzzleSteps(
        puzzleData.startingPieces.map(({ zone, pos }): LudoPuzzlePieceState => ({ zone, pos })),
        puzzleData.diceSequence,
        puzzleData.obstacles
      )
      expect(solution, 'bank puzzle must be winnable').not.toBeNull()
      expect(solution).toHaveLength(puzzleData.optimalRolls)
    }
    expect(seen.size).toBeGreaterThan(0)
  })

  it('reports only the usable batch-generator bank puzzles', () => {
    const { ludoPuzzles } = getBankStats()
    expect(ludoPuzzles).toBeGreaterThan(0)
    expect(ludoPuzzles).toBeLessThanOrEqual(40)
  })
})
