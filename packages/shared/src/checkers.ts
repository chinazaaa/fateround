import type { CheckersColor, CheckersSession } from './types'

export function currentTurnPlayerId(session: CheckersSession): string {
  return session.current_turn === 'r' ? session.player_red_id : session.player_black_id
}

export function colorForPlayer(session: CheckersSession, playerId: string): CheckersColor | null {
  if (session.player_red_id === playerId) return 'r'
  if (session.player_black_id === playerId) return 'b'
  return null
}

export function isDarkSquare(row: number, col: number): boolean {
  return (row + col) % 2 === 1
}

export function pieceAt(board: string, row: number, col: number): string {
  return board[row * 8 + col] ?? '.'
}

export function squareId(row: number, col: number): string {
  return `${row}${col}`
}

function parseSquare(sq: string): [number, number] {
  return [Number(sq[0]), Number(sq[1])]
}

function idx(row: number, col: number): number {
  return row * 8 + col
}

export function pieceAtSquare(board: string, sq: string): string {
  const [r, c] = parseSquare(sq)
  return board[idx(r, c)] ?? '.'
}

export function colorOfPiece(piece: string): CheckersColor | null {
  if (piece === 'r' || piece === 'R') return 'r'
  if (piece === 'b' || piece === 'B') return 'b'
  return null
}

function isKing(piece: string): boolean {
  return piece === 'R' || piece === 'B'
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8
}

function directionsFor(color: CheckersColor, king: boolean): Array<[number, number]> {
  if (king) {
    return [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]
  }
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

export type CheckersStep = { from: string; to: string; captured: string | null }

function captureStepsFrom(board: string, sq: string): CheckersStep[] {
  const piece = pieceAtSquare(board, sq)
  const color = colorOfPiece(piece)
  if (!color) return []
  const [r, c] = parseSquare(sq)
  const steps: CheckersStep[] = []
  for (const [dr, dc] of directionsFor(color, isKing(piece))) {
    const mr = r + dr
    const mc = c + dc
    const lr = r + dr * 2
    const lc = c + dc * 2
    if (!inBounds(lr, lc)) continue
    const midColor = colorOfPiece(board[idx(mr, mc)] ?? '.')
    if (midColor && midColor !== color && board[idx(lr, lc)] === '.') {
      steps.push({ from: sq, to: squareId(lr, lc), captured: squareId(mr, mc) })
    }
  }
  return steps
}

function simpleStepsFrom(board: string, sq: string): CheckersStep[] {
  const piece = pieceAtSquare(board, sq)
  const color = colorOfPiece(piece)
  if (!color) return []
  const [r, c] = parseSquare(sq)
  const steps: CheckersStep[] = []
  for (const [dr, dc] of directionsFor(color, isKing(piece))) {
    const tr = r + dr
    const tc = c + dc
    if (inBounds(tr, tc) && board[idx(tr, tc)] === '.') {
      steps.push({ from: sq, to: squareId(tr, tc), captured: null })
    }
  }
  return steps
}

export function hasAnyCapture(board: string, color: CheckersColor): boolean {
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      if (!isDarkSquare(r, c)) continue
      if (colorOfPiece(board[idx(r, c)] ?? '.') === color && captureStepsFrom(board, squareId(r, c)).length > 0) {
        return true
      }
    }
  }
  return false
}

export function legalStepsFromSquare(
  board: string,
  color: CheckersColor,
  square: string,
  mustContinue: string | null
): CheckersStep[] {
  if (mustContinue) {
    return square === mustContinue ? captureStepsFrom(board, square) : []
  }
  if (colorOfPiece(pieceAtSquare(board, square)) !== color) return []
  if (hasAnyCapture(board, color)) return captureStepsFrom(board, square)
  return simpleStepsFrom(board, square)
}

export function legalMovesForColor(
  board: string,
  color: CheckersColor,
  mustContinue: string | null = null
): CheckersStep[] {
  if (mustContinue) return captureStepsFrom(board, mustContinue)
  const all: CheckersStep[] = []
  const forced = hasAnyCapture(board, color)
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      if (!isDarkSquare(r, c)) continue
      const sq = squareId(r, c)
      if (colorOfPiece(board[idx(r, c)] ?? '.') !== color) continue
      all.push(...(forced ? captureStepsFrom(board, sq) : simpleStepsFrom(board, sq)))
    }
  }
  return all
}
