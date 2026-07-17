import type { ChessColor, ChessSession } from './types'

export function chessIsTimed(session: Pick<ChessSession, 'white_time_ms' | 'black_time_ms'>): boolean {
  return session.white_time_ms != null && session.black_time_ms != null
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

export function formatChessClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function liveChessClockMs(session: ChessSession, color: ChessColor, now = Date.now()): number {
  const base = (color === 'w' ? session.white_time_ms : session.black_time_ms) ?? 0
  const active = session.status === 'active' && session.current_turn === color
  const startedAt = session.turn_started_at ? Date.parse(session.turn_started_at) : null
  if (!active || startedAt == null) return base
  return Math.max(0, base - Math.max(0, now - startedAt))
}
