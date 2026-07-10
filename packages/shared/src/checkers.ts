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
