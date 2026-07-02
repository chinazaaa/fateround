import type { ChessColor } from '@/types'

export type PremovePiece = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

export type Premove = { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }

const FILES = 'abcdefgh'

function square(file: number, rank: number): string | null {
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null
  return `${FILES[file]}${rank}`
}

function push(set: Set<string>, file: number, rank: number): void {
  const sq = square(file, rank)
  if (sq) set.add(sq)
}

function ray(set: Set<string>, file: number, rank: number, df: number, dr: number): void {
  let f = file + df
  let r = rank + dr
  while (f >= 0 && f <= 7 && r >= 1 && r <= 8) {
    set.add(`${FILES[f]}${r}`)
    f += df
    r += dr
  }
}

const KNIGHT_JUMPS = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
] as const

const DIAGONALS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const

const ORTHOGONALS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/**
 * Squares a piece could reach from `from` on an otherwise-empty board — the
 * lichess-style premove rule. Occupancy, checks, and pins are deliberately
 * ignored: the queued move is re-validated against the real position once it
 * becomes the player's turn, and silently dropped if it turned out illegal.
 */
export function premoveTargets(from: string, type: PremovePiece, color: ChessColor): Set<string> {
  const targets = new Set<string>()
  const file = FILES.indexOf(from[0])
  const rank = Number(from[1])
  if (file < 0 || Number.isNaN(rank) || rank < 1 || rank > 8) return targets

  switch (type) {
    case 'p': {
      const dir = color === 'w' ? 1 : -1
      push(targets, file, rank + dir)
      if (rank === (color === 'w' ? 2 : 7)) push(targets, file, rank + 2 * dir)
      // Diagonal captures are always offered — the capturable piece may only
      // arrive there once the opponent moves.
      push(targets, file - 1, rank + dir)
      push(targets, file + 1, rank + dir)
      break
    }
    case 'n':
      for (const [df, dr] of KNIGHT_JUMPS) push(targets, file + df, rank + dr)
      break
    case 'b':
      for (const [df, dr] of DIAGONALS) ray(targets, file, rank, df, dr)
      break
    case 'r':
      for (const [df, dr] of ORTHOGONALS) ray(targets, file, rank, df, dr)
      break
    case 'q':
      for (const [df, dr] of [...DIAGONALS, ...ORTHOGONALS]) ray(targets, file, rank, df, dr)
      break
    case 'k': {
      for (const [df, dr] of [...DIAGONALS, ...ORTHOGONALS]) push(targets, file + df, rank + dr)
      // Castling premoves: king on its home square can queue the two-square hop.
      if (from === (color === 'w' ? 'e1' : 'e8')) {
        push(targets, file - 2, rank)
        push(targets, file + 2, rank)
      }
      break
    }
  }

  targets.delete(from)
  return targets
}

/** Whether a queued pawn move would land on the last rank and needs a promotion choice. */
export function premoveNeedsPromotion(to: string, type: PremovePiece, color: ChessColor): boolean {
  return type === 'p' && to[1] === (color === 'w' ? '8' : '1')
}
