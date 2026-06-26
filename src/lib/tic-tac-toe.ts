import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import type { TicTacToeBoardResult, TicTacToeMark, TicTacToeSession } from '@/types'

export const TIC_TAC_TOE_MIN_PLAYERS = 2
export const TIC_TAC_TOE_MAX_PLAYERS = 2
export const TIC_TAC_TOE_DEFAULT_MAX_PLAYERS = 2

/** Ultimate Tic-Tac-Toe: nine 3x3 sub-boards (81 cells total). */
export const TIC_TAC_TOE_SUB_BOARDS = 9
export const TIC_TAC_TOE_CELLS = 81

const EMPTY_BOARD: (TicTacToeMark | null)[] = Array(TIC_TAC_TOE_CELLS).fill(null)
const EMPTY_BOARD_WINNERS: TicTacToeBoardResult[] = Array(TIC_TAC_TOE_SUB_BOARDS).fill(null)

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

/** Cells belonging to sub-board `boardIndex` (0-8), in row-major order. */
export function subBoardCells(board: (TicTacToeMark | null)[], boardIndex: number): (TicTacToeMark | null)[] {
  return board.slice(boardIndex * 9, boardIndex * 9 + 9)
}

/** Overall game winner — three sub-boards won by the same mark in a row. */
export function checkOverallWinner(
  boardWinners: TicTacToeBoardResult[]
): { mark: TicTacToeMark; line: number[] } | null {
  const marks = boardWinners.map((w) => (w === 'X' || w === 'O' ? w : null))
  return checkWinner(marks)
}

/** True once every sub-board has been decided (won or drawn). */
export function isUltimateBoardComplete(boardWinners: TicTacToeBoardResult[]): boolean {
  return boardWinners.length === TIC_TAC_TOE_SUB_BOARDS && boardWinners.every((w) => w !== null)
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function checkWinner(board: (TicTacToeMark | null)[]): { mark: TicTacToeMark; line: number[] } | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line
    const mark = board[a!]
    if (mark && mark === board[b!] && mark === board[c!]) {
      return { mark, line }
    }
  }
  return null
}

export function isBoardFull(board: (TicTacToeMark | null)[]): boolean {
  return board.every((cell) => cell !== null)
}

export function ticTacToeTurnDeadline(timerSeconds: number): string | null {
  if (!timerSeconds || timerSeconds <= 0) return null
  return new Date(Date.now() + timerSeconds * 1000).toISOString()
}

export function markForPlayer(session: TicTacToeSession, playerId: string): TicTacToeMark | null {
  if (session.player_x_id === playerId) return 'X'
  if (session.player_o_id === playerId) return 'O'
  return null
}

export function currentTurnPlayerId(session: TicTacToeSession): string {
  return session.current_turn_mark === 'X' ? session.player_x_id : session.player_o_id
}

/** True when the host can reset the room for another round. */
export async function canTicTacToePlayAgain(
  supabase: SupabaseClient,
  gameId: string,
  gameStatus: string
): Promise<boolean> {
  if (gameStatus === 'waiting' || gameStatus === 'finished') return true
  if (gameStatus !== 'active') return false

  const { data: session } = await supabase
    .from('tic_tac_toe_sessions')
    .select('status')
    .eq('game_id', gameId)
    .maybeSingle()

  return session?.status === 'finished'
}

export function isTicTacToeResultsPhase(
  gameStatus: string | undefined,
  session: Pick<TicTacToeSession, 'status' | 'is_draw' | 'winner_player_id' | 'board_winners'> | null | undefined
): boolean {
  if (!gameStatus || gameStatus === 'waiting') return false
  if (gameStatus === 'finished') return true
  if (!session) return false
  if (session.status === 'finished' || session.is_draw || session.winner_player_id) return true
  const boardWinners = session.board_winners ?? []
  if (checkOverallWinner(boardWinners) || isUltimateBoardComplete(boardWinners)) return true
  return false
}

export async function initializeTicTacToeGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<{ error?: string }> {
  if (playerIds.length !== TIC_TAC_TOE_MIN_PLAYERS) {
    return { error: `Need exactly ${TIC_TAC_TOE_MIN_PLAYERS} players to start` }
  }

  const { data: existing } = await supabase
    .from('tic_tac_toe_sessions')
    .select('player_x_id, player_o_id')
    .eq('game_id', gameId)
    .maybeSingle()

  let playerXId: string
  let playerOId: string

  if (existing) {
    // Rematch: swap X/O so the player who went second last game starts as X.
    playerXId = existing.player_o_id
    playerOId = existing.player_x_id
    if (!playerIds.includes(playerXId) || !playerIds.includes(playerOId)) {
      ;[playerXId, playerOId] = shuffle(playerIds)
    }
  } else {
    ;[playerXId, playerOId] = shuffle(playerIds)
  }

  if (!playerXId || !playerOId) return { error: 'Need exactly 2 players to start' }

  const { data: gameRow } = await supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle()
  const timerSeconds = gameRow?.timer_seconds ?? 0

  const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
  const names = new Map<string, string>()
  for (const p of playerRows ?? []) names.set(p.id, p.name)

  const sessionRow = {
    player_x_id: playerXId,
    player_o_id: playerOId,
    board: EMPTY_BOARD,
    board_winners: EMPTY_BOARD_WINNERS,
    active_board: null,
    current_turn_mark: 'X' as const,
    status: 'active' as const,
    winner_player_id: null,
    is_draw: false,
    status_message: `${names.get(playerXId) ?? 'Player'}'s turn (X)`,
    turn_deadline_at: ticTacToeTurnDeadline(timerSeconds),
    updated_at: new Date().toISOString(),
  }

  const { error } = existing
    ? await supabase.from('tic_tac_toe_sessions').update(sessionRow).eq('game_id', gameId)
    : await supabase.from('tic_tac_toe_sessions').insert({ ...sessionRow, game_id: gameId })
  if (error) return { error: error.message }
  return {}
}

async function loadSession(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ session: TicTacToeSession | null; error?: string }> {
  const { data, error } = await supabase.from('tic_tac_toe_sessions').select('*').eq('game_id', gameId).maybeSingle()
  if (error) return { session: null, error: error.message }
  return { session: data as TicTacToeSession | null }
}

export async function processTicTacToeMove(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  cellIndex: number
): Promise<{ error?: string }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.status === 'finished') return { error: 'Game already finished' }

  const mark = markForPlayer(session, playerId)
  if (!mark) return { error: 'You are not in this game' }
  if (mark !== session.current_turn_mark) return { error: "It's not your turn" }
  if (cellIndex < 0 || cellIndex >= TIC_TAC_TOE_CELLS) return { error: 'Invalid cell' }

  const boardIndex = Math.floor(cellIndex / 9)
  const cellPos = cellIndex % 9

  const boardWinners: TicTacToeBoardResult[] = [...(session.board_winners ?? EMPTY_BOARD_WINNERS)]

  if (session.active_board != null && boardIndex !== session.active_board) {
    return { error: 'You must play in the highlighted board' }
  }
  if (boardWinners[boardIndex] != null) return { error: 'That board is already finished' }
  if (session.board[cellIndex] !== null) return { error: 'That cell is already taken' }

  const board = [...session.board]
  board[cellIndex] = mark

  // Re-evaluate the sub-board that was just played in.
  const subBoard = subBoardCells(board, boardIndex)
  const subWin = checkWinner(subBoard)
  if (subWin) boardWinners[boardIndex] = mark
  else if (isBoardFull(subBoard)) boardWinners[boardIndex] = 'draw'

  // The cell position you played dictates which board your opponent is sent to.
  // If that board is already decided, they may play anywhere.
  const nextActiveBoard = boardWinners[cellPos] != null ? null : cellPos

  const overallWin = checkOverallWinner(boardWinners)
  const draw = !overallWin && isUltimateBoardComplete(boardWinners)

  const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
  const names = new Map<string, string>()
  for (const p of playerRows ?? []) names.set(p.id, p.name)

  const nextMark: TicTacToeMark = mark === 'X' ? 'O' : 'X'
  const winnerPlayerId = overallWin ? (overallWin.mark === 'X' ? session.player_x_id : session.player_o_id) : null

  const { data: gameRow } = await supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle()
  const timerSeconds = gameRow?.timer_seconds ?? 0

  const statusMessage = overallWin
    ? `${names.get(winnerPlayerId!) ?? 'Player'} wins!`
    : draw
      ? "It's a draw!"
      : `${names.get(nextMark === 'X' ? session.player_x_id : session.player_o_id) ?? 'Player'}'s turn (${nextMark})`

  const finished = !!overallWin || draw

  const { error: updateError } = await supabase
    .from('tic_tac_toe_sessions')
    .update({
      board,
      board_winners: boardWinners,
      active_board: finished ? null : nextActiveBoard,
      current_turn_mark: nextMark,
      status: finished ? 'finished' : 'active',
      winner_player_id: winnerPlayerId,
      is_draw: draw,
      status_message: statusMessage,
      turn_deadline_at: finished ? null : ticTacToeTurnDeadline(timerSeconds),
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  if (updateError) return { error: updateError.message }

  if (finished) {
    await markGameFinished(supabase, gameId)
  }

  return {}
}

export async function processTicTacToeExpireTurn(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.status === 'finished') return {}
  if (!session.turn_deadline_at || new Date(session.turn_deadline_at).getTime() > Date.now()) return {}

  const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
  const names = new Map<string, string>()
  for (const p of playerRows ?? []) names.set(p.id, p.name)

  const { data: gameRow } = await supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle()
  const timerSeconds = gameRow?.timer_seconds ?? 0
  const nextMark: TicTacToeMark = session.current_turn_mark === 'X' ? 'O' : 'X'
  const nextPlayerId = nextMark === 'X' ? session.player_x_id : session.player_o_id

  const { error } = await supabase
    .from('tic_tac_toe_sessions')
    .update({
      current_turn_mark: nextMark,
      status_message: `${names.get(nextPlayerId) ?? 'Player'}'s turn (${nextMark}) — time ran out`,
      turn_deadline_at: ticTacToeTurnDeadline(timerSeconds),
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  if (error) return { error: error.message }
  return {}
}

/** Play again — keep finished session so the next start can swap who opens as X. */
export async function clearTicTacToeSessionData(
  _supabase: SupabaseClient,
  _gameId: string
): Promise<{ error?: string }> {
  return {}
}
