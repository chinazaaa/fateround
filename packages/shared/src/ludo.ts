import type { LudoColor, LudoDiceRoll, LudoPiece, LudoPlayerState, LudoSession, LudoVariant, Player } from './types'

export const LUDO_MIN_PLAYERS = 2
export const LUDO_MAX_PLAYERS = 4
export const LUDO_DEFAULT_MAX_PLAYERS = 4

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

/** Send a captured piece back to its own yard circle (not the track start square). */
function returnPieceToHomeYard(piece: LudoPiece): LudoPiece {
  return { id: piece.id, zone: 'base', pos: piece.id }
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
