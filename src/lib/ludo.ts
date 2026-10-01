import type { SupabaseClient } from '@supabase/supabase-js'
import { internalErrorMessage } from '@/lib/api-errors'
import { clearSessionTables } from './session-clear'
import { markGameFinished } from '@/lib/game-finish'
import type { LudoColor, LudoDiceRoll, LudoPiece, LudoPlayerState, LudoSession, LudoVariant, Player } from '@/types'
import { LUDO_DEFAULT_MAX_PLAYERS, LUDO_MAX_PLAYERS, LUDO_MIN_PLAYERS } from '@/lib/player-limits'
export { LUDO_DEFAULT_MAX_PLAYERS, LUDO_MAX_PLAYERS, LUDO_MIN_PLAYERS }

export const TRACK_LENGTH = 52

/**
 * A piece walks 51 track squares — its start plus 50 more — and turns into its
 * home column at the 51st step (the square directly behind its own start is
 * never entered; the home mouth comes first). Entering home at step 52 instead
 * made a piece overshoot its home mouth by one cell whenever it rolled the exact
 * count to the mouth + 1 (e.g. a 1 from the mouth), so it sailed past the home
 * lane and carried on around the track.
 */
export const HOME_ENTRY_STEPS = 51
const HOME_LANE_LENGTH = 5
const FINISH_STEPS = HOME_ENTRY_STEPS + HOME_LANE_LENGTH // 56

export const LUDO_COLORS: LudoColor[] = ['red', 'green', 'yellow', 'blue']

export const LUDO_COLOR_LABELS: Record<LudoColor, string> = {
  red: 'Red',
  green: 'Green',
  yellow: 'Yellow',
  blue: 'Blue',
}

export const LUDO_COLOR_HEX: Record<LudoColor, string> = {
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
}

/**
 * Track index where each colour's pieces enter the board. Corner layout:
 * green TL · red TR · blue BR · yellow BL (clockwise from green's ★ at index 0).
 */
export const START_POS: Record<LudoColor, number> = {
  green: 0,
  red: 13,
  blue: 26,
  yellow: 39,
}

/**
 * Two rule variants differ only in which track squares are safe from capture:
 *
 * - `modern`: the 8 standard safe squares — each colour's ★ start plus the
 *   mid-arm star 8 squares clockwise from each start.
 * - `traditional`: NO safe squares on the 52-cell track. The only refuge is a
 *   colour's own home column (the coloured lane to the finish), which opponents
 *   can never enter anyway, so nothing on the shared track is protected.
 */
export const LUDO_DEFAULT_VARIANT: LudoVariant = 'modern'

export function parseLudoVariant(raw: unknown): LudoVariant {
  return raw === 'traditional' ? 'traditional' : 'modern'
}

/** Mid-arm safe stars — the last safe square before each colour's home gate. */
const MID_ARM_SAFE_STARS = [
  8, // safe star [2,6] — guards red's home
  21, // safe star [6,12] — guards blue's home
  34, // safe star [12,8] — guards yellow's home
  47, // safe star [8,2] — guards green's home
] as const

const MODERN_SAFE_TRACK_POSITIONS: ReadonlySet<number> = new Set([
  START_POS.red,
  START_POS.green,
  START_POS.yellow,
  START_POS.blue,
  ...MID_ARM_SAFE_STARS,
])

/** Traditional has no capture-safe squares on the shared track. */
const TRADITIONAL_SAFE_TRACK_POSITIONS: ReadonlySet<number> = new Set()

function safeTrackPositions(variant: LudoVariant): ReadonlySet<number> {
  return variant === 'traditional' ? TRADITIONAL_SAFE_TRACK_POSITIONS : MODERN_SAFE_TRACK_POSITIONS
}

/**
 * Colors used for each player count. With 2 players they take diagonally
 * opposite corners — red (top-right) and yellow (bottom-left) — rather than
 * sitting side by side, matching how 2-player Ludo is normally set up.
 */
export function colorsForPlayerCount(count: number): LudoColor[] {
  if (count <= 2) return ['red', 'yellow']
  if (count === 3) return ['red', 'green', 'yellow']
  return ['red', 'green', 'yellow', 'blue']
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function createInitialPieces(): LudoPiece[] {
  return [0, 1, 2, 3].map((id) => ({ id, zone: 'base', pos: id }))
}

export function currentPlayerId(session: LudoSession): string | null {
  const order = session.turn_order ?? []
  if (order.length === 0) return null
  return order[session.current_turn_index % order.length] ?? null
}

export function ludoTurnDeadline(timerSeconds: number): string | null {
  if (!timerSeconds || timerSeconds <= 0) return null
  return new Date(Date.now() + timerSeconds * 1000).toISOString()
}

export function ludoSecondsLeft(deadlineAt: string | null | undefined): number {
  if (!deadlineAt) return 0
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000))
}

export function rollLudoDice(): LudoDiceRoll {
  const d1 = Math.floor(Math.random() * 6) + 1
  const d2 = Math.floor(Math.random() * 6) + 1
  return { d1, d2, total: d1 + d2, doubles: d1 === d2 }
}

/** Accepts jsonb from the DB or legacy single-die integers. */
export function parseLudoDice(raw: LudoDiceRoll | number | null | undefined): LudoDiceRoll | null {
  if (raw == null) return null
  if (typeof raw === 'number') {
    const total = raw
    const d1 = Math.min(6, Math.max(1, total - 1))
    const d2 = Math.max(1, Math.min(6, total - d1))
    return { d1, d2, total, doubles: d1 === d2 }
  }
  const total = raw.total ?? raw.d1 + raw.d2
  return {
    d1: raw.d1,
    d2: raw.d2,
    total,
    doubles: raw.doubles ?? raw.d1 === raw.d2,
  }
}

export function ludoDiceTotal(dice: LudoDiceRoll | number | null | undefined): number | null {
  return parseLudoDice(dice)?.total ?? null
}

export function ludoCanLeaveBase(dice: LudoDiceRoll): boolean {
  return dice.d1 === 6 || dice.d2 === 6
}

export function ludoGrantsExtraRoll(dice: LudoDiceRoll): boolean {
  // Only a double six grants the bonus roll — not every double.
  return dice.d1 === 6 && dice.d2 === 6
}

function ludoExtraRollReason(): string {
  return 'rolled double six'
}

export function formatLudoDiceRoll(dice: LudoDiceRoll): string {
  if (dice.doubles) return `${dice.d1} & ${dice.d2} (doubles, ${dice.total})`
  return `${dice.d1} + ${dice.d2} = ${dice.total}`
}

function stepsFromStart(color: LudoColor, piece: LudoPiece): number | null {
  if (piece.zone === 'base') return null
  if (piece.zone === 'finished') return FINISH_STEPS
  if (piece.zone === 'home') return HOME_ENTRY_STEPS + piece.pos
  return (piece.pos - START_POS[color] + TRACK_LENGTH) % TRACK_LENGTH
}

function pieceAtSteps(color: LudoColor, steps: number): LudoPiece {
  if (steps >= FINISH_STEPS) return { id: 0, zone: 'finished', pos: 0 }
  if (steps >= HOME_ENTRY_STEPS) return { id: 0, zone: 'home', pos: steps - HOME_ENTRY_STEPS }
  return { id: 0, zone: 'track', pos: (START_POS[color] + steps) % TRACK_LENGTH }
}

function trackPos(pos: number): number {
  return Number(pos)
}

function isSafeSquare(pos: number, variant: LudoVariant): boolean {
  return safeTrackPositions(variant).has(trackPos(pos))
}

function isCaptureAllowedAt(pos: number, variant: LudoVariant): boolean {
  return !isSafeSquare(pos, variant)
}

function wouldCaptureAt(
  states: LudoPlayerState[],
  destPos: number,
  color: LudoColor,
  movingPlayerId: string,
  movingPieceId: number,
  variant: LudoVariant
): boolean {
  const pos = trackPos(destPos)
  if (!isCaptureAllowedAt(pos, variant)) return false
  const occ = trackOccupants(states, movingPlayerId, movingPieceId).get(pos) ?? []
  return occ.some((o) => o.color !== color && o.count === 1)
}

function victimsAtTrackPos(
  states: LudoPlayerState[],
  destPos: number,
  capturingColor: LudoColor
): { playerId: string; pieceId: number }[] {
  const pos = trackPos(destPos)
  const victims: { playerId: string; pieceId: number }[] = []
  for (const row of states) {
    if (row.color === capturingColor) continue
    for (const piece of row.pieces) {
      if (piece.zone === 'track' && trackPos(piece.pos) === pos) {
        victims.push({ playerId: row.player_id, pieceId: piece.id })
      }
    }
  }
  return victims
}

function trackOccupants(
  states: LudoPlayerState[],
  excludePlayerId?: string,
  excludePieceId?: number
): Map<number, { color: LudoColor; playerId: string; pieceId: number; count: number }[]> {
  const map = new Map<number, { color: LudoColor; playerId: string; pieceId: number; count: number }[]>()

  for (const row of states) {
    for (const piece of row.pieces) {
      if (piece.zone !== 'track') continue
      if (row.player_id === excludePlayerId && piece.id === excludePieceId) continue
      const pos = trackPos(piece.pos)
      const list = map.get(pos) ?? []
      const existing = list.find((e) => e.color === row.color && e.playerId === row.player_id)
      if (existing) {
        existing.count += 1
      } else {
        list.push({ color: row.color, playerId: row.player_id, pieceId: piece.id, count: 1 })
      }
      map.set(pos, list)
    }
  }

  return map
}

export interface LudoMoveOption {
  pieceId: number
  from: LudoPiece
  to: LudoPiece
  captures: boolean
  /** Index into remaining_dice for which die this move uses. */
  diceIndex: number
  /** Pip value of the die consumed (e.g. 6 or 3), or the sum when usesAllDice. */
  diceValue: number
  /** When true, this move spends every die in remaining_dice on one piece at once. */
  usesAllDice?: boolean
}

export function getLegalMovesForSteps(
  color: LudoColor,
  pieces: LudoPiece[],
  steps: number,
  allStates: LudoPlayerState[],
  playerId: string,
  variant: LudoVariant = LUDO_DEFAULT_VARIANT
): Omit<LudoMoveOption, 'diceIndex' | 'diceValue'>[] {
  const moves: Omit<LudoMoveOption, 'diceIndex' | 'diceValue'>[] = []

  const hasInPlay = pieces.some((p) => p.zone !== 'base')

  for (const piece of pieces) {
    if (piece.zone === 'finished') continue

    if (piece.zone === 'base') {
      if (steps !== 6) continue
      if (!hasInPlay && pieces.filter((p) => p.zone === 'base').length === pieces.length) {
        // all in base — must bring one out on a 6
      }
      const start = START_POS[color]
      // Bringing a piece out always lands it on the colour's own start square;
      // any pieces already there simply share the square.
      //
      // Emerging from the yard never captures an opponent parked on the start
      // square — you can't "chase them home" just by stepping out of your house.
      // A capture must be earned by counting a die and moving onto them on the
      // track. (In the `modern` variant the start square is safe anyway; this
      // also covers the `traditional` variant where it isn't.)
      moves.push({
        pieceId: piece.id,
        from: piece,
        to: { id: piece.id, zone: 'track', pos: start },
        captures: false,
      })
      continue
    }

    const currentSteps = stepsFromStart(color, piece)
    if (currentSteps == null) continue

    const newSteps = currentSteps + steps
    if (newSteps > FINISH_STEPS) continue

    if (piece.zone === 'home') {
      const to = pieceAtSteps(color, newSteps)
      moves.push({
        pieceId: piece.id,
        from: piece,
        to: { ...to, id: piece.id },
        captures: false,
      })
      continue
    }

    const dest = pieceAtSteps(color, newSteps)
    if (dest.zone === 'track') {
      const captures = wouldCaptureAt(allStates, dest.pos, color, playerId, piece.id, variant)
      moves.push({
        pieceId: piece.id,
        from: piece,
        to: { ...dest, id: piece.id },
        captures,
      })
    } else {
      moves.push({
        pieceId: piece.id,
        from: piece,
        to: { ...dest, id: piece.id },
        captures: false,
      })
    }
  }

  return moves
}

export function getLegalMovesFromRemaining(
  color: LudoColor,
  pieces: LudoPiece[],
  remainingDice: number[],
  allStates: LudoPlayerState[],
  playerId: string,
  variant: LudoVariant = LUDO_DEFAULT_VARIANT
): LudoMoveOption[] {
  const moves: LudoMoveOption[] = []
  for (let diceIndex = 0; diceIndex < remainingDice.length; diceIndex += 1) {
    const steps = remainingDice[diceIndex]!
    const stepMoves = getLegalMovesForSteps(color, pieces, steps, allStates, playerId, variant)
    for (const move of stepMoves) {
      moves.push({ ...move, diceIndex, diceValue: steps })
    }
  }
  return moves
}

/** Pieces on the track or in the home column — not in the yard or finished. */
export function ludoPiecesOnBoard(pieces: LudoPiece[]): LudoPiece[] {
  return pieces.filter((p) => p.zone === 'track' || p.zone === 'home')
}

/**
 * When only one piece is outside the yard and every remaining die must land on
 * it (no bring-out choice), offer a single combined move instead of counting
 * die-by-die.
 */
export function resolveLudoMovesForTurn(
  color: LudoColor,
  pieces: LudoPiece[],
  remainingDice: number[],
  allStates: LudoPlayerState[],
  playerId: string,
  variant: LudoVariant = LUDO_DEFAULT_VARIANT
): LudoMoveOption[] {
  const perDie = getLegalMovesFromRemaining(color, pieces, remainingDice, allStates, playerId, variant)
  if (remainingDice.length <= 1) return perDie

  const onBoard = ludoPiecesOnBoard(pieces)
  if (onBoard.length !== 1) return perDie

  if (perDie.some((m) => m.from.zone === 'base')) return perDie

  const onlyPiece = onBoard[0]!
  const pieceIds = new Set(perDie.map((m) => m.pieceId))
  if (pieceIds.size !== 1 || !pieceIds.has(onlyPiece.id)) return perDie

  const totalSteps = remainingDice.reduce((sum, n) => sum + n, 0)
  const combined = getLegalMovesForSteps(color, pieces, totalSteps, allStates, playerId, variant)
  const forPiece = combined.find((m) => m.pieceId === onlyPiece.id)
  if (!forPiece) return perDie

  return [{ ...forPiece, diceIndex: 0, diceValue: totalSteps, usesAllDice: true }]
}

export function applyMoveLocally(
  states: LudoPlayerState[],
  playerId: string,
  move: Omit<LudoMoveOption, 'diceIndex' | 'diceValue'>,
  color: LudoColor,
  variant: LudoVariant
): LudoPlayerState[] {
  const captureVictims =
    move.from.zone !== 'base' &&
    move.to.zone === 'track' &&
    wouldCaptureAt(states, move.to.pos, color, playerId, move.pieceId, variant)
      ? victimsAtTrackPos(states, move.to.pos, color)
      : []
  const victimKeys = new Set(captureVictims.map((v) => `${v.playerId}:${v.pieceId}`))
  const isCapture = victimKeys.size > 0

  // House rule: capturing sends the victim back to its yard AND teleports the
  // capturing piece straight to its own finished home as the reward.
  //
  // This does NOT let a player dodge a leftover die: persistMove still forces any
  // remaining die onto whatever OTHER piece can move it, and only forfeits it when
  // the player has no other movable piece — i.e. they're genuinely back "in their
  // house" (all remaining pieces in the yard). "Use all rolls when possible" is
  // about the leftover die finding another piece, not about this piece staying put.
  const moverDest: LudoPiece = isCapture
    ? { id: move.pieceId, zone: 'finished', pos: 0 }
    : { ...move.to, id: move.pieceId }

  const nextStates = states.map((row) => {
    if (row.player_id !== playerId) return row
    return {
      ...row,
      pieces: row.pieces.map((p) => (p.id === move.pieceId ? moverDest : p)),
    }
  })

  if (!isCapture) return nextStates

  return nextStates.map((row) => {
    let changed = false
    const nextPieces = row.pieces.map((piece) => {
      const key = `${row.player_id}:${piece.id}`
      if (!victimKeys.has(key)) return piece
      changed = true
      return returnPieceToHomeYard(piece)
    })
    return changed ? { ...row, pieces: nextPieces } : row
  })
}

export function parseRemainingDice(raw: number[] | null | undefined): number[] {
  if (!raw || !Array.isArray(raw)) return []
  return raw.filter((n) => typeof n === 'number' && n >= 1 && n <= 6)
}

/** Prefer stored remaining_dice; fall back to last roll for older sessions. */
export function resolveRemainingDice(session: Pick<LudoSession, 'remaining_dice' | 'last_dice'>): number[] {
  const stored = parseRemainingDice(session.remaining_dice)
  if (stored.length > 0) return stored
  const roll = parseLudoDice(session.last_dice)
  if (roll) return [roll.d1, roll.d2]
  return []
}

/** Collapse duplicate UI options when two dice show the same move (e.g. 6+6 bring-out). */
export function dedupeLudoMovesForUi(moves: LudoMoveOption[]): LudoMoveOption[] {
  const byKey = new Map<string, LudoMoveOption>()
  for (const move of moves) {
    const key = `${move.pieceId}|${move.from.zone}|${move.from.pos}|${move.to.zone}|${move.to.pos}`
    const existing = byKey.get(key)
    if (!existing || move.diceIndex < existing.diceIndex) {
      byKey.set(key, move)
    }
  }
  return [...byKey.values()]
}

export function pickLudoMoveForPiece(moves: LudoMoveOption[], pieceId: number): LudoMoveOption | null {
  const pieceMoves = moves.filter((m) => m.pieceId === pieceId)
  if (pieceMoves.length === 0) return null

  const combined = pieceMoves.find((m) => m.usesAllDice)
  if (combined) return combined

  if (pieceMoves.length === 1) return pieceMoves[0]!

  // Prefer a capturing move: tapping a piece that can eat an opponent should
  // send it onto that square (and the victim home), rather than silently
  // playing the other die and missing the capture.
  const capturing = pieceMoves.filter((m) => m.captures)
  if (capturing.length > 0) {
    return [...capturing].sort((a, b) => a.diceIndex - b.diceIndex)[0]!
  }

  const leavingBase = pieceMoves.filter((m) => m.from.zone === 'base')
  const pool = leavingBase.length > 0 ? leavingBase : pieceMoves
  return [...pool].sort((a, b) => a.diceIndex - b.diceIndex)[0]!
}

export function allPiecesFinished(pieces: LudoPiece[]): boolean {
  return pieces.every((p) => p.zone === 'finished')
}

export function finishedPieceCount(pieces: LudoPiece[]): number {
  return pieces.filter((p) => p.zone === 'finished').length
}

export type LudoStanding = {
  playerId: string
  name: string
  color: LudoColor
  finishedCount: number
  rank: number
}

export function buildLudoStandings(
  states: LudoPlayerState[],
  players: Player[],
  winnerPlayerId?: string | null
): LudoStanding[] {
  const rows = states.map((state) => ({
    playerId: state.player_id,
    name: players.find((p) => p.id === state.player_id)?.name ?? 'Player',
    color: state.color,
    finishedCount: finishedPieceCount(state.pieces),
  }))

  rows.sort((a, b) => {
    if (winnerPlayerId) {
      if (a.playerId === winnerPlayerId) return -1
      if (b.playerId === winnerPlayerId) return 1
    }
    return b.finishedCount - a.finishedCount || a.name.localeCompare(b.name)
  })

  return rows.map((row, index) => ({ ...row, rank: index + 1 }))
}

/** Send a captured piece back to its own yard circle (not the track start square). */
function returnPieceToHomeYard(piece: LudoPiece): LudoPiece {
  return { id: piece.id, zone: 'base', pos: piece.id }
}

function advanceTurnIndex(session: LudoSession): number {
  return (session.current_turn_index + 1) % session.turn_order.length
}

// ── Per-game trophy accumulator ───────────────────────────────────────────────────────────
//
// PURELY ADDITIVE. Everything below is a write-only tally the finish-time facts builder folds
// into trophy counters (src/lib/trophies/game-facts/ludo.ts). None of it is ever read by the
// engine's move / capture / turn / win logic — remove it and gameplay is byte-for-byte the same.
// Ludo keeps only current piece positions, so a six rolled or a piece captured leaves no trace
// once the turn passes; this scratch blob on `ludo_player_state.game_counters` is that trace.
// See supabase/migrations/20260811010000_ludo_round_stats.sql.

/** A flat bag of per-game counters. Absent key == 0. */
type LudoGameCounters = Record<string, number>

/** Read the stored scratch counters off a state row, tolerating the untyped jsonb column. */
function readGameCounters(row: LudoPlayerState | undefined): LudoGameCounters {
  const raw = (row as unknown as { game_counters?: unknown } | undefined)?.game_counters
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: LudoGameCounters = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
  }
  return out
}

/** True when two of a player's own pieces share a track square (a capture-proof pair). */
function hasOwnStack(pieces: LudoPiece[]): boolean {
  const seen = new Set<number>()
  for (const piece of pieces) {
    if (piece.zone !== 'track') continue
    if (seen.has(piece.pos)) return true
    seen.add(piece.pos)
  }
  return false
}

/** The roller's scratch counters after one landed roll (sixes, double sixes, streaks). */
function rollCounterUpdate(base: LudoGameCounters, dice: LudoDiceRoll): LudoGameCounters {
  const next = { ...base }
  next.rolls = (next.rolls ?? 0) + 1
  const sixes = (dice.d1 === 6 ? 1 : 0) + (dice.d2 === 6 ? 1 : 0)
  if (sixes > 0) next.sixes_rolled = (next.sixes_rolled ?? 0) + sixes
  if (dice.d1 === 6 && dice.d2 === 6) {
    next.double_sixes = (next.double_sixes ?? 0) + 1
    next.dsix_streak = (next.dsix_streak ?? 0) + 1
  } else {
    next.dsix_streak = 0
  }
  next.dsix_streak_max = Math.max(next.dsix_streak_max ?? 0, next.dsix_streak ?? 0)
  return next
}

/**
 * Record the roller's dice counters after a roll that won the session CAS.
 *
 * A plain (non-CAS) write on the roller's own row: the caller only invokes this once the
 * session claim landed, so exactly one request per roll reaches here. Best-effort — a failed
 * counter write must never surface as a failed roll, so this never returns an error.
 */
async function bumpRollCounters(
  supabase: SupabaseClient,
  gameId: string,
  playerRow: LudoPlayerState,
  dice: LudoDiceRoll
): Promise<void> {
  const next = rollCounterUpdate(readGameCounters(playerRow), dice)
  await supabase
    .from('ludo_player_state')
    .update({ game_counters: next })
    .eq('game_id', gameId)
    .eq('player_id', playerRow.player_id)
}

async function loadGameState(
  supabase: SupabaseClient,
  gameId: string
): Promise<{
  session: LudoSession | null
  states: LudoPlayerState[]
  timerSeconds: number
  variant: LudoVariant
  playerNames: Map<string, string>
}> {
  const [sessionRes, statesRes, gameRes, playersRes] = await Promise.all([
    supabase.from('ludo_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    supabase.from('ludo_player_state').select('*').eq('game_id', gameId).order('player_order'),
    supabase.from('games').select('timer_seconds, ludo_variant').eq('id', gameId).maybeSingle(),
    supabase.from('players').select('id, name').eq('game_id', gameId),
  ])

  const playerNames = new Map<string, string>()
  for (const p of playersRes.data ?? []) {
    playerNames.set(p.id, p.name)
  }

  return {
    session: sessionRes.data as LudoSession | null,
    states: (statesRes.data as LudoPlayerState[]) ?? [],
    timerSeconds: gameRes.data?.timer_seconds ?? 0,
    variant: parseLudoVariant(gameRes.data?.ludo_variant),
    playerNames,
  }
}

export async function initializeLudoGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<{ error?: string }> {
  const turnOrder = shuffle(playerIds)
  const colors = colorsForPlayerCount(turnOrder.length)

  const { data: gameRow } = await supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle()
  const timerSeconds = gameRow?.timer_seconds ?? 0

  const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
  const names = new Map<string, string>()
  for (const p of playerRows ?? []) {
    names.set(p.id, p.name)
  }

  const firstPlayerId = turnOrder[0]
  const firstName = firstPlayerId ? (names.get(firstPlayerId) ?? 'Player') : 'Player'

  const sessionRow: Partial<LudoSession> = {
    game_id: gameId,
    turn_order: turnOrder,
    current_turn_index: 0,
    phase: 'roll',
    last_dice: null,
    remaining_dice: null,
    consecutive_sixes: 0,
    extra_turn: false,
    status_message: `${firstName}'s turn — roll the dice`,
    winner_player_id: null,
    turn_deadline_at: ludoTurnDeadline(timerSeconds),
  }

  const { error: sessionError } = await supabase.from('ludo_sessions').insert(sessionRow)
  if (sessionError) return { error: internalErrorMessage('ludo', sessionError) }

  const stateRows = turnOrder.map((playerId, index) => ({
    game_id: gameId,
    player_id: playerId,
    color: colors[index]!,
    pieces: createInitialPieces(),
    player_order: index,
  }))

  const { error: statesError } = await supabase.from('ludo_player_state').insert(stateRows)
  if (statesError) return { error: internalErrorMessage('ludo', statesError) }

  return {}
}

export async function clearLudoSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  return clearSessionTables(supabase, gameId, ['ludo_sessions', 'ludo_player_state'], { resetSpectators: true })
}

/**
 * Optimistic-concurrency session write. The update only lands if the row still
 * carries the `expectedUpdatedAt` we read, so when two requests race (e.g. every
 * client driving the turn timer, or two concurrent auto-rolls) only the first
 * wins — the loser gets 0 rows and the caller aborts before mutating piece state.
 * Returns true if this write won.
 */
async function persistSession(
  supabase: SupabaseClient,
  gameId: string,
  patch: Partial<LudoSession>,
  timerSeconds: number,
  expectedUpdatedAt: string
): Promise<boolean> {
  const { data } = await supabase
    .from('ludo_sessions')
    .update({
      ...patch,
      turn_deadline_at: patch.phase === 'finished' ? null : ludoTurnDeadline(timerSeconds),
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .eq('updated_at', expectedUpdatedAt)
    .select('game_id')
  return (data?.length ?? 0) > 0
}

async function persistMove(
  supabase: SupabaseClient,
  gameId: string,
  session: LudoSession,
  states: LudoPlayerState[],
  playerId: string,
  move: LudoMoveOption,
  timerSeconds: number,
  playerNames: Map<string, string>,
  variant: LudoVariant
): Promise<{ error?: string }> {
  const playerRow = states.find((s) => s.player_id === playerId)
  if (!playerRow) return { error: 'Player state not found' }

  const nextStates = applyMoveLocally(states, playerId, move, playerRow.color, variant)

  const myPieces = nextStates.find((s) => s.player_id === playerId)?.pieces ?? []
  const won = allPiecesFinished(myPieces)
  const name = playerNames.get(playerId) ?? 'Player'
  const roll = parseLudoDice(session.last_dice)

  const remainingBefore = resolveRemainingDice(session)
  const remainingAfter = move.usesAllDice ? [] : remainingBefore.filter((_, i) => i !== move.diceIndex)

  const movedFromBase = move.from.zone === 'base' && move.to.zone === 'track'
  const didCapture =
    !movedFromBase &&
    move.to.zone === 'track' &&
    victimsAtTrackPos(states, move.to.pos, playerRow.color).length > 0 &&
    wouldCaptureAt(states, move.to.pos, playerRow.color, playerId, move.pieceId, variant)
  const moveNote = didCapture
    ? 'captured an opponent and raced their own piece home!'
    : movedFromBase
      ? 'brought a piece onto the board'
      : move.to.zone === 'finished'
        ? 'finished a piece'
        : `moved a piece ${move.diceValue}`

  let phase: LudoSession['phase'] = 'roll'
  let currentTurnIndex = session.current_turn_index
  let extraTurn = false
  let lastDice: LudoDiceRoll | null = null
  let remainingDice: number[] | null = null
  let consecutiveSixes = session.consecutive_sixes
  let statusMessage: string

  if (won) {
    phase = 'finished'
    statusMessage = `${name} wins!`
  } else if (remainingAfter.length > 0) {
    const nextMoves = getLegalMovesFromRemaining(
      playerRow.color,
      myPieces,
      remainingAfter,
      nextStates,
      playerId,
      variant
    )
    if (nextMoves.length > 0) {
      phase = 'move'
      lastDice = roll
      remainingDice = remainingAfter
      const left = remainingAfter.join(' + ')
      statusMessage = `${name} ${moveNote} — use die ${left} next`
    } else {
      const grantsExtra = roll != null && ludoGrantsExtraRoll(roll)
      if (grantsExtra) consecutiveSixes += 1
      else consecutiveSixes = 0

      if (grantsExtra && consecutiveSixes < 3) {
        extraTurn = true
        statusMessage = `${name} ${moveNote} — ${roll ? ludoExtraRollReason() : 'bonus roll'}, roll again!`
      } else if (consecutiveSixes >= 3) {
        currentTurnIndex = advanceTurnIndex(session)
        consecutiveSixes = 0
        const nextId = session.turn_order[currentTurnIndex]
        statusMessage = `Three double sixes in a row — turn lost. ${playerNames.get(nextId ?? '') ?? 'Next player'}'s turn`
      } else {
        currentTurnIndex = advanceTurnIndex(session)
        const nextId = session.turn_order[currentTurnIndex]
        statusMessage = `${name} ${moveNote}. ${playerNames.get(nextId ?? '') ?? 'Next player'}'s turn`
      }
    }
  } else {
    const grantsExtra = roll != null && ludoGrantsExtraRoll(roll)
    if (grantsExtra) consecutiveSixes += 1
    else consecutiveSixes = 0

    if (grantsExtra && consecutiveSixes < 3) {
      extraTurn = true
      statusMessage = `${name} ${moveNote} — ${roll ? ludoExtraRollReason() : 'bonus roll'}, roll again!`
    } else if (consecutiveSixes >= 3) {
      currentTurnIndex = advanceTurnIndex(session)
      consecutiveSixes = 0
      const nextId = session.turn_order[currentTurnIndex]
      statusMessage = `Three double sixes in a row — turn lost. ${playerNames.get(nextId ?? '') ?? 'Next player'}'s turn`
    } else {
      currentTurnIndex = advanceTurnIndex(session)
      const nextId = session.turn_order[currentTurnIndex]
      statusMessage = `${name} ${moveNote}. ${playerNames.get(nextId ?? '') ?? 'Next player'}'s turn`
    }
  }

  // ── Trophy counters (additive, gameplay-neutral) ────────────────────────────────────────
  // Every affected row (the mover, plus any capture victims) also has its pieces changed by this
  // move, so all of these land inside `changedRows` below and ride the same CAS-gated write.
  const victims = didCapture ? victimsAtTrackPos(states, move.to.pos, playerRow.color) : []
  const finalCounters = new Map<string, LudoGameCounters>()

  // Mover: deployments, captures dealt, and the board-shape flags.
  const moverCounters = readGameCounters(playerRow)
  if (movedFromBase) {
    moverCounters.pieces_deployed = (moverCounters.pieces_deployed ?? 0) + 1
    // A bring-out on the player's very first roll of the game. `rolls` reaches 1 in the roll
    // handler for this same turn, so 1 here means "first roll".
    if ((moverCounters.rolls ?? 0) === 1) moverCounters.fast_start = 1
  }
  // Landing on a safe square by counting a die (the automatic bring-out to a safe start square
  // is excluded so the achievement means reaching a mid-arm star, not just leaving the yard).
  // `traditional` has no safe track squares, so this only ever fires in `modern`.
  if (!movedFromBase && move.to.zone === 'track' && isSafeSquare(move.to.pos, variant)) {
    moverCounters.safe_landings = (moverCounters.safe_landings ?? 0) + 1
  }
  if (victims.length > 0) {
    // Count pieces actually sent home — matching applyMoveLocally, which returns every opponent
    // piece on the destination square when a capture triggers.
    moverCounters.captures_made = (moverCounters.captures_made ?? 0) + victims.length
    moverCounters.max_captures_in_move = Math.max(moverCounters.max_captures_in_move ?? 0, victims.length)
    for (const victim of victims) {
      const victimColor = states.find((s) => s.player_id === victim.playerId)?.color
      if (victimColor) {
        const key = `cap_vs_${victimColor}`
        moverCounters[key] = (moverCounters[key] ?? 0) + 1
      }
    }
  }
  const moverPiecesAfter = nextStates.find((s) => s.player_id === playerId)?.pieces ?? []
  if (moverPiecesAfter.length > 0 && moverPiecesAfter.every((p) => p.zone !== 'base')) {
    moverCounters.full_deploy = 1
  }
  if (hasOwnStack(moverPiecesAfter)) moverCounters.shield = 1
  finalCounters.set(playerId, moverCounters)

  // Victims: each piece knocked home bumps `times_captured` and marks its id in `captured_mask`
  // (so the finish builder can tell a piece that was captured yet still reached home). A victim
  // reduced to all four in the yard by this capture records the comeback flag.
  for (const victim of victims) {
    const counters =
      finalCounters.get(victim.playerId) ?? readGameCounters(states.find((s) => s.player_id === victim.playerId))
    counters.times_captured = (counters.times_captured ?? 0) + 1
    counters.captured_mask = (counters.captured_mask ?? 0) | (1 << victim.pieceId)
    const victimPiecesAfter = nextStates.find((s) => s.player_id === victim.playerId)?.pieces ?? []
    if (victimPiecesAfter.length > 0 && victimPiecesAfter.every((p) => p.zone === 'base')) {
      counters.all_four_yarded = 1
    }
    finalCounters.set(victim.playerId, counters)
  }

  const changedRows = nextStates.filter((row) => {
    const original = states.find((s) => s.player_id === row.player_id)
    return !original || JSON.stringify(original.pieces) !== JSON.stringify(row.pieces)
  })

  // Claim the turn via CAS FIRST. If another request already moved the game from
  // this exact state (e.g. the loser of two concurrent auto-rolls), we lose the
  // CAS and bail — discarding our non-deterministic roll without touching pieces.
  const claimed = await persistSession(
    supabase,
    gameId,
    {
      phase,
      current_turn_index: currentTurnIndex,
      last_dice: lastDice,
      remaining_dice: remainingDice,
      consecutive_sixes: consecutiveSixes,
      extra_turn: extraTurn,
      status_message: statusMessage,
      winner_player_id: won ? playerId : null,
    },
    timerSeconds,
    session.updated_at
  )
  if (!claimed) return {}

  // We hold the claim — now safe to write piece state and finalize.
  const writeResults = await Promise.all(
    changedRows.map((row) => {
      const counters = finalCounters.get(row.player_id)
      const patch = counters ? { pieces: row.pieces, game_counters: counters } : { pieces: row.pieces }
      return supabase.from('ludo_player_state').update(patch).eq('game_id', gameId).eq('player_id', row.player_id)
    })
  )
  const writeError = writeResults.find((r) => r.error)
  if (writeError?.error) return { error: internalErrorMessage('ludo', writeError.error) }

  // Mark the game over only when this committed claim ended it, so a single
  // winner finalizes.
  if (won) await markGameFinished(supabase, gameId)

  return {}
}

export async function processLudoRoll(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string; dice?: LudoDiceRoll }> {
  const { session, states, timerSeconds, variant, playerNames } = await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }
  if (session.phase !== 'roll') return { error: 'Not roll phase' }
  if (currentPlayerId(session) !== playerId) return { error: 'Not your turn' }

  const dice = rollLudoDice()
  const playerRow = states.find((s) => s.player_id === playerId)
  if (!playerRow) return { error: 'Player state not found' }

  const remainingDice = [dice.d1, dice.d2]
  // A turn is only forfeited when NO die is playable. If at least one die has a
  // legal move, the player enters the move phase; the move handler then advances
  // the turn if the remaining die can't be used. (Requiring the full two-die
  // sequence to be playable here wrongly skipped turns where only one die moved.)
  const turnMoves = resolveLudoMovesForTurn(playerRow.color, playerRow.pieces, remainingDice, states, playerId, variant)
  const canPlay = turnMoves.length > 0
  const name = playerNames.get(playerId) ?? 'Player'
  const rollLabel = formatLudoDiceRoll(dice)
  const combinedOnly = turnMoves.length === 1 && turnMoves[0]?.usesAllDice

  if (!canPlay) {
    let consecutiveSixes = session.consecutive_sixes
    if (ludoGrantsExtraRoll(dice)) consecutiveSixes += 1
    else consecutiveSixes = 0

    if (ludoGrantsExtraRoll(dice) && consecutiveSixes < 3) {
      const claimed = await persistSession(
        supabase,
        gameId,
        {
          last_dice: null,
          remaining_dice: null,
          consecutive_sixes: consecutiveSixes,
          phase: 'roll',
          status_message: `${name} rolled ${rollLabel} but has no moves — roll again!`,
        },
        timerSeconds,
        session.updated_at
      )
      if (claimed) await bumpRollCounters(supabase, gameId, playerRow, dice)
      return { dice }
    }

    if (consecutiveSixes >= 3) {
      const nextIndex = advanceTurnIndex(session)
      const nextId = session.turn_order[nextIndex]
      const claimed = await persistSession(
        supabase,
        gameId,
        {
          last_dice: null,
          remaining_dice: null,
          consecutive_sixes: 0,
          current_turn_index: nextIndex,
          phase: 'roll',
          status_message: `Three double sixes in a row — turn lost. ${playerNames.get(nextId ?? '') ?? 'Next player'}'s turn`,
        },
        timerSeconds,
        session.updated_at
      )
      if (claimed) await bumpRollCounters(supabase, gameId, playerRow, dice)
      return { dice }
    }

    const nextIndex = advanceTurnIndex(session)
    const nextId = session.turn_order[nextIndex]
    const claimed = await persistSession(
      supabase,
      gameId,
      {
        last_dice: null,
        remaining_dice: null,
        consecutive_sixes: 0,
        current_turn_index: nextIndex,
        phase: 'roll',
        status_message: `${name} rolled ${rollLabel} — no moves. ${playerNames.get(nextId ?? '') ?? 'Next player'}'s turn`,
      },
      timerSeconds,
      session.updated_at
    )
    if (claimed) await bumpRollCounters(supabase, gameId, playerRow, dice)
    return { dice }
  }

  const claimed = await persistSession(
    supabase,
    gameId,
    {
      last_dice: dice,
      remaining_dice: remainingDice,
      phase: 'move',
      status_message: combinedOnly
        ? `${name} rolled ${rollLabel} — move ${turnMoves[0]!.diceValue} spaces`
        : `${name} rolled ${rollLabel} — use each die (${dice.d1} & ${dice.d2})`,
    },
    timerSeconds,
    session.updated_at
  )
  if (claimed) await bumpRollCounters(supabase, gameId, playerRow, dice)
  return { dice }
}

export async function processLudoMove(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  pieceId: number,
  diceIndex?: number
): Promise<{ error?: string }> {
  const { session, states, timerSeconds, variant, playerNames } = await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }
  if (session.phase !== 'move') return { error: 'Not move phase' }
  if (currentPlayerId(session) !== playerId) return { error: 'Not your turn' }
  if (!session.last_dice) return { error: 'Roll first' }

  const playerRow = states.find((s) => s.player_id === playerId)
  if (!playerRow) return { error: 'Player state not found' }

  const remaining = resolveRemainingDice(session)
  if (remaining.length === 0) return { error: 'No dice left to play' }

  const moves = resolveLudoMovesForTurn(playerRow.color, playerRow.pieces, remaining, states, playerId, variant)

  let move =
    diceIndex != null
      ? moves.find((m) => m.pieceId === pieceId && (m.diceIndex === diceIndex || (m.usesAllDice && diceIndex === 0)))
      : undefined

  if (!move) {
    move = pickLudoMoveForPiece(moves, pieceId) ?? undefined
  }

  if (!move) return { error: 'Invalid move' }

  return persistMove(supabase, gameId, session, states, playerId, move, timerSeconds, playerNames, variant)
}

export async function processLudoExpireTurn(supabase: SupabaseClient, gameId: string): Promise<{ error?: string }> {
  const { session, timerSeconds, playerNames } = await loadGameState(supabase, gameId)
  if (!session || session.phase === 'finished') return {}

  const playerId = currentPlayerId(session)
  if (!playerId) return { error: 'No current player' }

  // Server-side deadline guard: only expire once the stored deadline has passed.
  // The deadline is set by the server, so this is checked against the server clock
  // regardless of the caller — without it any client could POST /expire-turn early
  // and skip the active player's turn. No deadline (untimed game) = never expires.
  // Small grace covers sub-second skew between the deadline write and this read.
  const deadlineMs = session.turn_deadline_at ? new Date(session.turn_deadline_at).getTime() : null
  if (deadlineMs == null || Date.now() < deadlineMs - 750) return {}

  // Timeout forfeits the turn — we never roll or move on a player's behalf.
  // Play simply passes to the next player (their dice/roll are reset).
  const nextIndex = advanceTurnIndex(session)
  const nextId = session.turn_order[nextIndex]
  await persistSession(
    supabase,
    gameId,
    {
      last_dice: null,
      remaining_dice: null,
      phase: 'roll',
      current_turn_index: nextIndex,
      consecutive_sixes: 0,
      status_message: `Time's up — ${playerNames.get(nextId ?? '') ?? 'Next player'}'s turn`,
    },
    timerSeconds,
    session.updated_at
  )
  return {}
}

export type LudoHostMode = 'spectator' | 'player'

const LUDO_HOST_MODE_KEY = 'ludo_host_mode'

export function getLudoHostMode(gameCode: string): LudoHostMode {
  if (typeof window === 'undefined') return 'player'
  return (localStorage.getItem(`${LUDO_HOST_MODE_KEY}_${gameCode}`) as LudoHostMode) ?? 'player'
}

export function setLudoHostMode(gameCode: string, mode: LudoHostMode): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${LUDO_HOST_MODE_KEY}_${gameCode}`, mode)
}

/**
 * Remove a player from a Ludo game (they left or were kicked). Without this the
 * player's id stayed in `turn_order`, so the game kept handing them turns — a ghost
 * with no name, and a timer counting down on a player who was gone. Drop them from
 * the turn order (fixing current_turn_index), delete their piece state, end the game
 * if fewer than two players remain (lone survivor wins), then delete their player row.
 *
 * The session write is a plain (non-CAS) update on purpose: a removal must always
 * land — a lost optimistic-concurrency race would otherwise leave the ghost behind.
 */
export async function removeLudoPlayer(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  playerName?: string
): Promise<{ error: string | null }> {
  const { data: sessionRaw } = await supabase.from('ludo_sessions').select('*').eq('game_id', gameId).maybeSingle()
  const session = sessionRaw as LudoSession | null
  const order = session ? [...(session.turn_order ?? [])] : []
  const removedIndex = order.indexOf(playerId)

  if (session && removedIndex >= 0 && session.phase !== 'finished') {
    const turnOrder = order.filter((id) => id !== playerId)
    let currentTurnIndex = session.current_turn_index
    if (removedIndex < currentTurnIndex) currentTurnIndex -= 1
    else if (removedIndex === currentTurnIndex && turnOrder.length > 0) currentTurnIndex %= turnOrder.length
    if (turnOrder.length === 0) currentTurnIndex = 0

    const removedName = playerName ?? 'A player'
    const { data: gameRow } = await supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle()
    const timerSeconds = gameRow?.timer_seconds ?? 0
    const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
    const names = new Map<string, string>()
    for (const p of playerRows ?? []) names.set(p.id, p.name)

    const update: Record<string, unknown> = {
      turn_order: turnOrder,
      current_turn_index: currentTurnIndex,
      remaining_dice: null,
      extra_turn: false,
      consecutive_sixes: 0,
      updated_at: new Date().toISOString(),
    }

    const finishing = turnOrder.length < 2
    if (finishing) {
      // Not enough players to keep going — the lone remaining player wins.
      const winnerPlayerId = turnOrder[0] ?? null
      const winnerName = winnerPlayerId ? (names.get(winnerPlayerId) ?? 'Winner') : null
      update.phase = 'finished'
      update.winner_player_id = winnerPlayerId
      update.status_message = winnerName
        ? `${removedName} left — ${winnerName} wins!`
        : `${removedName} left — game over.`
      update.turn_deadline_at = null
    } else {
      const nextPlayerId = turnOrder[currentTurnIndex]
      update.phase = 'roll'
      update.status_message = `${removedName} left. ${names.get(nextPlayerId) ?? 'Next player'}'s turn`
      update.turn_deadline_at = ludoTurnDeadline(timerSeconds)
    }

    const { error: sessionError } = await supabase.from('ludo_sessions').update(update).eq('game_id', gameId)
    if (sessionError) return { error: internalErrorMessage('ludo', sessionError) }

    await supabase.from('ludo_player_state').delete().eq('game_id', gameId).eq('player_id', playerId)
    if (finishing) await markGameFinished(supabase, gameId)
    const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
    return { error: error?.message ?? null }
  }

  // Lobby, spectator, already-finished, or not in the turn order — just drop their state + row.
  await supabase.from('ludo_player_state').delete().eq('game_id', gameId).eq('player_id', playerId)
  const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
  return { error: error?.message ?? null }
}
