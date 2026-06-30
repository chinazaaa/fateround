import { describe, it, expect } from 'vitest'
import {
  CHECKERS_STARTING_BOARD,
  applyStep,
  captureStepsFromForTest,
  hasAnyCapture,
  hasPieces,
  legalMovesForColor,
  legalStepsFromSquare,
  pieceAt,
} from './checkers'

// A board is a 64-char string indexed by row*8 + col. Build one from a sparse map
// of `${row}${col}` -> piece char so tests read clearly.
function board(pieces: Record<string, string>): string {
  const arr = Array.from({ length: 64 }, () => '.')
  for (const [sq, ch] of Object.entries(pieces)) {
    arr[Number(sq[0]) * 8 + Number(sq[1])] = ch
  }
  return arr.join('')
}

describe('starting board', () => {
  it('seats 12 men per side on dark squares', () => {
    expect(CHECKERS_STARTING_BOARD.length).toBe(64)
    expect([...CHECKERS_STARTING_BOARD].filter((c) => c === 'r').length).toBe(12)
    expect([...CHECKERS_STARTING_BOARD].filter((c) => c === 'b').length).toBe(12)
    // Red sits on the bottom three rows, Black on the top three.
    expect(pieceAt(CHECKERS_STARTING_BOARD, '50')).toBe('r')
    expect(pieceAt(CHECKERS_STARTING_BOARD, '01')).toBe('b')
  })

  it('offers only forward simple moves from the start (no captures)', () => {
    expect(hasAnyCapture(CHECKERS_STARTING_BOARD, 'r')).toBe(false)
    // A red man on row 5 can step up to two empty row-4 dark squares.
    const moves = legalStepsFromSquare(CHECKERS_STARTING_BOARD, 'r', '52', null)
    expect(moves.map((m) => m.to).sort()).toEqual(['41', '43'])
  })
})

describe('forced capture', () => {
  it('returns only captures when one is available', () => {
    // Red man at 52, black man diagonally ahead at 43, landing 34 empty.
    const b = board({ '52': 'r', '43': 'b', '50': 'r' })
    expect(hasAnyCapture(b, 'r')).toBe(true)
    // The red man at 50 has a simple move but must not be offered one.
    const all = legalMovesForColor(b, 'r')
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ from: '52', to: '34', captured: '43' })
  })
})

describe('multi-jump chain', () => {
  it('a jump leaves more captures available from the landing square', () => {
    // Red at 52 jumps black at 43 -> lands 34, where black at 23 is jumpable -> 12.
    const b = board({ '52': 'r', '43': 'b', '23': 'b' })
    const first = legalStepsFromSquare(b, 'r', '52', null)
    expect(first).toHaveLength(1)
    const { board: afterFirst, crowned } = applyStep(b, first[0])
    expect(crowned).toBe(false)
    expect(pieceAt(afterFirst, '43')).toBe('.') // captured piece removed
    const next = captureStepsFromForTest(afterFirst, '34')
    expect(next.map((m) => m.to)).toContain('12')
  })
})

describe('crowning', () => {
  it('crowns a red man that reaches row 0', () => {
    const b = board({ '11': 'r' })
    const step = legalStepsFromSquare(b, 'r', '11', null).find((m) => m.to === '00')!
    const { board: after, crowned } = applyStep(b, step)
    expect(crowned).toBe(true)
    expect(pieceAt(after, '00')).toBe('R')
  })

  it('a king captures backward (a man cannot)', () => {
    // Red king at 34, black man behind/below at 45, landing 56 empty.
    const b = board({ '34': 'R', '45': 'b' })
    const caps = captureStepsFromForTest(b, '34')
    expect(caps.map((m) => m.to)).toContain('56')
    // A plain red man in the same spot cannot capture downward.
    const manBoard = board({ '34': 'r', '45': 'b' })
    expect(captureStepsFromForTest(manBoard, '34')).toHaveLength(0)
  })
})

describe('win / draw detection', () => {
  it('a side with no pieces has lost', () => {
    const b = board({ '52': 'r' })
    expect(hasPieces(b, 'b')).toBe(false)
    expect(hasPieces(b, 'r')).toBe(true)
  })

  it('a side with pieces but no legal move has lost', () => {
    // Black man at 00 boxed in: 11 is red, board edge otherwise. No move, no jump.
    const b = board({ '00': 'b', '11': 'r', '22': 'r' })
    expect(legalMovesForColor(b, 'b')).toHaveLength(0)
  })
})
