import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import type { LudoColor, LudoDiceRoll, LudoPiece, LudoPlayerState, LudoSession, Player } from '@/types'

export const LUDO_MIN_PLAYERS = 2
export const LUDO_MAX_PLAYERS = 4
export const LUDO_DEFAULT_MAX_PLAYERS = 4

export const TRACK_LENGTH = 52
const FINISH_STEPS = 57

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

export const START_POS: Record<LudoColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
}

/** ★ start + safe entry cells on the 52-cell track — pieces cannot be captured here. */
const SAFE_TRACK_POSITIONS: ReadonlySet<number> = new Set([
  START_POS.red,
  START_POS.green,
  START_POS.yellow,
  START_POS.blue,
  50, // red safe entry [7,0]
  11, // green safe entry [0,7]
  24, // yellow safe entry [7,14]
  37, // blue safe entry [14,7]
])

/** Colors used for each player count (opposite corners for 2-player). */
export function colorsForPlayerCount(count: number): LudoColor[] {
  if (count <= 2) return ['red', 'green']
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
  if (piece.zone === 'home') return 52 + piece.pos
  return (piece.pos - START_POS[color] + TRACK_LENGTH) % TRACK_LENGTH
}

function pieceAtSteps(color: LudoColor, steps: number): LudoPiece {
  if (steps >= FINISH_STEPS) return { id: 0, zone: 'finished', pos: 0 }
  if (steps >= 52) return { id: 0, zone: 'home', pos: steps - 52 }
  return { id: 0, zone: 'track', pos: (START_POS[color] + steps) % TRACK_LENGTH }
}

function trackPos(pos: number): number {
  return Number(pos)
}

function isCaptureAllowedAt(pos: number): boolean {
  return !SAFE_TRACK_POSITIONS.has(trackPos(pos))
}

function wouldCaptureAt(
  states: LudoPlayerState[],
  destPos: number,
  color: LudoColor,
  movingPlayerId: string,
  movingPieceId: number
): boolean {
  const pos = trackPos(destPos)
  if (!isCaptureAllowedAt(pos)) return false
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

function isOpponentBlockade(
  occupants: { color: LudoColor; playerId: string; count: number }[],
  myColor: LudoColor
): boolean {
  return occupants.some((o) => o.color !== myColor && o.count >= 2)
}

function isOwnBlockade(
  occupants: { color: LudoColor; playerId: string; count: number }[],
  myColor: LudoColor
): boolean {
  return occupants.some((o) => o.color === myColor && o.count >= 2)
}

function canPassTrackSquare(
  pos: number,
  color: LudoColor,
  occupants: Map<number, { color: LudoColor; playerId: string; pieceId: number; count: number }[]>
): boolean {
  const occ = occupants.get(trackPos(pos)) ?? []
  if (occ.length === 0) return true
  if (isOwnBlockade(occ, color)) return true
  if (isOpponentBlockade(occ, color)) return false
  return true
}

function canLandOnTrackSquare(
  pos: number,
  color: LudoColor,
  occupants: Map<number, { color: LudoColor; playerId: string; pieceId: number; count: number }[]>
): boolean {
  const occ = occupants.get(trackPos(pos)) ?? []
  if (occ.length === 0) return true
  if (isOpponentBlockade(occ, color)) return false
  if (occ.some((o) => o.color === color)) return true
  return true
}

export interface LudoMoveOption {
  pieceId: number
  from: LudoPiece
  to: LudoPiece
  captures: boolean
  /** Index into remaining_dice for which die this move uses. */
  diceIndex: number
  /** Pip value of the die consumed (e.g. 6 or 3). */
  diceValue: number
}

export function getLegalMovesForSteps(
  color: LudoColor,
  pieces: LudoPiece[],
  steps: number,
  allStates: LudoPlayerState[],
  playerId: string
): Omit<LudoMoveOption, 'diceIndex' | 'diceValue'>[] {
  const moves: Omit<LudoMoveOption, 'diceIndex' | 'diceValue'>[] = []
  const occupants = trackOccupants(allStates)

  const hasInPlay = pieces.some((p) => p.zone !== 'base')

  for (const piece of pieces) {
    if (piece.zone === 'finished') continue

    if (piece.zone === 'base') {
      if (steps !== 6) continue
      if (!hasInPlay && pieces.filter((p) => p.zone === 'base').length === pieces.length) {
        // all in base — must bring one out on a 6
      }
      const start = START_POS[color]
      const occ = occupants.get(start) ?? []
      if (isOpponentBlockade(occ, color)) continue
      const captures = wouldCaptureAt(allStates, start, color, playerId, piece.id)
      moves.push({
        pieceId: piece.id,
        from: piece,
        to: { id: piece.id, zone: 'track', pos: start },
        captures,
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

    let blocked = false
    for (let step = 1; step <= steps; step += 1) {
      const intermediateSteps = currentSteps + step
      if (intermediateSteps > 51) break
      const intermediatePos = (START_POS[color] + intermediateSteps) % TRACK_LENGTH
      if (step < steps && !canPassTrackSquare(intermediatePos, color, occupants)) {
        blocked = true
        break
      }
    }
    if (blocked) continue

    const dest = pieceAtSteps(color, newSteps)
    if (dest.zone === 'track') {
      if (!canLandOnTrackSquare(dest.pos, color, occupants)) continue
      const captures = wouldCaptureAt(allStates, dest.pos, color, playerId, piece.id)
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
  playerId: string
): LudoMoveOption[] {
  const moves: LudoMoveOption[] = []
  for (let diceIndex = 0; diceIndex < remainingDice.length; diceIndex += 1) {
    const steps = remainingDice[diceIndex]!
    const stepMoves = getLegalMovesForSteps(color, pieces, steps, allStates, playerId)
    for (const move of stepMoves) {
      moves.push({ ...move, diceIndex, diceValue: steps })
    }
  }
  return moves
}

function applyMoveLocally(
  states: LudoPlayerState[],
  playerId: string,
  move: Omit<LudoMoveOption, 'diceIndex' | 'diceValue'>,
  color: LudoColor
): LudoPlayerState[] {
  const captureVictims =
    move.to.zone === 'track' && wouldCaptureAt(states, move.to.pos, color, playerId, move.pieceId)
      ? victimsAtTrackPos(states, move.to.pos, color)
      : []
  const victimKeys = new Set(captureVictims.map((v) => `${v.playerId}:${v.pieceId}`))
  const isCapture = victimKeys.size > 0

  // House rule: eating an opponent sends the capturing piece straight to its
  // own finished home (its respective colour's final base) as the reward,
  // instead of leaving it on the square it captured on.
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

function canPlayRemainingDiceSequence(
  color: LudoColor,
  pieces: LudoPiece[],
  remainingDice: number[],
  states: LudoPlayerState[],
  playerId: string
): boolean {
  if (remainingDice.length === 0) return true

  for (let diceIndex = 0; diceIndex < remainingDice.length; diceIndex += 1) {
    const steps = remainingDice[diceIndex]!
    const stepMoves = getLegalMovesForSteps(color, pieces, steps, states, playerId)
    for (const move of stepMoves) {
      const nextStates = applyMoveLocally(states, playerId, move, color)
      const nextPieces = nextStates.find((s) => s.player_id === playerId)?.pieces ?? pieces
      const rest = remainingDice.filter((_, i) => i !== diceIndex)
      if (canPlayRemainingDiceSequence(color, nextPieces, rest, nextStates, playerId)) {
        return true
      }
    }
  }
  return false
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

async function loadGameState(
  supabase: SupabaseClient,
  gameId: string
): Promise<{
  session: LudoSession | null
  states: LudoPlayerState[]
  timerSeconds: number
  playerNames: Map<string, string>
}> {
  const [sessionRes, statesRes, gameRes, playersRes] = await Promise.all([
    supabase.from('ludo_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    supabase.from('ludo_player_state').select('*').eq('game_id', gameId).order('player_order'),
    supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle(),
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
  if (sessionError) return { error: sessionError.message }

  const stateRows = turnOrder.map((playerId, index) => ({
    game_id: gameId,
    player_id: playerId,
    color: colors[index]!,
    pieces: createInitialPieces(),
    player_order: index,
  }))

  const { error: statesError } = await supabase.from('ludo_player_state').insert(stateRows)
  if (statesError) return { error: statesError.message }

  return {}
}

export async function clearLudoSessionData(supabase: SupabaseClient, gameId: string): Promise<{ error?: string }> {
  const { error: sessionError } = await supabase.from('ludo_sessions').delete().eq('game_id', gameId)
  if (sessionError) return { error: sessionError.message }

  const { error: statesError } = await supabase.from('ludo_player_state').delete().eq('game_id', gameId)
  if (statesError) return { error: statesError.message }

  const { error: spectatorError } = await supabase
    .from('players')
    .update({ spectator: false })
    .eq('game_id', gameId)
    .eq('spectator', true)
  if (spectatorError) return { error: spectatorError.message }

  return {}
}

function pickAutoMove(moves: LudoMoveOption[]): LudoMoveOption | null {
  if (moves.length === 0) return null
  if (moves.length === 1) return moves[0]!

  const leavingBase = moves.filter((m) => m.from.zone === 'base')
  if (leavingBase.length > 0) {
    const sixes = leavingBase.filter((m) => m.diceValue === 6)
    const pool = sixes.length > 0 ? sixes : leavingBase
    return [...pool].sort((a, b) => a.pieceId - b.pieceId || a.diceIndex - b.diceIndex)[0]!
  }

  // Rolling a 6 with every piece still in base — all moves go to the same start square.
  const dest = moves[0]!.to
  if (moves.every((m) => m.from.zone === 'base' && m.to.zone === 'track' && m.to.pos === dest.pos)) {
    return [...moves].sort((a, b) => a.pieceId - b.pieceId)[0]!
  }

  const capturing = moves.filter((m) => m.captures)
  if (capturing.length > 0) return capturing[0]!
  const finishing = moves.filter((m) => m.to.zone === 'finished')
  if (finishing.length > 0) return finishing[0]!
  const enteringHome = moves.filter((m) => m.to.zone === 'home' && m.from.zone === 'track')
  if (enteringHome.length > 0) return enteringHome[0]!
  return moves[0]!
}

async function persistMove(
  supabase: SupabaseClient,
  gameId: string,
  session: LudoSession,
  states: LudoPlayerState[],
  playerId: string,
  move: LudoMoveOption,
  timerSeconds: number,
  playerNames: Map<string, string>
): Promise<{ error?: string }> {
  const playerRow = states.find((s) => s.player_id === playerId)
  if (!playerRow) return { error: 'Player state not found' }

  let nextStates = applyMoveLocally(states, playerId, move, playerRow.color)

  const myPieces = nextStates.find((s) => s.player_id === playerId)?.pieces ?? []
  const won = allPiecesFinished(myPieces)
  const name = playerNames.get(playerId) ?? 'Player'
  const roll = parseLudoDice(session.last_dice)

  const remainingBefore = resolveRemainingDice(session)
  const remainingAfter = remainingBefore.filter((_, i) => i !== move.diceIndex)

  const movedFromBase = move.from.zone === 'base' && move.to.zone === 'track'
  const didCapture =
    move.to.zone === 'track' &&
    victimsAtTrackPos(states, move.to.pos, playerRow.color).length > 0 &&
    wouldCaptureAt(states, move.to.pos, playerRow.color, playerId, move.pieceId)
  const moveNote = didCapture
    ? 'ate an opponent and sent it home, racing their own piece home!'
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
  let statusMessage = ''

  if (won) {
    phase = 'finished'
    statusMessage = `${name} wins!`
    await markGameFinished(supabase, gameId)
  } else if (remainingAfter.length > 0) {
    const nextMoves = getLegalMovesFromRemaining(playerRow.color, myPieces, remainingAfter, nextStates, playerId)
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

  const changedRows = nextStates.filter((row) => {
    const original = states.find((s) => s.player_id === row.player_id)
    return !original || JSON.stringify(original.pieces) !== JSON.stringify(row.pieces)
  })

  const writeResults = await Promise.all(
    changedRows.map((row) =>
      supabase
        .from('ludo_player_state')
        .update({ pieces: row.pieces })
        .eq('game_id', gameId)
        .eq('player_id', row.player_id)
    )
  )
  const writeError = writeResults.find((r) => r.error)
  if (writeError?.error) return { error: writeError.error.message }

  const { error: sessionError } = await supabase
    .from('ludo_sessions')
    .update({
      phase,
      current_turn_index: currentTurnIndex,
      last_dice: lastDice,
      remaining_dice: remainingDice,
      consecutive_sixes: consecutiveSixes,
      extra_turn: extraTurn,
      status_message: statusMessage,
      winner_player_id: won ? playerId : null,
      turn_deadline_at: phase === 'finished' ? null : ludoTurnDeadline(timerSeconds),
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  if (sessionError) return { error: sessionError.message }
  return {}
}

export async function processLudoRoll(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string; dice?: LudoDiceRoll }> {
  const { session, states, timerSeconds, playerNames } = await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }
  if (session.phase !== 'roll') return { error: 'Not roll phase' }
  if (currentPlayerId(session) !== playerId) return { error: 'Not your turn' }

  const dice = rollLudoDice()
  const playerRow = states.find((s) => s.player_id === playerId)
  if (!playerRow) return { error: 'Player state not found' }

  const remainingDice = [dice.d1, dice.d2]
  const canPlay = canPlayRemainingDiceSequence(playerRow.color, playerRow.pieces, remainingDice, states, playerId)
  const name = playerNames.get(playerId) ?? 'Player'
  const rollLabel = formatLudoDiceRoll(dice)

  if (!canPlay) {
    let consecutiveSixes = session.consecutive_sixes
    if (ludoGrantsExtraRoll(dice)) consecutiveSixes += 1
    else consecutiveSixes = 0

    if (ludoGrantsExtraRoll(dice) && consecutiveSixes < 3) {
      const { error } = await supabase
        .from('ludo_sessions')
        .update({
          last_dice: null,
          remaining_dice: null,
          consecutive_sixes: consecutiveSixes,
          phase: 'roll',
          status_message: `${name} rolled ${rollLabel} but has no moves — roll again!`,
          turn_deadline_at: ludoTurnDeadline(timerSeconds),
          updated_at: new Date().toISOString(),
        })
        .eq('game_id', gameId)
      if (error) return { error: error.message }
      return { dice }
    }

    if (consecutiveSixes >= 3) {
      const nextIndex = advanceTurnIndex(session)
      const nextId = session.turn_order[nextIndex]
      const { error } = await supabase
        .from('ludo_sessions')
        .update({
          last_dice: null,
          remaining_dice: null,
          consecutive_sixes: 0,
          current_turn_index: nextIndex,
          phase: 'roll',
          status_message: `Three double sixes in a row — turn lost. ${playerNames.get(nextId ?? '') ?? 'Next player'}'s turn`,
          turn_deadline_at: ludoTurnDeadline(timerSeconds),
          updated_at: new Date().toISOString(),
        })
        .eq('game_id', gameId)
      if (error) return { error: error.message }
      return { dice }
    }

    const nextIndex = advanceTurnIndex(session)
    const nextId = session.turn_order[nextIndex]
    const { error } = await supabase
      .from('ludo_sessions')
      .update({
        last_dice: null,
        remaining_dice: null,
        consecutive_sixes: 0,
        current_turn_index: nextIndex,
        phase: 'roll',
        status_message: `${name} rolled ${rollLabel} — no moves. ${playerNames.get(nextId ?? '') ?? 'Next player'}'s turn`,
        turn_deadline_at: ludoTurnDeadline(timerSeconds),
        updated_at: new Date().toISOString(),
      })
      .eq('game_id', gameId)
    if (error) return { error: error.message }
    return { dice }
  }

  const { error } = await supabase
    .from('ludo_sessions')
    .update({
      last_dice: dice,
      remaining_dice: remainingDice,
      phase: 'move',
      status_message: `${name} rolled ${rollLabel} — use each die (${dice.d1} & ${dice.d2})`,
      turn_deadline_at: ludoTurnDeadline(timerSeconds),
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  if (error) return { error: error.message }
  return { dice }
}

export async function processLudoMove(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  pieceId: number,
  diceIndex?: number
): Promise<{ error?: string }> {
  const { session, states, timerSeconds, playerNames } = await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }
  if (session.phase !== 'move') return { error: 'Not move phase' }
  if (currentPlayerId(session) !== playerId) return { error: 'Not your turn' }
  if (!session.last_dice) return { error: 'Roll first' }

  const playerRow = states.find((s) => s.player_id === playerId)
  if (!playerRow) return { error: 'Player state not found' }

  const remaining = resolveRemainingDice(session)
  if (remaining.length === 0) return { error: 'No dice left to play' }

  const moves = getLegalMovesFromRemaining(playerRow.color, playerRow.pieces, remaining, states, playerId)

  let move = diceIndex != null ? moves.find((m) => m.pieceId === pieceId && m.diceIndex === diceIndex) : undefined

  if (!move) {
    move = pickLudoMoveForPiece(moves, pieceId) ?? undefined
  }

  if (!move) return { error: 'Invalid move' }

  return persistMove(supabase, gameId, session, states, playerId, move, timerSeconds, playerNames)
}

export async function processLudoExpireTurn(supabase: SupabaseClient, gameId: string): Promise<{ error?: string }> {
  const { session, states, timerSeconds, playerNames } = await loadGameState(supabase, gameId)
  if (!session || session.phase === 'finished') return {}

  const playerId = currentPlayerId(session)
  if (!playerId) return { error: 'No current player' }

  if (session.phase === 'roll') {
    return processLudoRoll(supabase, gameId, playerId)
  }

  const playerRow = states.find((s) => s.player_id === playerId)
  if (!playerRow || !session.last_dice) return { error: 'Invalid state' }

  const remaining = resolveRemainingDice(session)
  const moves = getLegalMovesFromRemaining(playerRow.color, playerRow.pieces, remaining, states, playerId)
  const auto = pickAutoMove(moves)
  if (!auto) {
    const nextIndex = advanceTurnIndex(session)
    const nextId = session.turn_order[nextIndex]
    const { error } = await supabase
      .from('ludo_sessions')
      .update({
        last_dice: null,
        remaining_dice: null,
        phase: 'roll',
        current_turn_index: nextIndex,
        consecutive_sixes: 0,
        status_message: `Time's up — ${playerNames.get(nextId ?? '') ?? 'Next player'}'s turn`,
        turn_deadline_at: ludoTurnDeadline(timerSeconds),
        updated_at: new Date().toISOString(),
      })
      .eq('game_id', gameId)
    if (error) return { error: error.message }
    return {}
  }

  return persistMove(supabase, gameId, session, states, playerId, auto, timerSeconds, playerNames)
}

export type LudoHostMode = 'spectator' | 'player'

const LUDO_HOST_MODE_KEY = 'ludo_host_mode'

export function getLudoHostMode(gameCode: string): LudoHostMode {
  if (typeof window === 'undefined') return 'spectator'
  return (localStorage.getItem(`${LUDO_HOST_MODE_KEY}_${gameCode}`) as LudoHostMode) ?? 'spectator'
}

export function setLudoHostMode(gameCode: string, mode: LudoHostMode): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${LUDO_HOST_MODE_KEY}_${gameCode}`, mode)
}
