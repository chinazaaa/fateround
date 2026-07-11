import type { TicTacToeBoardResult, TicTacToeMark, TicTacToeSession } from './types'

const WIN_LINES: readonly number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

export function subBoardCells(board: (TicTacToeMark | null)[], boardIndex: number): (TicTacToeMark | null)[] {
  return board.slice(boardIndex * 9, boardIndex * 9 + 9)
}

export function checkOverallWinner(
  boardWinners: TicTacToeBoardResult[]
): { mark: TicTacToeMark; line: number[] } | null {
  const marks = boardWinners.map((w) => (w === 'X' || w === 'O' ? w : null))
  for (const line of WIN_LINES) {
    const [a, b, c] = line
    const mark = marks[a!]
    if (mark && mark === marks[b!] && mark === marks[c!]) {
      return { mark, line }
    }
  }
  return null
}

export function markForPlayer(session: TicTacToeSession, playerId: string): TicTacToeMark | null {
  if (session.player_x_id === playerId) return 'X'
  if (session.player_o_id === playerId) return 'O'
  return null
}

export function currentTurnPlayerId(session: TicTacToeSession): string {
  return session.current_turn_mark === 'X' ? session.player_x_id : session.player_o_id
}

export function boardInPlay(session: TicTacToeSession, boardIndex: number): boolean {
  if (session.status === 'finished') return false
  if (session.board_winners[boardIndex] != null) return false
  return session.active_board == null || session.active_board === boardIndex
}
