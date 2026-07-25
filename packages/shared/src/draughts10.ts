import type { CheckersColor, Draughts10Session } from './types'

// International / Nigerian draughts pure rules — mobile's client-side legality
// layer, mirroring the mobile Checkers pattern (packages/shared/src/checkers.ts)
// but for the 10×10 "flying kings" engine. This is a duplicate, hand-mirrored
// port of src/lib/draughts10.ts's pure board helpers (web is the source of
// truth for rules) — see the "Web/shared parallel copies" note. The server
// (src/lib/draughts10.ts via the checkers-international/checkers-nigeria API
// routes) is still authoritative; this only drives which squares the mobile
// board highlights as legal before a tap is sent.

const BOARD_SIZE = 10
const ALL_DIAGONALS: Array<[number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]

function parseSquare(sq: string): [number, number] {
  return [Number(sq[0]), Number(sq[1])]
}

export function squareId(row: number, col: number): string {
  return `${row}${col}`
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE
}

export function isDarkSquare(row: number, col: number): boolean {
  return (row + col) % 2 === 1
}

function idx(row: number, col: number): number {
  return row * BOARD_SIZE + col
}

export function pieceAt(board: string, row: number, col: number): string {
  return board[idx(row, col)] ?? '.'
}

export function pieceAtSquare(board: string, sq: string): string {
  const [r, c] = parseSquare(sq)
  return pieceAt(board, r, c)
}

export function colorOfPiece(piece: string): CheckersColor | null {
  if (piece === 'r' || piece === 'R') return 'r'
  if (piece === 'b' || piece === 'B') return 'b'
  return null
}

function isKing(piece: string): boolean {
  return piece === 'R' || piece === 'B'
}

function forwardDirections(color: CheckersColor): Array<[number, number]> {
  return color === 'r'
    ? [
        [-1, -1],
        [-1, 1],
      ]
    : [
        [1, -1],
        [1, 1],
      ]
}

export type Draughts10Step = { from: string; to: string; captured: string | null }

function simpleStepsFrom(board: string, sq: string): Draughts10Step[] {
  const piece = pieceAtSquare(board, sq)
  const color = colorOfPiece(piece)
  if (!color) return []
  const [r, c] = parseSquare(sq)
  const steps: Draughts10Step[] = []
  const king = isKing(piece)
  const dirs = king ? ALL_DIAGONALS : forwardDirections(color)
  for (const [dr, dc] of dirs) {
    let tr = r + dr
    let tc = c + dc
    while (inBounds(tr, tc) && board[idx(tr, tc)] === '.') {
      steps.push({ from: sq, to: squareId(tr, tc), captured: null })
      if (!king) break
      tr += dr
      tc += dc
    }
  }
  return steps
}

function captureStepsFrom(board: string, sq: string): Draughts10Step[] {
  const piece = pieceAtSquare(board, sq)
  const color = colorOfPiece(piece)
  if (!color) return []
  const [r, c] = parseSquare(sq)
  const king = isKing(piece)
  const steps: Draughts10Step[] = []
  for (const [dr, dc] of ALL_DIAGONALS) {
    if (!king) {
      const mr = r + dr
      const mc = c + dc
      const lr = r + dr * 2
      const lc = c + dc * 2
      if (!inBounds(lr, lc)) continue
      const midColor = colorOfPiece(board[idx(mr, mc)] ?? '.')
      if (midColor && midColor !== color && board[idx(lr, lc)] === '.') {
        steps.push({ from: sq, to: squareId(lr, lc), captured: squareId(mr, mc) })
      }
      continue
    }
    let mr = r + dr
    let mc = c + dc
    while (inBounds(mr, mc) && board[idx(mr, mc)] === '.') {
      mr += dr
      mc += dc
    }
    if (!inBounds(mr, mc)) continue
    const midColor = colorOfPiece(board[idx(mr, mc)] ?? '.')
    if (!midColor || midColor === color) continue
    let lr = mr + dr
    let lc = mc + dc
    while (inBounds(lr, lc) && board[idx(lr, lc)] === '.') {
      steps.push({ from: sq, to: squareId(lr, lc), captured: squareId(mr, mc) })
      lr += dr
      lc += dc
    }
  }
  return steps
}

export function hasAnyCapture(board: string, color: CheckersColor): boolean {
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (!isDarkSquare(r, c)) continue
      if (colorOfPiece(board[idx(r, c)] ?? '.') === color && captureStepsFrom(board, squareId(r, c)).length > 0) {
        return true
      }
    }
  }
  return false
}

export function hasPieces(board: string, color: CheckersColor): boolean {
  for (const ch of board) if (colorOfPiece(ch) === color) return true
  return false
}

function applyStepRaw(board: string, step: Draughts10Step): string {
  const arr = board.split('')
  const piece = pieceAtSquare(board, step.from)
  const [fr, fc] = parseSquare(step.from)
  const [tr, tc] = parseSquare(step.to)
  arr[idx(fr, fc)] = '.'
  if (step.captured) {
    const [cr, cc] = parseSquare(step.captured)
    arr[idx(cr, cc)] = '.'
  }
  arr[idx(tr, tc)] = piece
  return arr.join('')
}

/**
 * Max additional captures achievable in a single sequence starting at `sq`.
 * Small bounded recursion, same as the web engine.
 */
export function maxChainLength(board: string, sq: string): number {
  const options = captureStepsFrom(board, sq)
  if (options.length === 0) return 0
  let best = 0
  for (const step of options) {
    const next = applyStepRaw(board, step)
    const rest = maxChainLength(next, step.to)
    if (1 + rest > best) best = 1 + rest
  }
  return best
}

/**
 * Legal hops for the piece on `square`, honoring forced-capture AND the
 * majority-capture rule, mirroring src/lib/draughts10.ts's
 * legalStepsFromSquare exactly.
 */
export function legalStepsFromSquare(
  board: string,
  color: CheckersColor,
  square: string,
  mustContinue: string | null,
  mustRemaining: number | null = null
): Draughts10Step[] {
  if (mustContinue) {
    if (square !== mustContinue || mustRemaining == null) return []
    return captureStepsFrom(board, square).filter((s) => {
      const next = applyStepRaw(board, s)
      return maxChainLength(next, s.to) === mustRemaining - 1
    })
  }
  if (colorOfPiece(pieceAtSquare(board, square)) !== color) return []
  if (!hasAnyCapture(board, color)) return simpleStepsFrom(board, square)

  let globalMax = 0
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (!isDarkSquare(r, c)) continue
      const sq = squareId(r, c)
      if (colorOfPiece(board[idx(r, c)] ?? '.') === color) {
        const len = maxChainLength(board, sq)
        if (len > globalMax) globalMax = len
      }
    }
  }
  return captureStepsFrom(board, square).filter((s) => {
    const next = applyStepRaw(board, s)
    return 1 + maxChainLength(next, s.to) === globalMax
  })
}

export function currentTurnPlayerId(session: Draughts10Session): string {
  return session.current_turn === 'r' ? session.player_red_id : session.player_black_id
}

export function colorForPlayer(session: Draughts10Session, playerId: string): CheckersColor | null {
  if (session.player_red_id === playerId) return 'r'
  if (session.player_black_id === playerId) return 'b'
  return null
}

export function playerIdForColor(session: Draughts10Session, color: CheckersColor): string {
  return color === 'r' ? session.player_red_id : session.player_black_id
}

/** True when the match is timed (both players have a clock budget). */
export function draughts10IsTimed(session: Pick<Draughts10Session, 'red_time_ms' | 'black_time_ms'>): boolean {
  return session.red_time_ms != null && session.black_time_ms != null
}

/** Short human-readable phrase for how a finished game ended. */
export function draughts10ResultDetail(reason: string | null | undefined): string {
  switch (reason) {
    case 'capture_all':
      return 'All pieces captured'
    case 'no_moves':
      return 'No legal moves'
    case 'timeout':
      return 'Out of time'
    case 'resignation':
      return 'Resigned'
    case 'draw_moves':
      return '25-move draw rule'
    case 'threefold':
      return 'Draw by repetition'
    default:
      return ''
  }
}

/** "man"/"piece" for International, "seed" for Nigeria — a display-only terminology swap. */
export function draughts10PieceWord(variant: 'international' | 'nigeria'): string {
  return variant === 'nigeria' ? 'seed' : 'piece'
}
