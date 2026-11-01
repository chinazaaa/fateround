import { describe, expect, it } from 'vitest'
import { solveLudoPuzzleSteps, type LudoPuzzlePieceState } from './ludo-puzzle-solver'
import { generateBatch } from './daily-batch-generator'

// Independent replay of the daily play rules (src/components/daily/DailyLudoPuzzlePlay.tsx):
// track 0-50, home lane entered at step 51, finish exactly on step 56, a move is forced when
// any is legal, and obstacles are captured rather than blocking.
const HOME_ENTRY = 51
const FINISH = 56
const steps = (p: LudoPuzzlePieceState) =>
  p.zone === 'base' ? -1 : p.zone === 'track' ? p.pos : p.zone === 'home' ? HOME_ENTRY + p.pos : FINISH
const legal = (p: LudoPuzzlePieceState, roll: number) =>
  p.zone !== 'finished' && (steps(p) === -1 ? roll === 6 : steps(p) + roll <= FINISH)

function replayIsAWin(start: LudoPuzzlePieceState[], dice: number[]): boolean {
  const solution = solveLudoPuzzleSteps(start, dice, [])
  if (!solution) return false
  const pieces = start.map((p) => steps(p))
  for (const step of solution) {
    const roll = dice[step.rollNumber - 1]
    const anyLegal = pieces.some((s) => legal(fromSteps(s), roll))
    if (step.pieceIndex === null) {
      if (anyLegal) return false // the game never lets you skip a roll you could use
      continue
    }
    if (!legal(fromSteps(pieces[step.pieceIndex]), roll)) return false
    pieces[step.pieceIndex] = pieces[step.pieceIndex] === -1 ? 0 : pieces[step.pieceIndex] + roll
  }
  return pieces.every((s) => s === FINISH)
}

function fromSteps(s: number): LudoPuzzlePieceState {
  if (s === -1) return { zone: 'base', pos: 0 }
  if (s < HOME_ENTRY) return { zone: 'track', pos: s }
  if (s < FINISH) return { zone: 'home', pos: s - HOME_ENTRY }
  return { zone: 'finished', pos: 0 }
}

const finished: LudoPuzzlePieceState = { zone: 'finished', pos: 0 }

describe('solveLudoPuzzleSteps follows the daily play geometry', () => {
  it('finishes a track piece on exactly step 56 (track 50 + a 6)', () => {
    const result = solveLudoPuzzleSteps([{ zone: 'track', pos: 50 }, finished, finished, finished], [6], [])
    expect(result).toHaveLength(1)
    expect(result?.[0].after).toEqual(finished)
  })

  it('rejects the puzzle CodeRabbit found: solvable on a 57-step board, unwinnable in the game', () => {
    // Track 20 needs exactly 36 more steps; these dice only make multiples of 5, or that plus 2.
    const dice = [5, 5, 5, 5, 5, 5, 5, 2, 5, 5, 5, 5, 5]
    expect(solveLudoPuzzleSteps([{ zone: 'track', pos: 20 }, finished, finished, finished], dice, [])).toBeNull()
  })

  it('lets a piece land on an obstacle (captured, not blocked)', () => {
    const start: LudoPuzzlePieceState[] = [{ zone: 'track', pos: 47 }, finished, finished, finished]
    expect(solveLudoPuzzleSteps(start, [3, 6], [{ trackPos: 50 }])).toHaveLength(2)
  })
})

describe('generated daily ludo puzzles', () => {
  const dates = Array.from({ length: 90 }, (_, i) =>
    new Date(Date.UTC(2027, 0, 1) + i * 864e5).toISOString().slice(0, 10)
  )
  const generated = generateBatch(dates, ['ludo_puzzle'], []).generated.filter((e) =>
    String(e.theme).includes('generated')
  )

  it('fills every day algorithmically', () => {
    expect(generated).toHaveLength(dates.length)
  })

  it('are winnable under the game rules, in the stated number of rolls (3-12)', () => {
    for (const entry of generated) {
      const content = entry.content as {
        startingPieces: Array<{ zone: LudoPuzzlePieceState['zone']; pos: number }>
        diceSequence: number[]
        optimalRolls: number
      }
      const start = content.startingPieces.map(({ zone, pos }) => ({ zone, pos }))
      expect(replayIsAWin(start, content.diceSequence)).toBe(true)
      expect(solveLudoPuzzleSteps(start, content.diceSequence, [])).toHaveLength(content.optimalRolls)
      expect(content.optimalRolls).toBeGreaterThanOrEqual(3)
      expect(content.optimalRolls).toBeLessThanOrEqual(12)
    }
  })
})
