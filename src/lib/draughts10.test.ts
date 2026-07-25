import { describe, it, expect } from 'vitest'
import {
  DRAUGHTS10_STARTING_BOARD,
  applyStep,
  captureStepsFromForTest,
  hasAnyCapture,
  hasPieces,
  legalMovesForColor,
  legalStepsFromSquare,
  maxChainLength,
  pieceAt,
} from './draughts10'

// A board is a 100-char string indexed by row*10 + col. Build one from a sparse
// map of `${row}${col}` -> piece char so tests read clearly. Only dark squares
// ((row+col) odd) are ever legal piece positions, same as the real engine.
function board(pieces: Record<string, string>): string {
  const arr = Array.from({ length: 100 }, () => '.')
  for (const [sq, ch] of Object.entries(pieces)) {
    arr[Number(sq[0]) * 10 + Number(sq[1])] = ch
  }
  return arr.join('')
}

describe('starting board', () => {
  it('seats 20 men per side on dark squares', () => {
    expect(DRAUGHTS10_STARTING_BOARD.length).toBe(100)
    expect([...DRAUGHTS10_STARTING_BOARD].filter((c) => c === 'r').length).toBe(20)
    expect([...DRAUGHTS10_STARTING_BOARD].filter((c) => c === 'b').length).toBe(20)
    expect(pieceAt(DRAUGHTS10_STARTING_BOARD, '61')).toBe('r')
    expect(pieceAt(DRAUGHTS10_STARTING_BOARD, '01')).toBe('b')
  })

  it('offers only forward simple moves from the start (no captures)', () => {
    expect(hasAnyCapture(DRAUGHTS10_STARTING_BOARD, 'r')).toBe(false)
    expect(hasAnyCapture(DRAUGHTS10_STARTING_BOARD, 'b')).toBe(false)
  })
})

describe('bidirectional man capture (differs from American)', () => {
  it('a man captures backward, not just forward', () => {
    // Red man at 34 (Red advances toward row 0), black man behind/below it at 45,
    // landing 56 empty — a backward capture, illegal for a man in American rules.
    const b = board({ '34': 'r', '45': 'b' })
    const caps = captureStepsFromForTest(b, '34')
    expect(caps.map((m) => m.to)).toContain('56')
  })
})

describe('flying king', () => {
  it('slides any distance along an open diagonal for a simple move', () => {
    const b = board({ '81': 'R' })
    const moves = legalStepsFromSquare(b, 'r', '81', null, null)
    expect(moves.map((m) => m.to)).toEqual(expect.arrayContaining(['72', '63', '54', '45', '36', '27', '18', '09']))
  })

  it('captures the first enemy piece met and can land on any empty square beyond it', () => {
    const b = board({ '01': 'R', '34': 'b' })
    const caps = captureStepsFromForTest(b, '01')
    expect(caps.map((m) => m.to)).toEqual(expect.arrayContaining(['45', '56', '67', '78', '89']))
    expect(caps.every((m) => m.captured === '34')).toBe(true)
  })

  it('cannot land beyond a second piece blocking the line', () => {
    const b = board({ '01': 'R', '34': 'b', '67': 'r' })
    const caps = captureStepsFromForTest(b, '01')
    expect(caps.map((m) => m.to)).toEqual(['45', '56'])
  })
})

describe('majority-capture rule', () => {
  // Single-capture piece: 61 jumps black at 52, lands 43.
  // Double-capture piece: 90 jumps black at 81 (lands 72), then black at 63 (lands 54).
  const b = board({ '61': 'r', '52': 'b', '90': 'r', '81': 'b', '63': 'b' })

  it("computes each piece's max chain length", () => {
    expect(maxChainLength(b, '61')).toBe(1)
    expect(maxChainLength(b, '90')).toBe(2)
  })

  it('only offers the sequence that captures the most pieces', () => {
    // The single-capture piece has no legal moves — majority rule forces the longer chain.
    expect(legalStepsFromSquare(b, 'r', '61', null, null)).toHaveLength(0)
    const fromNinety = legalStepsFromSquare(b, 'r', '90', null, null)
    expect(fromNinety.map((m) => m.to)).toEqual(['72'])

    const all = legalMovesForColor(b, 'r')
    expect(all.every((m) => m.from === '90')).toBe(true)
  })

  it('continuing a chain only allows hops that keep it on the maximal path', () => {
    const first = legalStepsFromSquare(b, 'r', '90', null, null)[0]
    expect(first.to).toBe('72')
    const { board: afterFirst } = applyStep(b, first, false)
    const remaining = maxChainLength(afterFirst, '72')
    expect(remaining).toBe(1)
    const next = legalStepsFromSquare(afterFirst, 'r', '72', '72', remaining)
    expect(next.map((m) => m.to)).toEqual(['54'])
  })
})

describe('crowning deferred until the chain ends', () => {
  it('does not crown mid-sequence even when the chain passes through the far row', () => {
    // Red man at 21 jumps black at 12, lands on 03 (row 0, Red's far row) — but a
    // further capture is available from 03 (black at 14), so it must NOT crown yet.
    const b = board({ '21': 'r', '12': 'b', '14': 'b' })
    const first = legalStepsFromSquare(b, 'r', '21', null, null)[0]
    expect(first.to).toBe('03')
    const remaining = maxChainLength(applyStep(b, first, false).board, '03')
    expect(remaining).toBeGreaterThan(0)
    const { board: afterFirst } = applyStep(b, first, remaining === 0)
    expect(pieceAt(afterFirst, '03')).toBe('r') // still a man — not crowned mid-chain
  })

  it('crowns once a sequence actually ends on the far row', () => {
    const b = board({ '21': 'r', '12': 'b' })
    const step = legalStepsFromSquare(b, 'r', '21', null, null)[0]
    const remaining = maxChainLength(applyStep(b, step, false).board, step.to)
    expect(remaining).toBe(0)
    const { board: after } = applyStep(b, step, true)
    expect(pieceAt(after, step.to)).toBe('R')
  })
})

describe('win / draw detection', () => {
  it('a side with no pieces has lost', () => {
    const b = board({ '61': 'r' })
    expect(hasPieces(b, 'b')).toBe(false)
    expect(hasPieces(b, 'r')).toBe(true)
  })

  it('a side with pieces but no legal move has lost', () => {
    // Black at the 09 corner has only one forward diagonal (18); a red man
    // sits there and another blocks the capture-landing square beyond it (27),
    // so there's no simple move and no legal capture either.
    const b = board({ '09': 'b', '18': 'r', '27': 'r' })
    expect(legalMovesForColor(b, 'b')).toHaveLength(0)
  })
})
