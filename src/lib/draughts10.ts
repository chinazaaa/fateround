import { internalErrorMessage } from '@/lib/api-errors'
import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import type { CheckersColor, Draughts10Session, Draughts10Variant } from '@/types'

// International / Nigerian draughts. 10×10 board, 100-char string indexed by
// row*10 + col (row 0 = top, col 0 = left). Only dark squares ((row+col) odd)
// are ever occupied; light squares stay '.'. Pieces: 'r'/'b' = Red/Black man,
// 'R'/'B' = Red/Black king (flying — moves/captures any distance along an open
// diagonal). Black starts on the top four rows, Red on the bottom four. Black
// moves first. Men capture in ALL four diagonal directions (not forward-only,
// unlike American checkers). Capturing is mandatory AND majority: a player
// must play a sequence that captures the greatest total number of pieces.
// Nigeria shares this exact engine — its only differences are presentational
// (mirrored board orientation, "seed" terminology) plus an opt-in, off-by-default
// "street rules" room toggle, neither of which changes move legality here.
export const DRAUGHTS10_MIN_PLAYERS = 2
export const DRAUGHTS10_MAX_PLAYERS = 2
export const DRAUGHTS10_DEFAULT_MAX_PLAYERS = 2

export const DRAUGHTS10_STARTING_BOARD =
  '.b.b.b.b.bb.b.b.b.b..b.b.b.b.bb.b.b.b.b......................r.r.r.r.rr.r.r.r.r..r.r.r.r.rr.r.r.r.r.'

/** Draw after this many consecutive king-only, non-capture plies (25 per side). */
export const DRAUGHTS10_DRAW_PLY = 50

/** Draw once the same position (board + side to move) has occurred this many times. */
export const DRAUGHTS10_DRAW_REPETITIONS = 3

export type Draughts10MoveRequest = { from: string; to: string }

/** One legal hop: a simple step, or a jump (capture = square of the jumped piece). */
export type Draughts10Step = { from: string; to: string; captured: string | null }

/** Per-player total clock options, in seconds (0 = untimed). Mirrors Checkers/Chess. */
export const DRAUGHTS10_TIME_OPTIONS = [0, 180, 300, 600] as const
export const DRAUGHTS10_DEFAULT_TIME_SECONDS = 600

export function clampDraughts10Timer(value: unknown): number {
  const n = Number(value)
  return (DRAUGHTS10_TIME_OPTIONS as readonly number[]).includes(n) ? n : DRAUGHTS10_DEFAULT_TIME_SECONDS
}

export function draughts10IsTimed(session: Pick<Draughts10Session, 'red_time_ms' | 'black_time_ms'>): boolean {
  return session.red_time_ms != null && session.black_time_ms != null
}

// ---------------------------------------------------------------------------
// Pure board helpers (no DB) — exported for unit testing.
// ---------------------------------------------------------------------------

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

export function isValidSquare(sq: string): boolean {
  if (!/^[0-9][0-9]$/.test(sq)) return false
  const [r, c] = parseSquare(sq)
  return isDarkSquare(r, c)
}

function idx(row: number, col: number): number {
  return row * BOARD_SIZE + col
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

/** Forward-only directions for a man's *simple* (non-capturing) move. */
function forwardDirections(color: CheckersColor): Array<[number, number]> {
  // Red moves up the board (toward row 0); Black moves down (toward row 9).
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

/** Simple (non-capturing) moves. Men step one square forward; kings fly any distance. */
function simpleStepsFrom(board: string, sq: string): Draughts10Step[] {
  const piece = pieceAt(board, sq)
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

/**
 * Capture hops from `sq`. Men and kings both capture in all four diagonal
 * directions; a man jumps exactly one square, a flying king may jump the first
 * enemy piece it meets along a diagonal and land on ANY empty square beyond it.
 * Captured pieces are removed immediately (a common, standard simplification —
 * a piece can never be captured twice regardless, since a removed piece can't
 * be jumped again).
 */
function captureStepsFrom(board: string, sq: string): Draughts10Step[] {
  const piece = pieceAt(board, sq)
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
      const midColor = colorOfPiece(board[idx(mr, mc)])
      if (midColor && midColor !== color && board[idx(lr, lc)] === '.') {
        steps.push({ from: sq, to: squareId(lr, lc), captured: squareId(mr, mc) })
      }
      continue
    }
    // Flying king: walk empty squares, then test the first occupied square.
    let mr = r + dr
    let mc = c + dc
    while (inBounds(mr, mc) && board[idx(mr, mc)] === '.') {
      mr += dr
      mc += dc
    }
    if (!inBounds(mr, mc)) continue
    const midColor = colorOfPiece(board[idx(mr, mc)])
    if (!midColor || midColor === color) continue
    // Every empty square beyond the captured piece is a valid landing square.
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

/** Test-only alias for the internal capture generator. */
export const captureStepsFromForTest = captureStepsFrom

export function hasAnyCapture(board: string, color: CheckersColor): boolean {
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (!isDarkSquare(r, c)) continue
      if (colorOfPiece(board[idx(r, c)]) === color && captureStepsFrom(board, squareId(r, c)).length > 0) {
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

/** Apply a hop (no crowning — deferred until a capture chain fully ends). */
function applyStepRaw(board: string, step: Draughts10Step): string {
  const arr = board.split('')
  const piece = pieceAt(board, step.from)
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

/** True once a man reaches the far rank for its color (used to decide crowning). */
function reachesFarRank(color: CheckersColor, row: number): boolean {
  return color === 'r' ? row === 0 : row === BOARD_SIZE - 1
}

/**
 * Apply a hop and crown if `crown` is true (the caller decides — international
 * rules only crown once the whole capture sequence has ended on the far rank,
 * never mid-chain, even if the chain passes through it).
 */
export function applyStep(board: string, step: Draughts10Step, crown: boolean): { board: string; captured: boolean } {
  const piece = pieceAt(board, step.from)
  const color = colorOfPiece(piece)
  let next = applyStepRaw(board, step)
  if (crown && color && !isKing(piece)) {
    const [tr, tc] = parseSquare(step.to)
    const arr = next.split('')
    arr[idx(tr, tc)] = color === 'r' ? 'R' : 'B'
    next = arr.join('')
  }
  return { board: next, captured: !!step.captured }
}

/**
 * Max additional captures achievable in a single sequence starting at `sq`
 * (0 if `sq` has no capture available). Small, bounded recursion — the board
 * only has 20 pieces per side and a chain can't exceed that.
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
 * majority-capture rule. When `mustContinue`/`mustRemaining` are set (a
 * multi-jump is in progress), only that square may move, and only via a
 * continuation that stays on a maximal-length sequence.
 */
export function legalStepsFromSquare(
  board: string,
  color: CheckersColor,
  square: string,
  mustContinue: string | null,
  mustRemaining: number | null
): Draughts10Step[] {
  if (mustContinue) {
    if (square !== mustContinue || mustRemaining == null) return []
    return captureStepsFrom(board, square).filter((s) => {
      const next = applyStepRaw(board, s)
      return maxChainLength(next, s.to) === mustRemaining - 1
    })
  }
  if (colorOfPiece(pieceAt(board, square)) !== color) return []
  if (!hasAnyCapture(board, color)) return simpleStepsFrom(board, square)

  let globalMax = 0
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (!isDarkSquare(r, c)) continue
      const sq = squareId(r, c)
      if (colorOfPiece(board[idx(r, c)]) === color) {
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

/** Every legal hop available to `color` right now (used for stalemate detection). */
export function legalMovesForColor(
  board: string,
  color: CheckersColor,
  mustContinue: string | null = null,
  mustRemaining: number | null = null
): Draughts10Step[] {
  if (mustContinue) return legalStepsFromSquare(board, color, mustContinue, mustContinue, mustRemaining)
  const all: Draughts10Step[] = []
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (!isDarkSquare(r, c)) continue
      const sq = squareId(r, c)
      if (colorOfPiece(board[idx(r, c)]) !== color) continue
      all.push(...legalStepsFromSquare(board, color, sq, null, null))
    }
  }
  return all
}

// ---------------------------------------------------------------------------
// Session helpers (DB-backed) — mirrors src/lib/checkers.ts.
// ---------------------------------------------------------------------------

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function colorForPlayer(session: Draughts10Session, playerId: string): CheckersColor | null {
  if (session.player_red_id === playerId) return 'r'
  if (session.player_black_id === playerId) return 'b'
  return null
}

export function currentTurnPlayerId(session: Draughts10Session): string {
  return session.current_turn === 'r' ? session.player_red_id : session.player_black_id
}

export function playerIdForColor(session: Draughts10Session, color: CheckersColor): string {
  return color === 'r' ? session.player_red_id : session.player_black_id
}

/** True when the host can reset the room for another round. */
export async function canDraughts10PlayAgain(
  supabase: SupabaseClient,
  gameId: string,
  gameStatus: string
): Promise<boolean> {
  if (gameStatus === 'waiting' || gameStatus === 'finished') return true
  if (gameStatus !== 'active') return false

  const { data: session } = await supabase
    .from('checkers10_sessions')
    .select('status')
    .eq('game_id', gameId)
    .maybeSingle()

  return session?.status === 'finished'
}

/** Short human-readable phrase for how a finished game ended. */
export function draughts10ResultDetail(reason: string | null | undefined): string {
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
      return 'draw — 25-move rule'
    case 'threefold':
      return 'draw by repetition'
    default:
      return ''
  }
}

export function isDraughts10ResultsPhase(
  gameStatus: string | undefined,
  session: Pick<Draughts10Session, 'status' | 'is_draw' | 'winner_player_id'> | null | undefined
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

export async function initializeDraughts10Game(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[],
  variant: Draughts10Variant,
  huffingEnabled = false
): Promise<{ error?: string }> {
  if (playerIds.length !== DRAUGHTS10_MIN_PLAYERS) {
    return { error: `Need exactly ${DRAUGHTS10_MIN_PLAYERS} players to start` }
  }

  const { data: existing } = await supabase
    .from('checkers10_sessions')
    .select('player_red_id, player_black_id')
    .eq('game_id', gameId)
    .maybeSingle()

  let redId: string
  let blackId: string

  if (existing) {
    // Rematch: swap colors so whoever played Red opens as Black — and so moves
    // first — this time (Black always opens, like Dark in standard draughts).
    blackId = existing.player_red_id
    redId = existing.player_black_id
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
    variant,
    player_red_id: redId,
    player_black_id: blackId,
    board: DRAUGHTS10_STARTING_BOARD,
    current_turn: 'b' as const,
    move_count: 0,
    position_counts: {},
    must_continue_from: null,
    must_continue_remaining: null,
    huffing_enabled: variant === 'nigeria' ? huffingEnabled : false,
    red_time_ms: initialMs,
    black_time_ms: initialMs,
    turn_started_at: new Date(now).toISOString(),
    last_move_from: null,
    last_move_to: null,
    status: 'active' as const,
    result_reason: null,
    winner_player_id: null,
    is_draw: false,
    status_message: turnMessage(names.get(blackId) ?? 'Black', 'b'),
    turn_deadline_at: initialMs != null ? new Date(now + initialMs).toISOString() : null,
    updated_at: new Date().toISOString(),
  }

  const { error } = existing
    ? await supabase.from('checkers10_sessions').update(sessionRow).eq('game_id', gameId)
    : await supabase.from('checkers10_sessions').insert({ ...sessionRow, game_id: gameId })
  if (error) return { error: internalErrorMessage('draughts10', error) }
  return {}
}

async function loadSession(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ session: Draughts10Session | null; error?: string }> {
  const { data, error } = await supabase.from('checkers10_sessions').select('*').eq('game_id', gameId).maybeSingle()
  if (error) return { session: null, error: internalErrorMessage('draughts10', error) }
  return { session: data as Draughts10Session | null }
}

/**
 * Optimistic-concurrency session write (CAS on updated_at). Mirrors Checkers/Chess:
 * the update only lands if the row still carries the updated_at we read, so a
 * stale expire-turn can't overwrite a real move, and two requests never both
 * call markGameFinished. Returns true if this write won.
 */
async function persistSession(
  supabase: SupabaseClient,
  gameId: string,
  patch: Partial<Draughts10Session>,
  expectedUpdatedAt: string
): Promise<boolean> {
  const { data } = await supabase
    .from('checkers10_sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('game_id', gameId)
    .eq('updated_at', expectedUpdatedAt)
    .select('game_id')
  return (data?.length ?? 0) > 0
}

export async function processDraughts10Move(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  move: Draughts10MoveRequest
): Promise<{ error?: string }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.status === 'finished') return { error: 'Game already finished' }

  const color = colorForPlayer(session, playerId)
  if (!color) return { error: 'You are not in this game' }
  if (session.current_turn !== color) return { error: "It's not your turn" }

  if (!isValidSquare(move.from) || !isValidSquare(move.to)) return { error: 'Illegal move' }

  const steps = legalStepsFromSquare(
    session.board,
    color,
    move.from,
    session.must_continue_from,
    session.must_continue_remaining
  )
  const step = steps.find((s) => s.to === move.to)
  if (!step) return { error: 'Illegal move' }

  const mover = pieceAt(session.board, move.from)
  const [toRow] = parseSquare(step.to)
  const captured = !!step.captured

  // legalStepsFromSquare only offers hops on an optimal (majority-rule) path, so
  // the exact captures still required after this hop is just the landing square's
  // own max chain length — no need to re-derive it from must_continue_remaining.
  const boardAfterRaw = applyStepRaw(session.board, step)
  const remainingAfterThisHop = maxChainLength(boardAfterRaw, step.to)
  const continues = captured && remainingAfterThisHop > 0

  const eligibleForCrown = !isKing(mover) && reachesFarRank(color, toRow) && !continues
  const { board: nextBoard } = applyStep(session.board, step, eligibleForCrown)
  const crowned = eligibleForCrown

  const nextTurn: CheckersColor = continues ? color : color === 'r' ? 'b' : 'r'

  // Draw counter resets on any capture, man move, or crowning; only king moves
  // with no capture tick it up.
  const kingMove = isKing(mover) && !captured && !crowned
  const moveCount = kingMove ? session.move_count + 1 : 0

  let positionCounts: Record<string, number> = {}
  let repetition = 0
  if (kingMove && !continues) {
    const key = `${nextBoard}:${nextTurn}`
    repetition = (session.position_counts?.[key] ?? 0) + 1
    positionCounts = { ...session.position_counts, [key]: repetition }
  }

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
    } else if (repetition >= DRAUGHTS10_DRAW_REPETITIONS) {
      finished = true
      draw = true
      reason = 'threefold'
    } else if (moveCount >= DRAUGHTS10_DRAW_PLY) {
      finished = true
      draw = true
      reason = 'draw_moves'
    }
  }

  // --- Cumulative clock: deduct the time the mover spent on this hop. ---
  const timed = draughts10IsTimed(session)
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
          ? reason === 'threefold'
            ? "Threefold repetition — it's a draw!"
            : "It's a draw — 25-move rule!"
          : continues
            ? `${moverName} must keep jumping!`
            : turnMessage(nextName, nextTurn)

  const nextRemaining = nextTurn === 'r' ? redMs : blackMs
  const nextDeadline = !finished && timed && nextRemaining != null ? new Date(now + nextRemaining).toISOString() : null

  const won = await persistSession(
    supabase,
    gameId,
    {
      board: nextBoard,
      current_turn: nextTurn,
      move_count: moveCount,
      position_counts: positionCounts,
      must_continue_from: continues ? step.to : null,
      must_continue_remaining: continues ? remainingAfterThisHop : null,
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
export async function processDraughts10ExpireTurn(
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
export async function processDraughts10Resign(
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
export async function clearDraughts10SessionData(
  _supabase: SupabaseClient,
  _gameId: string
): Promise<{ error?: string }> {
  return {}
}

/**
 * Remove a player from a Draughts10 game (they left or were kicked). Heads-up,
 * so leaving an active game is a forfeit: the other player wins by resignation.
 * Mirrors processDraughts10Resign, but uses a plain (non-CAS) update so the
 * removal always lands.
 */
export async function removeDraughts10Player(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  playerName?: string
): Promise<{ error: string | null }> {
  const { data: sessionRaw } = await supabase
    .from('checkers10_sessions')
    .select('*')
    .eq('game_id', gameId)
    .maybeSingle()
  const session = sessionRaw as Draughts10Session | null

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
      .from('checkers10_sessions')
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
    if (sessionError) return { error: internalErrorMessage('draughts10', sessionError) }

    await markGameFinished(supabase, gameId)
    const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
    return { error: error?.message ?? null }
  }

  const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
  return { error: error?.message ?? null }
}
