import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * Ultimate Tic-Tac-Toe per-game facts, derived at finish from `tic_tac_toe_sessions`.
 *
 * The full board (81 cells) and 9 sub-board winners are persisted, so we can derive:
 * - sub-boards won per player
 * - whether specific boards (centre, corners) were won
 * - move counts (cells filled by each mark)
 * - diagonal wins
 * - domination (opponent won zero boards)
 */

type SessionRow = {
  player_x_id: string
  player_o_id: string
  board: (string | null)[]
  board_winners: (string | null)[]
  winner_player_id: string | null
  is_draw: boolean
}

type Mark = 'X' | 'O'

const CORNER_BOARDS = [0, 2, 6, 8]
const CENTRE_BOARD = 4
const DIAGONALS = [
  [0, 4, 8],
  [2, 4, 6],
]

function countSubBoardsWon(boardWinners: (string | null)[], mark: Mark): number {
  return boardWinners.filter((w) => w === mark).length
}

function countMoves(board: (string | null)[], mark: Mark): number {
  return board.filter((c) => c === mark).length
}

export async function ticTacToeFacts(
  supabase: SupabaseClient,
  gameId: string,
  _ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const { data } = await supabase
    .from('tic_tac_toe_sessions')
    .select('player_x_id, player_o_id, board, board_winners, winner_player_id, is_draw')
    .eq('game_id', gameId)
    .maybeSingle()

  if (!data) return out
  const s = data as SessionRow
  const board = s.board ?? []
  const bw = s.board_winners ?? []

  const players: { id: string; mark: Mark; oppMark: Mark }[] = [
    { id: s.player_x_id, mark: 'X', oppMark: 'O' },
    { id: s.player_o_id, mark: 'O', oppMark: 'X' },
  ]

  for (const p of players) {
    const facts: Record<string, number> = {}
    const won = s.winner_player_id === p.id
    const subWon = countSubBoardsWon(bw, p.mark)
    const oppSubWon = countSubBoardsWon(bw, p.oppMark)
    const myMoves = countMoves(board, p.mark)

    // Lifetime tallies
    if (subWon > 0) facts.ttt_sub_boards_won = subWon

    // Per-game flags
    if (s.is_draw) facts.ttt_draws = 1
    if (subWon >= 2) facts.ttt_two_boards_games = 1
    if (bw[CENTRE_BOARD] === p.mark) facts.ttt_centre_board_games = 1

    // Two corner boards
    const cornersWon = CORNER_BOARDS.filter((i) => bw[i] === p.mark).length
    if (cornersWon >= 2) facts.ttt_two_corners_games = 1

    // Sent opponent to an already-decided board: we can detect this from the board state
    // by checking if any of my moves landed in a sub-board that was already won/drawn at the time.
    // Approximation: count sub-boards where opponent has moves AND the board was decided for me.
    // Actually, we can check: for each sub-board I won, did the opponent also play there after?
    // This is hard to reconstruct from final state alone. Use a simpler proxy:
    // if I won a sub-board and the opponent has cells in the corresponding target boards.
    // For now, emit 1 if there are any decided boards the opponent has moves in (they were sent there).
    let sentToWon = 0
    for (let b = 0; b < 9; b++) {
      if (bw[b] !== null) {
        // Check if opponent has any moves in this decided board
        const oppMovesInBoard = Array.from({ length: 9 }, (_, i) => board[b * 9 + i]).filter(
          (c) => c === p.oppMark
        ).length
        if (oppMovesInBoard > 0 && bw[b] === p.mark) sentToWon++
      }
    }
    if (sentToWon > 0) facts.ttt_sent_to_won_board = 1

    // Win-gated flags
    if (won) {
      // Clean sweep: won 3+ sub-boards without losing one
      if (subWon >= 3 && oppSubWon === 0) facts.ttt_clean_sweep_games = 1

      // Quick win: 20 or fewer total moves (both players combined)
      const totalMoves = board.filter((c) => c !== null).length
      if (totalMoves <= 20) facts.ttt_quick_wins = 1

      // Diagonal win: check if winning line is a diagonal of sub-boards
      for (const diag of DIAGONALS) {
        if (diag.every((i) => bw[i] === p.mark)) {
          facts.ttt_diagonal_wins = 1
          break
        }
      }

      // Untouched: opponent won zero sub-boards
      if (oppSubWon === 0) facts.ttt_untouched_wins = 1
    }

    if (Object.keys(facts).length) out.set(p.id, facts)
  }

  return out
}
