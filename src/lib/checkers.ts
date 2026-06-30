import { internalErrorMessage } from '@/lib/api-errors'
import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import type { CheckersColor, CheckersSession } from '@/types'

export const CHECKERS_MIN_PLAYERS = 2
export const CHECKERS_MAX_PLAYERS = 2
export const CHECKERS_DEFAULT_MAX_PLAYERS = 2

// American 8×8 draughts. The board is a 64-char string indexed by row*8 + col
// (row 0 = top, col 0 = left). Only dark squares ((row + col) odd) are ever
// occupied; light squares stay '.'. Pieces: 'r'/'b' = Red/Black man,
// 'R'/'B' = Red/Black king, '.' = empty. Black starts on the top three rows,
// Red on the bottom three. Red moves first (toward row 0); Black moves toward
// row 7. A man reaching the far rank is crowned a king.
export const CHECKERS_STARTING_BOARD =
  '.b.b.b.bb.b.b.b..b.b.b.b................r.r.r.r..r.r.r.rr.r.r.r.'

/** Draw after this many consecutive king-only, non-capture plies (40 per side). */
export const CHECKERS_DRAW_PLY = 80

export type CheckersMoveRequest = { from: string; to: string }

/** One legal hop: a simple step, or a jump (capture = square of the jumped piece). */
export type CheckersStep = { from: string; to: string; captured: string | null }

/** Per-player total clock options, in seconds (0 = untimed). Mirrors Chess. */
export const CHECKERS_TIME_OPTIONS = [0, 180, 300, 600] as const
export const CHECKERS_DEFAULT_TIME_SECONDS = 600

export function clampCheckersTimer(value: unknown): number {
  const n = Number(value)
  return (CHECKERS_TIME_OPTIONS as readonly number[]).includes(n) ? n : CHECKERS_DEFAULT_TIME_SECONDS
}

export function checkersIsTimed(session: Pick<CheckersSession, 'red_time_ms' | 'black_time_ms'>): boolean {
  return session.red_time_ms != null && session.black_time_ms != null
}

// ---------------------------------------------------------------------------
// Pure board helpers (no DB) — exported for unit testing.
// ---------------------------------------------------------------------------

function parseSquare(sq: string): [number, number] {
  return [Number(sq[0]), Number(sq[1])]
}

export function squareId(row: number, col: number): string {
  return `${row}${col}`
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8
}

export function isDarkSquare(row: number, col: number): boolean {
  return (row + col) % 2 === 1
}

export function isValidSquare(sq: string): boolean {
  if (!/^[0-7][0-7]$/.test(sq)) return false
  const [r, c] = parseSquare(sq)
  return isDarkSquare(r, c)
}

function idx(row: number, col: number): number {
  return row * 8 + col
}

export function pieceAt(board: string, sq: string): string {
  const [r, c] = parseSquare(sq)
  return board[idx(r, c)]
}

export function colorOfPiece(piece: string): CheckersColor | null {
  if (piece === 'r' || piece === 'R') return 'r'
  if (piece === 'b' || piece === 'B') return 'b'
  return null
}

function isKing(piece: string): boolean {
  return piece === 'R' || piece === 'B'
}

/** Movement directions [dRow, dCol]. Men move one way; kings move all four. */
function directionsFor(color: CheckersColor, king: boolean): Array<[number, number]> {
  if (king) {
    return [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]
  }
  // Red moves up the board (toward row 0); Black moves down (toward row 7).
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

function captureStepsFrom(board: string, sq: string): CheckersStep[] {
  const piece = pieceAt(board, sq)
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
    const midColor = colorOfPiece(board[idx(mr, mc)])
    if (midColor && midColor !== color && board[idx(lr, lc)] === '.') {
      steps.push({ from: sq, to: squareId(lr, lc), captured: squareId(mr, mc) })
    }
  }
  return steps
}

function simpleStepsFrom(board: string, sq: string): CheckersStep[] {
  const piece = pieceAt(board, sq)
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
      if (colorOfPiece(board[idx(r, c)]) === color && captureStepsFrom(board, squareId(r, c)).length > 0) {
        return true
      }
    }
  }
  return false
}

/**
 * Legal hops for the piece on `square`. Honors the forced-capture rule: if any
 * capture exists for `color`, only captures are returned. When `mustContinue` is
 * set (a multi-jump is in progress) only that square may move, and only by
 * capturing.
 */
export function legalStepsFromSquare(
  board: string,
  color: CheckersColor,
  square: string,
  mustContinue: string | null
): CheckersStep[] {
  if (mustContinue) {
    return square === mustContinue ? captureStepsFrom(board, square) : []
  }
  if (colorOfPiece(pieceAt(board, square)) !== color) return []
  if (hasAnyCapture(board, color)) return captureStepsFrom(board, square)
  return simpleStepsFrom(board, square)
}

/** Every legal hop available to `color` right now (used for stalemate detection). */
export function legalMovesForColor(board: string, color: CheckersColor, mustContinue: string | null = null): CheckersStep[] {
  if (mustContinue) return captureStepsFrom(board, mustContinue)
  const all: CheckersStep[] = []
  const forced = hasAnyCapture(board, color)
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      if (!isDarkSquare(r, c)) continue
      const sq = squareId(r, c)
      if (colorOfPiece(board[idx(r, c)]) !== color) continue
      all.push(...(forced ? captureStepsFrom(board, sq) : simpleStepsFrom(board, sq)))
    }
  }
  return all
}

export function hasPieces(board: string, color: CheckersColor): boolean {
  for (const ch of board) if (colorOfPiece(ch) === color) return true
  return false
}

/** Test-only alias for the internal capture generator. */
export const captureStepsFromForTest = captureStepsFrom

/** Apply a hop. Crowns a man that lands on the far rank. Returns the new board. */
export function applyStep(board: string, step: CheckersStep): { board: string; crowned: boolean; captured: boolean } {
  const arr = board.split('')
  const piece = pieceAt(board, step.from)
  const color = colorOfPiece(piece)
  const [fr, fc] = parseSquare(step.from)
  const [tr, tc] = parseSquare(step.to)
  arr[idx(fr, fc)] = '.'
  if (step.captured) {
    const [cr, cc] = parseSquare(step.captured)
    arr[idx(cr, cc)] = '.'
  }
  let placed = piece
  let crowned = false
  if (!isKing(piece)) {
    if ((color === 'r' && tr === 0) || (color === 'b' && tr === 7)) {
      placed = color === 'r' ? 'R' : 'B'
      crowned = true
    }
  }
  arr[idx(tr, tc)] = placed
  return { board: arr.join(''), crowned, captured: !!step.captured }
}

// ---------------------------------------------------------------------------
// Session helpers (DB-backed) — mirror src/lib/chess.ts.
// ---------------------------------------------------------------------------

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function colorForPlayer(session: CheckersSession, playerId: string): CheckersColor | null {
  if (session.player_red_id === playerId) return 'r'
  if (session.player_black_id === playerId) return 'b'
  return null
}

export function currentTurnPlayerId(session: CheckersSession): string {
  return session.current_turn === 'r' ? session.player_red_id : session.player_black_id
}

export function playerIdForColor(session: CheckersSession, color: CheckersColor): string {
  return color === 'r' ? session.player_red_id : session.player_black_id
}

/** True when the host can reset the room for another round. */
export async function canCheckersPlayAgain(
  supabase: SupabaseClient,
  gameId: string,
  gameStatus: string
): Promise<boolean> {
  if (gameStatus === 'waiting' || gameStatus === 'finished') return true
  if (gameStatus !== 'active') return false

  const { data: session } = await supabase
    .from('checkers_sessions')
    .select('status')
    .eq('game_id', gameId)
    .maybeSingle()

  return session?.status === 'finished'
}

/** Short human-readable phrase for how a finished game ended. */
export function checkersResultDetail(reason: string | null | undefined): string {
  switch (reason) {
    case 'capture_all':
      return 'by capturing every piece'
    case 'no_moves':
      return 'by blocking all moves'
    case 'timeout':
      return 'on time'
    case 'resignation':
      return 'by resignation'
    case 'draw_moves':
      return 'draw — 40-move rule'
    default:
      return ''
  }
}

export function isCheckersResultsPhase(
  gameStatus: string | undefined,
  session: Pick<CheckersSession, 'status' | 'is_draw' | 'winner_player_id'> | null | undefined
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

function turnMessage(name: string, color: CheckersColor): string {
  return `${name}'s turn (${color === 'r' ? 'Red' : 'Black'})`
}

export async function initializeCheckersGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<{ error?: string }> {
  if (playerIds.length !== CHECKERS_MIN_PLAYERS) {
    return { error: `Need exactly ${CHECKERS_MIN_PLAYERS} players to start` }
  }

  const { data: existing } = await supabase
    .from('checkers_sessions')
    .select('player_red_id, player_black_id')
    .eq('game_id', gameId)
    .maybeSingle()

  let redId: string
  let blackId: string

  if (existing) {
    // Rematch: swap colors so whoever played Black opens as Red this time.
    redId = existing.player_black_id
    blackId = existing.player_red_id
    if (!playerIds.includes(redId) || !playerIds.includes(blackId)) {
      ;[redId, blackId] = shuffle(playerIds)
    }
  } else {
    ;[redId, blackId] = shuffle(playerIds)
  }

  if (!redId || !blackId) return { error: 'Need exactly 2 players to start' }

  const { data: gameRow } = await supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle()
  const timerSeconds = gameRow?.timer_seconds ?? 0
  const initialMs = timerSeconds > 0 ? timerSeconds * 1000 : null

  const names = await loadPlayerNames(supabase, gameId)

  const now = Date.now()
  const sessionRow = {
    player_red_id: redId,
    player_black_id: blackId,
    board: CHECKERS_STARTING_BOARD,
    current_turn: 'r' as const,
    move_count: 0,
    must_continue_from: null,
    red_time_ms: initialMs,
    black_time_ms: initialMs,
    turn_started_at: new Date(now).toISOString(),
    last_move_from: null,
    last_move_to: null,
    status: 'active' as const,
    result_reason: null,
    winner_player_id: null,
    is_draw: false,
    status_message: turnMessage(names.get(redId) ?? 'Red', 'r'),
    turn_deadline_at: initialMs != null ? new Date(now + initialMs).toISOString() : null,
    updated_at: new Date().toISOString(),
  }

  const { error } = existing
    ? await supabase.from('checkers_sessions').update(sessionRow).eq('game_id', gameId)
    : await supabase.from('checkers_sessions').insert({ ...sessionRow, game_id: gameId })
  if (error) return { error: internalErrorMessage('checkers', error) }
  return {}
}

async function loadSession(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ session: CheckersSession | null; error?: string }> {
  const { data, error } = await supabase.from('checkers_sessions').select('*').eq('game_id', gameId).maybeSingle()
  if (error) return { session: null, error: internalErrorMessage('checkers', error) }
  return { session: data as CheckersSession | null }
}

/**
 * Optimistic-concurrency session write (CAS on updated_at). Mirrors the Chess
 * engine: the update only lands if the row still carries the updated_at we read,
 * so a stale expire-turn can't overwrite a real move, and two requests never both
 * call markGameFinished. Returns true if this write won.
 */
async function persistSession(
  supabase: SupabaseClient,
  gameId: string,
  patch: Partial<CheckersSession>,
  expectedUpdatedAt: string
): Promise<boolean> {
  const { data } = await supabase
    .from('checkers_sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('game_id', gameId)
    .eq('updated_at', expectedUpdatedAt)
    .select('game_id')
  return (data?.length ?? 0) > 0
}

export async function processCheckersMove(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  move: CheckersMoveRequest
): Promise<{ error?: string }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.status === 'finished') return { error: 'Game already finished' }

  const color = colorForPlayer(session, playerId)
  if (!color) return { error: 'You are not in this game' }
  if (session.current_turn !== color) return { error: "It's not your turn" }

  if (!isValidSquare(move.from) || !isValidSquare(move.to)) return { error: 'Illegal move' }

  const steps = legalStepsFromSquare(session.board, color, move.from, session.must_continue_from)
  const step = steps.find((s) => s.to === move.to)
  if (!step) return { error: 'Illegal move' }

  const { board: nextBoard, crowned, captured } = applyStep(session.board, step)

  // A capturing piece that didn't just crown must keep jumping if it can.
  const continues = captured && !crowned && captureStepsFrom(nextBoard, step.to).length > 0
  const nextTurn: CheckersColor = continues ? color : color === 'r' ? 'b' : 'r'

  // Draw counter resets on any capture, man move, or crowning; only king moves
  // with no capture tick it up.
  const mover = pieceAt(session.board, move.from)
  const kingMove = isKing(mover) && !captured && !crowned
  const moveCount = kingMove ? session.move_count + 1 : 0

  let finished = false
  let draw = false
  let reason: string | null = null
  let winnerColor: CheckersColor | null = null

  if (!continues) {
    if (!hasPieces(nextBoard, nextTurn)) {
      finished = true
      winnerColor = color
      reason = 'capture_all'
    } else if (legalMovesForColor(nextBoard, nextTurn).length === 0) {
      finished = true
      winnerColor = color
      reason = 'no_moves'
    } else if (moveCount >= CHECKERS_DRAW_PLY) {
      finished = true
      draw = true
      reason = 'draw_moves'
    }
  }

  // --- Cumulative clock: deduct the time the mover spent on this hop. ---
  const timed = checkersIsTimed(session)
  const now = Date.now()
  let redMs = session.red_time_ms
  let blackMs = session.black_time_ms

  if (timed) {
    const startedAt = session.turn_started_at ? new Date(session.turn_started_at).getTime() : now
    const elapsed = Math.max(0, now - startedAt)
    if (color === 'r') redMs = Math.max(0, (session.red_time_ms ?? 0) - elapsed)
    else blackMs = Math.max(0, (session.black_time_ms ?? 0) - elapsed)

    const moverRemaining = (color === 'r' ? redMs : blackMs) ?? 0
    if (moverRemaining <= 0 && !finished) {
      finished = true
      draw = false
      reason = 'timeout'
      winnerColor = color === 'r' ? 'b' : 'r'
    }
  }

  const names = await loadPlayerNames(supabase, gameId)
  const winnerPlayerId = winnerColor ? playerIdForColor(session, winnerColor) : null
  const moverName = names.get(playerId) ?? (color === 'r' ? 'Red' : 'Black')
  const nextPlayerId = nextTurn === 'r' ? session.player_red_id : session.player_black_id
  const nextName = names.get(nextPlayerId) ?? (nextTurn === 'r' ? 'Red' : 'Black')

  const statusMessage =
    reason === 'timeout'
      ? `${moverName} ran out of time — ${names.get(winnerPlayerId!) ?? 'Opponent'} wins!`
      : winnerColor
        ? `${moverName} wins!`
        : draw
          ? "It's a draw — 40-move rule!"
          : continues
            ? `${moverName} must keep jumping!`
            : turnMessage(nextName, nextTurn)

  // The next player's clock starts now (same player when a jump continues).
  const nextRemaining = nextTurn === 'r' ? redMs : blackMs
  const nextDeadline = !finished && timed && nextRemaining != null ? new Date(now + nextRemaining).toISOString() : null

  const won = await persistSession(
    supabase,
    gameId,
    {
      board: nextBoard,
      current_turn: nextTurn,
      move_count: moveCount,
      must_continue_from: continues ? step.to : null,
      red_time_ms: redMs,
      black_time_ms: blackMs,
      turn_started_at: finished ? null : new Date(now).toISOString(),
      last_move_from: step.from,
      last_move_to: step.to,
      status: finished ? 'finished' : 'active',
      result_reason: reason,
      winner_player_id: winnerPlayerId,
      is_draw: draw,
      status_message: statusMessage,
      turn_deadline_at: nextDeadline,
    },
    session.updated_at
  )
  if (!won) return {}

  if (finished) {
    await markGameFinished(supabase, gameId)
  }

  return {}
}

/** The player on the move ran out of their cumulative clock — the opponent wins. */
export async function processCheckersExpireTurn(supabase: SupabaseClient, gameId: string): Promise<{ error?: string }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.status === 'finished') return {}
  if (!session.turn_deadline_at || new Date(session.turn_deadline_at).getTime() > Date.now()) return {}

  const names = await loadPlayerNames(supabase, gameId)
  const loserColor = session.current_turn
  const winnerColor: CheckersColor = loserColor === 'r' ? 'b' : 'r'
  const winnerPlayerId = playerIdForColor(session, winnerColor)
  const loserName = names.get(playerIdForColor(session, loserColor)) ?? (loserColor === 'r' ? 'Red' : 'Black')
  const winnerName = names.get(winnerPlayerId) ?? (winnerColor === 'r' ? 'Red' : 'Black')

  const won = await persistSession(
    supabase,
    gameId,
    {
      status: 'finished',
      result_reason: 'timeout',
      winner_player_id: winnerPlayerId,
      is_draw: false,
      red_time_ms: loserColor === 'r' ? 0 : session.red_time_ms,
      black_time_ms: loserColor === 'b' ? 0 : session.black_time_ms,
      turn_started_at: null,
      status_message: `${loserName} ran out of time — ${winnerName} wins!`,
      turn_deadline_at: null,
    },
    session.updated_at
  )
  if (!won) return {}

  await markGameFinished(supabase, gameId)
  return {}
}

/** Player resigns — the other color wins. */
export async function processCheckersResign(
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
  const winnerColor: CheckersColor = color === 'r' ? 'b' : 'r'
  const winnerPlayerId = playerIdForColor(session, winnerColor)
  const loserName = names.get(playerId) ?? (color === 'r' ? 'Red' : 'Black')
  const winnerName = names.get(winnerPlayerId) ?? (winnerColor === 'r' ? 'Red' : 'Black')

  const won = await persistSession(
    supabase,
    gameId,
    {
      status: 'finished',
      result_reason: 'resignation',
      winner_player_id: winnerPlayerId,
      is_draw: false,
      status_message: `${loserName} resigned — ${winnerName} wins!`,
      turn_deadline_at: null,
    },
    session.updated_at
  )
  if (!won) return {}

  await markGameFinished(supabase, gameId)
  return {}
}

/** Play again — keep finished session so the next start can swap who opens as Red. */
export async function clearCheckersSessionData(_supabase: SupabaseClient, _gameId: string): Promise<{ error?: string }> {
  return {}
}

/**
 * Remove a player from a Checkers game (they left or were kicked). Checkers is
 * heads-up, so leaving an active game is a forfeit: the other player wins by
 * resignation. Mirrors processCheckersResign, but uses a plain (non-CAS) update
 * so the removal always lands.
 */
export async function removeCheckersPlayer(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  playerName?: string
): Promise<{ error: string | null }> {
  const { data: sessionRaw } = await supabase.from('checkers_sessions').select('*').eq('game_id', gameId).maybeSingle()
  const session = sessionRaw as CheckersSession | null

  if (
    session &&
    session.status === 'active' &&
    (session.player_red_id === playerId || session.player_black_id === playerId)
  ) {
    const otherId = session.player_red_id === playerId ? session.player_black_id : session.player_red_id
    const names = await loadPlayerNames(supabase, gameId)
    const loserName = playerName ?? names.get(playerId) ?? (session.player_red_id === playerId ? 'Red' : 'Black')
    const winnerName = names.get(otherId) ?? 'Opponent'

    const { error: sessionError } = await supabase
      .from('checkers_sessions')
      .update({
        status: 'finished',
        result_reason: 'resignation',
        winner_player_id: otherId,
        is_draw: false,
        status_message: `${loserName} left — ${winnerName} wins!`,
        turn_deadline_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('game_id', gameId)
    if (sessionError) return { error: internalErrorMessage('checkers', sessionError) }

    await markGameFinished(supabase, gameId)
    const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
    return { error: error?.message ?? null }
  }

  const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
  return { error: error?.message ?? null }
}
