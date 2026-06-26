import { Chess } from 'chess.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import type { ChessColor, ChessSession } from '@/types'

export const CHESS_MIN_PLAYERS = 2
export const CHESS_MAX_PLAYERS = 2
export const CHESS_DEFAULT_MAX_PLAYERS = 2

export const CHESS_STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export type ChessMoveRequest = { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }

/** Per-player total clock options, in seconds (0 = untimed). Chess.com style. */
export const CHESS_TIME_OPTIONS = [0, 180, 300, 600] as const
export const CHESS_DEFAULT_TIME_SECONDS = 600

export function clampChessTimer(value: unknown): number {
  const n = Number(value)
  return (CHESS_TIME_OPTIONS as readonly number[]).includes(n) ? n : CHESS_DEFAULT_TIME_SECONDS
}

export function chessIsTimed(session: Pick<ChessSession, 'white_time_ms' | 'black_time_ms'>): boolean {
  return session.white_time_ms != null && session.black_time_ms != null
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function colorForPlayer(session: ChessSession, playerId: string): ChessColor | null {
  if (session.player_white_id === playerId) return 'w'
  if (session.player_black_id === playerId) return 'b'
  return null
}

export function currentTurnPlayerId(session: ChessSession): string {
  return session.current_turn === 'w' ? session.player_white_id : session.player_black_id
}

export function playerIdForColor(session: ChessSession, color: ChessColor): string {
  return color === 'w' ? session.player_white_id : session.player_black_id
}

/** True when the host can reset the room for another round. */
export async function canChessPlayAgain(
  supabase: SupabaseClient,
  gameId: string,
  gameStatus: string
): Promise<boolean> {
  if (gameStatus === 'waiting' || gameStatus === 'finished') return true
  if (gameStatus !== 'active') return false

  const { data: session } = await supabase
    .from('chess_sessions')
    .select('status')
    .eq('game_id', gameId)
    .maybeSingle()

  return session?.status === 'finished'
}

/** Short human-readable phrase for how a finished game ended. */
export function chessResultDetail(reason: string | null | undefined): string {
  switch (reason) {
    case 'checkmate':
      return 'by checkmate'
    case 'timeout':
      return 'on time'
    case 'resignation':
      return 'by resignation'
    case 'stalemate':
      return 'draw by stalemate'
    case 'threefold':
      return 'draw by repetition'
    case 'insufficient':
      return 'draw — insufficient material'
    case 'fifty_move':
      return 'draw — fifty-move rule'
    default:
      return ''
  }
}

export function isChessResultsPhase(
  gameStatus: string | undefined,
  session: Pick<ChessSession, 'status' | 'is_draw' | 'winner_player_id'> | null | undefined
): boolean {
  if (!gameStatus || gameStatus === 'waiting') return false
  if (gameStatus === 'finished') return true
  if (!session) return false
  return session.status === 'finished' || session.is_draw || !!session.winner_player_id
}

async function loadPlayerNames(supabase: SupabaseClient, gameId: string): Promise<Map<string, string>> {
  const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
  const names = new Map<string, string>()
  for (const p of playerRows ?? []) names.set(p.id, p.name)
  return names
}

export async function initializeChessGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<{ error?: string }> {
  if (playerIds.length !== CHESS_MIN_PLAYERS) {
    return { error: `Need exactly ${CHESS_MIN_PLAYERS} players to start` }
  }

  const { data: existing } = await supabase
    .from('chess_sessions')
    .select('player_white_id, player_black_id')
    .eq('game_id', gameId)
    .maybeSingle()

  let whiteId: string
  let blackId: string

  if (existing) {
    // Rematch: swap colors so whoever played Black opens as White this time.
    whiteId = existing.player_black_id
    blackId = existing.player_white_id
    if (!playerIds.includes(whiteId) || !playerIds.includes(blackId)) {
      ;[whiteId, blackId] = shuffle(playerIds)
    }
  } else {
    ;[whiteId, blackId] = shuffle(playerIds)
  }

  if (!whiteId || !blackId) return { error: 'Need exactly 2 players to start' }

  const { data: gameRow } = await supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle()
  const timerSeconds = gameRow?.timer_seconds ?? 0
  const initialMs = timerSeconds > 0 ? timerSeconds * 1000 : null

  const names = await loadPlayerNames(supabase, gameId)

  const now = Date.now()
  const sessionRow = {
    player_white_id: whiteId,
    player_black_id: blackId,
    fen: CHESS_STARTING_FEN,
    pgn: '',
    current_turn: 'w' as const,
    white_time_ms: initialMs,
    black_time_ms: initialMs,
    turn_started_at: new Date(now).toISOString(),
    last_move_from: null,
    last_move_to: null,
    in_check: false,
    status: 'active' as const,
    result_reason: null,
    winner_player_id: null,
    is_draw: false,
    status_message: `${names.get(whiteId) ?? 'White'}'s turn (White)`,
    turn_deadline_at: initialMs != null ? new Date(now + initialMs).toISOString() : null,
    updated_at: new Date().toISOString(),
  }

  const { error } = existing
    ? await supabase.from('chess_sessions').update(sessionRow).eq('game_id', gameId)
    : await supabase.from('chess_sessions').insert({ ...sessionRow, game_id: gameId })
  if (error) return { error: error.message }
  return {}
}

async function loadSession(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ session: ChessSession | null; error?: string }> {
  const { data, error } = await supabase.from('chess_sessions').select('*').eq('game_id', gameId).maybeSingle()
  if (error) return { session: null, error: error.message }
  return { session: data as ChessSession | null }
}

function describeDrawReason(reason: string): string {
  switch (reason) {
    case 'stalemate':
      return 'Stalemate — '
    case 'threefold':
      return 'Threefold repetition — '
    case 'insufficient':
      return 'Insufficient material — '
    case 'fifty_move':
      return 'Fifty-move rule — '
    default:
      return ''
  }
}

export async function processChessMove(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  move: ChessMoveRequest
): Promise<{ error?: string }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.status === 'finished') return { error: 'Game already finished' }

  const color = colorForPlayer(session, playerId)
  if (!color) return { error: 'You are not in this game' }

  const chess = new Chess()
  try {
    chess.load(session.fen)
  } catch {
    return { error: 'Corrupt game state' }
  }

  if (chess.turn() !== color) return { error: "It's not your turn" }

  // Replay history so PGN / threefold detection stays accurate.
  if (session.pgn) {
    try {
      const replay = new Chess()
      replay.loadPgn(session.pgn)
      if (replay.fen() === session.fen) chess.loadPgn(session.pgn)
    } catch {
      // Fall back to the FEN-only instance already loaded.
    }
  }

  let result
  try {
    result = chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' })
  } catch {
    return { error: 'Illegal move' }
  }
  if (!result) return { error: 'Illegal move' }

  const names = await loadPlayerNames(supabase, gameId)

  const nextTurn = chess.turn()
  const inCheck = chess.inCheck()

  let finished = false
  let draw = false
  let reason: string | null = null
  let winnerColor: ChessColor | null = null

  if (chess.isCheckmate()) {
    finished = true
    winnerColor = color
    reason = 'checkmate'
  } else if (chess.isStalemate()) {
    finished = true
    draw = true
    reason = 'stalemate'
  } else if (chess.isThreefoldRepetition()) {
    finished = true
    draw = true
    reason = 'threefold'
  } else if (chess.isInsufficientMaterial()) {
    finished = true
    draw = true
    reason = 'insufficient'
  } else if (chess.isDraw()) {
    finished = true
    draw = true
    reason = 'fifty_move'
  }

  // --- Cumulative clock: deduct the time the mover spent on this turn. ---
  const timed = chessIsTimed(session)
  const now = Date.now()
  let whiteMs = session.white_time_ms
  let blackMs = session.black_time_ms

  if (timed) {
    const startedAt = session.turn_started_at ? new Date(session.turn_started_at).getTime() : now
    const elapsed = Math.max(0, now - startedAt)
    if (color === 'w') whiteMs = Math.max(0, (session.white_time_ms ?? 0) - elapsed)
    else blackMs = Math.max(0, (session.black_time_ms ?? 0) - elapsed)

    // Flag fall on the moving side (and the move wasn't already a checkmate/draw)
    // means they ran out of time — the opponent wins.
    const moverRemaining = (color === 'w' ? whiteMs : blackMs) ?? 0
    if (moverRemaining <= 0 && !finished) {
      finished = true
      draw = false
      reason = 'timeout'
      winnerColor = color === 'w' ? 'b' : 'w'
    }
  }

  const winnerPlayerId = winnerColor ? playerIdForColor(session, winnerColor) : null
  const moverName = names.get(playerId) ?? (color === 'w' ? 'White' : 'Black')
  const nextPlayerId = nextTurn === 'w' ? session.player_white_id : session.player_black_id
  const nextName = names.get(nextPlayerId) ?? (nextTurn === 'w' ? 'White' : 'Black')

  const statusMessage =
    reason === 'timeout'
      ? `${moverName} ran out of time — ${names.get(winnerPlayerId!) ?? 'Opponent'} wins!`
      : winnerColor
        ? `Checkmate — ${moverName} wins!`
        : draw
          ? `${describeDrawReason(reason ?? '')}it's a draw!`
          : `${nextName}'s turn (${nextTurn === 'w' ? 'White' : 'Black'})${inCheck ? ' — check!' : ''}`

  // The opponent's clock starts now (unless the game just ended).
  const nextRemaining = nextTurn === 'w' ? whiteMs : blackMs
  const nextDeadline = !finished && timed && nextRemaining != null ? new Date(now + nextRemaining).toISOString() : null

  const { error: updateError } = await supabase
    .from('chess_sessions')
    .update({
      fen: chess.fen(),
      pgn: chess.pgn(),
      current_turn: nextTurn,
      white_time_ms: whiteMs,
      black_time_ms: blackMs,
      turn_started_at: finished ? null : new Date(now).toISOString(),
      last_move_from: result.from,
      last_move_to: result.to,
      in_check: inCheck,
      status: finished ? 'finished' : 'active',
      result_reason: reason,
      winner_player_id: winnerPlayerId,
      is_draw: draw,
      status_message: statusMessage,
      turn_deadline_at: nextDeadline,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  if (updateError) return { error: updateError.message }

  if (finished) {
    await markGameFinished(supabase, gameId)
  }

  return {}
}

/** The player on the move ran out of their cumulative clock — the opponent wins. */
export async function processChessExpireTurn(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.status === 'finished') return {}
  if (!session.turn_deadline_at || new Date(session.turn_deadline_at).getTime() > Date.now()) return {}

  const names = await loadPlayerNames(supabase, gameId)
  const loserColor = session.current_turn
  const winnerColor: ChessColor = loserColor === 'w' ? 'b' : 'w'
  const winnerPlayerId = playerIdForColor(session, winnerColor)
  const loserName = names.get(playerIdForColor(session, loserColor)) ?? (loserColor === 'w' ? 'White' : 'Black')
  const winnerName = names.get(winnerPlayerId) ?? (winnerColor === 'w' ? 'White' : 'Black')

  const { error } = await supabase
    .from('chess_sessions')
    .update({
      status: 'finished',
      result_reason: 'timeout',
      winner_player_id: winnerPlayerId,
      is_draw: false,
      // Zero out the flagged player's clock so the final position reads correctly.
      white_time_ms: loserColor === 'w' ? 0 : session.white_time_ms,
      black_time_ms: loserColor === 'b' ? 0 : session.black_time_ms,
      turn_started_at: null,
      status_message: `${loserName} ran out of time — ${winnerName} wins!`,
      turn_deadline_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  if (error) return { error: error.message }

  await markGameFinished(supabase, gameId)
  return {}
}

/** Player resigns — the other color wins. */
export async function processChessResign(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.status === 'finished') return {}

  const color = colorForPlayer(session, playerId)
  if (!color) return { error: 'You are not in this game' }

  const names = await loadPlayerNames(supabase, gameId)
  const winnerColor: ChessColor = color === 'w' ? 'b' : 'w'
  const winnerPlayerId = playerIdForColor(session, winnerColor)
  const loserName = names.get(playerId) ?? (color === 'w' ? 'White' : 'Black')
  const winnerName = names.get(winnerPlayerId) ?? (winnerColor === 'w' ? 'White' : 'Black')

  const { error } = await supabase
    .from('chess_sessions')
    .update({
      status: 'finished',
      result_reason: 'resignation',
      winner_player_id: winnerPlayerId,
      is_draw: false,
      status_message: `${loserName} resigned — ${winnerName} wins!`,
      turn_deadline_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  if (error) return { error: error.message }

  await markGameFinished(supabase, gameId)
  return {}
}

/** Play again — keep finished session so the next start can swap who opens as White. */
export async function clearChessSessionData(_supabase: SupabaseClient, _gameId: string): Promise<{ error?: string }> {
  return {}
}
