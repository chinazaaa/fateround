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
 * continuation that stays on a maximal-length sequence — this holds even
 * under Street Rules, which only relaxes whether a capture chain must be
 * *started*, not whether one must be *finished* once begun.
 *
 * `allowSkip` (Nigeria's "Street Rules" room setting) lets a player decline
 * an available capture and make an ordinary simple move instead — captures
 * remain legal to play, just no longer mandatory. The caller (processDraughts10Move)
 * is responsible for tracking which pieces become "huffable" when a capture
 * is declined.
 */
export function legalStepsFromSquare(
  board: string,
  color: CheckersColor,
  square: string,
  mustContinue: string | null,
  mustRemaining: number | null,
  allowSkip = false
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
  const forced = captureStepsFrom(board, square).filter((s) => {
    const next = applyStepRaw(board, s)
    return 1 + maxChainLength(next, s.to) === globalMax
  })
  return allowSkip ? [...forced, ...simpleStepsFrom(board, square)] : forced
}

/** Every legal hop available to `color` right now (used for stalemate detection). */
export function legalMovesForColor(
  board: string,
  color: CheckersColor,
  mustContinue: string | null = null,
  mustRemaining: number | null = null,
  allowSkip = false
): Draughts10Step[] {
  if (mustContinue) return legalStepsFromSquare(board, color, mustContinue, mustContinue, mustRemaining, allowSkip)
  const all: Draughts10Step[] = []
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (!isDarkSquare(r, c)) continue
      const sq = squareId(r, c)
      if (colorOfPiece(board[idx(r, c)]) !== color) continue
      all.push(...legalStepsFromSquare(board, color, sq, null, null, allowSkip))
    }
  }
  return all
}

/** Squares of `color`'s pieces that currently have a capture available — used to compute
 *  which pieces become huffable when a player declines to capture under Street Rules. */
function capturablePieceSquares(board: string, color: CheckersColor): string[] {
  const squares: string[] = []
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (!isDarkSquare(r, c)) continue
      const sq = squareId(r, c)
      if (colorOfPiece(board[idx(r, c)]) === color && captureStepsFrom(board, sq).length > 0) {
        squares.push(sq)
      }
    }
  }
  return squares
}

/** Test-only alias for the internal huffable-squares generator. */
export const capturablePieceSquaresForTest = capturablePieceSquares

// ---------------------------------------------------------------------------
// Per-game trophy accumulator (red_stats / black_stats on the session row).
//
// International/Nigerian draughts keeps a POSITION, not a record: a crowning, a
// majority-rule capture chain, a flying-king sweep across the board all vanish
// once `board` is rewritten. These paired blobs are the trace the finish-time
// facts builder folds into lifetime trophy counters
// (src/lib/trophies/game-facts/checkers.ts, shared with the 8x8 engine).
// Everything here is additive: it reads the move the engine already decided.
// ---------------------------------------------------------------------------

/** One seat's per-GAME scratch tallies. All optional; absent == 0. Shared shape with 8x8. */
export type Draughts10Stats = {
  captures?: number
  kings_made?: number
  enemy_kings_captured?: number
  best_chain?: number
  chain_cur?: number
  peak_kings?: number
  max_deficit?: number
  turns?: number
  back_streak?: number
  back_streak_max?: number
  made_capture_last_turn?: number
  trades?: number
  reached_endgame?: number
  /** Longest single flying-king hop (rows travelled). Only kings fly, so 0 for man moves. */
  flying_king_max?: number
}

/** A position with this many total pieces or fewer counts as an endgame (start is 40). */
const DRAUGHTS10_ENDGAME_PIECES = 8

function pieceCount(board: string, color: CheckersColor): number {
  let n = 0
  for (const ch of board) if (colorOfPiece(ch) === color) n += 1
  return n
}

function kingCount(board: string, color: CheckersColor): number {
  const king = color === 'r' ? 'R' : 'B'
  let n = 0
  for (const ch of board) if (ch === king) n += 1
  return n
}

/** True when `color` still has a piece on its own home back rank (Red row 9, Black row 0). */
function holdsBackRank(board: string, color: CheckersColor): boolean {
  const row = color === 'r' ? BOARD_SIZE - 1 : 0
  for (let c = 0; c < BOARD_SIZE; c += 1) if (colorOfPiece(board[idx(row, c)]) === color) return true
  return false
}

/**
 * Fold one accepted hop (or a huff) into the paired seat blobs, from the engine's own
 * decisions so it can never disagree with what was played. `!continues` marks the end of
 * the mover's whole turn, where turn-spanning tallies (chain length, trades, back-rank
 * hold) and the symmetric board-derived ones (peak kings, deficit, endgame) are settled.
 *
 * A huff (Street Rules) calls in with captured=true, continues=false and kingHopDistance=0:
 * it removes an opponent piece, so it counts toward captures/Seed Master exactly like a jump.
 */
export function bumpDraughts10Stats(
  prevRed: Draughts10Stats,
  prevBlack: Draughts10Stats,
  args: {
    color: CheckersColor
    captured: boolean
    crowned: boolean
    continues: boolean
    capturedWasKing: boolean
    kingHopDistance: number
    nextBoard: string
  }
): { red_stats: Draughts10Stats; black_stats: Draughts10Stats } {
  const { color, captured, crowned, continues, capturedWasKing, kingHopDistance, nextBoard } = args
  const red: Draughts10Stats = { ...prevRed }
  const black: Draughts10Stats = { ...prevBlack }
  const mine = color === 'r' ? red : black
  const theirs = color === 'r' ? black : red

  if (captured) {
    mine.captures = (mine.captures ?? 0) + 1
    mine.chain_cur = (mine.chain_cur ?? 0) + 1
  }
  if (crowned) mine.kings_made = (mine.kings_made ?? 0) + 1
  if (capturedWasKing) mine.enemy_kings_captured = (mine.enemy_kings_captured ?? 0) + 1
  if (kingHopDistance > (mine.flying_king_max ?? 0)) mine.flying_king_max = kingHopDistance

  if (!continues) {
    const chain = mine.chain_cur ?? 0
    if (chain > (mine.best_chain ?? 0)) mine.best_chain = chain
    mine.chain_cur = 0
    mine.turns = (mine.turns ?? 0) + 1

    if (captured && (theirs.made_capture_last_turn ?? 0) === 1) mine.trades = (mine.trades ?? 0) + 1
    mine.made_capture_last_turn = captured ? 1 : 0

    if (holdsBackRank(nextBoard, color)) {
      mine.back_streak = (mine.back_streak ?? 0) + 1
      if (mine.back_streak > (mine.back_streak_max ?? 0)) mine.back_streak_max = mine.back_streak
    } else {
      mine.back_streak = 0
    }

    const redCount = pieceCount(nextBoard, 'r')
    const blackCount = pieceCount(nextBoard, 'b')
    red.peak_kings = Math.max(red.peak_kings ?? 0, kingCount(nextBoard, 'r'))
    black.peak_kings = Math.max(black.peak_kings ?? 0, kingCount(nextBoard, 'b'))
    red.max_deficit = Math.max(red.max_deficit ?? 0, blackCount - redCount)
    black.max_deficit = Math.max(black.max_deficit ?? 0, redCount - blackCount)
    if (redCount + blackCount <= DRAUGHTS10_ENDGAME_PIECES) {
      red.reached_endgame = 1
      black.reached_endgame = 1
    }
  }

  return { red_stats: red, black_stats: black }
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
    case 'huff_all':
      return 'by huffing every piece'
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
  patch: Partial<Draughts10Session> & { red_stats?: Draughts10Stats; black_stats?: Draughts10Stats },
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

  const allowSkip = session.huffing_enabled && !session.must_continue_from
  const steps = legalStepsFromSquare(
    session.board,
    color,
    move.from,
    session.must_continue_from,
    session.must_continue_remaining,
    allowSkip
  )
  const step = steps.find((s) => s.to === move.to)
  if (!step) return { error: 'Illegal move' }

  const mover = pieceAt(session.board, move.from)
  const [toRow] = parseSquare(step.to)
  const captured = !!step.captured

  // Street Rules: declining an available capture makes every one of the mover's
  // pieces that could have captured "huffable" by the opponent next turn. Any
  // huff opportunity the mover chose not to use (their own prior skip being
  // huffed, or an unused one from further back) lapses the moment they act.
  const huffableSquares =
    allowSkip && !captured && hasAnyCapture(session.board, color) ? capturablePieceSquares(session.board, color) : []

  // legalStepsFromSquare only offers hops on an optimal (majority-rule) path, so
  // the exact captures still required after this hop is just the landing square's
  // own max chain length — no need to re-derive it from must_continue_remaining.
  const boardAfterRaw = applyStepRaw(session.board, step)
  const remainingAfterThisHop = maxChainLength(boardAfterRaw, step.to)
  const continues = captured && remainingAfterThisHop > 0

  const eligibleForCrown = !isKing(mover) && reachesFarRank(color, toRow) && !continues
  const { board: nextBoard } = applyStep(session.board, step, eligibleForCrown)
  const crowned = eligibleForCrown

  // Per-game trophy accumulator (additive; never affects the move above). Distance is
  // read only for a flying king — a man always steps one square. The captured square
  // still holds the victim in `session.board`, so its rank is read before the hop lands.
  const [fromRow] = parseSquare(step.from)
  const kingHopDistance = isKing(mover) ? Math.abs(toRow - fromRow) : 0
  const capturedWasKing = captured && isKing(pieceAt(session.board, step.captured!))
  const { red_stats: redStats, black_stats: blackStats } = bumpDraughts10Stats(
    (session as unknown as { red_stats?: Draughts10Stats }).red_stats ?? {},
    (session as unknown as { black_stats?: Draughts10Stats }).black_stats ?? {},
    { color, captured, crowned, continues, capturedWasKing, kingHopDistance, nextBoard }
  )

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
            : huffableSquares.length > 0
              ? `${moverName} passed up a capture — ${nextName} may huff a piece or move.`
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
      huffable_squares: huffableSquares,
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
      red_stats: redStats,
      black_stats: blackStats,
    },
    session.updated_at
  )
  if (!won) return {}

  if (finished) {
    await markGameFinished(supabase, gameId)
  }

  return {}
}

/**
 * Street Rules only: instead of moving, spend your turn removing one of the
 * opponent's pieces that they left un-captured last turn (the classic "huffing"
 * penalty). Ends the turn — huffing counts as progress, same as a capture.
 */
export async function processDraughts10Huff(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  square: string
): Promise<{ error?: string }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.status === 'finished') return { error: 'Game already finished' }
  if (!session.huffing_enabled) return { error: 'Street Rules is not enabled for this game' }

  const color = colorForPlayer(session, playerId)
  if (!color) return { error: 'You are not in this game' }
  if (session.current_turn !== color) return { error: "It's not your turn" }
  if (session.must_continue_from) return { error: 'Finish your capture chain before huffing' }
  if (!session.huffable_squares?.includes(square)) return { error: 'That piece is not eligible to be huffed' }

  const opponent: CheckersColor = color === 'r' ? 'b' : 'r'
  if (colorOfPiece(pieceAt(session.board, square)) !== opponent) {
    return { error: 'That piece is not eligible to be huffed' }
  }

  const [r, c] = parseSquare(square)
  const huffedWasKing = isKing(pieceAt(session.board, square))
  const arr = session.board.split('')
  arr[idx(r, c)] = '.'
  const nextBoard = arr.join('')
  const nextTurn = opponent

  // Per-game trophy accumulator. A huff eliminates an opponent piece, so it counts as a
  // capture for the tallies (captures / Seed Master) even though it isn't a jump.
  const { red_stats: redStats, black_stats: blackStats } = bumpDraughts10Stats(
    (session as unknown as { red_stats?: Draughts10Stats }).red_stats ?? {},
    (session as unknown as { black_stats?: Draughts10Stats }).black_stats ?? {},
    {
      color,
      captured: true,
      crowned: false,
      continues: false,
      capturedWasKing: huffedWasKing,
      kingHopDistance: 0,
      nextBoard,
    }
  )

  let finished = false
  let reason: string | null = null
  let winnerColor: CheckersColor | null = null

  if (!hasPieces(nextBoard, nextTurn)) {
    finished = true
    winnerColor = color
    reason = 'huff_all'
  } else if (legalMovesForColor(nextBoard, nextTurn, null, null, session.huffing_enabled).length === 0) {
    finished = true
    winnerColor = color
    reason = 'no_moves'
  }

  // --- Cumulative clock: deduct the time the huffer spent on this turn. ---
  const timed = draughts10IsTimed(session)
  const now = Date.now()
  let redMs = session.red_time_ms
  let blackMs = session.black_time_ms

  if (timed) {
    const startedAt = session.turn_started_at ? new Date(session.turn_started_at).getTime() : now
    const elapsed = Math.max(0, now - startedAt)
    if (color === 'r') redMs = Math.max(0, (session.red_time_ms ?? 0) - elapsed)
    else blackMs = Math.max(0, (session.black_time_ms ?? 0) - elapsed)

    const huffedRemaining = (color === 'r' ? redMs : blackMs) ?? 0
    if (huffedRemaining <= 0 && !finished) {
      finished = true
      reason = 'timeout'
      winnerColor = opponent
    }
  }

  const names = await loadPlayerNames(supabase, gameId)
  const winnerPlayerId = winnerColor ? playerIdForColor(session, winnerColor) : null
  const huffedByName = names.get(playerId) ?? (color === 'r' ? 'Red' : 'Black')
  const nextPlayerId = nextTurn === 'r' ? session.player_red_id : session.player_black_id
  const nextName = names.get(nextPlayerId) ?? (nextTurn === 'r' ? 'Red' : 'Black')

  const statusMessage =
    reason === 'timeout'
      ? `${huffedByName} ran out of time — ${names.get(winnerPlayerId!) ?? 'Opponent'} wins!`
      : winnerColor
        ? `${huffedByName} wins!`
        : `${huffedByName} huffed a piece! ${turnMessage(nextName, nextTurn)}`

  const nextRemaining = nextTurn === 'r' ? redMs : blackMs
  const nextDeadline = !finished && timed && nextRemaining != null ? new Date(now + nextRemaining).toISOString() : null

  const won = await persistSession(
    supabase,
    gameId,
    {
      board: nextBoard,
      current_turn: nextTurn,
      move_count: 0,
      must_continue_from: null,
      must_continue_remaining: null,
      huffable_squares: [],
      red_time_ms: redMs,
      black_time_ms: blackMs,
      turn_started_at: finished ? null : new Date(now).toISOString(),
      last_move_from: null,
      last_move_to: square,
      status: finished ? 'finished' : 'active',
      result_reason: reason,
      winner_player_id: winnerPlayerId,
      is_draw: false,
      status_message: statusMessage,
      turn_deadline_at: nextDeadline,
      red_stats: redStats,
      black_stats: blackStats,
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
